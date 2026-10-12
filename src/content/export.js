// src/content/export.js
// 一键导出:把回答/笔记/生成物/选中内容转成 Markdown,引用按脚注处理(正文 [n] + 文末来源)。
// 三个出口:复制 / 下载 .md / 打印(可另存为 PDF)。
// 入口:① 每条回答尾部注入「⤓ 导出」按钮;② 工具栏「导出」菜单(含最稳妥的“选中内容”方式)。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const dom = NS.dom;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function readableLatex(source) {
    let text = String(source || '').trim();
    const symbols = {
      lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
      leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠',
      times: '×', cdot: '·', div: '÷', pm: '±',
      infty: '∞', approx: '≈', to: '→', rightarrow: '→', leftarrow: '←',
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ',
      lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω',
    };

    for (let i = 0; i < 4; i += 1) {
      const next = text
        .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
        .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
      if (next === text) break;
      text = next;
    }

    text = text
      .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\(lfloor|rfloor|lceil|rceil|leq|le|geq|ge|neq|times|cdot|div|pm|infty|approx|to|rightarrow|leftarrow|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|phi|omega)\b/g, (_, name) => symbols[name])
      .replace(/\\(?:left|right|quad|qquad)\b/g, '')
      .replace(/\\[,;:!]/g, '')
      .replace(/\\([A-Za-z]+)/g, '$1')
      .replace(/[{}]/g, '');

    return escapeHtml(text)
      .replace(/\^([A-Za-z0-9+\-=()]+)/g, '<sup>$1</sup>')
      .replace(/_([A-Za-z0-9+\-=()]+)/g, '<sub>$1</sub>');
  }
  function printableText(value) {
    const text = String(value || '');
    const math = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\((.+?)\\\)/g;
    let html = '';
    let lastIndex = 0;
    let match;
    while ((match = math.exec(text))) {
      html += escapeHtml(text.slice(lastIndex, match.index));
      html += `<span class="nblm-math">${readableLatex(match[1] || match[2] || match[3] || match[4])}</span>`;
      lastIndex = math.lastIndex;
    }
    return html + escapeHtml(text.slice(lastIndex));
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
  }
  function download(name, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function filename(title) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const safe = String(title).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40).trim() || 'export';
    return `NotebookLM-${safe}-${ymd}.md`;
  }

  function normalizeTitle(value) {
    return String(value || '').replace(/\s+/g, '').toLowerCase();
  }

  function titlesMatch(expected, actual) {
    const left = normalizeTitle(expected);
    const right = normalizeTitle(actual);
    return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
  }

  function isQuizCard(card) {
    if (!card) return false;
    const attrs = ['data-artifact-type', 'data-type', 'aria-label'];
    const explicit = attrs.map((name) => {
      try { return card.getAttribute(name) || ''; } catch (_) { return ''; }
    }).join(' ');
    if (/(^|\W)(quiz|test)(\W|$)|测验/i.test(explicit)) return true;
    if (!card.querySelector) return false;
    return !!card.querySelector(
      '[data-artifact-type="quiz" i], [data-type="quiz" i], ' +
      '[aria-label*="quiz" i], [aria-label*="测验"], ' +
      '[data-mat-icon-name*="quiz" i], mat-icon[data-font-icon*="quiz" i]'
    );
  }

  function injectQuizExportMenu(menu, card, onExport) {
    if (!menu || !isQuizCard(card)) return false;
    if (menu.querySelector && menu.querySelector('[data-nblm-quiz-export]')) return true;
    const items = Array.from(menu.children || []);
    const deleteItem = items.find((item) => /^(delete|删除)$/i.test(String(item.textContent || '').trim()));
    if (!deleteItem || !menu.ownerDocument || !menu.ownerDocument.createElement) return false;

    const item = deleteItem.cloneNode
      ? deleteItem.cloneNode(false)
      : menu.ownerDocument.createElement(deleteItem.tagName ? deleteItem.tagName.toLowerCase() : 'button');
    if (!deleteItem.cloneNode) item.className = deleteItem.className || '';
    if (item.removeAttribute) {
      item.removeAttribute('id');
      item.removeAttribute('aria-label');
    }
    item.dataset.nblmQuizExport = '';
    item.setAttribute('data-nblm-quiz-export', '');
    if (deleteItem.getAttribute) {
      const role = deleteItem.getAttribute('role');
      if (role) item.setAttribute('role', role);
    }
    item.textContent = 'Export';
    item.addEventListener('click', (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      onExport();
    });
    menu.insertBefore(item, deleteItem);
    return true;
  }

  // VERIFY: NotebookLM 引用角标选择器(用于脚注化)。命中即处理,未命中则不生成脚注。
  const CITATION_SELECTORS = ['button[aria-label*="citation" i]', '[data-citation]', '.citation', 'a[href*="cite" i]'];
  function processCitations(root) {
    let nodes = [];
    for (const s of CITATION_SELECTORS) {
      const found = root.querySelectorAll(s);
      if (found.length) { nodes = Array.prototype.slice.call(found); break; }
    }
    const sources = [], map = new Map();
    nodes.forEach((n) => {
      const label = (n.getAttribute && (n.getAttribute('aria-label') || n.title) || n.textContent || '来源').trim().slice(0, 200);
      let idx;
      if (map.has(label)) idx = map.get(label);
      else { sources.push(label); idx = sources.length; map.set(label, idx); }
      n.replaceWith(document.createTextNode(`[${idx}]`));
    });
    return sources;
  }

  // 捕获一个节点 → { md, html }(已脚注化引用)
  function capture(node) {
    const clone = node.cloneNode(true);
    
    // 把 input 和 textarea 替换为文本 div，以防 value 属性丢失导致 Markdown 转换后为空
    const inputs = node.querySelectorAll('input, textarea');
    const cloneInputs = clone.querySelectorAll('input, textarea');
    inputs.forEach((original, idx) => {
      const val = original.value || '';
      const replacement = document.createElement('div');
      replacement.className = original.className;
      replacement.textContent = val;
      if (cloneInputs[idx]) {
        cloneInputs[idx].replaceWith(replacement);
      }
    });

    const sources = processCitations(clone);
    // 移除不相关的 UI 按钮（例如：Studio 面板中的删除、全屏、返回按钮。保留测验中的选项按钮）
    clone.querySelectorAll('button:not(.answer-btn), .nblm-answer-export').forEach((b) => b.remove());

    let md = NS.md.fromHtml(clone);
    let html = clone.innerHTML;
    if (sources.length) {
      md += '\n\n---\n\n**来源**\n\n' + sources.map((s, i) => `[${i + 1}] ${s}`).join('\n');
      html += '<hr><p><strong>来源</strong></p><ol>' + sources.map((s) => `<li>${escapeHtml(s)}</li>`).join('') + '</ol>';
    }
    return { md, html };
  }
  function captureMany(nodes, sep) {
    const parts = nodes.map((n) => capture(n));
    return {
      md: parts.map((p) => p.md).join(`\n\n${sep || '---'}\n\n`),
      html: parts.map((p) => p.html).join('<hr>'),
    };
  }

  function printContent(title, html) {
    const w = window.open('', '_blank');
    if (!w) { NS.ui.toast('被拦截，无法打开打印视图'); return; }
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>\n` +
      `<style>body{font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Roboto,Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1a1a}` +
      `h1,h2,h3{line-height:1.3}pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto}` +
      `code{background:#f0f0f0;padding:1px 4px;border-radius:3px}blockquote{border-left:3px solid #ccc;margin:0;padding-left:14px;color:#555}` +
      `.nblm-math{font-family:"Cambria Math","STIX Two Math","Times New Roman",serif;white-space:nowrap}` +
      `table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 10px}img{max-width:100%}` +
      `@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(title)}</h1>${html}` +
      `</body></html>`);
    w.document.close();
    
    // Use timeout to avoid CSP inline script violation
    setTimeout(() => {
      w.focus();
      w.print();
    }, 500);
  }

  function showOutput(title, cap) {
    if (!cap || !String(cap.md || '').trim()) {
      NS.ui.toast('未识别到可导出的文本内容');
      return false;
    }
    const h = NS.ui.h;
    const preview = h('textarea', { class: 'nblm-textarea', style: { minHeight: '220px' } }, cap.md);
    const copyBtn = h('button', { class: 'nblm-btn', text: '复制', onClick: async () => { await copy(preview.value); NS.ui.toast('已复制 Markdown'); } });
    const dlBtn = h('button', { class: 'nblm-btn', text: '下载 .md', onClick: () => download(filename(title), preview.value) });
    const pdfBtn = h('button', { class: 'nblm-btn primary', text: '打印 / 存 PDF', onClick: () => printContent(title, cap.html) });
    
    const obsBtn = h('button', { class: 'nblm-btn', text: '📓 发送到 Obsidian', onClick: async () => {
      const settings = await NS.storage.getSettings();
      const obs = settings.obsidian || {};
      if (!obs.vaultName) {
        NS.ui.toast('请先在控制中心配置 Obsidian Vault 名称');
        return;
      }
      const uri = `obsidian://new?vault=${encodeURIComponent(obs.vaultName)}&name=${encodeURIComponent(title)}&content=${encodeURIComponent(preview.value)}` + (obs.defaultFolder ? `&folder=${encodeURIComponent(obs.defaultFolder)}` : '');
      window.open(uri, '_blank');
    }});

    const notionBtn = h('button', { class: 'nblm-btn', text: '📓 发送到 Notion', onClick: async () => {
      const settings = await NS.storage.getSettings();
      const notion = settings.notion || {};
      if (!notion.token || !(notion.targetId || notion.databaseId)) {
        NS.ui.toast('请先在控制中心配置 Notion API Token 和目标页面');
        return;
      }
      const prevText = notionBtn.textContent;
      notionBtn.textContent = '发送中...';
      try {
        await NS.notionAPI.exportToNotion(title, preview.value);
        NS.ui.toast('已成功发送到 Notion');
      } catch (err) {
        NS.ui.toast(err.message || '发送失败');
      } finally {
        notionBtn.textContent = prevText;
      }
    }});

    NS.ui.openOverlay(
      h('div', null, h('div', { class: 'nblm-hint', text: '可在下方微调后再复制 / 下载;打印视图用原始排版,适合另存为 PDF。' }), preview),
      { title: '导出 · ' + title, width: 720, footer: [notionBtn, obsBtn, copyBtn, dlBtn, pdfBtn] });
    return true;
  }

  // —— 各来源 ——
  function exportSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { NS.ui.toast('请先在页面选中要导出的内容'); return; }
    const div = document.createElement('div');
    div.appendChild(sel.getRangeAt(0).cloneContents());
    showOutput('选中内容', capture(div));
  }
  function exportLastAnswer() {
    const nodes = dom.getAnswerNodes();
    if (!nodes.length) { NS.ui.toast('未找到回答节点(可改用“选中内容”导出)'); return; }
    showOutput('回答', capture(nodes[nodes.length - 1]));
  }
  function requestArtifactContent(iframe, timeoutMs) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Timeout waiting for iframe response'));
      }, timeoutMs || 3000);
      
      function onMessage(event) {
        const d = event.data;
        if (event.source === iframe.contentWindow &&
            d && d.type === 'NBLM_ARTIFACT_CONTENT_RESPONSE' && d.requestId === requestId) {
          clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          resolve(d);
        }
      }
      window.addEventListener('message', onMessage);
      
      if (!iframe || !iframe.contentWindow) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        reject(new Error('Invalid iframe or contentWindow'));
        return;
      }

      try {
        iframe.contentWindow.postMessage({
          type: 'NBLM_GET_ARTIFACT_CONTENT',
          requestId: requestId
        }, '*');
      } catch (err) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        reject(err);
      }
    });
  }

  function parseQuizJson(quizList, options) {
    const includeAnswers = !options || options.includeAnswers !== false;
    let md = '';
    let html = '';
    quizList.forEach((q, index) => {
      const stem = (q.question || '').replace(/<[^>]+>/g, '').trim();
      if (!stem) return;
      const num = index + 1;
      md += `### ${num}. ${stem}\n\n`;
      html += `<h3>${num}. ${printableText(stem)}</h3>`;
      
      let typeLabel = '单选题';
      const correctOptions = (q.answerOptions || []).filter(o => o.isCorrect);
      if (q.type === 'true_false' || (q.answerOptions && q.answerOptions.length === 2 && /对|错|正确|错误|true|false/i.test(q.answerOptions.map(o => o.text || o.optionText || '').join('|')))) {
        typeLabel = '判断题';
      } else if (correctOptions.length > 1) {
        typeLabel = '多选题';
      }
      md += `*类型：${typeLabel}*\n\n`;
      html += `<p><em>类型：${typeLabel}</em></p>`;
      
      const options = q.answerOptions || q.options || [];
      const correctAnswers = [];
      if (options.length) {
        html += '<ul>';
        options.forEach(o => {
          const text = (o.text || o.optionText || o.content || o.answerText || o.option || o.value || '').trim();
          const isCorrect = o.isCorrect || false;
          md += `- [ ] ${text}\n`;
          html += `<li>[ ] ${printableText(text)}</li>`;
          if (isCorrect) correctAnswers.push(text);
        });
        md += '\n';
        html += '</ul>';
      }
      
      const explanation = q.explanation || q.rationale || q.feedback || '';
      if (includeAnswers && (correctAnswers.length > 0 || explanation)) {
        md += `<details>\n<summary>查看答案与解析</summary>\n\n`;
        html += `<details style="margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 6px;"><summary style="cursor: pointer; font-weight: bold;">查看答案与解析</summary>\n`;
        if (correctAnswers.length > 0) {
           md += `**正确答案**：${correctAnswers.join(', ')}\n\n`;
           html += `<p style="margin-top: 10px;"><strong>正确答案</strong>：${printableText(correctAnswers.join(', '))}</p>`;
        }
        if (explanation) {
           md += `**解析**：${explanation}\n\n`;
           html += `<p><strong>解析</strong>：${printableText(explanation)}</p>`;
        }
        md += `</details>\n\n`;
        html += `</details>`;
      }
      md += '---\n\n';
      html += '<hr>';
    });
    return { md: md.trim(), html };
  }

  async function waitForQuizData(expectedTitle, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 8000);
    let lastError = '未检测到已打开的测验';
    while (Date.now() < deadline) {
      const openTitle = dom.getOpenArtifactTitle ? dom.getOpenArtifactTitle() : '';
      if (!titlesMatch(expectedTitle, openTitle)) {
        lastError = openTitle ? `当前打开的是“${openTitle}”` : '尚未识别到已打开的测验标题';
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      const iframe = dom.getArtifactIframe ? dom.getArtifactIframe() : null;
      if (!iframe) {
        lastError = '测验正文尚未加载';
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      try {
        const data = await requestArtifactContent(iframe, Math.min(1200, Math.max(200, deadline - Date.now())));
        if (data && data.success && data.appData && Array.isArray(data.appData.quiz) && data.appData.quiz.length) {
          return data;
        }
        lastError = '测验题目数据为空';
      } catch (_) {
        lastError = '等待测验正文响应超时';
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(lastError);
  }

  function openQuizCard(card) {
    if (!card) return false;
    const target = card.querySelector && card.querySelector(
      '[data-artifact-title], .artifact-title, [class*="title"], h3, h2'
    );
    const clickable = target && target.click ? target : card;
    if (!clickable.click) return false;
    clickable.click();
    return true;
  }

  async function exportQuizCard(context, format, includeAnswers) {
    NS.ui.closeOverlay();
    if (!openQuizCard(context.card)) {
      NS.ui.toast('导出失败：无法打开所选测验');
      return;
    }
    NS.ui.toast('正在读取测验内容…');
    try {
      const data = await waitForQuizData(context.title, 8000);
      const output = parseQuizJson(data.appData.quiz, { includeAnswers });
      if (!output.md.trim()) throw new Error('测验题目数据为空');
      if (format === 'pdf') printContent(context.title, output.html);
      else download(filename(context.title), output.md);
    } catch (error) {
      NS.ui.toast(`导出失败：${error.message || error}`);
    }
  }

  function openQuizExportOptions(context) {
    const h = NS.ui.h;
    let format = 'md';
    let answerMode = 'answers';
    const body = h('div', null,
      h('div', { class: 'nblm-hint', style: { marginBottom: '16px' }, text: `导出测验：${context.title}` }),
      h('div', { class: 'nblm-inline' },
        h('div', { class: 'nblm-row' },
          h('div', { class: 'nblm-label', text: '格式' }),
          h('select', { class: 'nblm-select', onChange: (event) => { format = event.target.value; } },
            h('option', { value: 'md', selected: true, text: 'Markdown' }),
            h('option', { value: 'pdf', text: 'PDF / 打印' }))),
        h('div', { class: 'nblm-row' },
          h('div', { class: 'nblm-label', text: '答案' }),
          h('select', { class: 'nblm-select', onChange: (event) => { answerMode = event.target.value; } },
            h('option', { value: 'answers', selected: true, text: '含答案与解析' }),
            h('option', { value: 'practice', text: '仅题目' })))),
      h('div', { class: 'nblm-hint', text: '确认后会打开该测验并读取题目；导出完成后保留测验打开。' }));
    const cancel = h('button', { class: 'nblm-btn', text: '取消', onClick: () => NS.ui.closeOverlay() });
    const confirm = h('button', {
      class: 'nblm-btn primary',
      text: '开始导出',
      onClick: () => exportQuizCard(context, format, answerMode === 'answers'),
    });
    NS.ui.openOverlay(body, { title: '导出测验', width: 480, footer: [cancel, confirm] });
  }

  let pendingQuizCard = null;

  function scanArtifactMenus() {
    if (!pendingQuizCard || !dom.getArtifactMenus) return;
    const menus = dom.getArtifactMenus();
    for (let index = menus.length - 1; index >= 0; index--) {
      if (injectQuizExportMenu(menus[index], pendingQuizCard.card, () => openQuizExportOptions(pendingQuizCard))) {
        break;
      }
    }
  }

  function trackArtifactMenuClicks() {
    if (!document.addEventListener || !dom.SELECTORS || !dom.SELECTORS.artifactMenuTrigger) return;
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      let trigger = null;
      for (const selector of dom.SELECTORS.artifactMenuTrigger) {
        try {
          trigger = target.closest(selector);
          if (trigger) break;
        } catch (_) {}
      }
      if (!trigger || !dom.findArtifactCard) return;
      const card = dom.findArtifactCard(trigger);
      if (!isQuizCard(card)) {
        pendingQuizCard = null;
        return;
      }
      const title = dom.getArtifactCardTitle ? dom.getArtifactCardTitle(card) : '';
      if (!title) {
        pendingQuizCard = null;
        return;
      }
      pendingQuizCard = { card, title };
      setTimeout(scanArtifactMenus, 0);
    }, true);
  }

  async function exportArtifact() {
    // 1. 尝试寻找当前可见的 Iframe (生成物如学习指南、测验等)
    const iframe = dom.getArtifactIframe ? dom.getArtifactIframe() : null;
    if (iframe) {
      try {
        const data = await requestArtifactContent(iframe);
        if (data && data.success) {
          if (data.appData && Array.isArray(data.appData.quiz)) {
            const parsed = parseQuizJson(data.appData.quiz);
            if (showOutput(data.title || '生成物', parsed)) return;
          }
          if (data.html) {
            const div = document.createElement('div');
            div.innerHTML = data.html;
            div.querySelectorAll('script, style, link, svg, iframe').forEach(el => el.remove());
            if (showOutput(data.title || '生成物', capture(div))) return;
          }
        }
      } catch (err) {
        console.warn('[NotebookLM Plus] Failed to export via iframe postMessage, falling back:', err);
      }
    }
    
    // 2. 尝试寻找当前在右侧 Studio 面板中打开的笔记 (Note)
    const noteEl = dom.getOpenNote ? dom.getOpenNote() : null;
    if (noteEl) {
      // 进一步确认这确实是一个笔记面板，而不是包含 Quiz 程序的 Studio/App 页面
      const hasNoteBreadcrumb = document.querySelector('section.studio-panel')?.textContent.includes('Note');
      const hasEditable = noteEl.querySelector('[contenteditable="true"]');
      const isStudioPanel = noteEl.tagName === 'SECTION' && noteEl.classList.contains('studio-panel');
      
      if (isStudioPanel && !hasNoteBreadcrumb && !hasEditable) {
        // 这其实是一个 Quiz 或其他 App，但由于 iframe 未就绪被错误地用 studio-panel 兜底命中了。跳过笔记导出。
      } else {
        // 提取标题，如果找不到，兜底使用默认标题或容器中的首个 h1/h2
        const titleEl = noteEl.querySelector('input[placeholder*="标题" i], textarea[placeholder*="标题" i], [contenteditable="true"].title, .note-title, h1, h2');
        let title = '笔记';
        if (titleEl) {
          title = titleEl.value || titleEl.textContent || '笔记';
        } else {
          const studioPanel = document.querySelector('section.studio-panel');
          if (studioPanel) {
            const tEl = studioPanel.querySelector('.title, h1, h2');
            if (tEl) title = tEl.textContent || '笔记';
          }
        }
        title = String(title).trim() || '笔记';
        if (showOutput(title, capture(noteEl))) return;
      }
    }
    
    // 3. 降级为原有的生成物容器提取
    const el = dom.getArtifact();
    if (el) {
      if (showOutput('生成物', capture(el))) return;
      return;
    }
    
    // 4. 彻底找不到时的提示
    NS.ui.toast('未找到当前打开的生成物或笔记(可改用“选中内容”导出)');
  }
  function exportNotes() {
    const cards = dom.getNoteCards();
    if (!cards.length) { NS.ui.toast('未找到笔记卡片(可改用“选中内容”导出)'); return; }
    showOutput('笔记', captureMany(cards, '---'));
  }

  function exportFullConversation() {
    const userSels = dom.SELECTORS.userNode.join(', ');
    const assistantSels = dom.SELECTORS.answerNode.join(', ');
    const allSels = `${userSels}, ${assistantSels}`;

    const rawNodes = Array.from(document.querySelectorAll(allSels)).filter(dom.isVisible);
    const nodes = [];
    for (const n of rawNodes) {
      if (nodes.some(parent => parent.contains(n))) continue;
      nodes.push(n);
    }

    if (!nodes.length) { NS.ui.toast('未找到对话记录(可改用“选中内容”导出)'); return; }

    const isUserNode = (node) => {
      return dom.SELECTORS.userNode.some(s => {
        try { return node.matches(s); } catch (_) { return false; }
      });
    };

    const parts = nodes.map(node => {
      if (isUserNode(node)) {
        const text = dom.text(node);
        return {
          md: `**用户**：${text}`,
          html: `<p><strong>用户</strong>：${escapeHtml(text)}</p>`
        };
      } else {
        const cap = capture(node);
        const cleanMd = cap.md.replace(/^\s*⤓\s*导出\s*/i, '');
        const cleanHtml = cap.html.replace(/<button[^>]*class="nblm-answer-export"[^>]*>.*?<\/button>/gi, '');
        return {
          md: `**AI**：\n\n${cleanMd}`,
          html: `<p><strong>AI</strong>：</p>${cleanHtml}`
        };
      }
    });

    const cap = {
      md: parts.map(p => p.md).join('\n\n---\n\n'),
      html: parts.map(p => p.html).join('<hr>')
    };

    showOutput('完整对话', cap);
  }

  function sourceRow(title, desc, onClick) {
    const h = NS.ui.h;
    return h('button', {
      class: 'nblm-list-item', style: { display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent' },
      onClick,
    }, h('div', { class: 't', text: title }), h('div', { class: 'm', text: desc }));
  }

  function openMenu() {
    const h = NS.ui.h;
    NS.ui.openOverlay(h('div', null,
      sourceRow('选中的内容(最稳妥)', '先在页面选中文字,再点这里 — 不依赖页面结构', exportSelection),
      sourceRow('最新回答', '导出对话里最后一条 AI 回答', exportLastAnswer),
      sourceRow('完整对话', '按顺序导出当前窗口中的所有问答对话', exportFullConversation),
      sourceRow('当前生成物', '学习指南 / 简报 / 测验等当前打开的生成物', exportArtifact),
      sourceRow('所有笔记', '导出 Studio 中保存的笔记卡片', exportNotes),
      sourceRow('错题本 → Anki', '管理错题并导出为 Anki 格式的记忆卡片', () => {
        NS.ui.closeOverlay();
        if (NS.quizReview && NS.quizReview.open) NS.quizReview.open();
        else NS.ui.toast('错题本模块未加载');
      })
    ), { title: '导出为 Markdown', width: 480 });
  }

  // 每条回答尾部注入「⤓ 导出」按钮(幂等;由 bootstrap 心跳调用)
  function scanAnswers() {
    const nodes = dom.allBy(dom.SELECTORS.answerNode);
    nodes.forEach((node) => {
      if (node.__nblmBtn || node.querySelector(':scope > .nblm-answer-export')) return;
      node.__nblmBtn = true;
      const btn = document.createElement('button');
      btn.className = 'nblm-answer-export';
      btn.textContent = '⤓ 导出';
      btn.style.cssText = 'border:none;background:rgba(37,99,235,.1);color:#2563EB;cursor:pointer;border-radius:6px;padding:2px 8px;font-size:12px;margin:6px 0;display:inline-flex;gap:4px;align-items:center;font-family:Roboto,system-ui,sans-serif';
      btn.addEventListener('click', (e) => { e.stopPropagation(); showOutput('回答', capture(node)); });
      node.appendChild(btn);
    });
  }

  trackArtifactMenuClicks();

  NS.export = {
    openMenu,
    scanAnswers,
    scanArtifactMenus,
    parseQuizJson,
    injectQuizExportMenu,
    isQuizCard,
    titlesMatch,
  };
})();
