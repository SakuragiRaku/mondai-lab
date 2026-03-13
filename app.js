// app.js - モンダイラボ メインロジック

(function() {
  'use strict';

  const MATERIALS_KEY = 'mondai-lab-materials';
  const HISTORY_KEY = 'mondai-lab-history';
  const SUBJECT_ICONS = ['📘', '📗', '📙', '📕', '📒', '💻', '🔬', '🧮', '🌐', '📐'];

  let currentQuiz = null;
  let currentQuestionIdx = 0;
  let quizResults = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== データ管理 =====
  function getMaterials() {
    try { return JSON.parse(localStorage.getItem(MATERIALS_KEY) || '[]'); }
    catch { return []; }
  }

  function saveMaterials(data) {
    localStorage.setItem(MATERIALS_KEY, JSON.stringify(data));
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }

  function saveHistory(data) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
  }

  // ===== 初期化 =====
  function init() {
    setupEventListeners();
    renderHome();
    loadApiKey();
  }

  // ===== ホーム画面 =====
  function renderHome() {
    const materials = getMaterials();
    const history = getHistory();

    // 科目一覧
    const subjects = {};
    materials.forEach(m => {
      if (!subjects[m.subject]) subjects[m.subject] = [];
      subjects[m.subject].push(m);
    });

    const cards = $('#subject-cards');
    const empty = $('#empty-subjects');

    if (Object.keys(subjects).length === 0) {
      empty.classList.remove('hidden');
      cards.innerHTML = '';
      cards.appendChild(empty);
    } else {
      empty.classList.add('hidden');
      cards.innerHTML = Object.entries(subjects).map(([name, units], i) => `
        <div class="subject-card" data-subject="${name}">
          <span class="subject-emoji">${SUBJECT_ICONS[i % SUBJECT_ICONS.length]}</span>
          <div class="subject-info">
            <div class="subject-name">${escapeHtml(name)}</div>
            <div class="subject-units">${units.length}単元</div>
          </div>
        </div>
      `).join('');
    }

    // 統計
    $('#home-subjects').textContent = Object.keys(subjects).length;
    const totalCorrect = history.reduce((sum, h) => sum + h.correct, 0);
    $('#home-correct').textContent = totalCorrect;

    // ストリーク
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (history.some(h => h.date === key)) { streak++; }
      else break;
    }
    $('#home-streak').textContent = streak;
  }

  // ===== 教材管理 =====
  function renderMaterials() {
    const materials = getMaterials();
    $('#material-list').innerHTML = materials.map((m, i) => `
      <div class="material-item">
        <div class="material-info">
          <h4>${escapeHtml(m.subject)} / ${escapeHtml(m.unit)}</h4>
          <p>${m.text.length}文字</p>
        </div>
        <button class="material-delete" data-index="${i}">🗑️</button>
      </div>
    `).join('') || '<p style="padding:20px;color:var(--text-muted);text-align:center;">まだ教材がありません</p>';
  }

  function addMaterial() {
    const subject = $('#subject-name').value.trim();
    const unit = $('#unit-name').value.trim();
    const text = $('#material-text').value.trim();

    if (!subject || !unit || !text) {
      alert('すべてのフィールドを入力してください');
      return;
    }

    const materials = getMaterials();
    materials.push({ subject, unit, text, createdAt: new Date().toISOString() });
    saveMaterials(materials);

    $('#subject-name').value = '';
    $('#unit-name').value = '';
    $('#material-text').value = '';

    renderMaterials();
    renderHome();
  }

  // ===== クイズ設定 =====
  function openQuizSetup(subject) {
    $('#setup-subject').textContent = subject;
    $('#quiz-setup').classList.remove('hidden');
    $('#quiz-setup').dataset.subject = subject;
  }

  function getSetupOptions() {
    const format = $('.pill.active[data-format]')?.dataset.format || 'choice';
    const difficulty = $('.pill.active[data-difficulty]')?.dataset.difficulty || 'normal';
    const count = parseInt($('.pill.active[data-count]')?.dataset.count || '5');
    return { format, difficulty, count };
  }

  // ===== AI問題生成 =====
  async function startQuiz() {
    const subject = $('#quiz-setup').dataset.subject;
    const options = getSetupOptions();

    const materials = getMaterials().filter(m => m.subject === subject);
    const materialText = materials.map(m => `【${m.unit}】\n${m.text}`).join('\n\n');

    $('#quiz-setup').classList.add('hidden');
    $('#quiz-screen').classList.remove('hidden');
    $('#loading').classList.remove('hidden');
    $('#question-card').classList.add('hidden');
    $('#feedback').classList.add('hidden');

    const difficultyMap = { easy: 'やさしい', normal: 'ふつう', hard: 'むずかしい' };
    const formatMap = {
      choice: '4択問題',
      fill: '穴埋め問題（答えを入力する形式）',
      short: '一問一答（記述式）'
    };

    const prompt = `あなたは試験対策の問題を作成するAI講師です。
以下の教材テキストを元に、${formatMap[options.format]}を${options.count}問作成してください。

難易度: ${difficultyMap[options.difficulty]}

教材テキスト:
${materialText}

以下のJSON形式で出力してください。他のテキストは含めないでください。

${options.format === 'choice' ? `
{
  "questions": [
    {
      "question": "問題文",
      "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
      "answer": 0,
      "explanation": "中学生でもわかるように、日常の例えを使ってフレンドリーに解説。難しい用語があれば「ひとことメモ」として簡単に説明を添える。"
    }
  ]
}` : `
{
  "questions": [
    {
      "question": "問題文",
      "answer": "正解のテキスト",
      "keywords": ["採点用キーワード1", "キーワード2"],
      "explanation": "中学生でもわかるように、日常の例えを使ってフレンドリーに解説。難しい用語があれば「ひとことメモ」として簡単に説明を添える。"
    }
  ]
}`}

注意:
- 解説は教科書口調ではなく、フレンドリーで噛み砕いた文体にしてください
- 「〜だよ」「〜だね」のような親しみやすい口調を使ってください
- 日常の例えを積極的に使ってください
- 難易度が「やさしい」の場合は特に丁寧に説明してください`;

    try {
      const response = await AIConfig.callGemini(prompt, { jsonMode: true, temperature: 0.8 });
      const data = JSON.parse(response);

      currentQuiz = {
        subject,
        questions: data.questions,
        format: options.format,
        options,
      };
      currentQuestionIdx = 0;
      quizResults = [];

      $('#loading').classList.add('hidden');
      $('#question-card').classList.remove('hidden');
      showQuestion();
    } catch (error) {
      $('#loading').classList.add('hidden');
      $('#quiz-screen').classList.add('hidden');
      alert('問題の生成に失敗しました:\n' + error.message);
    }
  }

  // ===== 問題表示 =====
  function showQuestion() {
    const q = currentQuiz.questions[currentQuestionIdx];
    const total = currentQuiz.questions.length;

    $('#quiz-progress').textContent = `${currentQuestionIdx + 1} / ${total}`;
    $('#progress-fill').style.width = `${((currentQuestionIdx + 1) / total) * 100}%`;
    $('#question-text').textContent = q.question;
    $('#feedback').classList.add('hidden');
    $('#question-card').classList.remove('hidden');

    const area = $('#answer-area');

    if (currentQuiz.format === 'choice') {
      area.innerHTML = q.choices.map((c, i) => `
        <button class="answer-choice" data-index="${i}">${escapeHtml(c)}</button>
      `).join('');
    } else {
      area.innerHTML = `
        <input type="text" class="answer-input" id="answer-text" placeholder="答えを入力..." />
        <button class="btn-primary submit-answer" id="submit-answer">回答する</button>
      `;
      setTimeout(() => $('#answer-text')?.focus(), 100);
    }
  }

  // ===== 回答チェック =====
  function checkAnswer(userAnswer) {
    const q = currentQuiz.questions[currentQuestionIdx];
    let isCorrect = false;

    if (currentQuiz.format === 'choice') {
      isCorrect = parseInt(userAnswer) === q.answer;

      // ボタンの色更新
      $$('.answer-choice').forEach((btn, i) => {
        btn.style.pointerEvents = 'none';
        if (i === q.answer) btn.classList.add('correct');
        if (i === parseInt(userAnswer) && !isCorrect) btn.classList.add('wrong');
      });
    } else {
      const answer = userAnswer.trim().toLowerCase();
      const correctAnswer = q.answer.toLowerCase();
      const keywords = (q.keywords || []).map(k => k.toLowerCase());

      isCorrect = answer === correctAnswer || keywords.some(k => answer.includes(k));
    }

    quizResults.push({
      question: q.question,
      userAnswer,
      correctAnswer: currentQuiz.format === 'choice' ? q.choices[q.answer] : q.answer,
      isCorrect,
      explanation: q.explanation,
    });

    showFeedback(isCorrect, q.explanation);
  }

  function showFeedback(isCorrect, explanation) {
    const feedback = $('#feedback');
    feedback.classList.remove('hidden');

    if (isCorrect) {
      $('#feedback-icon').textContent = '🎉';
      $('#feedback-result').textContent = 'すごい! 正解!!';
      $('#feedback-result').className = 'feedback-result correct';
      triggerConfetti();
    } else {
      $('#feedback-icon').textContent = '😅';
      $('#feedback-result').textContent = 'おしい! 不正解...';
      $('#feedback-result').className = 'feedback-result wrong';
    }

    $('#feedback-explanation').textContent = explanation || '';

    const isLast = currentQuestionIdx >= currentQuiz.questions.length - 1;
    $('#next-question').textContent = isLast ? '結果を見る 🏆' : '次の問題 →';
  }

  function nextQuestion() {
    currentQuestionIdx++;

    if (currentQuestionIdx >= currentQuiz.questions.length) {
      showResults();
    } else {
      showQuestion();
    }
  }

  // ===== 結果 =====
  function showResults() {
    $('#quiz-screen').classList.add('hidden');
    $('#result-screen').classList.remove('hidden');

    const correct = quizResults.filter(r => r.isCorrect).length;
    const total = quizResults.length;
    const accuracy = Math.round((correct / total) * 100);

    $('#score-value').textContent = correct;
    $('#score-total').textContent = `/ ${total}`;
    $('#result-accuracy').textContent = `正答率: ${accuracy}%`;

    if (accuracy === 100) {
      $('#result-emoji').textContent = '🏆';
      $('#result-title').textContent = 'パーフェクト!!';
      $('#result-message').textContent = '全問正解!すごすぎる!この調子でどんどん進もう!🌟';
      triggerConfetti();
    } else if (accuracy >= 80) {
      $('#result-emoji').textContent = '🎉';
      $('#result-title').textContent = 'すばらしい!';
      $('#result-message').textContent = 'ほとんど正解!あと少しで完璧だね!💪';
    } else if (accuracy >= 50) {
      $('#result-emoji').textContent = '😊';
      $('#result-title').textContent = 'いいぞ!';
      $('#result-message').textContent = '半分以上正解!間違えた問題を復習すればもっと伸びるよ!📈';
    } else {
      $('#result-emoji').textContent = '💪';
      $('#result-title').textContent = 'まだまだこれから!';
      $('#result-message').textContent = '大丈夫、最初はみんな間違えるもの。復習してもう一回挑戦しよう!🔥';
    }

    // 記録保存
    const history = getHistory();
    history.unshift({
      subject: currentQuiz.subject,
      format: currentQuiz.options.format,
      difficulty: currentQuiz.options.difficulty,
      total,
      correct,
      accuracy,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
    });
    saveHistory(history);
  }

  function showWrongAnswers() {
    const wrong = quizResults.filter(r => !r.isCorrect);
    const container = $('#wrong-answers');

    if (wrong.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">間違えた問題はありません!🎉</p>';
    } else {
      container.innerHTML = wrong.map(r => `
        <div class="wrong-item">
          <div class="wrong-q">❓ ${escapeHtml(r.question)}</div>
          <div class="wrong-a">✗ あなたの回答: ${escapeHtml(String(r.userAnswer))}</div>
          <div class="wrong-correct">✓ 正解: ${escapeHtml(r.correctAnswer)}</div>
        </div>
      `).join('');
    }

    container.classList.toggle('hidden', container.classList.contains('hidden') ? false : true);
  }

  // ===== 履歴 =====
  function renderHistory() {
    const history = getHistory();

    const totalQ = history.reduce((sum, h) => sum + h.total, 0);
    const avgAcc = history.length > 0
      ? Math.round(history.reduce((sum, h) => sum + h.accuracy, 0) / history.length)
      : 0;

    $('#hist-total-q').textContent = totalQ;
    $('#hist-accuracy').textContent = avgAcc + '%';

    const formatLabels = { choice: '4択', fill: '穴埋め', short: '記述' };
    const diffLabels = { easy: '😊', normal: '🤔', hard: '🔥' };

    $('#history-list').innerHTML = history.slice(0, 20).map(h => `
      <div class="history-item">
        <div class="history-info">
          <h4>${escapeHtml(h.subject)} (${formatLabels[h.format] || ''} ${diffLabels[h.difficulty] || ''})</h4>
          <p>${h.date}</p>
        </div>
        <span class="history-score">${h.correct}/${h.total}</span>
      </div>
    `).join('') || '<p style="padding:20px;color:var(--text-muted);text-align:center;">まだ記録がありません</p>';
  }

  // ===== APIキー =====
  function loadApiKey() {
    if (typeof AIConfig !== 'undefined' && AIConfig.hasApiKey()) {
      $('#api-key-input').value = '••••••••';
      showApiStatus('設定済み ✓', 'success');
    }
  }

  function saveApiKey() {
    const key = $('#api-key-input').value.trim();
    if (!key || key === '••••••••') return;
    AIConfig.setApiKey(key);
    showApiStatus('保存しました ✓', 'success');
    $('#api-key-input').value = '••••••••';
  }

  function showApiStatus(text, type) {
    const el = $('#api-status');
    el.textContent = text;
    el.className = 'api-status ' + type;
  }

  // ===== 紙吹雪 =====
  function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
    const pieces = [];

    for (let i = 0; i < 80; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        w: 8 + Math.random() * 6,
        h: 6 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: 2 + Math.random() * 4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
        drift: (Math.random() - 0.5) * 2,
      });
    }

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let allDone = true;

      pieces.forEach(p => {
        p.y += p.speed;
        p.x += p.drift;
        p.angle += p.spin;

        if (p.y < canvas.height + 20) allDone = false;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      frame++;
      if (!allDone && frame < 300) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    animate();
  }

  // ===== ユーティリティ =====
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function switchView(viewId) {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $(`[data-view="${viewId}"]`)?.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${viewId}`).classList.add('active');
  }

  // ===== イベントリスナー =====
  function setupEventListeners() {
    // ナビゲーション
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        if (btn.dataset.view === 'home') renderHome();
        if (btn.dataset.view === 'materials') renderMaterials();
        if (btn.dataset.view === 'history') renderHistory();
      });
    });

    // ホーム - 教材へ
    document.addEventListener('click', (e) => {
      if (e.target.id === 'go-materials') {
        switchView('materials');
        renderMaterials();
      }
    });

    // 科目カードクリック
    $('#subject-cards').addEventListener('click', (e) => {
      const card = e.target.closest('.subject-card');
      if (!card) return;
      if (!AIConfig.hasApiKey()) {
        alert('先にGemini APIキーを設定してください（⚙️ 設定から）');
        return;
      }
      openQuizSetup(card.dataset.subject);
    });

    // 教材保存
    $('#save-material').addEventListener('click', addMaterial);

    // 教材削除
    $('#material-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.material-delete');
      if (!btn) return;
      const idx = parseInt(btn.dataset.index);
      const materials = getMaterials();
      materials.splice(idx, 1);
      saveMaterials(materials);
      renderMaterials();
      renderHome();
    });

    // ===== クイズ設定 =====
    // ピル選択
    document.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      const group = pill.closest('.option-pills');
      if (!group) return;
      group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });

    $('#setup-cancel').addEventListener('click', () => {
      $('#quiz-setup').classList.add('hidden');
    });

    $('#setup-start').addEventListener('click', startQuiz);

    // ===== クイズ =====
    // 4択回答
    $('#answer-area').addEventListener('click', (e) => {
      const choice = e.target.closest('.answer-choice');
      if (!choice || choice.classList.contains('correct') || choice.classList.contains('wrong')) return;
      checkAnswer(choice.dataset.index);
    });

    // 記述式回答
    document.addEventListener('click', (e) => {
      if (e.target.id === 'submit-answer') {
        const input = $('#answer-text');
        if (input && input.value.trim()) checkAnswer(input.value);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && $('#answer-text') && !$('#feedback').classList.contains('hidden') === false) {
        const input = $('#answer-text');
        if (input && input.value.trim()) checkAnswer(input.value);
      }
    });

    $('#next-question').addEventListener('click', nextQuestion);

    $('#quiz-quit').addEventListener('click', () => {
      if (confirm('テストを中断しますか？')) {
        $('#quiz-screen').classList.add('hidden');
        renderHome();
      }
    });

    // ===== 結果 =====
    $('#result-home').addEventListener('click', () => {
      $('#result-screen').classList.add('hidden');
      renderHome();
      switchView('home');
    });

    $('#result-review').addEventListener('click', showWrongAnswers);

    // ===== 設定 =====
    $('#save-api-key').addEventListener('click', saveApiKey);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
