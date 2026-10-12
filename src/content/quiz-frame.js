// src/content/quiz-frame.js
// 由 background.js 注入到测验 blob iframe(*.scf.usercontent.goog)。
// 扫描 button.answer-btn DOM，捕获错题写入 storage.local，再通知主页面显示 toast。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage;
  if (!storage) return;

  const processed = new Set();
  const processing = new Set();
  const historyProcessed = new Set();
  const historyProcessing = new Set();
  const DUPLICATE_THRESHOLDS = { loose: 0.82, standard: 0.72, strict: 0.62 };
  const userSelections = new Map();

  const injectButtonsObserver = new MutationObserver(() => {
    const qEl = document.querySelector('h1.question-text');
    if (!qEl || qEl.dataset.nblmInjected) return;
    
    // Check if buttons already exist to prevent duplicate injection
    if (qEl.parentElement.querySelector('.nblm-quick-actions')) return;
    qEl.dataset.nblmInjected = 'true';

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'nblm-quick-actions';
    actionsWrap.style.cssText = 'display: inline-flex; gap: 8px; margin-left: 12px; vertical-align: middle;';

    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '📋 复制';
    copyBtn.style.cssText = 'background: rgba(0,0,0,0.05); border: none; padding: 4px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; color: #475569; display: flex; align-items: center; gap: 4px;';
    
    const favBtn = document.createElement('button');
    favBtn.innerHTML = '⭐️ 收入好题';
    favBtn.style.cssText = 'background: rgba(234,179,8,0.15); border: none; padding: 4px 8px; border-radius: 6px; font-size: 12px; cursor: pointer; color: #a16207; display: flex; align-items: center; gap: 4px;';

    copyBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const p = parseCurrentQuestion();
      if (!p) {
        // Fallback to just copying the text if we can't parse it yet
        navigator.clipboard.writeText(qEl.textContent.trim());
      } else {
        let text = `【题目】${p.stem}\n`;
        p.options.forEach((opt, i) => text += `${String.fromCharCode(65 + i)}. ${opt}\n`);
        navigator.clipboard.writeText(text.trim());
      }
      const old = copyBtn.innerHTML;
      copyBtn.innerHTML = '✅ 已复制';
      setTimeout(() => copyBtn.innerHTML = old, 1500);
    };

    favBtn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const p = parseCurrentQuestion();
      if (!p) {
        // Fallback simple parsing if options aren't fully rendered or clicked
        const stem = qEl.textContent.trim();
        const opts = Array.from(document.querySelectorAll('.answer-text')).map(o => o.textContent.trim());
        await saveToGoodBook({ stem, options: opts, type: 'single' });
      } else {
        await saveToGoodBook(p);
      }
      const old = favBtn.innerHTML;
      favBtn.innerHTML = '✅ 已收入';
      setTimeout(() => favBtn.innerHTML = old, 1500);
    };

    async function saveToGoodBook(p) {
      const id = await requestParentNotebookId() || await storage.getActiveNotebook();
      if (!id) return;
      const item = {
        id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type: p.type || 'single',
        stem: p.stem,
        options: p.options || [],
        correct: p.correctIdx || [],
        ts: Date.now()
      };
      await storage.addGood(id, item);
      let syncResult = null;
      if (NS.notionAPI && NS.notionAPI.syncSingleQuestion) {
        try {
          const res = await NS.notionAPI.syncSingleQuestion(item, id, true);
          if (res) syncResult = 'success';
        } catch (e) {
          syncResult = e.message;
        }
      }
      try { window.parent.postMessage({ __nblm: 'good_captured', stem: p.stem.slice(0, 60), syncResult }, '*'); } catch (err) {}
    }

    actionsWrap.appendChild(copyBtn);
    actionsWrap.appendChild(favBtn);
    
    // Appending to the header container. Angular sometimes replaces contents, so we append after the h1.
    if (qEl.nextSibling) {
      qEl.parentNode.insertBefore(actionsWrap, qEl.nextSibling);
    } else {
      qEl.parentNode.appendChild(actionsWrap);
    }
  });

  injectButtonsObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button.answer-btn');
    if (!btn) return;
    const qEl = document.querySelector('h1.question-text');
    if (!qEl) return;
    const stem = qEl.textContent.trim();
    if (!stem) return;
    const btns = Array.from(document.querySelectorAll('button.answer-btn'));
    const idx = btns.indexOf(btn);
    if (idx === -1) return;
    if (!userSelections.has(stem)) userSelections.set(stem, new Set());
    const graded = btns.some(b => b.classList.contains('correct') || b.classList.contains('incorrect') || b.classList.contains('faded'));
    if (!graded) {
      userSelections.get(stem).add(idx);
    }
  }, true);

  function requestParentNotebookId() {
    return new Promise((resolve) => {
      if (!window.parent || window.parent === window) {
        resolve(null);
        return;
      }
      const requestId = 'nb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(null);
      }, 750);

      function onMessage(event) {
        const d = event.data;
        if (event.source !== window.parent ||
            !d || d.type !== 'NBLM_NOTEBOOK_ID_RESPONSE' || d.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(d.notebookId || null);
      }

      window.addEventListener('message', onMessage);
      try {
        window.parent.postMessage({ type: 'NBLM_GET_NOTEBOOK_ID', requestId }, '*');
      } catch (_) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(null);
      }
    });
  }

  function parseCurrentQuestion() {
    const qEl = document.querySelector('h1.question-text');
    if (!qEl) return null;
    const stem = qEl.textContent.trim();
    if (!stem) return null;

    const btns = Array.from(document.querySelectorAll('button.answer-btn'));
    if (!btns.length) return null;

    const graded = btns.some(b =>
      b.classList.contains('correct') || b.classList.contains('incorrect') || b.classList.contains('faded')
    );
    if (!graded) return null;

    const options = btns.map(b =>
      (b.getAttribute('aria-label') || '').replace(/^[A-Z]\.\s*/, '').trim() ||
      (b.querySelector('.answer-text') || b).textContent.trim().replace(/\s+/g, ' ')
    );
    const correctIdx = btns.reduce((a, b, i) => b.classList.contains('correct')   ? [...a, i] : a, []);
    const mineIdx    = btns.reduce((a, b, i) => b.classList.contains('incorrect') ? [...a, i] : a, []);

    let type = 'single';
    try {
      const raw = document.querySelector('app-root[data-app-data]').dataset.appData;
      const quizData = JSON.parse(raw).quiz || [];
      const normStem = stem.replace(/\s+/g, '').slice(0, 15);
      const match = quizData.find(q => {
        if (!q.question) return false;
        const normQ = q.question.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
        return normQ.startsWith(normStem) || normStem.startsWith(normQ.slice(0, 15));
      });
      if (match) {
        if (match.type === 'true_false') type = 'truefalse';
        else if ((match.answerOptions || []).filter(o => o.isCorrect).length > 1) type = 'multi';
      }
    } catch (e) {}

    // 后置校验与兜底判断
    if (correctIdx.length > 1) {
      type = 'multi';
    } else if (document.querySelector('true-false-question')) {
      type = 'truefalse';
    } else if (options.length === 2) {
      const optStr = options.join('|');
      if (/对\|错|正确\|错误|true\|false/i.test(optStr)) {
        type = 'truefalse';
      }
    }

    let isCorrect = false;
    let selected = null;

    const clicks = userSelections.get(stem);
    if (clicks && clicks.size > 0) {
      selected = Array.from(clicks);
      // 如果用户点击了任何不属于正确答案的选项，则视为答错
      const clickedWrong = selected.some(idx => !correctIdx.includes(idx));
      isCorrect = !clickedWrong && selected.length === correctIdx.length && correctIdx.length > 0;
    } else {
      // 如果未捕获到点击事件，尝试从 DOM 的选中状态读取
      const checkedIdx = btns.reduce((a, b, i) => 
        (b.getAttribute('aria-checked') === 'true' || 
         b.getAttribute('aria-selected') === 'true' || 
         b.getAttribute('aria-pressed') === 'true' || 
         b.classList.contains('selected')) ? [...a, i] : a, 
      []);

      if (checkedIdx.length > 0) {
        selected = checkedIdx;
        const clickedWrong = selected.some(idx => !correctIdx.includes(idx));
        isCorrect = !clickedWrong && selected.length === correctIdx.length && correctIdx.length > 0;
      } else {
        // 终极兜底：依赖 incorrect 类名
        isCorrect = mineIdx.length === 0 && correctIdx.length > 0;
        selected = isCorrect ? [...correctIdx] : [...mineIdx];
      }
    }

    return { stem, options, correctIdx, mineIdx, type, isCorrect, selected };
  }

  function readQuizQuestions() {
    const root = document.querySelector('app-root[data-app-data]');
    if (!root || !root.dataset.appData) return [];
    try {
      const quiz = JSON.parse(root.dataset.appData).quiz;
      if (!Array.isArray(quiz)) return [];
      return quiz.map((question) => ({
        stem: String(question.question || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        options: (question.answerOptions || []).map((option) =>
          typeof option === 'string'
            ? option
            : option.text || option.optionText || option.content || ''),
      })).filter((question) => question.stem);
    } catch (_) {
      return [];
    }
  }

  async function captureQuizHistory() {
    if (!storage.getSettings || !storage.addQuizHistory) return;
    const questions = readQuizQuestions();
    if (!questions.length) return;
    const fingerprint = JSON.stringify(questions.map((question) => question.stem));
    if (historyProcessed.has(fingerprint) || historyProcessing.has(fingerprint)) return;

    historyProcessing.add(fingerprint);
    try {
      const settings = await storage.getSettings();
      const defaults = settings.quizDefaults || {};
      if (defaults.avoidDuplicates === false) {
        historyProcessed.add(fingerprint);
        return;
      }
      const id = await requestParentNotebookId() || await storage.getActiveNotebook();
      if (!id) return;
      const threshold = DUPLICATE_THRESHOLDS[defaults.duplicateStrictness] ||
        DUPLICATE_THRESHOLDS.standard;
      const report = await storage.addQuizHistory(id, defaults.scope, questions, threshold);
      historyProcessed.add(fingerprint);
      try {
        window.parent.postMessage(Object.assign({
          __nblm: 'quiz-history',
          chapter: String(defaults.scope || '').trim() || '全部来源内容',
        }, report), '*');
      } catch (_) {}
    } finally {
      historyProcessing.delete(fingerprint);
    }
  }

  async function scan() {
    let key = null;
    try {
      await captureQuizHistory();
      const p = parseCurrentQuestion();
      if (!p) return;
      key = JSON.stringify([p.stem, p.options]);
      if (processed.has(key) || processing.has(key)) return;
      if (!p.correctIdx.length) return; // Not graded yet or correct answer not revealed

      processing.add(key);
      const id = await requestParentNotebookId() || await storage.getActiveNotebook();
      if (!id) return;

      // 1. 保存到 Quiz Session
      const questions = readQuizQuestions();
      if (questions.length) {
        const fingerprint = JSON.stringify(questions.map((q) => q.stem));
        const settings = await storage.getSettings();
        const scope = settings.quizDefaults ? settings.quizDefaults.scope : '';
        let sessions = await storage.getQuizSessions(id);
        let session = sessions.find(s => s.quizFingerprint === fingerprint && s.status === 'active');
        
        if (!session) {
          session = {
            id: 'qs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            notebookId: id,
            quizFingerprint: fingerprint,
            scope: scope,
            startedAt: Date.now(),
            completedAt: 0,
            status: 'active',
            totalQuestions: questions.length,
            questions: []
          };
        }

        const existingQIdx = session.questions.findIndex(q => q.stem === p.stem);
        const qData = {
          id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          stem: p.stem,
          options: p.options,
          correct: p.correctIdx,
          selected: p.selected,
          isCorrect: p.isCorrect,
          type: p.type,
          answeredAt: Date.now()
        };

        if (existingQIdx >= 0) {
          session.questions[existingQIdx] = Object.assign({}, session.questions[existingQIdx], qData);
        } else {
          session.questions.push(qData);
        }

        if (session.questions.length >= session.totalQuestions) {
          session.status = 'completed';
          session.completedAt = Date.now();
        }

        await storage.saveQuizSession(id, session);
        try { window.parent.postMessage({ __nblm: 'quiz-session-updated', session: session }, '*'); } catch (e) {}
      }

      // 2. 错题保存到错题本 (原有逻辑)
      if (!p.isCorrect) {
        const item = {
          id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          type: p.type, stem: p.stem, options: p.options,
          correct: p.correctIdx, mine: (p.selected && p.selected.length > 0) ? p.selected : p.mineIdx,
          ts: Date.now(), wrongCount: 1, rightStreak: 0,
          reviewCount: 0, lastReviewedAt: 0,
        };
        await storage.addWrong(id, item);

        let syncResult = null;
        if (NS.notionAPI && NS.notionAPI.syncSingleQuestion) {
          try {
            const res = await NS.notionAPI.syncSingleQuestion(item, id, false);
            if (res) syncResult = 'success';
          } catch (e) {
            syncResult = e.message;
          }
        }

        processed.add(key);
        try { window.parent.postMessage({ __nblm: 'captured', stem: p.stem.slice(0, 60), isCorrect: p.isCorrect, syncResult }, '*'); } catch (e) {}
      } else {
        processed.add(key);
        try { window.parent.postMessage({ __nblm: 'captured', stem: p.stem.slice(0, 60), isCorrect: p.isCorrect }, '*'); } catch (e) {}
      }
    } catch (e) {
      console.warn('[NotebookLM Plus] quiz-frame scan 出错(已忽略):', e);
    } finally {
      if (key) processing.delete(key);
    }
  }

  // 监听来自父窗口的导出内容请求
  window.addEventListener('message', (event) => {
    const d = event.data;
    if (event.source === window.parent && d && d.type === 'NBLM_GET_ARTIFACT_CONTENT') {
      try {
        let appData = null;
        const appRoot = document.querySelector('app-root[data-app-data]');
        if (appRoot && appRoot.dataset.appData) {
          try {
            appData = JSON.parse(appRoot.dataset.appData);
          } catch (_) {}
        }
        const titleEl = document.querySelector('h1, h2, .title, .header');
        const title = titleEl ? titleEl.textContent.trim() : '';
        
        window.parent.postMessage({
          type: 'NBLM_ARTIFACT_CONTENT_RESPONSE',
          requestId: d.requestId,
          success: true,
          html: document.body.innerHTML,
          title: title,
          appData: appData
        }, '*');
      } catch (err) {
        window.parent.postMessage({
          type: 'NBLM_ARTIFACT_CONTENT_RESPONSE',
          requestId: d.requestId,
          success: false,
          error: err.message
        }, '*');
      }
    }
  });

  NS.quizFrame = {
    scan,
    reset: () => {
      processed.clear();
      processing.clear();
      historyProcessed.clear();
      historyProcessing.clear();
      userSelections.clear();
    },
  };
})();
