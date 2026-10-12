// src/common/anki-export.js
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  function generateAnkiTSV(questions, options = {}) {
    const lines = [];
    lines.push('#separator:tab');
    lines.push('#html:true');
    lines.push('#tags column:3');

    for (const q of questions) {
      let front = '';
      let back = '';
      let tags = `notebooklm ${q.type || 'unknown'}`;

      if (q.type === 'single' || q.type === 'multi' || q.type === 'truefalse') {
        let optsHtml = '<ul>' + (q.options || []).map(opt => `<li>${opt}</li>`).join('') + '</ul>';
        front = `<div><strong>${q.stem}</strong></div>${optsHtml}`;

        let correctAnsHtml = '<ul>' + (q.options || []).map((opt, i) => {
          const isCorrect = q.correct && q.correct.includes(i);
          return isCorrect ? `<li style="color: green; font-weight: bold;">${opt}</li>` : `<li>${opt}</li>`;
        }).join('') + '</ul>';
        
        back = correctAnsHtml;
        if (options.includeExplanation && q.explanation) {
          back += `<hr><div style="font-size: 14px;"><strong>解析：</strong><br>${q.explanation}</div>`;
        }
      } else if (q.type === 'fillblank') {
        const stemBold = q.stem.replace(/_{2,}/g, '<strong>____</strong>');
        front = `<div>${stemBold}</div>`;
        back = `<div><strong>答案：</strong>${q.answer || ''}</div>`;
        if (options.includeExplanation && q.explanation) {
          back += `<hr><div style="font-size: 14px;"><strong>解析：</strong><br>${q.explanation}</div>`;
        }
      } else if (q.type === 'shortanswer') {
        front = `<div><strong>${q.stem}</strong></div>`;
        back = `<div><strong>参考答案：</strong><br>${(q.referenceAnswer || '').replace(/\n/g, '<br>')}</div>`;
        if (options.includeExplanation && q.explanation) {
          back += `<hr><div style="font-size: 14px;"><strong>解析：</strong><br>${q.explanation}</div>`;
        }
      } else {
        continue; // skip unknown
      }

      // Escape tabs and newlines for TSV
      const cleanFront = String(front).replace(/\t/g, ' ').replace(/\n/g, ' ');
      const cleanBack = String(back).replace(/\t/g, ' ').replace(/\n/g, ' ');
      lines.push(`${cleanFront}\t${cleanBack}\t${tags}`);
    }

    return lines.join('\n');
  }

  function downloadAnkiFile(questions, notebookId, options = {}) {
    const tsv = generateAnkiTSV(questions, options);
    const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `Anki_${notebookId || 'Cards'}_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    NS.ui.toast(`成功导出 ${questions.length} 道题目到 Anki`);
  }

  NS.ankiExport = { generateAnkiTSV, downloadAnkiFile };
})();
