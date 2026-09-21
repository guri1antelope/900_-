import os
import sys
import hashlib
import asyncio
import urllib.parse
from http.server import SimpleHTTPRequestHandler
import socketserver

# edge-tts の自動インポート・インストール
try:
    import edge_tts
except ImportError:
    print("edge-tts が見つかりません。インストールしています...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts"])
    import edge_tts

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# 落ち着いた温かみのある大人の男性（先生）の声
VOICE = "ja-JP-KeitaNeural"

async def generate_voice(text, output_path):
    # 小学生が聞き取りやすいよう、少しだけ落ち着いた速度（-5%）
    communicate = edge_tts.Communicate(text, VOICE, rate="-5%")
    await communicate.save(output_path)

class InterviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/tts":
            query = urllib.parse.parse_qs(parsed.query)
            text = query.get("text", [""])[0]
            if not text:
                self.send_error(400, "Text is required")
                return

            text_hash = hashlib.md5((text + "_" + VOICE).encode("utf-8")).hexdigest()
            cache_file = os.path.join(CACHE_DIR, f"{text_hash}.mp3")

            if not os.path.exists(cache_file):
                try:
                    asyncio.run(generate_voice(text, cache_file))
                except Exception as e:
                    print(f"TTS generation error: {e}")
                    self.send_error(500, f"TTS error: {e}")
                    return

            try:
                with open(cache_file, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_error(500, f"File read error: {e}")
            return

        super().do_GET()

def run_server():
    port = 8000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = socketserver.ThreadingTCPServer(("", port), InterviewHandler)
    server.allow_reuse_address = True
    print(f"===================================================")
    print(f"  高志中等 面接トレーニング AI音声サーバー稼働中")
    print(f"  URL: http://localhost:{port}/index.html")
    print(f"===================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを停止しました。")
        server.shutdown()

if __name__ == "__main__":
    run_server()
