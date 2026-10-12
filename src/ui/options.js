// src/ui/options.js
// 选项页:复习概览与设置 + 出题模板管理 + 本地复习数据清理。
(function () {
  const { storage } = window.NBLMPlus;
  const $ = (id) => document.getElementById(id);
  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  let flashTimer = null;
  function flash(msg) {
    const f = $('flash');
    f.textContent = msg; f.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => f.classList.remove('show'), 1500);
  }

  function formatTime(value) {
    if (!value) return '尚未复习';
    return new Date(value).toLocaleString();
  }

  function accuracy(stats) {
    return stats.attempts ? Math.round(stats.correct / stats.attempts * 100) + '%' : '--';
  }

  async function loadReview() {
    const settings = await storage.getSettings();
    $('rv-retire').value = (settings.review && settings.review.retireAfter) || 2;
    if (settings.obsidian) {
      $('obs-vault').value = settings.obsidian.vaultName || '';
      $('obs-folder').value = settings.obsidian.defaultFolder || '';
    }
    if (settings.notion) {
      $('notion-token').value = settings.notion.token || '';
      $('notion-db').value = settings.notion.targetId || settings.notion.databaseId || '';
      $('notion-target-type').value = settings.notion.targetType || 'page';
      $('notion-sync-wrong').checked = !!settings.notion.autoSyncWrong;
      $('notion-sync-good').checked = !!settings.notion.autoSyncGood;
    }
    if (settings.ai) {
      $('ai-provider').value = settings.ai.provider || 'none';
      $('ai-key').value = settings.ai.apiKey || '';
      $('ai-model').value = settings.ai.model || '';
    }

    const list = $('review-summary');
    list.innerHTML = '';
    const records = await storage.listReviewNotebooks();
    if (!records.length) {
      list.innerHTML = '<div class="muted">暂无复习记录。</div>';
      return;
    }
    records.sort((a, b) => b.stats.lastReviewedAt - a.stats.lastReviewedAt);
    records.forEach((record) => {
      const card = el('div', 'stat-card');
      card.innerHTML =
        `<div class="stat-title">Notebook <code>${record.notebookId}</code></div>` +
        `<div class="stat-values">` +
        `<span><b>${record.wrongList.length}</b> 当前错题</span>` +
        `<span><b>${record.stats.attempts}</b> 累计作答</span>` +
        `<span><b>${accuracy(record.stats)}</b> 正确率</span>` +
        `<span><b>${record.stats.mastered}</b> 已掌握</span>` +
        `</div><div class="stat-time">最近复习：${formatTime(record.stats.lastReviewedAt)}</div>`;
      list.appendChild(card);
    });
  }

  async function saveReviewSettings() {
    await storage.setSettings({
      review: { retireAfter: Math.max(1, Math.min(9, parseInt($('rv-retire').value, 10) || 2)) },
      obsidian: {
        vaultName: $('obs-vault').value.trim(),
        defaultFolder: $('obs-folder').value.trim()
      },
      notion: {
        token: $('notion-token').value.trim(),
        targetId: $('notion-db').value.trim(),
        targetType: $('notion-target-type').value,
        autoSyncWrong: $('notion-sync-wrong').checked,
        autoSyncGood: $('notion-sync-good').checked
      },
      ai: {
        provider: $('ai-provider').value,
        apiKey: $('ai-key').value.trim(),
        model: $('ai-model').value.trim()
      }
    });
    flash('已保存');
  }

  let templates = [];
  function renderTemplates() {
    const list = $('tpl-list'); list.innerHTML = '';
    templates.forEach((template, index) => {
      const card = el('div', 'tpl-card');
      const title = el('input', 'tpl-title'); title.value = template.title || ''; title.placeholder = '模板名称';
      title.addEventListener('input', () => { templates[index].title = title.value; });
      const body = el('textarea', 'tpl-body'); body.value = template.body || ''; body.rows = 8;
      body.addEventListener('input', () => { templates[index].body = body.value; });
      const hint = el('div', 'tpl-hint');
      hint.textContent = '占位符:{{types}} {{count}} {{difficulty}} {{scope}} {{language}}';
      const del = el('button', 'tpl-del'); del.textContent = '删除此模板';
      del.addEventListener('click', () => { templates.splice(index, 1); renderTemplates(); });
      card.append(title, body, hint, del);
      list.appendChild(card);
    });
  }

  async function loadTemplates() { templates = await storage.getTemplates(); renderTemplates(); }
  function bindTemplates() {
    $('tpl-add').addEventListener('click', () => {
      templates.push({ id: 'tpl_' + Date.now(), title: '新模板', body: storage.DEFAULTS.templates[0].body });
      renderTemplates();
    });
    $('tpl-save').addEventListener('click', async () => {
      if (!templates.length) templates = JSON.parse(JSON.stringify(storage.DEFAULTS.templates));
      await storage.setTemplates(templates); flash('模板已保存');
    });
  }

  async function loadWrong() {
    const list = $('wrong-list'); list.innerHTML = '';
    const records = await storage.listReviewNotebooks();
    if (!records.length) {
      list.innerHTML = '<div class="muted" style="margin:0">暂无复习记录。</div>';
      return;
    }
    records.forEach((record) => {
      const row = el('div', 'wrong-row');
      const info = el('div');
      info.innerHTML =
        `<b>${record.wrongList.length}</b> 题 · ${record.stats.attempts} 次作答 · ` +
        `${accuracy(record.stats)} · notebook <code>${record.notebookId}</code>`;
      const clear = el('button', 'wrong-clr'); clear.textContent = '清空';
      clear.addEventListener('click', async () => {
        await storage.clearReviewData(record.notebookId);
        await Promise.all([loadReview(), loadWrong()]);
      });
      row.append(info, clear); list.appendChild(row);
    });
  }

  function bindWrong() {
    $('wrong-export-quizforge').addEventListener('click', async () => {
      const exporter = window.NBLMPlus.quizforgeExport;
      if (!exporter || !exporter.exportWrongQuestions) {
        flash('QuizForge 导出模块未加载');
        return;
      }
      try {
        const result = await exporter.exportWrongQuestions(storage);
        flash(`已导出 ${result.notebookCount} 个 Notebook / ${result.questionCount} 道错题`);
      } catch (err) {
        flash('导出失败，请查看控制台');
        console.warn('[NotebookLM Plus] QuizForge export failed:', err);
      }
    });

    $('wrong-clear-all').addEventListener('click', async () => {
      const records = await storage.listReviewNotebooks();
      for (const record of records) await storage.clearReviewData(record.notebookId);
      await Promise.all([loadReview(), loadWrong()]);
    });
  }

  function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    navItems.forEach((button) => {
      button.addEventListener('click', () => {
        navItems.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        tabPanes.forEach((pane) => pane.classList.toggle('active', pane.id === button.dataset.target));
      });
    });
  }

  initTabs();
  $('rv-retire').addEventListener('change', saveReviewSettings);
  $('obs-vault').addEventListener('change', saveReviewSettings);
  $('obs-folder').addEventListener('change', saveReviewSettings);
  $('notion-token').addEventListener('change', saveReviewSettings);
  $('notion-db').addEventListener('change', saveReviewSettings);
  $('notion-target-type').addEventListener('change', saveReviewSettings);
  $('notion-sync-wrong').addEventListener('change', saveReviewSettings);
  $('notion-sync-good').addEventListener('change', saveReviewSettings);
  $('ai-provider').addEventListener('change', saveReviewSettings);
  $('ai-key').addEventListener('change', saveReviewSettings);
  $('ai-model').addEventListener('change', saveReviewSettings);
  loadReview();
  loadTemplates(); bindTemplates();
  loadWrong(); bindWrong();
})();
