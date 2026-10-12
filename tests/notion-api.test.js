const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadNotionApi(notion) {
  let sentMessage;
  const window = {
    NBLMPlus: {
      storage: {
        async getSettings() {
          return { notion };
        },
      },
    },
  };
  const chrome = {
    runtime: {
      sendMessage(message, callback) {
        sentMessage = message;
        callback({ ok: true, status: 200, text: '{}' });
      },
    },
  };
  const filename = path.join(__dirname, '..', 'src', 'common', 'notion-api.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { chrome, window });
  return {
    notionAPI: window.NBLMPlus.notionAPI,
    getSentMessage: () => sentMessage,
  };
}

test('exports as a child page under the configured Notion page URL', async () => {
  const state = loadNotionApi({
    token: 'secret_test',
    targetId: 'https://app.notion.com/p/35433b6448168009a33ecfd7c44346db?source=copy_link',
    targetType: 'page',
  });

  await state.notionAPI.exportToNotion('Test note', '# Heading');

  const body = state.getSentMessage().body;
  assert.deepEqual(
    JSON.parse(JSON.stringify(body.parent)),
    { page_id: '35433b6448168009a33ecfd7c44346db' },
  );
  assert.equal(body.properties.title.title[0].text.content, 'Test note');
  assert.equal(body.children[0].type, 'heading_1');
});

test('keeps legacy database targets working', async () => {
  const state = loadNotionApi({
    token: 'secret_test',
    databaseId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  });

  await state.notionAPI.exportToNotion('Legacy note', 'Body');

  const body = state.getSentMessage().body;
  assert.deepEqual(
    JSON.parse(JSON.stringify(body.parent)),
    { database_id: 'aaaaaaaabbbbccccddddeeeeeeeeeeee' },
  );
  assert.equal(body.properties.Name.title[0].text.content, 'Legacy note');
});

test('preserves quiz markdown formatting with native Notion blocks and rich text', async () => {
  const state = loadNotionApi({
    token: 'secret_test',
    targetId: '35433b6448168009a33ecfd7c44346db',
    targetType: 'page',
  });

  await state.notionAPI.exportToNotion(
    'Quiz Complete',
    [
      '## 1. 根据图的定义，下列关于顶点集 $V$ 和边集 $E$ 的描述中，正确的是哪一项？',
      '',
      '*类型：单选题*',
      '',
      '- [ ] 顶点集 $V$ 可以为空',
      '- [x] 顶点集 $V$ 不能为空，但边集 $E$ 可以为空 **（正确答案）**',
      '',
      '公式：$\\frac{n(n-1)}{2}$',
    ].join('\n'),
  );

  const blocks = state.getSentMessage().body.children;
  assert.equal(blocks[0].type, 'heading_2');
  assert.equal(blocks[0].heading_2.rich_text.some((item) => item.type === 'equation'), true);

  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[1].paragraph.rich_text[0].annotations.italic, true);
  assert.equal(blocks[1].paragraph.rich_text[0].text.content, '类型：单选题');

  assert.equal(blocks[2].type, 'to_do');
  assert.equal(blocks[2].to_do.checked, false);
  assert.equal(blocks[2].to_do.rich_text.some((item) => item.type === 'equation'), true);

  assert.equal(blocks[3].type, 'to_do');
  assert.equal(blocks[3].to_do.checked, true);
  assert.equal(
    blocks[3].to_do.rich_text.some((item) =>
      item.type === 'text' &&
      item.text.content === '（正确答案）' &&
      item.annotations.bold),
    true,
  );

  assert.equal(blocks[4].paragraph.rich_text[1].type, 'equation');
  assert.equal(blocks[4].paragraph.rich_text[1].equation.expression, '\\frac{n(n-1)}{2}');
});
