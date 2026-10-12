// src/content/quiz-observer.js
// 主页面侧：错题采集在 blob iframe 内由 quiz-frame.js 完成。
// 这里只暴露 scan/reset/debug 存根，供 bootstrap.js 调用不报错。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  NS.quizObserver = {
    scan:  () => {},
    reset: () => {},
    debug: () => console.log('[NBLM+] 错题采集在 blob iframe 内运行，见 background.js 注入日志。'),
  };
})();
