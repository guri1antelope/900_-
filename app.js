// 高志中等 面接トレーニング アプリロジック (app.js)

class InterviewApp {
  constructor() {
    this.currentMode = "practice"; // "practice" | "exam"
    this.currentQuestionIndex = 0;
    this.questionList = [];
    this.currentQuestion = null;
    this.isFollowUp = false;
    this.currentFollowUpQuestion = "";
    this.sessionAnswers = []; // { question, answer, followUpAnswer, feedback }
    
    // 音声関連
    this.recognition = null;
    this.isRecognitionActive = false;
    this.isAcceptingInput = false;    // 佑実さんの発話受付中フラグ
    this.isSpeaking = false;          // 先生の発話中フラグ
    this.ignoredPrefixLength = 0;     // 先生の発話中に拾った文字数（除外用）
    this.isManuallyEdited = false;    // 手動編集中フラグ

    // タイマー関連
    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.targetSeconds = 90; // 目安1分30秒
    
    this.initElements();
    this.initSpeech();
    this.initEvents();
  }

  initElements() {
    // 画面コンテナ
    this.viewHome = document.getElementById("view-home");
    this.viewInterview = document.getElementById("view-interview");
    this.viewResult = document.getElementById("view-result");
    
    // チャットタイムライン
    this.chatTimeline = document.getElementById("chat-timeline");
    
    // ヘッダー情報
    this.modeBadge = document.getElementById("mode-badge");
    this.questionCounter = document.getElementById("question-counter");
    this.progressBar = document.getElementById("progress-bar");
    this.timerDisplay = document.getElementById("timer-display");
    
    // 面接官エリア
    this.interviewerCategory = document.getElementById("interviewer-category");
    this.interviewerStatus = document.getElementById("interviewer-status");
    this.btnReplay = document.getElementById("btn-replay");
    
    // 回答者エリア
    this.candidateStatus = document.getElementById("candidate-status");
    this.voiceVisualizer = document.getElementById("voice-visualizer");
    this.speechTranscript = document.getElementById("speech-transcript");
    this.charCount = document.getElementById("char-count");
    this.editBadge = document.getElementById("edit-badge");
    this.btnMic = document.getElementById("btn-mic");
    this.btnSubmit = document.getElementById("btn-submit");
    
    // 右サイドバー（練習モードヒント）
    this.practiceSidebar = document.getElementById("practice-sidebar");
    this.intentText = document.getElementById("intent-text");
    this.structureChecklist = document.getElementById("structure-checklist");
    this.exampleText = document.getElementById("example-text");
    
    // レスキューボタン
    this.btnRescueRepeat = document.getElementById("btn-rescue-repeat");
    this.btnRescueThink = document.getElementById("btn-rescue-think");
    this.btnRescueRestart = document.getElementById("btn-rescue-restart");
    
    // 練習モード即時フィードバックモーダル
    this.feedbackModal = document.getElementById("feedback-modal");
    this.modalFeedbackContent = document.getElementById("modal-feedback-content");
    this.btnModalNext = document.getElementById("btn-modal-next");
  }

  initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = "ja-JP";
      this.recognition.continuous = true;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isRecognitionActive = true;
      };

      this.recognition.onresult = (event) => {
        // 全体の発話テキストを抽出
        let full = "";
        for (let i = 0; i < event.results.length; ++i) {
          full += event.results[i][0].transcript;
        }

        // 先生が話している間、または入力受付前は、その時点までの文字数を記録して除外
        if (!this.isAcceptingInput || this.isSpeaking) {
          this.ignoredPrefixLength = full.length;
          return;
        }

        // 手動編集された後は、音声認識による自動上書きを行わない
        if (this.isManuallyEdited) {
          return;
        }

        // 佑実さんが話した分のみを切り出して表示
        const candidateText = full.slice(this.ignoredPrefixLength || 0);
        this.speechTranscript.value = candidateText;
        this.charCount.innerText = `${candidateText.length} 文字`;
      };

      this.recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          alert("マイクの使用が許可されていません。ブラウザのアドレスバーからマイクを許可してください。");
        }
      };

      this.recognition.onend = () => {
        this.isRecognitionActive = false;
        // 面接セッション中なら自動で再接続
        if (this.viewInterview && !this.viewInterview.classList.contains("hidden")) {
          try {
            this.recognition.start();
          } catch(e) {}
        }
      };
    } else {
      console.warn("Web Speech Recognition is not supported in this browser.");
    }
  }

  initEvents() {
    // ホーム画面
    document.getElementById("btn-start-practice").addEventListener("click", () => this.startPracticeMode());
    document.getElementById("btn-start-exam").addEventListener("click", () => this.startExamMode());
    
    // 再生ボタン
    this.btnReplay.addEventListener("click", () => {
      const textToSpeak = this.isFollowUp ? this.currentFollowUpQuestion : this.currentQuestion.question;
      this.pauseInputAndSpeak(textToSpeak);
    });

    // マイクON/OFF（手動切替）
    this.btnMic.addEventListener("click", () => {
      if (this.isAcceptingInput) {
        this.setInputAcceptance(false);
      } else {
        this.isManuallyEdited = false;
        if (this.editBadge) this.editBadge.classList.add("hidden");
        this.setInputAcceptance(true);
      }
    });

    // 回答完了ボタン
    this.btnSubmit.addEventListener("click", () => this.handleSubmitAnswer());

    // テキストエリア直接入力イベント（手動編集の検知）
    this.speechTranscript.addEventListener("input", () => {
      this.isManuallyEdited = true;
      if (this.editBadge) this.editBadge.classList.remove("hidden");
      this.charCount.innerText = `${this.speechTranscript.value.length} 文字`;
    });

    // レスキューボタン
    this.btnRescueRepeat.addEventListener("click", () => this.handleRescue("repeat"));
    this.btnRescueThink.addEventListener("click", () => this.handleRescue("think"));
    this.btnRescueRestart.addEventListener("click", () => this.handleRescue("restart"));

    // モード切替・終了
    document.getElementById("btn-exit-interview").addEventListener("click", () => {
      if (confirm("面接練習を終了してホームに戻りますか？")) {
        this.setInputAcceptance(false);
        this.stopRecognitionCompletely();
        if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null; }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        this.stopTimer();
        this.showView("home");
      }
    });

    // 結果画面からホームへ
    document.getElementById("btn-result-home").addEventListener("click", () => {
      this.stopRecognitionCompletely();
      this.showView("home");
    });

    document.getElementById("btn-result-retry").addEventListener("click", () => {
      if (this.currentMode === "exam") {
        this.startExamMode();
      } else {
        this.startPracticeMode();
      }
    });
  }

  showView(viewName) {
    this.viewHome.classList.add("hidden");
    this.viewInterview.classList.add("hidden");
    this.viewResult.classList.add("hidden");

    if (viewName === "home") this.viewHome.classList.remove("hidden");
    if (viewName === "interview") this.viewInterview.classList.remove("hidden");
    if (viewName === "result") this.viewResult.classList.remove("hidden");
  }

  ensureRecognitionActive() {
    if (!this.recognition) return;
    if (!this.isRecognitionActive) {
      try {
        this.recognition.start();
      } catch (e) {}
    }
  }

  stopRecognitionCompletely() {
    this.isAcceptingInput = false;
    this.updateMicUI(false);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch(e) {}
    }
  }

  setInputAcceptance(accepting) {
    this.isAcceptingInput = accepting;
    this.updateMicUI(accepting);
  }

  // --- チャットタイムライン操作 ---
  addSystemDivider(text) {
    if (!this.chatTimeline) return;
    const div = document.createElement("div");
    div.className = "flex items-center justify-center my-1";
    div.innerHTML = `
      <span class="px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-medium border border-surface-variant/40 shadow-xs">
        ${text}
      </span>
    `;
    this.chatTimeline.appendChild(div);
    this.scrollChatToBottom();
  }

  addChatMessage(sender, text, options = {}) {
    if (!this.chatTimeline) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const div = document.createElement("div");

    if (sender === "interviewer") {
      const isFollowUp = options.isFollowUp || false;
      const roleLabel = isFollowUp ? "面接官（追加質問）" : "面接官";
      const bubbleBorder = isFollowUp ? "border-tertiary/40 bg-amber-50/50" : "border-surface-container bg-surface-container-lowest";

      div.className = "flex items-start gap-2.5 max-w-[92%] sm:max-w-[85%]";
      div.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
          先
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-bold text-primary">${roleLabel}</span>
            <span class="text-[10px] text-outline">${timeStr}</span>
          </div>
          <div class="p-3 sm:p-3.5 rounded-2xl rounded-tl-none ${bubbleBorder} text-on-surface shadow-xs border text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">${text.trim()}</div>
        </div>
      `;
    } else {
      div.className = "flex items-start gap-2.5 max-w-[92%] sm:max-w-[85%]" + " ml-auto flex-row-reverse";
      div.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
          佑
        </div>
        <div class="space-y-1 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <span class="text-[10px] text-outline">${timeStr}</span>
            <span class="text-[11px] font-bold text-secondary">佑実さん</span>
          </div>
          <div class="p-3 sm:p-3.5 rounded-2xl rounded-tr-none bg-secondary-container text-on-secondary-container shadow-xs border border-secondary/20 text-xs sm:text-sm leading-relaxed text-left whitespace-pre-wrap">${text.trim()}</div>
        </div>
      `;
    }

    this.chatTimeline.appendChild(div);
    this.scrollChatToBottom();
  }

  scrollChatToBottom() {
    if (!this.chatTimeline) return;
    setTimeout(() => {
      this.chatTimeline.scrollTop = this.chatTimeline.scrollHeight;
    }, 50);
  }

  // --- 練習モード開始（優先度を考慮したランダム3問） ---
  startPracticeMode(selectedQId = null) {
    this.currentMode = "practice";
    if (selectedQId) {
      this.questionList = INTERVIEW_QUESTIONS.filter(q => q.id === selectedQId);
    } else {
      // 優先度Sから1問、Aから1問、BまたはCから1問をランダム抽出（計3問）
      const s = this.shuffle([...INTERVIEW_QUESTIONS.filter(q => q.priority === "S")])[0];
      const a = this.shuffle([...INTERVIEW_QUESTIONS.filter(q => q.priority === "A")])[0];
      const bc = this.shuffle([...INTERVIEW_QUESTIONS.filter(q => q.priority === "B" || q.priority === "C")])[0];
      this.questionList = [s, a, bc];
    }
    this.currentQuestionIndex = 0;
    this.sessionAnswers = [];
    if (this.chatTimeline) this.chatTimeline.innerHTML = "";
    this.addSystemDivider("練習モードを開始しました（全3問）");
    this.setupInterviewScreen();
    this.ensureRecognitionActive();
    this.loadQuestion();
  }

  // --- 本番モード開始 ---
  startExamMode() {
    this.currentMode = "exam";
    const sList = this.shuffle([...INTERVIEW_QUESTIONS.filter(q => q.priority === "S")]).slice(0, 3);
    const aList = this.shuffle([...INTERVIEW_QUESTIONS.filter(q => q.priority === "A")]).slice(0, 2);
    const bcList = this.shuffle([...INTERVIEW_QUESTIONS.filter(q => q.priority === "B" || q.priority === "C")]).slice(0, 1);
    
    this.questionList = [...sList, ...aList, ...bcList];
    this.currentQuestionIndex = 0;
    this.sessionAnswers = [];
    if (this.chatTimeline) this.chatTimeline.innerHTML = "";
    this.addSystemDivider(`本番モードを開始しました（全${this.questionList.length}問）`);
    this.setupInterviewScreen();
    this.ensureRecognitionActive();
    this.loadQuestion();
  }

  shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
  }

  setupInterviewScreen() {
    this.showView("interview");
    if (this.currentMode === "practice") {
      this.modeBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-secondary animate-pulse flex-shrink-0"></span>
        <span class="truncate">練習モード</span>
      `;
      this.practiceSidebar.classList.remove("hidden");
    } else {
      this.modeBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0"></span>
        <span class="font-bold text-primary truncate">本番モード</span>
      `;
      this.practiceSidebar.classList.add("hidden");
    }
  }

  loadQuestion() {
    this.currentQuestion = this.questionList[this.currentQuestionIndex];
    this.isFollowUp = false;
    this.currentFollowUpQuestion = "";
    
    this.resetInputArea();
    this.setInputAcceptance(false);

    // ヘッダー進捗更新
    const total = this.questionList.length;
    const currentNum = this.currentQuestionIndex + 1;
    this.questionCounter.innerHTML = `
      <span class="text-primary font-bold">第 ${currentNum} 問</span>
      <span class="text-on-surface-variant">/ ${total}問</span>
    `;
    this.progressBar.style.width = `${(currentNum / total) * 100}%`;

    // タイムラインに設問の区切りを表示
    this.addSystemDivider(`第 ${currentNum} 問 / 全${total}問 （${this.currentQuestion.category}）`);

    // 面接官情報
    this.interviewerCategory.innerText = `${this.currentQuestion.category}（優先度 ${this.currentQuestion.priority}）`;
    this.interviewerStatus.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-secondary"></span>
      <span>質問を読み上げ中…</span>
    `;

    // タイムラインに先生の質問を追加
    this.addChatMessage("interviewer", this.currentQuestion.question, { isFollowUp: false });

    // 練習サイドバー情報
    if (this.currentMode === "practice") {
      this.intentText.innerText = this.currentQuestion.intent;
      this.structureChecklist.innerHTML = this.renderChecklist(this.currentQuestion.structure);
      this.exampleText.innerText = this.currentQuestion.example;
    }

    // タイマーリセット
    this.startTimer();

    // 先生による音声読み上げ
    this.speakText(this.currentQuestion.question, () => {
      this.interviewerStatus.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-secondary"></span>
        <span>あなたの番です。落ち着いて話してください。</span>
      `;
      this.startAnsweringTurn();
    });
  }

  resetInputArea() {
    this.isManuallyEdited = false;
    if (this.editBadge) this.editBadge.classList.add("hidden");
    if (this.speechTranscript) this.speechTranscript.value = "";
    if (this.charCount) this.charCount.innerText = "0 文字";
  }

  startAnsweringTurn() {
    this.resetInputArea();
    // 先生の声の余韻が収まるまで少し待ってから受付開始
    setTimeout(() => {
      this.setInputAcceptance(true);
    }, 200);
  }

  renderChecklist(structureStr) {
    const parts = structureStr.split("➔");
    return parts.map(part => `
      <li class="flex items-center gap-1.5 text-caption font-caption text-on-surface">
        <span class="text-secondary font-bold">✔</span>
        <span>${part.trim()}</span>
      </li>
    `).join("");
  }

  // --- 回答完了処理 ---
  handleSubmitAnswer() {
    this.setInputAcceptance(false);

    const answerText = this.speechTranscript.value.trim();

    if (answerText.length < 5) {
      if (!confirm("回答が短いか、音声がうまく認識されていないようです。このまま進めますか？")) {
        this.setInputAcceptance(true);
        return;
      }
    }

    // タイムラインに佑実さんの発言を追加
    this.addChatMessage("candidate", answerText || "（無回答）");

    // 追加質問（深掘り）の判定
    if (!this.isFollowUp && this.currentQuestion.followUpQuestions && this.currentQuestion.followUpQuestions.length > 0) {
      const shouldFollowUp = (this.currentMode === "exam") 
        ? (this.currentQuestion.priority === "S" || Math.random() > 0.4)
        : true;

      if (shouldFollowUp) {
        this.triggerFollowUp(answerText);
        return;
      }
    }

    this.finishCurrentQuestion(answerText);
  }

  // --- 追加質問の発動 ---
  triggerFollowUp(initialAnswer) {
    this.isFollowUp = true;
    this.initialAnswer = initialAnswer;
    
    const followUps = this.currentQuestion.followUpQuestions;
    this.currentFollowUpQuestion = followUps[Math.floor(Math.random() * followUps.length)];
    const followUpIntros = [
      "お話ししてくれてありがとうございます。もう少し詳しく聞かせてください。",
      "なるほど、しっかり自分の考えを持って答えてくれましたね。では、こういった点についてはどうでしょう？",
      "ありがとうございます。今の答えを聞いてさらに興味が湧きました。もう一つ質問させてください。",
      "よく伝わってきましたよ。では関連して、もう一つ教えてください。",
      "なるほど、そういう工夫や経験があるのですね。では次の質問です。",
      "率直に答えてくれて嬉しいです。では、もう一歩踏み込んで伺いますね。",
      "具体的なエピソードをありがとう。では、その時についてもう少し教えてください。",
      "大切な視点ですね。では、もし別の状況だったらどう行動しましたか？"
    ];
    const intro = followUpIntros[Math.floor(Math.random() * followUpIntros.length)];
    const followUpSpeechText = `${intro} ${this.currentFollowUpQuestion}`;
    
    this.interviewerStatus.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-tertiary"></span>
      <span>深掘りの追加質問を読み上げています…</span>
    `;

    // タイムラインに追加質問をメッセージとして追加
    this.addChatMessage("interviewer", followUpSpeechText, { isFollowUp: true });

    this.resetInputArea();
    this.setInputAcceptance(false);

    this.speakText(followUpSpeechText, () => {
      this.interviewerStatus.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-secondary"></span>
        <span>追加質問に答えてみましょう。</span>
      `;
      this.startAnsweringTurn();
    });
  }

  finishCurrentQuestion(finalAnswer) {
    this.stopTimer();

    const initialAns = this.isFollowUp ? this.initialAnswer : finalAnswer;
    const followUpAns = this.isFollowUp ? finalAnswer : "";
    const feedback = this.evaluateAnswer(this.currentQuestion, initialAns, followUpAns);

    this.sessionAnswers.push({
      question: this.currentQuestion,
      initialAnswer: initialAns,
      followUpQuestion: this.currentFollowUpQuestion,
      followUpAnswer: followUpAns,
      feedback: feedback,
      elapsedSeconds: this.elapsedSeconds
    });

    if (this.currentMode === "practice") {
      this.showInstantFeedbackModal(feedback);
    } else {
      this.nextQuestion();
    }
  }

  showInstantFeedbackModal(feedback) {
    this.modalFeedbackContent.innerHTML = `
      <div class="space-y-3">
        <div class="p-3.5 rounded-xl bg-secondary-fixed/40 border border-secondary/30">
          <h4 class="font-bold text-secondary text-xs sm:text-sm mb-0.5">良かった点</h4>
          <p class="text-xs sm:text-sm text-on-surface">${feedback.goodPoint}</p>
        </div>
        <div class="p-3.5 rounded-xl bg-tertiary-container/20 border border-tertiary/30">
          <h4 class="font-bold text-tertiary text-xs sm:text-sm mb-0.5">もっと良くなるアドバイス</h4>
          <p class="text-xs sm:text-sm text-on-surface">${feedback.advice}</p>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-caption pt-1">
          <div class="p-2 rounded-lg bg-surface-container">
            <p class="text-outline text-[10px]">結論ファースト</p>
            <p class="font-bold text-primary text-xs sm:text-sm">${feedback.isConclusionFirst ? "⭕ できてる" : "🔺 意識しよう"}</p>
          </div>
          <div class="p-2 rounded-lg bg-surface-container">
            <p class="text-outline text-[10px]">キーワード</p>
            <p class="font-bold text-secondary text-xs sm:text-sm">${feedback.matchedKeywords.length > 0 ? "⭕バッチリ" : "🔺もう少し"}</p>
          </div>
          <div class="p-2 rounded-lg bg-surface-container">
            <p class="text-outline text-[10px]">ボリューム</p>
            <p class="font-bold text-primary text-xs sm:text-sm">${feedback.volumeCheck}</p>
          </div>
        </div>
      </div>
    `;

    this.feedbackModal.classList.remove("hidden");
    this.btnModalNext.onclick = () => {
      this.feedbackModal.classList.add("hidden");
      this.nextQuestion();
    };
  }

  nextQuestion() {
    this.currentQuestionIndex++;
    if (this.currentQuestionIndex < this.questionList.length) {
      this.loadQuestion();
    } else {
      this.showResultScreen();
    }
  }

  // --- 評価ロジック ---
  evaluateAnswer(q, answer, followUpAnswer) {
    const text = (answer + " " + followUpAnswer).trim();
    const length = text.length;

    // 1. 結論ファーストチェック (冒頭部分の判定)
    const startChunk = text.slice(0, 45);
    const conclusionPatterns = [/からです/, /です/, /ます/, /理由は/, /私の長所は/, /やり遂げたことは/, /将来は/];
    const isConclusionFirst = conclusionPatterns.some(p => p.test(startChunk));

    // 2. キーワードマッチング
    const matchedKeywords = q.keywords.filter(kw => text.includes(kw));

    // 3. ボリューム判定
    let volumeCheck = "ちょうど良い";
    if (length < 40) volumeCheck = "短め";
    if (length > 250) volumeCheck = "長め";

    // 4. アドバイス生成
    let goodPoint = "落ち着いて自分の言葉で回答できました。";
    if (matchedKeywords.length >= 2) {
      goodPoint += `「${matchedKeywords.join("」「")}」などの大切な視点が入っています！`;
    } else if (isConclusionFirst) {
      goodPoint += "最初に結論をはっきり言えていて、面接官に伝わりやすい構成です。";
    }

    let advice = "";
    if (!isConclusionFirst) {
      advice += "「〜だからです」「私の考えは〜です」と、まず最初に一番言いたい結論を言うとグッと引き締まります。";
    } else if (matchedKeywords.length === 0) {
      advice += `具体例として、${q.intent.slice(0, 30)}…といった工夫や経験を添えるとさらに説得力が増しますよ。`;
    } else {
      advice += "この調子です！本番でも目を見てハキハキと、笑顔で伝えてみてください。";
    }

    return {
      isConclusionFirst,
      matchedKeywords,
      volumeCheck,
      goodPoint,
      advice,
      charCount: length
    };
  }

  // --- 結果画面表示 ---
  showResultScreen() {
    this.setInputAcceptance(false);
    this.stopRecognitionCompletely();
    this.stopTimer();
    this.showView("result");

    const resultSummary = document.getElementById("result-summary");
    const resultList = document.getElementById("result-list");

    const totalQuestions = this.sessionAnswers.length;
    const conclusionCount = this.sessionAnswers.filter(a => a.feedback.isConclusionFirst).length;

    resultSummary.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container text-center">
          <p class="text-xs text-on-surface-variant font-medium">回答設問数</p>
          <p class="text-2xl font-bold text-primary mt-0.5">${totalQuestions} <span class="text-xs">問</span></p>
        </div>
        <div class="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container text-center">
          <p class="text-xs text-on-surface-variant font-medium">結論ファースト率</p>
          <p class="text-2xl font-bold text-secondary mt-0.5">${Math.round((conclusionCount / totalQuestions) * 100)} <span class="text-xs">%</span></p>
        </div>
        <div class="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container text-center">
          <p class="text-xs text-on-surface-variant font-medium">総評</p>
          <p class="text-base font-bold text-tertiary mt-1">大変よく頑張りました！</p>
        </div>
      </div>
    `;

    resultList.innerHTML = this.sessionAnswers.map((item, idx) => `
      <div class="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-surface-container space-y-3">
        <!-- 設問ヘッダー -->
        <div class="flex items-center justify-between border-b border-surface-container pb-2">
          <span class="px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-[11px] font-bold">
            第 ${idx + 1} 問: ${item.question.category}
          </span>
          <span class="text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
            <span class="material-symbols-outlined text-[14px]">timer</span>
            ${item.elapsedSeconds}秒
          </span>
        </div>

        <!-- LINE風 やり取り履歴タイムライン -->
        <div class="p-3.5 bg-surface-container-low rounded-xl space-y-2.5 border border-surface-variant/30">
          <!-- 1. 先生の質問 -->
          <div class="flex items-start gap-2 max-w-[95%]">
            <div class="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 shadow-xs">先</div>
            <div class="space-y-0.5">
              <span class="text-[10px] font-bold text-primary">先生の質問</span>
              <div class="p-2.5 rounded-xl rounded-tl-none bg-surface-container-lowest text-on-surface shadow-xs border border-surface-container text-xs sm:text-sm">「${item.question.question.trim()}」</div>
            </div>
          </div>

          <!-- 2. 佑実さんの回答 -->
          <div class="flex items-start gap-2 max-w-[95%] ml-auto flex-row-reverse">
            <div class="w-6 h-6 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 shadow-xs">佑</div>
            <div class="space-y-0.5 text-right">
              <span class="text-[10px] font-bold text-secondary">佑実さんの回答</span>
              <div class="p-2.5 rounded-xl rounded-tr-none bg-secondary-container text-on-secondary-container shadow-xs border border-secondary/20 text-xs sm:text-sm text-left">「${(item.initialAnswer || "（無回答）").trim()}」</div>
            </div>
          </div>

          <!-- 3. 追加質問＆回答（あれば） -->
          ${item.followUpQuestion ? `
            <div class="pt-2 border-t border-surface-variant/30 space-y-2.5">
              <div class="flex items-start gap-2 max-w-[95%]">
                <div class="w-6 h-6 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 shadow-xs">追</div>
                <div class="space-y-0.5">
                  <span class="text-[10px] font-bold text-tertiary">追加質問</span>
                  <div class="p-2.5 rounded-xl rounded-tl-none bg-amber-50/50 text-on-surface shadow-xs border border-tertiary/30 text-xs sm:text-sm">「${item.followUpQuestion.trim()}」</div>
                </div>
              </div>

              <div class="flex items-start gap-2 max-w-[95%] ml-auto flex-row-reverse">
                <div class="w-6 h-6 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 shadow-xs">佑</div>
                <div class="space-y-0.5 text-right">
                  <span class="text-[10px] font-bold text-secondary">佑実さんの追加回答</span>
                  <div class="p-2.5 rounded-xl rounded-tr-none bg-secondary-container text-on-secondary-container shadow-xs border border-secondary/20 text-xs sm:text-sm text-left">「${(item.followUpAnswer || "（無回答）").trim()}」</div>
                </div>
              </div>
            </div>
          ` : ""}
        </div>

        <!-- 評価＆アドバイス -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
          <div class="p-3 bg-secondary-fixed/20 rounded-xl text-on-secondary-fixed-variant border border-secondary/20">
            <p class="font-bold mb-0.5 flex items-center gap-1">
              <span class="text-secondary font-bold">✔</span> 良かった点
            </p>
            <p class="leading-relaxed">${item.feedback.goodPoint}</p>
          </div>
          <div class="p-3 bg-tertiary-container/20 rounded-xl text-on-tertiary-container border border-tertiary/20">
            <p class="font-bold mb-0.5 flex items-center gap-1">
              <span class="text-tertiary font-bold">💡</span> 次へのアドバイス
            </p>
            <p class="leading-relaxed">${item.feedback.advice}</p>
          </div>
        </div>
      </div>
    `).join("");
  }

  // --- お助けフレーズの処理 ---
  handleRescue(type) {
    const text = RESCUE_RESPONSES[type];
    if (!text) return;

    this.setInputAcceptance(false);
    this.interviewerStatus.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
      <span>先生が答えています…</span>
    `;

    // タイムラインにお助けフレーズと返答を記録
    let rescueLabel = "";
    if (type === "repeat") rescueLabel = "「もう一度お願いします」とお伝えしました";
    if (type === "think") rescueLabel = "「少し考える時間をください」とお伝えしました";
    if (type === "restart") rescueLabel = "「最初からやり直します」とお伝えしました";
    this.addSystemDivider(rescueLabel);
    this.addChatMessage("interviewer", text, { isFollowUp: true });

    this.speakText(text, () => {
      if (type === "repeat") {
        const qText = this.isFollowUp ? this.currentFollowUpQuestion : this.currentQuestion.question;
        this.speakText(qText, () => {
          this.interviewerStatus.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-secondary"></span>
            <span>あなたの番です。</span>
          `;
          this.startAnsweringTurn();
        });
      } else if (type === "think") {
        this.interviewerStatus.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-secondary"></span>
          <span>準備ができたら話してください（お待ちしています）</span>
        `;
        this.startAnsweringTurn();
      } else if (type === "restart") {
        this.resetInputArea();
        this.interviewerStatus.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-secondary"></span>
          <span>深呼吸して、最初からどうぞ。</span>
        `;
        this.startAnsweringTurn();
      }
    });
  }

  pauseInputAndSpeak(text) {
    this.setInputAcceptance(false);
    this.speakText(text, () => {
      this.startAnsweringTurn();
    });
  }

  updateMicUI(active) {
    if (active) {
      this.candidateStatus.innerText = "佑実さんの番です（マイク録音中）";
      this.voiceVisualizer.classList.remove("opacity-20");
      this.btnMic.classList.remove("bg-primary-container");
      this.btnMic.classList.add("bg-error", "animate-pulse");
    } else {
      this.candidateStatus.innerText = "佑実さんの番です（待機中）";
      this.voiceVisualizer.classList.add("opacity-20");
      this.btnMic.classList.add("bg-primary-container");
      this.btnMic.classList.remove("bg-error", "animate-pulse");
    }
  }

  // --- 読み上げ用テキスト変換（「高志」を「こうし」にフリガナ化） ---
  formatForSpeech(text) {
    if (!text) return "";
    return text
      .replace(/高志中等教育学校/g, "こうしちゅうとうきょういくがっこう")
      .replace(/高志中等/g, "こうしちゅうとう")
      .replace(/本校（高志中等）/g, "本校、こうしちゅうとう")
      .replace(/高志/g, "こうし");
  }

  // --- 音声読み上げ（Chrome内蔵・落ち着いた大人の男性声） ---
  speakText(rawText, onEndCallback = null) {
    const speechText = this.formatForSpeech(rawText);
    this.isSpeaking = true;

    if (!('speechSynthesis' in window)) {
      this.isSpeaking = false;
      if (onEndCallback) onEndCallback();
      return;
    }

    // 既存の音声を即座に停止
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "ja-JP";
    utterance.rate = 0.92;  // 落ち着いて聞き取りやすいスピード
    utterance.pitch = 0.85; // 大人の男性の落ち着いた低音トーン

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // 1. 日本語の男性ボイスを優先探索（Ichiro, Keita, Male, 男 など）
      const maleVoice = voices.find(v => 
        (v.lang.startsWith("ja") || v.lang === "ja-JP") && 
        (v.name.includes("Ichiro") || v.name.includes("Keita") || v.name.includes("Kenji") || v.name.includes("Daichi") || v.name.includes("Male") || v.name.includes("男"))
      );

      // 2. 日本語ボイスのフォールバック
      const jaVoice = maleVoice || voices.find(v => v.lang === "ja-JP" || v.lang.startsWith("ja"));

      if (jaVoice) {
        utterance.voice = jaVoice;
        // 男性の個別ボイスが見当たらない場合はピッチをさらに下げて大人の男性の低音に調整
        if (!maleVoice) {
          utterance.pitch = 0.75;
        }
      }
    }

    let hasEnded = false;
    const finish = () => {
      if (hasEnded) return;
      hasEnded = true;
      this.isSpeaking = false;
      if (onEndCallback) onEndCallback();
    };

    utterance.onend = finish;
    utterance.onerror = (e) => {
      console.warn("音声再生エラー:", e);
      finish();
    };

    // 音声再生を開始
    window.speechSynthesis.speak(utterance);
  }

  // --- タイマー操作 ---
  startTimer() {
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.renderTimer();

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.renderTimer();
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  renderTimer() {
    const min = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, "0");
    const sec = String(this.elapsedSeconds % 60).padStart(2, "0");
    this.timerDisplay.innerText = `${min}:${sec}`;
  }
}

// 初期化
window.addEventListener("DOMContentLoaded", () => {
  window.app = new InterviewApp();
});
