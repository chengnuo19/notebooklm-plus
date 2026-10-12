// src/common/notion-api.js
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});

  async function notionRequest(method, endpoint, body) {
    const settings = await NS.storage.getSettings();
    const token = settings.notion && settings.notion.token;
    if (!token) throw new Error('未配置 Notion Token');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    };

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'NOTION_API_REQUEST',
        url: `https://api.notion.com/v1/${endpoint}`,
        method,
        headers,
        body
      }, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else if (!response.ok) {
          let errDetail = response.text;
          try { errDetail = JSON.parse(response.text).message || errDetail; } catch (e) {}
          if (token && errDetail && typeof errDetail === 'string') {
            errDetail = errDetail.split(token).join('***');
          }
          reject(new Error(`Notion API Error (${response.status}): ${errDetail}`));
        } else {
          try {
            resolve(JSON.parse(response.text));
          } catch (e) {
            resolve(response.text);
          }
        }
      });
    });
  }

  const DEFAULT_ANNOTATIONS = {
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
    code: false,
    color: 'default'
  };

  function textRichText(content, annotations) {
    const result = [];
    const value = String(content || '');
    for (let i = 0; i < value.length; i += 2000) {
      result.push({
        type: 'text',
        text: { content: value.slice(i, i + 2000) },
        annotations: Object.assign({}, DEFAULT_ANNOTATIONS, annotations || {})
      });
    }
    return result;
  }

  function inlineMarkdownToRichText(value, annotations) {
    const text = String(value || '');
    const richText = [];
    const tokenPattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\$[^$\n]+\$|\*[^*\n]+\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = tokenPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        richText.push(...textRichText(text.slice(lastIndex, match.index), annotations));
      }

      const token = match[0];
      if (token.startsWith('**')) {
        richText.push(...inlineMarkdownToRichText(
          token.slice(2, -2),
          Object.assign({}, annotations || {}, { bold: true })
        ));
      } else if (token.startsWith('`')) {
        richText.push(...textRichText(
          token.slice(1, -1),
          Object.assign({}, annotations || {}, { code: true })
        ));
      } else if (token.startsWith('$')) {
        richText.push({
          type: 'equation',
          equation: { expression: token.slice(1, -1) }
        });
      } else {
        richText.push(...inlineMarkdownToRichText(
          token.slice(1, -1),
          Object.assign({}, annotations || {}, { italic: true })
        ));
      }
      lastIndex = tokenPattern.lastIndex;
    }

    if (lastIndex < text.length) {
      richText.push(...textRichText(text.slice(lastIndex), annotations));
    }
    return richText;
  }

  function richTextBlock(type, value, extra) {
    return {
      object: 'block',
      type,
      [type]: Object.assign({
        rich_text: inlineMarkdownToRichText(value)
      }, extra || {})
    };
  }

  function markdownToBlocks(md) {
    const blocks = [];
    const lines = md.split('\n');
    let currentParagraph = [];

    let insideToggle = false;
    let toggleSummary = '查看详情';
    let toggleChildrenLines = [];

    function flushParagraph() {
      if (currentParagraph.length > 0) {
        blocks.push(richTextBlock('paragraph', currentParagraph.join('\n')));
        currentParagraph = [];
      }
    }

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (!insideToggle && line.startsWith('<details>')) {
        flushParagraph();
        insideToggle = true;
        toggleSummary = '查看详情';
        toggleChildrenLines = [];
        continue;
      }
      if (insideToggle) {
        if (line.startsWith('<summary>')) {
           toggleSummary = line.replace(/<\/?summary>/g, '').trim();
           continue;
        }
        if (line.startsWith('</details>')) {
           insideToggle = false;
           const childBlocks = markdownToBlocks(toggleChildrenLines.join('\n'));
           blocks.push(richTextBlock('toggle', toggleSummary, { children: childBlocks.length ? childBlocks : [richTextBlock('paragraph', ' ')] }));
           continue;
        }
        toggleChildrenLines.push(line);
        continue;
      }

      if (!line) {
        flushParagraph();
        continue;
      }
      if (line.startsWith('# ')) {
        flushParagraph();
        blocks.push(richTextBlock('heading_1', line.replace(/^#\s*/, '')));
      } else if (line.startsWith('## ')) {
        flushParagraph();
        blocks.push(richTextBlock('heading_2', line.replace(/^##\s*/, '')));
      } else if (line.startsWith('### ')) {
        flushParagraph();
        blocks.push(richTextBlock('heading_3', line.replace(/^###\s*/, '')));
      } else if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
        flushParagraph();
        const match = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        blocks.push(richTextBlock('to_do', match[2], {
          checked: match[1].toLowerCase() === 'x'
        }));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        flushParagraph();
        blocks.push(richTextBlock('bulleted_list_item', line.replace(/^[-*]\s*/, '')));
      } else if (line.match(/^\d+\.\s/)) {
        flushParagraph();
        blocks.push(richTextBlock('numbered_list_item', line.replace(/^\d+\.\s*/, '')));
      } else if (line.startsWith('---')) {
        flushParagraph();
        blocks.push({
          object: 'block', type: 'divider', divider: {}
        });
      } else {
        currentParagraph.push(line);
      }
    }
    flushParagraph();

    // Notion allows max 100 blocks per request
    return blocks.slice(0, 100);
  }

  function normalizeTargetId(value) {
    const match = String(value || '').match(/[0-9a-f]{32}/i);
    return match ? match[0] : String(value || '').trim().replace(/-/g, '');
  }

  async function exportToNotion(title, markdownContent) {
    const settings = await NS.storage.getSettings();
    const notion = settings.notion || {};
    const targetId = normalizeTargetId(notion.targetId || notion.databaseId);
    if (!targetId) throw new Error('未配置 Notion 目标页面或数据库');

    const blocks = markdownToBlocks(markdownContent);
    const isDatabase = notion.targetType === 'database' ||
      (!notion.targetId && Boolean(notion.databaseId));
    const body = {
      parent: isDatabase ? { database_id: targetId } : { page_id: targetId },
      properties: isDatabase
        ? { 'Name': { title: [{ text: { content: title } }] } }
        : { title: { title: [{ text: { content: title } }] } },
      children: blocks
    };

    return notionRequest('POST', 'pages', body);
  }

  async function syncSingleQuestion(item, notebookId, isGood) {
    const settings = await NS.storage.getSettings();
    const notion = settings.notion || {};
    if (isGood && !notion.autoSyncGood) return;
    if (!isGood && !notion.autoSyncWrong) return;

    const targetId = normalizeTargetId(notion.targetId || notion.databaseId);
    if (!targetId) return; // Silent skip if not configured

    const titlePrefix = isGood ? '【好题】' : '【错题】';
    const typeLabel = { single: '单选', multi: '多选', truefalse: '判断', fillblank: '填空', shortanswer: '简答' }[item.type] || '';
    const title = `${titlePrefix}[${typeLabel}] ${item.stem.slice(0, 40)}${item.stem.length > 40 ? '...' : ''}`;
    
    let md = `## ${item.stem}\n\n`;
    if (item.options && item.options.length) {
      item.options.forEach((opt, j) => {
        const isCorrect = item.correct && item.correct.includes(j);
        md += `- [${isCorrect ? 'x' : ' '}] ${opt}\n`;
      });
    } else {
      md += `**参考答案**：${item.answer || item.referenceAnswer || '无'}\n`;
    }
    if (item.explanation) md += `\n**解析**：\n${item.explanation}\n`;
    md += `\n\n_来自 NotebookLM 笔记本 ${notebookId}_`;

    const blocks = markdownToBlocks(md);
    const isDatabase = notion.targetType === 'database' || (!notion.targetId && Boolean(notion.databaseId));
    
    const body = {
      parent: isDatabase ? { database_id: targetId } : { page_id: targetId },
      properties: isDatabase
        ? { 'Name': { title: [{ text: { content: title } }] } }
        : { title: { title: [{ text: { content: title } }] } },
      children: blocks
    };

    return notionRequest('POST', 'pages', body);
  }

  NS.notionAPI = { exportToNotion, normalizeTargetId, syncSingleQuestion };
})();
