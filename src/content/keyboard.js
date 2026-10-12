// src/content/keyboard.js
// 全局键盘快捷键系统
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  const SHORTCUTS = {
    'Alt+Q': { label: '出题要求', action: () => NS.quizPrompt && NS.quizPrompt.open() },
    'Alt+R': { label: '错题复习', action: () => NS.quizReview && NS.quizReview.open() },
    'Alt+E': { label: '导出文档', action: () => NS.export && NS.export.openMenu() },
    'Alt+P': { label: '提示词库', action: () => NS.promptLibrary && NS.promptLibrary.open() },
    'Alt+W': { label: '界面宽度', action: () => NS.chatWidth && NS.chatWidth.openPanel() },
    'Alt+T': { label: '时间线', action: () => NS.timeline && NS.timeline.toggle && NS.timeline.toggle() },
    'Escape': { label: '关闭弹窗', action: () => NS.ui && NS.ui.closeOverlay() },
  };

  function keyCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.key && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift') {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    return parts.join('+');
  }

  function handler(e) {
    // Skip if user is typing in an input/textarea
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
      if (e.key === 'Escape') {
        // Allow Escape even in inputs
      } else {
        return;
      }
    }
    const combo = keyCombo(e);
    const shortcut = SHORTCUTS[combo];
    if (shortcut) {
      e.preventDefault();
      e.stopPropagation();
      shortcut.action();
    }
  }

  function showHelp() {
    const { h } = NS.ui;
    const rows = Object.entries(SHORTCUTS).map(([key, { label }]) =>
      h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' } },
        h('span', { text: label, style: { fontWeight: '600', color: '#1e293b' } }),
        h('kbd', { text: key, style: { background: '#f1f5f9', padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #e2e8f0' } })
      )
    );
    const body = h('div', null, ...rows);
    NS.ui.openOverlay(body, { title: '⌨️ 键盘快捷键' });
  }

  document.addEventListener('keydown', handler, true);

  NS.keyboard = { SHORTCUTS, showHelp };
})();
