// src/content/quiz-review.js
// 错题筛选、长期统计与逐题复习。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  const storage = NS.storage, dom = NS.dom;

  function setEq(a, b) {
    if (a.size !== b.size) return false;
    for (const value of a) if (!b.has(value)) return false;
    return true;
  }

  function getMasteryStatus(item) {
    if (!(item.reviewCount > 0)) return 'unreviewed';
    return item.rightStreak > 0 ? 'improving' : 'needsWork';
  }

  function filterDeck(deck, filters, now) {
    filters = filters || {};
    now = now || Date.now();
    const maxAge = filters.age === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : filters.age === '30d' ? 30 * 24 * 60 * 60 * 1000 : null;
    return deck.filter((item) => {
      if (filters.type && filters.type !== 'all' && item.type !== filters.type) return false;
      if (filters.mastery && filters.mastery !== 'all' && getMasteryStatus(item) !== filters.mastery) return false;
      if (maxAge != null && (!item.ts || now - item.ts > maxAge)) return false;
      return true;
    });
  }

  async function updateItem(notebookId, item, right, retireAfter) {
    const reviewCount = (item.reviewCount || 0) + 1;
    const lastReviewedAt = Date.now();
    if (right) {
      const streak = (item.rightStreak || 0) + 1;
      const mastered = streak >= retireAfter;
      if (mastered) await storage.removeWrong(notebookId, item.id);
      else await storage.updateWrong(notebookId, item.id, { rightStreak: streak, reviewCount, lastReviewedAt });
      if (storage.recordReviewResult) await storage.recordReviewResult(notebookId, true, mastered);
      return mastered;
    }
    await storage.updateWrong(notebookId, item.id, {
      rightStreak: 0,
      wrongCount: (item.wrongCount || 1) + 1,
      reviewCount,
      lastReviewedAt,
    });
    if (storage.recordReviewResult) await storage.recordReviewResult(notebookId, false, false);
    return false;
  }

  function formatTime(value) {
    return value ? new Date(value).toLocaleString() : '尚未复习';
  }

  function accuracy(stats) {
    return stats.attempts ? Math.round(stats.correct / stats.attempts * 100) + '%' : '--';
  }

  async function open() {
    const h = NS.ui.h;
    const notebookId = dom.getNotebookId();
    let fullDeck = await storage.getWrong(notebookId);
    const settings = await storage.getSettings();
    const retireAfter = (settings.review && settings.review.retireAfter) || 2;
    const bodyWrap = h('div');
    const footWrap = h('div', {
      style: { display: 'flex', gap: '8px', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
    });
    NS.ui.openOverlay(bodyWrap, { title: '错题复习', width: 720, footer: footWrap });

    let deck = [];
    let index = 0;
    let rightCount = 0;
    let answeredCount = 0;

    function formatText(str) {
      if (!str) return '';
      let text = String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Math: \frac{a}{b} -> a / b
      text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
      text = text.replace(/\\frac ([a-zA-Z0-9]+) ([a-zA-Z0-9]+)/g, '($1)/($2)');
      // Math: x^2 -> x²
      text = text.replace(/\^2/g, '²').replace(/\^3/g, '³');
      // Bold Markdown
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Math: $...$ and $$...$$
      text = text.replace(/\$\$(.*?)\$\$/g, '\\[$1\\]');
      text = text.replace(/\$(.*?)\$/g, '\\($1\\)');
      return text;
    }

    function selectRow(label, choices, value, onChange) {
      return h('div', { class: 'nblm-row' },
        h('div', { class: 'nblm-label', text: label }),
        h('select', { class: 'nblm-select', onChange },
          ...Object.keys(choices).map((key) => h('option', {
            value: key,
            selected: key === value,
            text: choices[key],
          }))));
    }

    async function renderHome() {
      bodyWrap.innerHTML = '';
      footWrap.innerHTML = '';
      fullDeck = await storage.getWrong(notebookId);
      const stats = storage.getReviewStats
        ? await storage.getReviewStats(notebookId)
        : { attempts: 0, correct: 0, mastered: 0, lastReviewedAt: 0 };
      const filters = { scope: 'current', type: 'all', mastery: 'all', age: 'all' };
      const countText = h('span', { class: 'nblm-progress' });
      const startButton = h('button', { class: 'nblm-btn primary', text: '开始复习' });

      function refreshCount() {
        const count = filterDeck(fullDeck, filters).length;
        countText.textContent = `筛选后 ${count} 题`;
        startButton.disabled = count === 0;
      }

      const statCards = [
        ['当前错题', fullDeck.length],
        ['累计作答', stats.attempts],
        ['正确率', accuracy(stats)],
        ['已掌握', stats.mastered],
      ].map(([label, value]) => h('div', {
        style: { padding: '12px', border: '1px solid var(--border, #e2e8f0)', borderRadius: '10px', textAlign: 'center' },
      },
      h('div', { style: { fontSize: '18px', fontWeight: '700' }, text: String(value) }),
      h('div', { style: { fontSize: '11px', opacity: 0.7, marginTop: '3px' }, text: label })));
      const statGrid = h('div', {
        style: {
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '18px',
        },
      }, ...statCards);

      const typeChoices = { all: '全部题型', single: '单选题', multi: '多选题', truefalse: '判断题', fillblank: '填空题', shortanswer: '简答题' };
      const masteryChoices = { all: '全部状态', unreviewed: '未复习', improving: '改进中', needsWork: '需巩固' };
      const ageChoices = { all: '全部时间', '7d': '近 7 天', '30d': '近 30 天' };
      const scopeChoices = { current: '当前笔记本', all: '全部笔记本' };
      const controls = h('div', { class: 'nblm-inline' },
        selectRow('范围', scopeChoices, filters.scope, async (event) => { 
          filters.scope = event.target.value; 
          if (filters.scope === 'all' && storage.listAllWrongNotebooks) {
            const all = await storage.listAllWrongNotebooks();
            fullDeck = all.flatMap(n => n.wrongList);
          } else {
            fullDeck = await storage.getWrong(notebookId);
          }
          refreshCount(); 
        }),
        selectRow('题型', typeChoices, filters.type, (event) => { filters.type = event.target.value; refreshCount(); }),
        selectRow('掌握状态', masteryChoices, filters.mastery, (event) => { filters.mastery = event.target.value; refreshCount(); }),
        selectRow('加入时间', ageChoices, filters.age, (event) => { filters.age = event.target.value; refreshCount(); }));

      const contentNodes = [
        statGrid,
        h('div', { class: 'nblm-hint', style: { margin: '-8px 0 18px' }, text: `最近复习：${formatTime(stats.lastReviewedAt)}` }),
        controls
      ];
      if (!fullDeck.length) {
        contentNodes.push(h('div', { class: 'nblm-empty', text: '当前范围暂无错题。' }));
      }
      bodyWrap.append(...contentNodes);

      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([bodyWrap]).catch((err) => console.log(err));
      }

      startButton.addEventListener('click', () => {
        deck = filterDeck(fullDeck, filters);
        if (!deck.length) return;
        index = 0; rightCount = 0; answeredCount = 0;
        renderQuestion();
      });

      const ankiButton = h('button', {
        class: 'nblm-btn', text: '📤 导出到 Anki',
        onClick: () => {
          const currentDeck = filterDeck(fullDeck, filters);
          if (!currentDeck.length) return NS.ui.toast('当前没有可导出的题目');
          
          const ankiBody = h('div', null,
            h('div', { class: 'nblm-label', text: '导出范围' }),
            h('select', { class: 'nblm-select', id: 'anki-scope' },
              h('option', { value: 'current', text: `当前筛选 (${currentDeck.length} 题)` }),
              h('option', { value: 'all', text: `全部错题 (${fullDeck.length} 题)` })
            ),
            h('div', { class: 'nblm-label', text: '导出选项', style: { marginTop: '12px' } }),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' } },
              h('input', { type: 'checkbox', id: 'anki-exp', checked: true }),
              '包含解析'
            )
          );
          
          const confirmBtn = h('button', {
            class: 'nblm-btn primary', text: '确认导出',
            onClick: () => {
              const scope = ankiBody.querySelector('#anki-scope').value;
              const incExp = ankiBody.querySelector('#anki-exp').checked;
              const exportDeck = scope === 'all' ? fullDeck : currentDeck;
              
              if (NS.ankiExport && NS.ankiExport.downloadAnkiFile) {
                NS.ankiExport.downloadAnkiFile(exportDeck, notebookId, { includeExplanation: incExp });
                NS.ui.closeOverlay();
                open();
              } else {
                NS.ui.toast('导出模块未加载');
              }
            }
          });
          
          NS.ui.openOverlay(ankiBody, {
            title: '导出到 Anki',
            width: 360,
            footer: [
              h('button', { class: 'nblm-btn', text: '取消', onClick: () => { NS.ui.closeOverlay(); open(); } }),
              confirmBtn
            ]
          });
        }
      });

      function buildReviewMarkdown(deck) {
        let md = '# 错题本复习\n\n';
        deck.forEach((q, i) => {
          md += `## ${i+1}. ${q.stem}\n`;
          let correctAnswers = [];
          if (q.options && q.options.length) {
             md += q.options.map((opt, j) => {
               const isCorrect = q.correct && q.correct.includes(j);
               if (isCorrect) correctAnswers.push(opt);
               return `- [ ] ${opt}`;
             }).join('\n') + '\n\n';
          } else {
             correctAnswers.push(q.answer || q.referenceAnswer || '无');
          }
          md += `<details>\n<summary>查看答案与解析</summary>\n\n`;
          md += `**正确答案**：${correctAnswers.join(', ')}\n`;
          if (q.explanation) md += `\n**解析**：\n${q.explanation}\n`;
          md += `</details>\n\n`;
          md += '---\n\n';
        });
        return md;
      }

      const obsButton = h('button', {
        class: 'nblm-btn', text: '📓 导出到 Obsidian',
        onClick: async () => {
          const currentDeck = filterDeck(fullDeck, filters);
          if (!currentDeck.length) return NS.ui.toast('当前没有可导出的题目');
          const settings = await NS.storage.getSettings();
          const obs = settings.obsidian || {};
          if (!obs.vaultName) {
            NS.ui.toast('请先在控制中心配置 Obsidian Vault 名称');
            return;
          }
          const md = buildReviewMarkdown(currentDeck);
          const uri = `obsidian://new?vault=${encodeURIComponent(obs.vaultName)}&name=${encodeURIComponent('错题本复习记录')}&content=${encodeURIComponent(md)}` + (obs.defaultFolder ? `&folder=${encodeURIComponent(obs.defaultFolder)}` : '');
          window.open(uri, '_blank');
        }
      });

      const notionButton = h('button', {
        class: 'nblm-btn', text: '📓 导出到 Notion',
        onClick: async () => {
          const currentDeck = filterDeck(fullDeck, filters);
          if (!currentDeck.length) return NS.ui.toast('当前没有可导出的题目');
          const settings = await NS.storage.getSettings();
          const notion = settings.notion || {};
          if (!notion.token || !(notion.targetId || notion.databaseId)) {
            NS.ui.toast('请先在控制中心配置 Notion API Token 和目标页面');
            return;
          }
          const md = buildReviewMarkdown(currentDeck);
          
          const prevText = notionButton.textContent;
          notionButton.textContent = '发送中...';
          try {
            await NS.notionAPI.exportToNotion('错题本复习记录', md);
            NS.ui.toast('已成功发送到 Notion');
          } catch (err) {
            NS.ui.toast(err.message || '发送失败');
          } finally {
            notionButton.textContent = prevText;
          }
        }
      });

      footWrap.append(countText, h('div', { style: { display: 'flex', gap: '8px' } }, notionButton, obsButton, ankiButton, startButton));
      refreshCount();
    }

    async function renderSummary() {
      bodyWrap.innerHTML = ''; footWrap.innerHTML = '';
      const stats = storage.getReviewStats ? await storage.getReviewStats(notebookId) : null;
      bodyWrap.append(h('div', {
        class: 'nblm-empty',
        html:
          `本轮复习完成<br>共 ${deck.length} 题，作答 ${answeredCount} 题，答对 ${rightCount} 题。` +
          `<br><span style="font-size:12px">累计正确率：${stats ? accuracy(stats) : '--'}；答对满 ${retireAfter} 次的题目已移出错题本。</span>`,
      }));
      footWrap.append(
        h('button', { class: 'nblm-btn', text: '返回筛选', onClick: renderHome }),
        h('button', { class: 'nblm-btn primary', text: '完成', onClick: () => NS.ui.closeOverlay() }));
    }

    function renderQuestion() {
      if (index >= deck.length) {
        renderSummary();
        return;
      }
      bodyWrap.innerHTML = ''; footWrap.innerHTML = '';
      const item = deck[index];
      const multi = item.type === 'multi';
      const picked = new Set();
      let revealed = false;
      let userInput = '';

      const typeLabel = { single: '单选', multi: '多选', truefalse: '判断', fillblank: '填空', shortanswer: '简答' }[item.type] || '';
      bodyWrap.append(
        h('div', { class: 'nblm-q-stem' },
          h('span', { style: { color: '#2563eb', fontSize: '13px', marginRight: '6px' }, text: `【${typeLabel}】` }),
          h('span', { html: formatText(item.stem) }))
      );

      let optionButtons = [];
      if (['single', 'multi', 'truefalse'].includes(item.type)) {
        optionButtons = item.options.map((text, optionIndex) => h('button', {
          class: 'nblm-q-opt', html: formatText(text),
          onClick: (event) => {
            if (revealed) return;
            if (multi) {
              if (picked.has(optionIndex)) { picked.delete(optionIndex); event.currentTarget.dataset.state = ''; }
              else { picked.add(optionIndex); event.currentTarget.dataset.state = 'picked'; }
            } else {
              picked.clear();
              optionButtons.forEach((button) => { button.dataset.state = ''; });
              picked.add(optionIndex); event.currentTarget.dataset.state = 'picked';
            }
          },
        }));
        bodyWrap.append(...optionButtons);
      } else if (item.type === 'fillblank') {
        const input = h('input', {
          class: 'nblm-input nblm-fill-input', placeholder: '请输入答案...',
          onInput: (e) => { userInput = e.target.value.trim(); }
        });
        bodyWrap.append(input);
      } else if (item.type === 'shortanswer') {
        const textarea = h('textarea', {
          class: 'nblm-textarea nblm-short-textarea', placeholder: '请输入简答...',
          onInput: (e) => { userInput = e.target.value.trim(); }
        });
        bodyWrap.append(textarea);
      }

      const feedback = h('span', { style: { fontSize: '13px', fontWeight: '600' } });
      const progress = h('span', { class: 'nblm-progress', text: `第 ${index + 1}/${deck.length} 题 · 已答对 ${rightCount}` });
      const mainButton = h('button', {
        class: 'nblm-btn primary', text: '翻答案',
        onClick: async () => {
          if (!revealed) {
            if (['single', 'multi', 'truefalse'].includes(item.type) && !picked.size) return NS.ui.toast('请先作答');
            if (['fillblank', 'shortanswer'].includes(item.type) && !userInput) return NS.ui.toast('请先作答');
            
            revealed = true;
            let right = false;

            if (['single', 'multi', 'truefalse'].includes(item.type)) {
              const correct = new Set(item.correct);
              optionButtons.forEach((button, optionIndex) => {
                if (correct.has(optionIndex)) button.dataset.state = 'correct';
                else if (picked.has(optionIndex)) button.dataset.state = 'wrong';
                else button.dataset.state = '';
              });
              right = setEq(picked, correct);
            } else if (item.type === 'fillblank') {
              const cleanAnswer = (item.answer || '').replace(/[ \n\r\t.,;!?，。；！？]/g, '');
              const cleanInput = userInput.replace(/[ \n\r\t.,;!?，。；！？]/g, '');
              right = cleanInput === cleanAnswer;
              
              bodyWrap.append(h('div', { style: { marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' } },
                h('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px' }, text: '参考答案：' }),
                h('div', { style: { fontWeight: '600', color: '#0f172a' }, text: item.answer })
              ));
            } else if (item.type === 'shortanswer') {
              bodyWrap.append(h('div', { style: { marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' } },
                h('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px' }, text: '参考答案：' }),
                h('div', { style: { color: '#0f172a', whiteSpace: 'pre-wrap', fontSize: '13px' }, text: item.referenceAnswer })
              ));
              
              const selfGradeBtns = h('div', { class: 'nblm-self-grade', style: { display: 'flex', gap: '8px', marginTop: '12px' } },
                h('button', { class: 'nblm-btn', style: { color: '#16a34a', borderColor: '#16a34a', borderWidth: '1px', borderStyle: 'solid', background: '#f0fdf4' }, text: '✅ 算我对', onClick: async () => finishGrading(true) }),
                h('button', { class: 'nblm-btn', style: { color: '#dc2626', borderColor: '#dc2626', borderWidth: '1px', borderStyle: 'solid', background: '#fef2f2' }, text: '❌ 算我错', onClick: async () => finishGrading(false) }),
                h('button', { class: 'nblm-btn', text: '🤖 AI 评分', onClick: () => {
                  const input = dom.getChatInput();
                  if (input) {
                    dom.setInputValue(input, `请帮我给这道简答题评分（满分10分，并给出理由）：\n\n【题目】${item.stem}\n【参考答案】${item.referenceAnswer}\n【我的答案】${userInput}`);
                    NS.ui.closeOverlay();
                    NS.ui.toast('已填入聊天框，请发送等待评分');
                  } else {
                    NS.ui.toast('找不到聊天框');
                  }
                } })
              );
              bodyWrap.append(selfGradeBtns);
              mainButton.style.display = 'none';
              
              async function finishGrading(isRight) {
                selfGradeBtns.style.display = 'none';
                mainButton.style.display = '';
                right = isRight;
                answeredCount++;
                if (right) rightCount++;
                feedback.textContent = right ? '✓ 答对了' : '✗ 答错了';
                feedback.style.color = right ? '#16a34a' : '#dc2626';
                await updateItem(notebookId, item, right, retireAfter);
                mainButton.textContent = index + 1 >= deck.length ? '完成' : '下一题';
                appendExplainBlock();
              }
              return; // wait for self grade
            }

            answeredCount++;
            if (right) rightCount++;
            feedback.textContent = right ? '✓ 答对了' : '✗ 答错了';
            feedback.style.color = right ? '#16a34a' : '#dc2626';
            await updateItem(notebookId, item, right, retireAfter);
            mainButton.textContent = index + 1 >= deck.length ? '完成' : '下一题';
            
            appendExplainBlock();
          } else {
            index++;
            renderQuestion();
          }
        },
      });

      function appendExplainBlock() {
        const explainBlock = h('div', { class: 'nblm-explain-wrap' });
        if (item.explanation) {
          const expContent = h('div', { class: 'nblm-explain-content', html: item.explanation, hidden: true });
          const toggleBtn = h('button', {
            class: 'nblm-btn', text: '📖 查看解析',
            style: { marginTop: '12px' },
            onClick: () => {
              const isHidden = expContent.hasAttribute('hidden');
              if (isHidden) { expContent.removeAttribute('hidden'); toggleBtn.textContent = '📖 收起解析'; }
              else { expContent.setAttribute('hidden', ''); toggleBtn.textContent = '📖 查看解析'; }
            }
          });
          explainBlock.append(toggleBtn, expContent);
        } else {
          const reqBtn = h('button', {
            class: 'nblm-btn', text: '🔍 求解析',
            style: { marginTop: '12px' },
            onClick: () => {
              if (NS.quizExplain && NS.quizExplain.requestExplanation) {
                NS.quizExplain.requestExplanation(item);
              } else {
                NS.ui.toast('解析模块未加载');
              }
            }
          });
          explainBlock.append(reqBtn);
        }
        bodyWrap.appendChild(explainBlock);
      }
      const skipButton = h('button', {
        class: 'nblm-btn', text: '跳过',
        onClick: () => { index++; renderQuestion(); },
      });
      footWrap.append(
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, progress, feedback),
        h('div', { style: { display: 'flex', gap: '8px' } }, skipButton, mainButton));
        
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([bodyWrap]).catch((err) => console.log(err));
      }
    }

    renderHome();
  }

  NS.quizReview = { open, getMasteryStatus, filterDeck, updateItem };
})();
