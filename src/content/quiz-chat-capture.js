// src/content/quiz-chat-capture.js
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage;
  const dom = NS.dom;

  function parseResponse(markdownText) {
    const results = [];
    const fillBlankRegex = /【填空题\s*\d*】\s*([\s\S]*?)【答案】\s*([^\n]+)/g;
    let match;
    while ((match = fillBlankRegex.exec(markdownText)) !== null) {
      results.push({
        type: 'fillblank',
        stem: match[1].trim(),
        answer: match[2].trim(),
      });
    }

    const shortAnswerRegex = /【简答题\s*\d*】\s*([\s\S]*?)【参考答案】\s*([\s\S]*?)(?=【填空题|【简答题|$)/g;
    while ((match = shortAnswerRegex.exec(markdownText)) !== null) {
      results.push({
        type: 'shortanswer',
        stem: match[1].trim(),
        referenceAnswer: match[2].trim(),
      });
    }
    return results;
  }

  function injectCaptureButton(answerNode) {
    if (!answerNode) return;
    if (answerNode.querySelector('.nblm-chat-capture-btn')) return;

    // To prevent interfering with explain buttons, parse innerText roughly first to avoid heavy fromHtml
    if (!answerNode.innerText.includes('【填空题') && !answerNode.innerText.includes('【简答题')) return;

    const clone = answerNode.cloneNode(true);
    const removeBtns = clone.querySelectorAll('.nblm-save-explain-btn, .nblm-answer-export, .nblm-chat-capture-btn');
    removeBtns.forEach(b => b.remove());
    
    const md = NS.md.fromHtml(clone);
    const questions = parseResponse(md);
    if (questions.length === 0) return;

    const btn = document.createElement('button');
    btn.className = 'nblm-chat-capture-btn';
    btn.textContent = `📥 采集为题库 (${questions.length} 题)`;
    btn.style.cssText = 'border:1px solid #0284c7;background:#e0f2fe;color:#0284c7;cursor:pointer;border-radius:6px;padding:4px 10px;font-size:12px;margin:8px 0;display:inline-flex;gap:4px;align-items:center;font-weight:600;font-family:Roboto,system-ui,sans-serif';

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const notebookId = dom.getNotebookId();
        if (!notebookId) throw new Error('无法识别当前 Notebook');

        for (const q of questions) {
          await storage.addWrong(notebookId, {
            id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            type: q.type,
            stem: q.stem,
            options: [],
            correct: [],
            mine: [],
            answer: q.answer,
            referenceAnswer: q.referenceAnswer,
            ts: Date.now(),
            wrongCount: 1, 
            rightStreak: 0,
            reviewCount: 0,
            lastReviewedAt: 0,
          });
        }
        NS.ui.toast(`成功采集 ${questions.length} 道题到题库！`);
        btn.textContent = '✅ 已采集';
        btn.disabled = true;
        btn.style.opacity = '0.7';
      } catch (err) {
        NS.ui.toast('采集失败: ' + err.message);
      }
    });

    answerNode.appendChild(btn);
  }

  function scan() {
    if (!NS.dom) return;
    const answers = NS.dom.getAnswerNodes();
    for (const node of answers) {
      injectCaptureButton(node);
    }
  }

  NS.quizChatCapture = {
    parseResponse,
    injectCaptureButton,
    scan,
  };
})();
