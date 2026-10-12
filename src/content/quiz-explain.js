// src/content/quiz-explain.js
// 错题复习时向 NotebookLM 自动请求错题解析，并捕获保存到错题本。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage;
  const dom = NS.dom;

  let pendingExplanation = null; // { notebookId, questionId }

  function buildExplainPrompt(item) {
    let typeLabel = { single: '单选题', multi: '多选题', truefalse: '判断题', fillblank: '填空题', shortanswer: '简答题' }[item.type] || '题目';
    let optionsText = '';
    if (item.options && item.options.length) {
      optionsText = '\n【选项】\n' + item.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
    }
    
    let correctText = '';
    if (item.correct && item.correct.length) {
      correctText = item.correct.map(i => String.fromCharCode(65 + i)).join(', ');
    } else if (item.referenceAnswer) {
      correctText = item.referenceAnswer;
    } else if (item.answer) {
      correctText = item.answer;
    }

    let mineText = '';
    if (item.mine && item.mine.length) {
      mineText = item.mine.map(i => String.fromCharCode(65 + i)).join(', ');
    } else if (item.myAnswer) {
      mineText = item.myAnswer;
    }

    return `请根据笔记本来源内容，解释以下${typeLabel}：
【题目】${item.stem}${optionsText}
【正确答案】${correctText}
【我的答案】${mineText || '未作答/答错'}
请说明正确答案的依据，以及为什么我的答案不对。`;
  }

  async function requestExplanation(item) {
    const input = dom.getChatInput();
    if (!input) {
      NS.ui.toast('未找到聊天输入框，无法自动请求解析');
      return;
    }
    const notebookId = dom.getNotebookId();
    if (!notebookId) {
      NS.ui.toast('无法识别当前 Notebook');
      return;
    }

    const prompt = buildExplainPrompt(item);
    dom.setInputValue(input, prompt);
    NS.ui.closeOverlay();
    NS.ui.toast('已填入聊天输入框，请发送并等待 AI 回答', null);
    
    pendingExplanation = { notebookId, questionId: item.id };
  }

  function handleNewAnswer(answerNode) {
    if (!pendingExplanation || !answerNode) return;
    
    if (answerNode.querySelector('.nblm-save-explain-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'nblm-save-explain-btn';
    btn.textContent = '💾 保存为错题解析';
    btn.style.cssText = 'border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;cursor:pointer;border-radius:6px;padding:4px 10px;font-size:12px;margin:8px 0;display:inline-flex;gap:4px;align-items:center;font-weight:600;font-family:Roboto,system-ui,sans-serif';
    
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const clone = answerNode.cloneNode(true);
        const removeBtns = clone.querySelectorAll('.nblm-save-explain-btn, .nblm-answer-export');
        removeBtns.forEach(b => b.remove());
        const md = NS.md.fromHtml(clone).trim();
        
        await storage.updateWrong(pendingExplanation.notebookId, pendingExplanation.questionId, {
          explanation: md
        });
        NS.ui.toast('解析已保存到错题本！');
        pendingExplanation = null;
        btn.textContent = '✅ 已保存解析';
        btn.disabled = true;
        btn.style.opacity = '0.7';
      } catch (err) {
        NS.ui.toast('保存解析失败: ' + err.message);
      }
    });

    answerNode.appendChild(btn);
  }

  NS.quizExplain = {
    requestExplanation,
    handleNewAnswer,
    get pendingExplanation() { return pendingExplanation; },
  };
})();
