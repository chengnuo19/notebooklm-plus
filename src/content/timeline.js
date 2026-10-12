// src/content/timeline.js
// Feature B: Interactive Timeline Navigation (enhanced)
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  
  let containerEl = null;
  let wrapperEl = null;
  let observer = null;
  let dotsMap = new Map(); // node -> dot element
  let lastNodeCount = 0;
  let collapsed = sessionStorage.getItem('nblm_tl_collapsed') === '1';

  function ensureContainer() {
    if (wrapperEl && NS.ui.shadow && NS.ui.shadow.contains(wrapperEl)) return containerEl;
    if (!NS.ui.shadow) return null;
    const h = NS.ui.h;
    
    containerEl = h('div', { class: 'nblm-timeline-dots' });

    // Counter badge
    const counterEl = h('div', { class: 'nblm-tl-counter', text: '0' });

    // Jump to top button
    const topBtn = h('button', { class: 'nblm-tl-jump', text: '⬆', title: '跳到对话开头', onClick: () => {
      const nodes = getMessageNodes();
      if (nodes.length) nodes[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }});

    // Jump to bottom button
    const bottomBtn = h('button', { class: 'nblm-tl-jump', text: '⬇', title: '跳到对话底部', onClick: () => {
      const nodes = getMessageNodes();
      if (nodes.length) nodes[nodes.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
    }});

    // Toggle button
    const toggleBtn = h('button', { class: 'nblm-tl-toggle', text: collapsed ? '◀' : '▶', title: '折叠/展开时间线', onClick: () => {
      collapsed = !collapsed;
      sessionStorage.setItem('nblm_tl_collapsed', collapsed ? '1' : '0');
      containerEl.hidden = collapsed;
      topBtn.hidden = collapsed;
      bottomBtn.hidden = collapsed;
      toggleBtn.textContent = collapsed ? '◀' : '▶';
    }});

    wrapperEl = h('div', { class: 'nblm-timeline', hidden: true },
      counterEl, topBtn, containerEl, bottomBtn, toggleBtn
    );

    if (collapsed) {
      containerEl.hidden = true;
      topBtn.hidden = true;
      bottomBtn.hidden = true;
    }

    NS.ui.shadow.appendChild(wrapperEl);

    // Setup IntersectionObserver for highlighting active dot
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const dot = dotsMap.get(entry.target);
        if (dot) {
          if (entry.isIntersecting) {
            dot.classList.add('active');
          } else {
            dot.classList.remove('active');
          }
        }
      });
    }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });

    return containerEl;
  }

  function getMessageNodes() {
    const userNodes = NS.dom.findAll('userNode', document) || [];
    const answerNodes = NS.dom.findAll('answerNode', document) || [];
    const all = Array.from(userNodes).concat(Array.from(answerNodes));
    all.sort((a, b) => {
      if (a === b) return 0;
      if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      return 1;
    });
    return all;
  }

  function getPreviewText(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 80);
  }

  function refresh() {
    if (!ensureContainer()) return;
    
    const nodes = getMessageNodes();
    if (nodes.length === 0) {
      wrapperEl.hidden = true;
      return;
    }
    
    // Only rebuild if count changed
    if (nodes.length === lastNodeCount) return;
    lastNodeCount = nodes.length;

    wrapperEl.hidden = false;
    containerEl.innerHTML = '';
    if (observer) observer.disconnect();
    dotsMap.clear();

    // Update counter
    const counter = wrapperEl.querySelector('.nblm-tl-counter');
    if (counter) counter.textContent = nodes.length;

    const cachedUserNodes = new Set(NS.dom.findAll('userNode', document));

    nodes.forEach((node, index) => {
      const isUserNode = cachedUserNodes.has(node);

      const dot = NS.ui.h('div', { 
        class: 'nblm-tl-dot',
        'data-role': isUserNode ? 'user' : 'assistant',
        onClick: () => {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        onDblclick: () => {
          const starred = dot.getAttribute('data-starred') === 'true';
          dot.setAttribute('data-starred', !starred);
          const key = `nblm_star_${NS.dom.getNotebookId()}_${index}`;
          if (!starred) sessionStorage.setItem(key, '1');
          else sessionStorage.removeItem(key);
        }
      });

      // Restore star state
      if (sessionStorage.getItem(`nblm_star_${NS.dom.getNotebookId()}_${index}`)) {
        dot.setAttribute('data-starred', 'true');
      }

      const tooltip = NS.ui.h('div', { class: 'nblm-tl-tooltip', text: getPreviewText(node) });
      dot.appendChild(tooltip);

      containerEl.appendChild(dot);
      dotsMap.set(node, dot);
      observer.observe(node);
    });
  }

  function toggle() {
    if (!wrapperEl) return;
    collapsed = !collapsed;
    sessionStorage.setItem('nblm_tl_collapsed', collapsed ? '1' : '0');
    const dots = wrapperEl.querySelector('.nblm-timeline-dots');
    const btns = wrapperEl.querySelectorAll('.nblm-tl-jump');
    const toggleBtn = wrapperEl.querySelector('.nblm-tl-toggle');
    if (dots) dots.hidden = collapsed;
    btns.forEach(b => b.hidden = collapsed);
    if (toggleBtn) toggleBtn.textContent = collapsed ? '◀' : '▶';
  }

  NS.timeline = { refresh, toggle };
})();
