// src/content/bootstrap.js
// SPA 感知的统一初始化与“心跳”:挂工具栏、扫描回答/测验/菜单、处理路由切换。
// 单个 MutationObserver 驱动所有幂等的 scan,避免多个观察器互相打架。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage;
  let started = false;

  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function publishNotebookId() {
    if (storage.setActiveNotebook && NS.dom) storage.setActiveNotebook(NS.dom.getNotebookId());
  }

  function listenFrame() {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d && d.type === 'NBLM_GET_NOTEBOOK_ID' && e.source && NS.dom) {
        e.source.postMessage({
          type: 'NBLM_NOTEBOOK_ID_RESPONSE',
          requestId: d.requestId,
          notebookId: NS.dom.getNotebookId(),
        }, '*');
        return;
      }
      if (d && d.__nblm === 'quiz-history') {
        const duplicateCount = (d.exact || 0) + (d.similar || 0);
        if (duplicateCount && NS.ui) {
          NS.ui.toast(`本套测验新题率 ${d.newRate}%：发现 ${duplicateCount} 道重复或相似题`);
        }
        console.log(
          '%c[NBLM+] 测验防重复:',
          'color:#2563eb',
          d.chapter || '',
          d,
        );
        return;
      }
      if (d && d.__nblm === 'good_captured') {
        let msg = '⭐️ 已收入好题本';
        if (d.syncResult === 'success') msg += ' (已同步至 Notion)';
        else if (d.syncResult) msg += ` (同步失败: ${d.syncResult})`;
        if (NS.ui) {
          NS.ui.toast(msg, () => {
            if (NS.goodReview && NS.goodReview.open) NS.goodReview.open();
          });
        }
        return;
      }
      if (!d || d.__nblm !== 'captured') return;
      if (d.isCorrect === false) {
        let msg = '已收入错题本';
        if (d.syncResult === 'success') msg += ' (已同步至 Notion)';
        else if (d.syncResult) msg += ` (同步失败: ${d.syncResult})`;
        if (NS.ui) {
          NS.ui.toast(msg + '（点击去复习）', () => {
            if (NS.quizReview && NS.quizReview.open) NS.quizReview.open();
          });
        }
        console.log('%c[NBLM+] 采集错题:', 'color:#16a34a', d.stem || '');
      } else {
        console.log('%c[NBLM+] 测验答对，记录 session:', 'color:#16a34a', d.stem || '');
      }
    });
  }

  // 幂等扫描:可被反复调用
  function scan() {
    if (NS.toolbar) NS.toolbar.ensureMounted();
    if (NS.export && NS.export.scanAnswers) NS.export.scanAnswers();
    if (NS.export && NS.export.scanArtifactMenus) NS.export.scanArtifactMenus();
    if (NS.quizObserver && NS.quizObserver.scan) NS.quizObserver.scan();
    if (NS.quizExplain && NS.quizExplain.pendingExplanation && NS.dom) {
      const answers = NS.dom.getAnswerNodes();
      if (answers.length) NS.quizExplain.handleNewAnswer(answers[answers.length - 1]);
    }
    if (NS.quizChatCapture && NS.quizChatCapture.scan) NS.quizChatCapture.scan();
    if (NS.timeline && NS.timeline.refresh) NS.timeline.refresh();
    if (NS.chatEnhance && NS.chatEnhance.scan) NS.chatEnhance.scan();
  }

  function onRouteChange() {
    publishNotebookId();
    if (NS.quizObserver && NS.quizObserver.reset) NS.quizObserver.reset();
    if (NS.ui && NS.ui.closeOverlay) NS.ui.closeOverlay();
    scan();
  }

  function hookHistory() {
    const fire = () => window.dispatchEvent(new Event('nblm:route'));
    ['pushState', 'replaceState'].forEach((m) => {
      const orig = history[m];
      history[m] = function () { const r = orig.apply(this, arguments); fire(); return r; };
    });
    window.addEventListener('popstate', fire);
    let last = location.href;
    setInterval(() => { if (location.href !== last) { last = location.href; fire(); } }, 1000);
    window.addEventListener('nblm:route', debounce(onRouteChange, 250));
  }

  function start() {
    if (started) return;
    started = true;
    if (NS.toolbar) NS.toolbar.mount();
    publishNotebookId();
    listenFrame();
    scan();
    if (NS.chatWidth && NS.chatWidth.apply) NS.chatWidth.apply();
    new MutationObserver(debounce(scan, 300)).observe(document.body, { childList: true, subtree: true });
    hookHistory();
  }

  (function waitReady() {
    if (document.body) start();
    else requestAnimationFrame(waitReady);
  })();
})();
