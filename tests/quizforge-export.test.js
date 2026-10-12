const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadExporter() {
  const downloads = [];
  const document = {
    body: {
      appendChild(node) { node.attached = true; },
      removeChild(node) { node.removed = true; },
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        href: '',
        download: '',
        click() { downloads.push({ href: this.href, download: this.download }); },
      };
    },
  };
  const urls = [];
  const URLMock = {
    createObjectURL(blob) {
      urls.push(blob);
      return 'blob:quizforge-export';
    },
    revokeObjectURL() {},
  };
  const window = {};
  const filename = path.join(__dirname, '..', 'src', 'common', 'quizforge-export.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Blob,
    URL: URLMock,
    document,
    window,
  });
  return { exporter: window.NBLMPlus.quizforgeExport, downloads, urls };
}

test('builds a stable QuizForge export payload from wrong notebooks', () => {
  const { exporter } = loadExporter();
  const rawPayload = exporter.buildQuizForgeExport([
    {
      notebookId: 'notebook-a',
      wrongList: [
        {
          id: 'w_1',
          type: 'single',
          stem: 'What is 2 + 2?',
          options: ['3', '4'],
          correct: [1],
          mine: [0],
          ts: 1783583000000,
          wrongCount: 2,
          reviewCount: 1,
          privateField: 'not exported',
        },
      ],
    },
  ], { now: 1783584000000 });

  const payload = JSON.parse(JSON.stringify(rawPayload));

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.source, 'notebooklm-plus');
  assert.equal(payload.exportedAt, 1783584000000);
  assert.equal(payload.notebooks.length, 1);
  assert.deepEqual(payload.notebooks[0], {
    notebookId: 'notebook-a',
    notebookTitle: 'notebook-a',
    wrongQuestions: [
      {
        id: 'w_1',
        type: 'single',
        stem: 'What is 2 + 2?',
        options: ['3', '4'],
        correct: [1],
        mine: [0],
        ts: 1783583000000,
        wrongCount: 2,
        reviewCount: 1,
      },
    ],
  });
});

test('keeps empty notebooks out of the export summary payload', () => {
  const { exporter } = loadExporter();
  const rawPayload = exporter.buildQuizForgeExport([
    { notebookId: 'empty', wrongList: [] },
    { notebookId: 'filled', wrongList: [{ stem: 'Q', options: ['A'], correct: [0] }] },
  ], { now: 1 });

  const payload = JSON.parse(JSON.stringify(rawPayload));

  assert.deepEqual(payload.notebooks.map((item) => item.notebookId), ['filled']);
  assert.equal(payload.notebooks[0].wrongQuestions.length, 1);
});

test('downloads the payload as a JSON file', () => {
  const { exporter, downloads, urls } = loadExporter();
  exporter.downloadQuizForgeExport({
    schemaVersion: 1,
    source: 'notebooklm-plus',
    exportedAt: 1783584000000,
    notebooks: [],
  });

  assert.equal(downloads.length, 1);
  assert.match(downloads[0].download, /^notebooklm-quizforge-export-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].type, 'application/json;charset=utf-8');
});
