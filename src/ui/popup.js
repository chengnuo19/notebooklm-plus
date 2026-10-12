// src/ui/popup.js — 扩展图标弹窗:打开设置 / 打开 NotebookLM
document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
document.getElementById('open-nblm').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
  window.close();
});
