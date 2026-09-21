// 高志中等 面接トレーニング ローカルAI音声サーバー (server.js)
// 外部npmパッケージ不要・Node.js標準機能のみで動作

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = 8000;
const ROOT_DIR = __dirname;
const CACHE_DIR = path.join(ROOT_DIR, 'audio_cache');
const VOICE = 'ja-JP-KeitaNeural'; // 落ち着いた大人の男性声

// キャッシュディレクトリの作成
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Edge-TTS 音声生成（WebSocket経由）
function generateVoice(text) {
  return new Promise((resolve, reject) => {
    const wsUrl = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EA6542DED6D315261D387042";
    
    let ws;
    try {
      ws = new WebSocket(wsUrl, {
        headers: {
          "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
        }
      });
    } catch (e) {
      return reject(e);
    }

    const audioChunks = [];
    const requestId = crypto.randomUUID().replace(/-/g, "");
    let isResolved = false;

    // タイムアウト設定 (15秒)
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try { ws.close(); } catch(e) {}
        reject(new Error("TTS request timed out"));
      }
    }, 15000);

    ws.onopen = () => {
      // 1. 設定メッセージ送信
      const configMsg = "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        });
      ws.send(configMsg);

      // 2. SSMLメッセージ送信
      const dateStr = new Date().toString();
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ja-JP'><voice name='${VOICE}'><prosody pitch='+0Hz' rate='-5%'>${escapedText}</prosody></voice></speak>`;
      const ssmlMsg = `X-Timestamp:${dateStr}\r\nX-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes("Path:turn.end")) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            try { ws.close(); } catch(e) {}
            resolve(Buffer.concat(audioChunks));
          }
        }
      } else {
        // バイナリ音声データ
        let buffer;
        if (Buffer.isBuffer(event.data)) {
          buffer = event.data;
        } else if (event.data instanceof ArrayBuffer) {
          buffer = Buffer.from(event.data);
        } else if (event.data && typeof event.data.arrayBuffer === 'function') {
          buffer = Buffer.from(await event.data.arrayBuffer());
        }

        if (buffer && buffer.length > 2) {
          const headerLen = buffer.readUInt16BE(0);
          if (buffer.length >= 2 + headerLen) {
            const headerText = buffer.subarray(2, 2 + headerLen).toString('utf-8');
            if (headerText.includes("Path:audio")) {
              audioChunks.push(buffer.subarray(2 + headerLen));
            }
          }
        }
      }
    };

    ws.onerror = (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        reject(err);
      }
    };

    ws.onclose = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        if (audioChunks.length > 0) {
          resolve(Buffer.concat(audioChunks));
        } else {
          reject(new Error("Connection closed before audio received"));
        }
      }
    };
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // CORSヘッダー
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. TTS API エンドポイント
  if (parsedUrl.pathname === '/api/tts') {
    const text = (parsedUrl.query.text || '').trim();
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Text is required');
      return;
    }

    const textHash = crypto.createHash('md5').update(text + '_' + VOICE).digest('hex');
    const cacheFile = path.join(CACHE_DIR, `${textHash}.mp3`);

    // キャッシュがある場合は即時返却
    if (fs.existsSync(cacheFile)) {
      try {
        const data = fs.readFileSync(cacheFile);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': data.length,
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(data);
        return;
      } catch (e) {
        console.error('Cache read error:', e);
      }
    }

    // キャッシュがない場合はEdge-TTSで生成
    try {
      console.log(`[TTS生成中] "${text.slice(0, 30)}..."`);
      const audioBuffer = await generateVoice(text);
      fs.writeFileSync(cacheFile, audioBuffer);
      console.log(`[TTS完了] 保存: ${textHash}.mp3 (${audioBuffer.length} bytes)`);

      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(audioBuffer);
    } catch (err) {
      console.error('[TTS生成失敗]:', err.message || err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('TTS generation error: ' + (err.message || String(err)));
    }
    return;
  }

  // 2. 静的ファイルの配信
  let filePath = path.join(ROOT_DIR, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  filePath = path.normalize(filePath);

  // ディレクトリトラバーサル防止
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log('===================================================');
  console.log('  Koshi Junior High Interview App Server Running');
  console.log(`  URL: http://localhost:${PORT}/index.html`);
  console.log('===================================================');
  
  // 自動でブラウザを開く
  const { exec } = require('child_process');
  exec(`start http://localhost:${PORT}/index.html`, (err) => {
    if (err) console.error('Failed to open browser:', err);
  });
});
