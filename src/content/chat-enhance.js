// src/content/chat-enhance.js
// 聊天相关增强:字数统计、快捷按钮
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  function ensureStyles() {
    if (document.getElementById('nblm-chat-enhance-styles')) return;
    const style = document.createElement('style');
    style.id = 'nblm-chat-enhance-styles';
    style.textContent = `
      .nblm-word-count {
        font-size: 11px;
        color: #94a3b8;
        display: inline-block;
        margin-left: 8px;
        font-weight: normal;
        user-select: none;
      }
      .nblm-quick-prompt-btn {
        position: absolute;
        right: 50px;
        bottom: 12px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 16px;
        opacity: 0.6;
        transition: opacity 0.2s, transform 0.2s;
        z-index: 10;
      }
      .nblm-quick-prompt-btn:hover {
        opacity: 1;
        transform: scale(1.1);
      }
      .nblm-input-word-count {
        position: absolute;
        left: 16px;
        bottom: -20px;
        font-size: 11px;
        color: #94a3b8;
        pointer-events: none;
      }
      .nblm-fold-btn {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 11px;
        padding: 2px 6px;
        cursor: pointer;
        z-index: 10;
        color: #64748b;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .nblm-fold-btn:hover {
        background: #f8fafc;
        color: #0f172a;
      }
      .nblm-folded-node {
        max-height: 120px !important;
        overflow: hidden !important;
        position: relative;
      }
      .nblm-folded-node::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 60px;
        background: linear-gradient(transparent, var(--surface, white));
        pointer-events: none;
        z-index: 5;
      }
    `;
    document.head.appendChild(style);
  }

  function scanAnswers() {
    const answers = NS.dom.getAnswerNodes();
    answers.forEach(node => {
      if (node.hasAttribute('data-nblm-word-count-injected')) return;
      
      const text = NS.dom.text(node);
      if (!text) return;

      node.setAttribute('data-nblm-word-count-injected', '1');
      node.style.position = 'relative';

      // 1. Fold button
      const len = text.length;
      if (len > 100) { // Only add fold button for long answers
        const foldBtn = document.createElement('button');
        foldBtn.className = 'nblm-fold-btn';
        foldBtn.textContent = '收起';
        let folded = false;
        
        foldBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          folded = !folded;
          foldBtn.textContent = folded ? '展开' : '收起';
          if (folded) {
            node.classList.add('nblm-folded-node');
          } else {
            node.classList.remove('nblm-folded-node');
          }
        };
        node.appendChild(foldBtn);
      }
      
      // 2. Word count & Follow-up Chips
      const actionBar = node.querySelector('chat-message-actions') || node.querySelector('.action-bar');
      if (actionBar) {
        const countEl = document.createElement('span');
        countEl.className = 'nblm-word-count';
        countEl.textContent = `共 ${len} 字`;
        actionBar.appendChild(countEl);

        // 3. Smart Follow-ups
        const followUps = generateFollowUps(text);
        if (followUps.length > 0) {
          const chipsContainer = document.createElement('div');
          chipsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; width: 100%;';
          
          followUps.forEach(q => {
            const chip = document.createElement('button');
            chip.style.cssText = 'background: rgba(140, 110, 90, 0.1); border: 1px solid rgba(140, 110, 90, 0.2); border-radius: 16px; padding: 4px 12px; font-size: 12px; color: hsl(28, 35%, 45%); cursor: pointer; transition: all 0.2s; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;';
            chip.textContent = '💡 ' + q;
            chip.title = '点击填入对话框';
            chip.onmouseover = () => { chip.style.background = 'rgba(140, 110, 90, 0.2)'; };
            chip.onmouseout = () => { chip.style.background = 'rgba(140, 110, 90, 0.1)'; };
            chip.onclick = () => {
              const input = NS.dom.getChatInput();
              if (input) {
                NS.dom.setInputValue(input, q);
                if (NS.ui) NS.ui.toast('已填入，请按回车发送');
              }
            };
            chipsContainer.appendChild(chip);
          });
          
          // insert before action bar or append to it if flex-wrap allows
          // Better to append to the parent of actionBar if it's block, or just append to node.
          actionBar.parentElement.appendChild(chipsContainer);
        }
      }
    });
  }

  function generateFollowUps(text) {
    const questions = new Set();
    const t = text || '';
    
    // Heuristic 1: English terms
    const engMatches = t.match(/[A-Z][a-z]+(?: [A-Z][a-z]+)*/g) || [];
    const engTerms = engMatches.filter(m => m.length > 3 && m.length < 20);
    if (engTerms.length > 0) {
      questions.add(`能详细解释一下「${engTerms[Math.floor(Math.random() * engTerms.length)]}」的具体概念吗？`);
    }

    // Heuristic 2: Bullet points
    if (t.includes('1.') || t.includes('首先') || t.includes('第一')) {
      questions.add('能否就你提到的第一点，给出一个具体的例子？');
    }

    // Heuristic 3: Quotes
    const quoteMatches = t.match(/「([^」]+)」/g) || t.match(/“([^”]+)”/g) || [];
    if (quoteMatches.length > 0) {
      const q = quoteMatches[Math.floor(Math.random() * quoteMatches.length)].replace(/["「」“”]/g, '');
      if (q.length > 2 && q.length < 15) {
        questions.add(`刚才提到的「${q}」在实际中怎么应用？`);
      }
    }

    // Generic fallbacks
    const generics = [
      '这背后的核心原理是什么？',
      '这和传统的做法相比，有什么明显的优缺点？',
      '能用更通俗、更简单的话再总结一下吗？',
      '除了上面提到的，还有其他的特殊情况或例外吗？',
      '如果要在实际工作/学习中应用，你有什么建议？'
    ];
    
    // Shuffle generics
    generics.sort(() => 0.5 - Math.random());
    
    // Fill until we have 3 questions
    const result = Array.from(questions);
    while (result.length < 3) {
      const g = generics.pop();
      if (!result.includes(g)) result.push(g);
    }
    
    return result.slice(0, 3);
  }

  function enhanceInput() {
    const input = NS.dom.getChatInput();
    if (!input || input.hasAttribute('data-nblm-enhanced')) return;

    const wrapper = input.closest('query-box') || input.parentElement;
    if (!wrapper) return;

    input.setAttribute('data-nblm-enhanced', '1');
    wrapper.style.position = 'relative';

    // 1. Quick Prompt Library Button
    const btn = document.createElement('button');
    btn.className = 'nblm-quick-prompt-btn';
    btn.textContent = '⚡';
    btn.title = '打开提示词库 (Alt+P)';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (NS.promptLibrary) NS.promptLibrary.open();
    };
    wrapper.appendChild(btn);

    // 2. Word count for input
    const countEl = document.createElement('div');
    countEl.className = 'nblm-input-word-count';
    countEl.textContent = '0 字';
    wrapper.appendChild(countEl);

    input.addEventListener('input', () => {
      const len = (input.value || input.textContent || '').trim().length;
      countEl.textContent = len > 0 ? `${len} 字` : '';
    });
  }

  function scan() {
    ensureStyles();
    scanAnswers();
    enhanceInput();
  }

  NS.chatEnhance = { scan };
})();
