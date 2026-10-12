// src/content/toolbar.js
// Shadow-DOM 宿主 + 共享 UI 套件(NS.ui)+ 右下角浮动工具栏(NS.toolbar)。
// 其他模块(quizPrompt / quizReview / export)通过 NS.ui 渲染面板与弹窗。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  let shadow = null, hostEl = null, overlayEl = null, overlayContent = null;
  let toolbarEl = null, actionsEl = null, expanded = false, toastTimer = null;

  // 极简 hyperscript:h('div', {class,text,onClick,...}, ...children)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return el;
  }

  function ensure() {
    if (shadow && document.body.contains(hostEl)) return shadow;
    hostEl = document.createElement('div');
    hostEl.id = 'nblm-plus-host';
    hostEl.style.cssText = 'all: initial;';
    shadow = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = (NS.styles && NS.styles.shadowCss) || '';
    shadow.appendChild(style);
    overlayEl = h('div', { class: 'nblm-overlay', hidden: true });
    overlayContent = h('div', { class: 'nblm-overlay-content' });
    overlayEl.append(h('div', { class: 'nblm-backdrop', onClick: closeOverlay }), overlayContent);
    shadow.appendChild(overlayEl);
    document.body.appendChild(hostEl);
    return shadow;
  }

  function openOverlay(bodyNode, opts) {
    opts = opts || {};
    ensure();
    overlayContent.innerHTML = '';
    const card = h('div', { class: 'nblm-card' },
      h('div', { class: 'nblm-card-head' },
        h('div', { class: 'nblm-card-title', text: opts.title || '' }),
        h('button', { class: 'nblm-x', text: '×', title: '关闭', onClick: closeOverlay })),
      h('div', { class: 'nblm-card-body' }, bodyNode),
      opts.footer ? h('div', { class: 'nblm-card-foot' }, ...[].concat(opts.footer)) : null);
    if (opts.width) card.style.width = `min(${opts.width}px, 92vw)`;
    overlayContent.appendChild(card);
    overlayEl.hidden = false;
    return { close: closeOverlay, card };
  }
  function closeOverlay() { if (overlayEl) overlayEl.hidden = true; }

  function toast(msg, onClick) {
    ensure();
    let t = shadow.querySelector('.nblm-toast');
    if (!t) { t = h('div', { class: 'nblm-toast' }); shadow.appendChild(t); }
    t.textContent = msg;

    t.className = 'nblm-toast';
    const newT = t.cloneNode(true);
    t.parentNode.replaceChild(newT, t);
    t = newT;

    if (onClick) {
      t.classList.add('interactive');
      t.addEventListener('click', () => {
        t.classList.remove('show');
        onClick();
      });
    }

    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), onClick ? 3500 : 2200);
  }

  NS.ui = { h, ensure, openOverlay, closeOverlay, toast, get shadow() { return shadow; } };

  // —— 工具栏 ——
  function callModule(path, method, label) {
    let mod = NS;
    for (const p of path.split('.')) mod = mod && mod[p];
    if (mod && typeof mod[method] === 'function') {
      try {
        Promise.resolve(mod[method]()).catch((error) => {
          console.error(`[NotebookLM Plus] ${label} failed:`, error);
          toast(`「${label}」打开失败：${error.message || error}`);
        });
      } catch (error) {
        console.error(`[NotebookLM Plus] ${label} failed:`, error);
        toast(`「${label}」打开失败：${error.message || error}`);
      }
    } else {
      toast(`「${label}」尚未就绪`);
    }
    expanded = false; if (actionsEl) actionsEl.hidden = true;
  }
  function pill(svgHtml, label, onClick) {
    return h('button', { class: 'nblm-pill', onClick },
      h('span', { class: 'i', html: svgHtml }), h('span', { text: label }));
  }

  let isDragging = false;
  function buildToolbar() {
    const svgPrompt = `<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
    const svgReview = `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
    const svgExport = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;
    const svgWidth = `<svg viewBox="0 0 24 24"><path d="M4 12h16M4 12l4-4m-4 4 4 4m12-4-4-4m4 4-4 4M4 4v16M20 4v16"/></svg>`;
    const svgPromptLib = `<svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline><path d="M10 13h4M10 17h4M14 13l-4 4"></path></svg>`;
    const svgAi = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"></path><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
    const svgStar = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    actionsEl = h('div', { class: 'nblm-actions', hidden: true },
      pill(svgWidth, '界面宽度', () => callModule('chatWidth', 'openPanel', '界面宽度')),
      pill(svgPromptLib, '提示词库', () => callModule('promptLibrary', 'open', '提示词库')),
      pill(svgPrompt, '出题要求', () => callModule('quizPrompt', 'open', '出题')),
      pill(svgAi, 'AI 复盘', () => callModule('quizAiReview', 'open', 'AI 复盘')),
      pill(svgReview, '错题本', () => callModule('quizReview', 'open', '错题本')),
      pill(svgStar, '好题本', () => callModule('goodReview', 'open', '好题本')),
      pill(svgExport, '导出文档', () => callModule('export', 'openMenu', '导出')));
    
    const fab = h('button', {
      class: 'nblm-fab', title: 'NotebookLM Plus (可拖拽)', text: 'NB+',
      onClick: () => {
        if (isDragging) return;
        expanded = !expanded; actionsEl.hidden = !expanded;
      },
    });

    let startX = 0, startY = 0;
    let startRight = 18, startBottom = 18;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = toolbarEl.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;

      const onMouseMove = (moveEv) => {
        const deltaX = moveEv.clientX - startX;
        const deltaY = moveEv.clientY - startY;
        if (Math.hypot(deltaX, deltaY) > 3) {
          isDragging = true;
          fab.classList.add('dragging');
        }
        if (isDragging) {
          const newRight = Math.max(0, Math.min(window.innerWidth - 48, startRight - deltaX));
          const newBottom = Math.max(0, Math.min(window.innerHeight - 48, startBottom - deltaY));
          toolbarEl.style.left = 'auto';
          toolbarEl.style.top = 'auto';
          toolbarEl.style.right = `${newRight}px`;
          toolbarEl.style.bottom = `${newBottom}px`;
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (isDragging) {
          fab.classList.remove('dragging');
          const rect = toolbarEl.getBoundingClientRect();
          const savedRight = window.innerWidth - rect.right;
          const savedBottom = window.innerHeight - rect.bottom;
          if (NS.storage && NS.storage.setSettings) {
            NS.storage.setSettings({
              toolbar: { toolbarRight: savedRight, toolbarBottom: savedBottom }
            }).catch(() => {});
          }
          setTimeout(() => { isDragging = false; }, 50);
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onTouchStart = (e) => {
      isDragging = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = toolbarEl.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;

      const onTouchMove = (moveEv) => {
        const t = moveEv.touches[0];
        const deltaX = t.clientX - startX;
        const deltaY = t.clientY - startY;
        if (Math.hypot(deltaX, deltaY) > 5) {
          isDragging = true;
        }
        if (isDragging) {
          const newRight = Math.max(0, Math.min(window.innerWidth - 48, startRight - deltaX));
          const newBottom = Math.max(0, Math.min(window.innerHeight - 48, startBottom - deltaY));
          toolbarEl.style.left = 'auto';
          toolbarEl.style.top = 'auto';
          toolbarEl.style.right = `${newRight}px`;
          toolbarEl.style.bottom = `${newBottom}px`;
          if (moveEv.cancelable) moveEv.preventDefault();
        }
      };

      const onTouchEnd = () => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        if (isDragging) {
          const rect = toolbarEl.getBoundingClientRect();
          const savedRight = window.innerWidth - rect.right;
          const savedBottom = window.innerHeight - rect.bottom;
          if (NS.storage && NS.storage.setSettings) {
            NS.storage.setSettings({
              toolbar: { toolbarRight: savedRight, toolbarBottom: savedBottom }
            }).catch(() => {});
          }
          setTimeout(() => { isDragging = false; }, 50);
        }
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    fab.addEventListener('mousedown', onMouseDown);
    fab.addEventListener('touchstart', onTouchStart);

    return h('div', { class: 'nblm-toolbar' }, actionsEl, fab);
  }

  async function applySavedPosition() {
    if (!toolbarEl || !NS.storage) return;
    try {
      const s = await NS.storage.getSettings();
      const toolbar = s.toolbar || {};
      const legacy = s.ui || {};
      const right = toolbar.toolbarRight !== undefined ? toolbar.toolbarRight : legacy.toolbarRight;
      const bottom = toolbar.toolbarBottom !== undefined ? toolbar.toolbarBottom : legacy.toolbarBottom;
      if (right !== undefined && bottom !== undefined) {
        toolbarEl.style.left = 'auto';
        toolbarEl.style.top = 'auto';
        toolbarEl.style.right = `${right}px`;
        toolbarEl.style.bottom = `${bottom}px`;
      }
    } catch (_) {}
  }

  function mount() {
    ensure();
    if (toolbarEl && shadow.contains(toolbarEl)) return;
    toolbarEl = buildToolbar();
    shadow.appendChild(toolbarEl);
    applySavedPosition();
  }
  function ensureMounted() {
    if (!hostEl || !document.body.contains(hostEl)) { shadow = null; toolbarEl = null; mount(); return; }
    if (!toolbarEl || !shadow.contains(toolbarEl)) mount();
  }
  function unmount() {
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    shadow = null; toolbarEl = null;
  }

  NS.toolbar = { mount, ensureMounted, unmount };
})();
