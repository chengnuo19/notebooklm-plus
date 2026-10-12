// Generate an AI review for the latest completed or partially answered Quiz session.
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage;
  const dom = NS.dom;

  function latestReviewableSession(sessions) {
    const all = sessions || [];
    const completed = all
      .filter((session) => session.status === 'completed' && session.questions && session.questions.length)
      .sort((a, b) => (b.completedAt || b.startedAt || 0) - (a.completedAt || a.startedAt || 0));
    if (completed.length) return completed[0];

    return all
      .filter((session) => session.questions && session.questions.length)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
  }

  function sessionFromWrongQuestions(notebookId, wrongQuestions) {
    if (!wrongQuestions || !wrongQuestions.length) return null;
    return {
      id: 'wrong-book-review',
      notebookId,
      source: 'wrong-book',
      status: 'completed',
      startedAt: Math.max(...wrongQuestions.map((item) => item.ts || 0)),
      completedAt: Date.now(),
      totalQuestions: wrongQuestions.length,
      questions: wrongQuestions.map((item) => ({
        id: item.id,
        stem: item.stem,
        options: item.options || [],
        correct: item.correct || [],
        selected: item.mine || [],
        isCorrect: false,
        type: item.type || 'single',
        answeredAt: item.ts || 0,
      })),
    };
  }

  function requestReview(sessionData, settings) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'AI_REVIEW_REQUEST', sessionData, settings },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.error) {
            reject(new Error(response.error));
            return;
          }
          if (!response || !response.result || !response.result.summary) {
            reject(new Error('AI 未返回有效复盘结果'));
            return;
          }
          resolve(response);
        },
      );
    });
  }

  function mockReport() {
    return {
      result: {
        summary: '本次测验表现良好，但部分基础概念仍需巩固。',
        weakTopics: [
          {
            topic: '基础概念',
            mastery: 60,
            priority: 'high',
            reason: '多道基础定义题回答错误',
          },
        ],
        mistakePatterns: [
          { type: '审题不清', description: '忽略了题目中的关键条件' },
        ],
        studyActions: ['重读相关章节', '复习错题本中的相关题目'],
        nextQuizSpec: {
          questionCount: 5,
          difficulty: 'medium',
          focusTopics: [{ topic: '基础概念', count: 3, reason: '巩固薄弱点' }],
          specialRequirements: ['增加易混淆概念的对比'],
        },
        externalKnowledge: [],
      },
    };
  }

  function localReport(session) {
    const questions = session.questions || [];
    const wrong = questions.filter((question) => question.isCorrect === false);
    const correctCount = questions.length - wrong.length;
    const accuracy = questions.length
      ? Math.round(correctCount / questions.length * 100)
      : 0;
    const nextCount = Math.max(5, Math.min(10, wrong.length * 2 || 5));

    return {
      result: {
        summary: `已分析 ${questions.length} 道作答，答对 ${correctCount} 道，正确率 ${accuracy}%。`,
        weakTopics: wrong.length ? [{
          topic: '本次错题',
          mastery: accuracy,
          priority: accuracy < 60 ? 'high' : 'medium',
          reason: `共有 ${wrong.length} 道题需要复习`,
          evidenceQuestionIds: wrong.map((question) => question.id).filter(Boolean),
        }] : [],
        mistakePatterns: wrong.length ? [{
          type: '错题回顾',
          description: wrong.slice(0, 5)
            .map((question) => question.stem)
            .filter(Boolean)
            .join('；'),
          evidenceQuestionIds: wrong.map((question) => question.id).filter(Boolean),
        }] : [],
        studyActions: wrong.length
          ? ['逐题核对错误选项与正确答案', '回到 NotebookLM 来源定位相关概念', '完成下一轮针对性测验']
          : ['保持当前掌握状态', '进行一轮综合巩固测验'],
        nextQuizSpec: {
          questionCount: nextCount,
          difficulty: accuracy >= 80 ? 'hard' : accuracy >= 60 ? 'medium' : 'easy',
          focusTopics: wrong.length ? [{
            topic: '本次错题相关概念',
            count: nextCount,
            reason: `针对 ${wrong.length} 道错题进行巩固`,
          }] : [],
          specialRequirements: wrong.length
            ? ['优先生成与本次错题概念相近但表述不同的题目']
            : ['覆盖本次 Quiz 的核心概念并适当提高难度'],
        },
        externalKnowledge: [],
      },
    };
  }

  async function open() {
    const ui = NS.ui;
    if (!ui) throw new Error('NotebookLM Plus UI 尚未初始化');

    const notebookId = dom.getNotebookId();
    if (!notebookId) return ui.toast('未识别到当前 Notebook');

    let session = latestReviewableSession(await storage.getQuizSessions(notebookId));
    if (!session && storage.getWrong) {
      session = sessionFromWrongQuestions(notebookId, await storage.getWrong(notebookId));
    }
    if (!session) {
      return ui.toast('暂无可复盘的 Quiz 作答或错题记录');
    }

    const settings = await storage.getSettings();
    const aiConfig = settings.ai || {};
    const usesLocalAnalysis = !aiConfig.provider || aiConfig.provider === 'none';
    ui.toast(usesLocalAnalysis ? '正在生成本地复盘...' : '正在生成 AI 复盘报告，请稍候...');

    let report;
    try {
      report = usesLocalAnalysis
        ? localReport(session)
        : aiConfig.provider === 'mock'
        ? mockReport()
        : await requestReview(session, aiConfig);
    } catch (error) {
      return ui.toast('AI 分析失败：' + error.message);
    }

    if (!NS.quizReviewMarkdown || !NS.quizReviewMarkdown.renderHtml) {
      throw new Error('AI 复盘渲染器未加载');
    }

    const htmlContent = NS.quizReviewMarkdown.renderHtml(report);
    const h = ui.h;

    const nextButton = h('button', {
      class: 'nblm-btn primary',
      text: '生成下一轮提示词',
      onClick: async () => {
        if (!NS.quizPrompt || !NS.quizPrompt.fillNextQuizPrompt) {
          ui.toast('提示词功能未就绪');
          return;
        }
        await NS.quizPrompt.fillNextQuizPrompt(report.result.nextQuizSpec || {});
      },
    });
    const body = h(
      'div',
      { class: 'nblm-review-body' },
      h('div', {
        class: 'nblm-review-preview',
        html: htmlContent,
      }),
    );

    const answeredCount = session.questions.length;
    const totalCount = session.totalQuestions || answeredCount;
    const dataTitle = session.source === 'wrong-book'
      ? `AI Quiz 复盘（基于 ${answeredCount} 道错题记录）`
      : session.status === 'completed'
      ? 'AI Quiz 复盘'
      : `AI Quiz 复盘（已作答 ${answeredCount}/${totalCount}）`;
    const title = usesLocalAnalysis ? `${dataTitle} · 本地分析` : dataTitle;

    ui.openOverlay(body, {
      title,
      width: 600,
      footer: [nextButton],
    });
  }

  NS.quizAiReview = {
    open,
    latestReviewableSession,
    sessionFromWrongQuestions,
    localReport,
    requestReview,
  };
})();
