// src/content/chat-width.js
// Feature C: Chat width adjustment.
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  
  let styleEl = null;

  function ensureStyleEl() {
    if (styleEl && document.head.contains(styleEl)) return styleEl;
    styleEl = document.createElement('style');
    styleEl.id = 'nblm-chat-width-override';
    document.head.appendChild(styleEl);
    return styleEl;
  }

  function setWidth(widthStr) {
    ensureStyleEl();
    if (!widthStr || widthStr === '0' || widthStr === '0px') {
      styleEl.textContent = '';
      return;
    }
    const selectors = NS.dom.SELECTORS.chatContainer ? NS.dom.SELECTORS.chatContainer.join(', ') : 'main > div';
    styleEl.textContent = `${selectors} { max-width: ${widthStr} !important; }`;
  }

  async function apply() {
    try {
      const s = await NS.storage.getSettings();
      setWidth(s.chatWidth ? `${s.chatWidth}px` : '0');
    } catch (_) {}
  }

  function openPanel() {
    const { h, closeOverlay, toast } = NS.ui;
    
    // Load current
    NS.storage.getSettings().then(s => {
      const currentVal = s.chatWidth || 0;
      
      const valDisplay = h('span', { text: currentVal ? `${currentVal}px` : '默认' });
      const slider = h('input', { 
        type: 'range', 
        min: '400', max: '1600', step: '50', 
        value: currentVal || '800',
        onInput: (e) => {
          const val = e.target.value;
          valDisplay.textContent = `${val}px`;
          setWidth(`${val}px`);
        }
      });

      const body = h('div', { class: 'nblm-row' },
        h('label', { class: 'nblm-label', text: '对话区最大宽度' }),
        h('div', { class: 'nblm-inline', style: { alignItems: 'center' } }, slider, valDisplay)
      );

      const footer = [
        h('button', { 
          class: 'nblm-btn', 
          text: '恢复默认', 
          onClick: async () => {
            slider.value = 800;
            valDisplay.textContent = '默认';
            setWidth('0');
            const s = await NS.storage.getSettings();
            s.chatWidth = 0;
            await NS.storage.setSettings(s);
            toast('已恢复默认宽度');
          }
        }),
        h('button', { 
          class: 'nblm-btn primary', 
          text: '保存设置', 
          onClick: async () => {
            const val = parseInt(slider.value, 10);
            const s = await NS.storage.getSettings();
            s.chatWidth = val;
            await NS.storage.setSettings(s);
            toast('宽度设置已保存');
            closeOverlay();
          }
        })
      ];

      NS.ui.openOverlay(body, { title: '📐 调整界面宽度', footer });
    });
  }

  NS.chatWidth = { apply, openPanel, setWidth };
})();
