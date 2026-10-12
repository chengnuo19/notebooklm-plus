// src/content/md.js
// 紧凑的 HTML→Markdown 转换器,覆盖 NotebookLM 内容用到的标签子集:
// 标题、段落、加粗/斜体、链接、有序/无序(含嵌套)列表、代码/代码块、引用块、分隔线、表格、图片。
// 自包含、零依赖(不引 Turndown,避免 20KB 体积与外部 CDN)。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  function inlineText(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function walk(node) {
    let out = '';
    node.childNodes.forEach((n) => { out += render(n); });
    return out;
  }
  function list(node, ordered) {
    let i = 1, out = '\n';
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 1 && ch.tagName.toLowerCase() === 'li') {
        const marker = ordered ? `${i++}. ` : '- ';
        let content = walk(ch).trim().replace(/\n/g, '\n  '); // 嵌套缩进
        out += marker + content + '\n';
      }
    });
    return out + '\n';
  }
  function table(node) {
    const rows = Array.prototype.slice.call(node.querySelectorAll('tr'));
    if (!rows.length) return '';
    const cells = (r) => Array.prototype.map.call(r.children, (c) => inlineText(c).replace(/\|/g, '\\|') || ' ');
    const head = cells(rows[0]);
    let out = '\n| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n';
    rows.slice(1).forEach((r) => { out += '| ' + cells(r).join(' | ') + ' |\n'; });
    return out + '\n';
  }
  function render(node) {
    if (node.nodeType === 3) return (node.textContent || '').replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    switch (tag) {
      case 'h1': return `\n# ${inlineText(node)}\n\n`;
      case 'h2': return `\n## ${inlineText(node)}\n\n`;
      case 'h3': return `\n### ${inlineText(node)}\n\n`;
      case 'h4': return `\n#### ${inlineText(node)}\n\n`;
      case 'h5':
      case 'h6': return `\n##### ${inlineText(node)}\n\n`;
      case 'p':
      case 'section':
      case 'article':
      case 'div': { const t = walk(node).trim(); return t ? t + '\n\n' : ''; }
      case 'br': return '  \n';
      case 'strong':
      case 'b': { const t = walk(node).trim(); return t ? `**${t}**` : ''; }
      case 'em':
      case 'i': { const t = walk(node).trim(); return t ? `*${t}*` : ''; }
      case 'del':
      case 's': { const t = walk(node).trim(); return t ? `~~${t}~~` : ''; }
      case 'mark': { const t = walk(node).trim(); return t ? `==${t}==` : ''; }
      case 'details': return `\n<details>\n${walk(node).trim()}\n</details>\n\n`;
      case 'summary': return `<summary>${inlineText(node)}</summary>\n\n`;
      case 'pre': return `\n\`\`\`\n${(node.textContent || '').replace(/\n+$/, '')}\n\`\`\`\n\n`;
      case 'code': return node.closest('pre') ? (node.textContent || '') : '`' + (node.textContent || '') + '`';
      case 'a': {
        const href = node.getAttribute('href');
        const t = walk(node).trim() || href || '';
        return href ? `[${t}](${href})` : t;
      }
      case 'ul': return list(node, false);
      case 'ol': return list(node, true);
      case 'li': return walk(node);
      case 'blockquote':
        return walk(node).trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
      case 'hr': return '\n---\n\n';
      case 'table': return table(node);
      case 'img': {
        const src = node.getAttribute('src') || '';
        return src ? `![${node.getAttribute('alt') || ''}](${src})` : '';
      }
      default: return walk(node);
    }
  }

  function fromHtml(input) {
    let root;
    if (typeof input === 'string') { root = document.createElement('div'); root.innerHTML = input; }
    else root = input;
    const md = walk(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return md.trim();
  }

  NS.md = { fromHtml };
})();
