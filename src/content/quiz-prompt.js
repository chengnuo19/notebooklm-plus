// Quiz prompt builder: configure a quiz, optionally exclude prior questions,
// then fill NotebookLM's custom instructions box or copy the prompt.
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage;
  const dom = NS.dom;

  const TYPE_LABELS = { single: '单选题', multi: '多选题', truefalse: '判断题', fillblank: '填空题', shortanswer: '简答题' };
  const DIFF_LABELS = { easy: '简单', medium: '中等', hard: '困难' };
  const LANG_LABELS = { auto: '与来源或提问相同', zh: '中文', en: 'English' };
  const STRICTNESS_LABELS = { loose: '宽松', standard: '标准', strict: '严格' };

  function buildQuizPrompt(body, params, duplicateOptions) {
    const map = {
      types: (params.types && params.types.length ? params.types : ['single'])
        .map((type) => TYPE_LABELS[type] || type).join('、'),
      count: params.count || 10,
      difficulty: DIFF_LABELS[params.difficulty] || params.difficulty || '中等',
      scope: params.scope && params.scope.trim() ? params.scope.trim() : '全部来源内容',
      language: LANG_LABELS[params.language] || params.language || LANG_LABELS.auto,
    };
    const prompt = String(body).replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => (key in map ? map[key] : '{{' + key + '}}'),
    );
    let finalPrompt = prompt;
    if (duplicateOptions && duplicateOptions.enabled && duplicateOptions.history && duplicateOptions.history.length) {
      const dedup = NS.questionDedup;
      finalPrompt += (dedup && dedup.buildExclusionBlock
        ? dedup.buildExclusionBlock(duplicateOptions.history, duplicateOptions.limit || 30)
        : '');
    }
    if (params.types && (params.types.includes('fillblank') || params.types.includes('shortanswer'))) {
      finalPrompt += '\n\n【格式要求】\n如果你生成了填空题或简答题，请严格按以下格式输出（不要用 Markdown 列表，独立成段）：\n\n填空题格式：\n【填空题 1】这里是题干，空白处用 ____ 标注\n【答案】这是正确答案\n\n简答题格式：\n【简答题 1】这里是题干\n【参考答案】这是详细参考答案';
    }
    return finalPrompt;
  }

  function row(label, node) {
    const h = NS.ui.h;
    return h('div', { class: 'nblm-row' },
      h('div', { class: 'nblm-label', text: label }),
      node);
  }

  function selectEl(labels, value, onChange) {
    const h = NS.ui.h;
    return h('select', { class: 'nblm-select', onChange: (event) => onChange(event.target.value) },
      ...Object.keys(labels).map((key) =>
        h('option', { value: key, selected: key === value }, labels[key])));
  }

  function clampInt(value, min, max, fallback) {
    value = parseInt(value, 10);
    if (isNaN(value)) return fallback;
    return Math.max(min, Math.min(max, value));
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch (_) {}
      textarea.remove();
    }
  }

  async function open() {
    const h = NS.ui.h;
    const settings = await storage.getSettings();
    const templates = await storage.getTemplates();
    const defaults = settings.quizDefaults;
    const selectedTypes = new Set(
      defaults.types && defaults.types.length ? defaults.types : ['single'],
    );
    const notebookId = dom.getNotebookId();
    let difficulty = defaults.difficulty;
    let language = defaults.language;
    let avoidDuplicates = defaults.avoidDuplicates !== false;
    let duplicateStrictness = defaults.duplicateStrictness || 'standard';
    let templateId = settings.activeTemplateId || (templates[0] && templates[0].id);

    const typeChips = Object.keys(TYPE_LABELS).map((type) => h('button', {
      class: 'nblm-chip',
      'aria-pressed': selectedTypes.has(type) ? 'true' : 'false',
      text: TYPE_LABELS[type],
      onClick: (event) => {
        const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
        event.currentTarget.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        if (enabled) selectedTypes.add(type);
        else selectedTypes.delete(type);
      },
    }));
    const countInput = h('input', {
      class: 'nblm-input',
      type: 'number',
      min: 1,
      max: 50,
      value: defaults.count || 10,
    });
    const diffSelect = selectEl(DIFF_LABELS, difficulty, (value) => { difficulty = value; });
    const langSelect = selectEl(LANG_LABELS, language, (value) => { language = value; });
    const scopeInput = h('textarea', {
      class: 'nblm-textarea',
      placeholder: '例如：第 3 章 / 某个概念 / 某来源标题；留空 = 全部来源',
    }, defaults.scope || '');
    const strictnessSelect = selectEl(
      STRICTNESS_LABELS,
      duplicateStrictness,
      (value) => { duplicateStrictness = value; },
    );
    const historyHint = h('div', { class: 'nblm-hint', text: '正在读取本范围历史题目…' });
    const clearHistoryBtn = h('button', {
      class: 'nblm-btn',
      text: '清空本范围历史',
      onClick: async () => {
        if (!notebookId) return NS.ui.toast('未识别到当前 Notebook');
        await storage.clearQuizHistory(notebookId, scopeInput.value);
        await refreshHistory();
        NS.ui.toast('已清空本范围历史题目');
      },
    });
    const dedupToggle = h('button', {
      class: 'nblm-chip',
      'aria-pressed': avoidDuplicates ? 'true' : 'false',
      text: '避免历史重复',
      onClick: (event) => {
        avoidDuplicates = !avoidDuplicates;
        event.currentTarget.setAttribute('aria-pressed', avoidDuplicates ? 'true' : 'false');
        refreshHistory();
      },
    });
    const templateSelect = h('select', {
      class: 'nblm-select',
      onChange: (event) => { templateId = event.target.value; },
    }, ...templates.map((template) =>
      h('option', { value: template.id, selected: template.id === templateId }, template.title)));

    function collect() {
      return {
        types: [...selectedTypes],
        count: clampInt(countInput.value, 1, 50, 10),
        difficulty,
        scope: scopeInput.value,
        language,
        avoidDuplicates,
        duplicateStrictness,
      };
    }

    async function currentPrompt() {
      const template = templates.find((item) => item.id === templateId) || templates[0];
      const history = avoidDuplicates && notebookId
        ? await storage.getQuizHistory(notebookId, scopeInput.value)
        : [];
      return buildQuizPrompt(template.body, collect(), {
        enabled: avoidDuplicates,
        history,
        limit: 30,
      });
    }

    async function persist() {
      await storage.setSettings({ quizDefaults: collect(), activeTemplateId: templateId });
    }

    async function refreshHistory() {
      if (!avoidDuplicates) {
        historyHint.textContent = '防重复已关闭，本次不会附加历史题目排除清单。';
        clearHistoryBtn.hidden = true;
        return;
      }
      if (!notebookId) {
        historyHint.textContent = '未识别到当前 Notebook，暂时无法读取历史题目。';
        clearHistoryBtn.hidden = true;
        return;
      }
      const history = await storage.getQuizHistory(notebookId, scopeInput.value);
      historyHint.textContent =
        `当前范围已记录 ${history.length} 道历史题；提示词最多排除最近 30 道。`;
      clearHistoryBtn.hidden = history.length === 0;
    }
    scopeInput.addEventListener('change', refreshHistory);

    const body = h('div', null,
      row('题型（可多选）', h('div', { class: 'nblm-chips' }, ...typeChips)),
      h('div', { class: 'nblm-inline' },
        row('数量', countInput),
        row('难度', diffSelect),
        row('语言', langSelect)),
      row('覆盖范围', scopeInput),
      row('防重复', h('div', null,
        h('div', { class: 'nblm-inline' },
          h('div', { class: 'nblm-chips' }, dedupToggle),
          strictnessSelect),
        historyHint,
        h('div', { style: { marginTop: '8px' } }, clearHistoryBtn))),
      row('出题模板', templateSelect),
      h('div', {
        class: 'nblm-hint',
        text: '填入出题框只会写入提示词，不会自动生成。生成后的整套题会按当前覆盖范围记录，用于下次防重复。',
      }));

    const copyBtn = h('button', {
      class: 'nblm-btn',
      text: '复制提示词',
      onClick: async () => {
        if (!selectedTypes.size) return NS.ui.toast('请至少选择一种题型');
        await persist();
        await copy(await currentPrompt());
        NS.ui.toast('已复制到剪贴板');
      },
    });
    const fillBtn = h('button', {
      class: 'nblm-btn primary',
      text: '填入出题框',
      onClick: async () => {
        if (!selectedTypes.size) return NS.ui.toast('请至少选择一种题型');
        await persist();
        const prompt = await currentPrompt();
        if (selectedTypes.has('fillblank') || selectedTypes.has('shortanswer')) {
          const chatInput = dom.getChatInput();
          if (chatInput) {
            dom.setInputValue(chatInput, prompt);
            NS.ui.toast('已填入对话框，请发送后等待 AI 生成题目');
            NS.ui.closeOverlay();
            return;
          }
        }
        const box = dom.findQuizCustomBox();
        if (box) {
          dom.setInputValue(box, prompt);
          NS.ui.toast('已填入出题框，请检查后点生成');
          NS.ui.closeOverlay();
        } else {
          await copy(prompt);
          NS.ui.toast('未找到出题框，已复制到剪贴板');
        }
      },
    });

    NS.ui.openOverlay(body, {
      title: 'Quiz 出题',
      width: 480,
      footer: [copyBtn, fillBtn],
    });
    refreshHistory();
  }

  async function fillNextQuizPrompt(spec) {
    const notebookId = dom.getNotebookId();
    if (!notebookId) return NS.ui.toast('未识别到当前 Notebook');

    const templates = await storage.getTemplates();
    const template = templates[0];
    const history = await storage.getQuizHistory(notebookId, '全部来源内容');

    let prompt = `请严格依据本笔记本的来源内容，生成一套测验题。\n`;
    prompt += `要求：\n`;
    prompt += `- 题目数量：${spec.questionCount || 10} 题\n`;
    prompt += `- 难度：${spec.difficulty || 'medium'}\n`;
    
    if (spec.focusTopics && spec.focusTopics.length > 0) {
      prompt += `- 重点考察：\n`;
      spec.focusTopics.forEach(ft => {
        prompt += `  - ${ft.topic} (${ft.count}题): ${ft.reason || ''}\n`;
      });
    }

    if (spec.specialRequirements && spec.specialRequirements.length > 0) {
      prompt += `- 特别检查 / 特殊要求：\n`;
      spec.specialRequirements.forEach(req => {
        prompt += `  - ${req}\n`;
      });
    }

    const dedup = NS.questionDedup;
    if (dedup && dedup.buildExclusionBlock && history.length > 0) {
      prompt += dedup.buildExclusionBlock(history, 30);
    }

    const box = dom.findQuizCustomBox();
    if (box) {
      dom.setInputValue(box, prompt);
      NS.ui.toast('已填入出题框，请检查后点生成');
    } else {
      await copy(prompt);
      NS.ui.toast('未找到出题框，已复制到剪贴板');
    }
  }

  NS.quizPrompt = { open, buildQuizPrompt, fillNextQuizPrompt };
})();
