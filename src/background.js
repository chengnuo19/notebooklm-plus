// src/background.js
importScripts('common/ai-client.js');
// Service worker:监听子 frame 导航到 blob: URL(测验 mini-app 的实际渲染文档),
// 第一时间注入错题本采集脚本(quiz-frame.js + frame-bootstrap.js)。
//
// 流程:NotebookLM 先把测验 iframe 的 src 设为 *.scf.usercontent.goog/... ,
// 该页面脚本再把自身 location 改写为 blob:https://*.scf.usercontent.goog/<uuid>;
// Angular 测验 app 在这个 blob 文档里运行。
// webNavigation.onCommitted 恰好在 blob 文档提交时触发,此时注入采集代码。
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) return;            // 只处理子 frame
  const isBlob = details.url.startsWith('blob:');
  const isScf = details.url.includes('scf.usercontent.goog');
  if (!isBlob && !isScf) return;

  chrome.scripting.executeScript({
    target: { 
      tabId: details.tabId, 
      frameIds: [details.frameId]
    },
    files: [
      'src/common/question-dedup.js',
      'src/common/storage.js',
      'src/common/notion-api.js',
      'src/content/quiz-frame.js',
      'src/content/frame-bootstrap.js',
    ],
  }).catch((err) => {
    console.warn('[NotebookLM Plus] Script injection failed:', err);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NOTION_API_REQUEST') {
    const { url, method, headers, body } = message;
    fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
      .then((res) => res.text().then((text) => ({ status: res.status, ok: res.ok, text })))
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // async response
  }
  if (message.type === 'AI_REVIEW_REQUEST') {
    const { sessionData, settings } = message;
    globalThis.NBLMPlus.aiClient.generateReview(sessionData, settings)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});
