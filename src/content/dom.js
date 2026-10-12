// src/content/dom.js
// 所有与 NotebookLM 页面结构强相关的逻辑集中在此一处。
// ⚠️ NotebookLM 是 Angular SPA:class 名动态生成、版本会改结构。
//    下面每个 SELECTORS 条目都给了多个候选(优先 aria/role/语义,其次结构)。
//    某处定位失效时——只改这里。finder 找不到不会崩,只在控制台给一次性提示。
//    标了 VERIFY 的项需要对照真实 NotebookLM DOM 校准(见 README「校准选择器」)。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  const SELECTORS = {
    // 主对话输入框 —— 实地校准(2026-06-12):<query-box> 内的 textarea
    chatInput: [
      'query-box textarea',
      'textarea.query-box-input',
      'textarea[aria-label="查询框"]',
      'rich-textarea textarea',
      'div[contenteditable="true"][role="textbox"]',
    ],
    // 对话区主容器 (用于调整宽度)
    chatContainer: [
      'main > div > div:nth-child(1)',
      '.chat-container',
      'app-chat-layout > div',
      'main [role="log"]'
    ],
    // VERIFY: 自带测验生成器里「出题要求」输入框(生成测验的对话框/面板内)
    quizCustomBox: [
      'textarea[aria-label*="测验" i]',
      'textarea[aria-label*="quiz" i]',
      'mat-dialog-container textarea',
      '[role="dialog"] textarea',
      '[role="dialog"] input[type="text"]',
    ],
    // VERIFY: AI 回答节点(助手消息容器)
    answerNode: [
      '[data-message-author-role="assistant"]',
      'chat-message[data-role="model"]',
      '.chat-message-model',
      'message-content',
    ],
    // VERIFY: 用户提问节点
    userNode: [
      '[data-message-author-role="user"]',
      'chat-message[data-role="user"]',
      'to-user-message-card',
      '.to-user-message-card-content',
    ],
    // VERIFY: 笔记卡片(Studio 中保存的 note)
    noteCard: [
      'note-card',
      '[data-note-id]',
      '.note-card',
    ],
    // 校准(2026-06-12):生成物外层容器为 <app-viewer>/<artifact-viewer>。
    // ⚠️ 注意:生成物正文(测验/思维导图等)实际渲染在**跨域 iframe**(*.scf.usercontent.goog)内,
    //    顶层 content script 无法读取其正文,导出生成物正文受限(见 README「生成物在 iframe 内」)。
    artifact: [
      'app-viewer',
      'artifact-viewer',
      '[data-artifact]',
    ],
    openNote: [
      'note-editor',
      'app-note-editor',
      'note-viewer',
      'app-note-viewer',
      'note-detail',
      'app-note-detail',
      '.note-editor',
      '.note-viewer',
      '.note-detail',
      '.note-container',
      '.note-editor-container',
      'section.studio-panel',
    ],
    // Studio 生成物卡片与三点菜单。优先使用语义属性，页面改版时只需校准此处。
    artifactCard: [
      'artifact-card',
      '[data-artifact-id]',
      '[data-artifact-type]',
      '.artifact-card',
      '[role="listitem"]',
      'mat-card',
      'li',
    ],
    artifactMenuTrigger: [
      'button[aria-label*="more" i]',
      'button[aria-label*="options" i]',
      'button[aria-label*="更多"]',
      'button[aria-label*="选项"]',
    ],
    artifactMenu: [
      '[role="menu"]',
      'mat-menu-content',
      '.mat-mdc-menu-panel',
      '.mat-menu-panel',
    ],
    openArtifactTitle: [
      'app-viewer header h1',
      'app-viewer header h2',
      'artifact-viewer header h1',
      'artifact-viewer header h2',
      'app-viewer [class*="title"]',
      'artifact-viewer [class*="title"]',
      'section.studio-panel h1',
      'section.studio-panel .artifact-title',
      'section.studio-panel header h2',
    ],
  };

  const warned = new Set();
  function warnMissing(key) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(
      `[NotebookLM Plus] 未能在页面定位「${key}」。` +
      `请在 src/content/dom.js 的 SELECTORS.${key} 中按真实 DOM 补充选择器。`
    );
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.getClientRects && el.getClientRects().length === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function firstBy(selList, root) {
    root = root || document;
    for (const sel of selList) {
      let nodes;
      try { nodes = root.querySelectorAll(sel); } catch (_) { continue; }
      for (const n of nodes) if (isVisible(n)) return n;
    }
    return null;
  }
  function allBy(selList, root) {
    root = root || document;
    for (const sel of selList) {
      let nodes;
      try { nodes = root.querySelectorAll(sel); } catch (_) { continue; }
      const vis = Array.prototype.filter.call(nodes, isVisible);
      if (vis.length) return vis;
    }
    return [];
  }

  function find(key, root) {
    const el = firstBy(SELECTORS[key], root);
    if (!el) warnMissing(key);
    return el;
  }
  function findAll(key, root) {
    const els = allBy(SELECTORS[key], root);
    if (!els.length) warnMissing(key);
    return els;
  }

  function getNotebookId() {
    const m = location.pathname.match(/notebook\/([^/?#]+)/i);
    return m ? m[1] : 'default';
  }

  // 写入 Angular 控制的输入框:用原生 value setter + 派发 input/change,使 ngModel 感知到。
  function setInputValue(el, text) {
    if (!el) return false;
    try { el.focus(); } catch (_) {}
    if (el.isContentEditable) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function text(el) {
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }

  NS.dom = {
    SELECTORS,
    isVisible, firstBy, allBy, find, findAll,
    getNotebookId, setInputValue, text,
    getChatInput: () => find('chatInput'),
    findQuizCustomBox: () => find('quizCustomBox'),
    getAnswerNodes: () => findAll('answerNode'),
    getNoteCards: () => findAll('noteCard'),
    getArtifact: () => find('artifact'),
    getArtifactIframe: () => {
      const container = find('artifact');
      if (container) {
        const iframe = container.querySelector('iframe');
        if (iframe) return iframe;
      }
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        if (isVisible(iframe)) {
          try {
            const src = iframe.getAttribute('src') || '';
            if (src.includes('scf.usercontent.goog') || iframe.src.startsWith('blob:')) {
              return iframe;
            }
          } catch (_) {}
        }
      }
      return null;
    },
    getOpenNote: () => find('openNote'),
    findArtifactCard: (node) => {
      if (!node || !node.closest) return null;
      for (const selector of SELECTORS.artifactCard) {
        try {
          const card = node.closest(selector);
          if (card) return card;
        } catch (_) {}
      }
      return null;
    },
    getArtifactCardTitle: (card) => {
      if (!card) return '';
      const titleNode = firstBy([
        '[data-artifact-title]',
        '.artifact-title',
        '[class*="title"]',
        'h3',
        'h2',
      ], card);
      const exact = (card.getAttribute && card.getAttribute('data-artifact-title')) ||
                    (titleNode && titleNode.getAttribute && titleNode.getAttribute('title'));
      if (exact) return exact.trim();
      return text(titleNode);
    },
    getArtifactMenus: () => allBy(SELECTORS.artifactMenu),
    getOpenArtifactTitle: () => text(firstBy(SELECTORS.openArtifactTitle)),
  };
})();
