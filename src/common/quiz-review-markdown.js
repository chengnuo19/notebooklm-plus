// src/common/quiz-review-markdown.js
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function text(value) {
    return escapeHtml(value == null ? '' : String(value));
  }

  function listItems(items) {
    return items.map((item) => `<li>${item}</li>`).join('');
  }

  function section(title, content, className) {
    if (!content) return '';
    return [
      `<section class="${className || 'nblm-review-section'}">`,
      `<h2>${text(title)}</h2>`,
      content,
      '</section>',
    ].join('');
  }

  function render(report) {
    if (!report || !report.result) return '# Quiz 复盘\n\n无数据';

    const res = report.result;
    const lines = ['# Quiz 复盘\n'];

    if (res.summary) {
      lines.push('## 本次表现\n');
      lines.push(res.summary + '\n');
    }

    if (res.weakTopics && res.weakTopics.length > 0) {
      lines.push('## 薄弱知识点\n');
      res.weakTopics.forEach(t => {
        lines.push(`- **${t.topic}** (掌握度: ${t.mastery || 0}% / 优先级: ${t.priority || 'medium'})`);
        if (t.reason) lines.push(`  - 诊断: ${t.reason}`);
        if (t.evidenceQuestionIds && t.evidenceQuestionIds.length > 0) {
          lines.push(`  - 关联题目: ${t.evidenceQuestionIds.join(', ')}`);
        }
      });
      lines.push('');
    }

    if (res.mistakePatterns && res.mistakePatterns.length > 0) {
      lines.push('## 错误模式\n');
      res.mistakePatterns.forEach(p => {
        lines.push(`- **${p.type || '未知类型'}**: ${p.description}`);
        if (p.evidenceQuestionIds && p.evidenceQuestionIds.length > 0) {
          lines.push(`  - 关联题目: ${p.evidenceQuestionIds.join(', ')}`);
        }
      });
      lines.push('');
    }

    if (res.studyActions && res.studyActions.length > 0) {
      lines.push('## 建议复习顺序\n');
      res.studyActions.forEach((a, i) => {
        lines.push(`${i + 1}. ${a}`);
      });
      lines.push('');
    }

    if (res.nextQuizSpec) {
      const spec = res.nextQuizSpec;
      lines.push('## 下一轮训练建议\n');
      lines.push(`- **题量**: ${spec.questionCount || 10}题`);
      lines.push(`- **难度**: ${spec.difficulty || 'medium'}`);
      if (spec.focusTopics && spec.focusTopics.length > 0) {
        lines.push(`- **重点考察**:`);
        spec.focusTopics.forEach(ft => {
          lines.push(`  - ${ft.topic} (${ft.count}题): ${ft.reason || ''}`);
        });
      }
      if (spec.specialRequirements && spec.specialRequirements.length > 0) {
        lines.push(`- **特殊要求**:`);
        spec.specialRequirements.forEach(req => {
          lines.push(`  - ${req}`);
        });
      }
      lines.push('');
    }

    if (res.externalKnowledge && res.externalKnowledge.length > 0) {
      lines.push('## AI 外部知识补充\n');
      lines.push('> [!warning] AI 外部知识补充');
      lines.push('> 以下内容可能不来自当前 NotebookLM 来源，请自行核验。\n');
      res.externalKnowledge.forEach(ext => {
        lines.push(`- ${ext}`);
      });
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  function renderHtml(report) {
    if (!report || !report.result) {
      return [
        '<article class="nblm-review-report">',
        '<h1>Quiz 复盘</h1>',
        '<p class="nblm-review-empty">无数据</p>',
        '</article>',
      ].join('');
    }

    const res = report.result;
    const parts = [
      '<article class="nblm-review-report">',
      '<h1>Quiz 复盘</h1>',
    ];

    if (res.summary) {
      parts.push(section(
        '本次表现',
        `<p>${text(res.summary)}</p>`
      ));
    }

    if (res.weakTopics && res.weakTopics.length > 0) {
      const items = res.weakTopics.map(t => {
        let content = `<strong>${text(t.topic)}</strong>`;
        content += ` <span class="nblm-review-meta">(掌握度: ${text(t.mastery || 0)}% / 优先级: ${text(t.priority || 'medium')})</span>`;
        
        let sub = '';
        if (t.reason) sub += `<li>诊断: ${text(t.reason)}</li>`;
        if (t.evidenceQuestionIds && t.evidenceQuestionIds.length > 0) {
          sub += `<li>关联题目: ${text(t.evidenceQuestionIds.join(', '))}</li>`;
        }
        if (sub) {
          content += `<ul>${sub}</ul>`;
        }
        return `<li class="nblm-review-topic">${content}</li>`;
      });
      parts.push(section('薄弱知识点', `<ul class="nblm-review-list">${items.join('')}</ul>`));
    }

    if (res.mistakePatterns && res.mistakePatterns.length > 0) {
      const items = res.mistakePatterns.map(p => {
        let content = `<strong>${text(p.type || '未知类型')}</strong>: ${text(p.description)}`;
        if (p.evidenceQuestionIds && p.evidenceQuestionIds.length > 0) {
          content += ` <span class="nblm-review-evidence">(关联题目: ${text(p.evidenceQuestionIds.join(', '))})</span>`;
        }
        return `<li>${content}</li>`;
      });
      parts.push(section('错误模式', `<ul class="nblm-review-list">${items.join('')}</ul>`));
    }

    if (res.studyActions && res.studyActions.length > 0) {
      const items = res.studyActions.map(a => `<li>${text(a)}</li>`);
      parts.push(section('建议复习顺序', `<ol class="nblm-review-actions">${items.join('')}</ol>`));
    }

    if (res.nextQuizSpec) {
      const spec = res.nextQuizSpec;
      let ddt = `<dt>题量</dt><dd>${text(spec.questionCount || 10)}题</dd>`;
      ddt += `<dt>难度</dt><dd>${text(spec.difficulty || 'medium')}</dd>`;
      
      let extra = '';
      if (spec.focusTopics && spec.focusTopics.length > 0) {
        extra += `<p><strong>重点考察:</strong></p><ul>`;
        extra += spec.focusTopics.map(ft => `<li>${text(ft.topic)} (${text(ft.count)}题): ${text(ft.reason || '')}</li>`).join('');
        extra += `</ul>`;
      }
      if (spec.specialRequirements && spec.specialRequirements.length > 0) {
        extra += `<p><strong>特殊要求:</strong></p><ul>`;
        extra += spec.specialRequirements.map(req => `<li>${text(req)}</li>`).join('');
        extra += `</ul>`;
      }
      
      parts.push(section('下一轮训练建议', `<dl class="nblm-review-spec">${ddt}</dl>${extra}`));
    }

    if (res.externalKnowledge && res.externalKnowledge.length > 0) {
      const items = res.externalKnowledge.map(ext => `<li>${text(ext)}</li>`);
      parts.push([
        `<section class="nblm-review-warning">`,
        `<h2>AI 外部知识补充</h2>`,
        `<p>以下内容可能不来自当前 NotebookLM 来源，请自行核验。</p>`,
        `<ul>${items.join('')}</ul>`,
        `</section>`
      ].join(''));
    }

    parts.push('</article>');
    return parts.join('');
  }

  NS.quizReviewMarkdown = {
    render,
    renderHtml,
  };
})();
