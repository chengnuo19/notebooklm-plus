// src/content/frame-bootstrap.js
// 仅注入到测验 iframe(*.scf.usercontent.goog,manifest 第二个 content_scripts 条目)。
// 不建工具栏/界面,只驱动 quiz-observer 的心跳:回传 DOM 轮廓(校准用)+ 采集错题。
(function () {
  const NS = window.NBLMPlus || {};
  if (!NS.quizFrame || !NS.quizFrame.scan) return;
  const tick = NS.quizFrame.scan;

  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function start() {
    tick();
    // 评分常以 class / aria-checked 变化体现,所以也观察属性变化
    new MutationObserver(debounce(tick, 400)).observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'aria-checked', 'aria-selected', 'aria-pressed'],
    });
    // 兜底:前 ~30 秒每 2 秒回传一次,确保校准期一定能拿到结构
    let n = 0;
    const iv = setInterval(() => { tick(); if (++n >= 15) clearInterval(iv); }, 2000);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
