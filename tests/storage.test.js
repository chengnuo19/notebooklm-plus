const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadStorage(initialLocal = {}, initialSync = {}) {
  const runtime = { lastError: null };
  const localData = { nblm_schema_version: 1, ...initialLocal };
  const syncData = { ...initialSync };

  function area(data) {
    return {
      get(key, callback) {
        if (key == null) {
          callback({ ...data });
          return;
        }
        if (Array.isArray(key)) {
          callback(Object.fromEntries(key.filter((item) => item in data).map((item) => [item, data[item]])));
          return;
        }
        callback(key in data ? { [key]: data[key] } : {});
      },
      set(value, callback) {
        Object.assign(data, value);
        callback();
      },
      remove(key, callback) {
        for (const item of [].concat(key)) delete data[item];
        callback();
      },
    };
  }

  const window = {};
  const chrome = {
    runtime,
    storage: {
      sync: area(syncData),
      local: area(localData),
      onChanged: { addListener() {} },
    },
  };
  const filename = path.join(__dirname, '..', 'src', 'common', 'storage.js');
  const dedupFilename = path.join(__dirname, '..', 'src', 'common', 'question-dedup.js');
  vm.runInNewContext(fs.readFileSync(dedupFilename, 'utf8'), { window });
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { chrome, console, window });
  return { storage: window.NBLMPlus.storage, localData, syncData };
}

test('rejects when chrome.storage reports a write failure', async () => {
  const runtime = { lastError: null };
  const sync = {
    get(key, callback) {
      callback({});
    },
    set(value, callback) {
      runtime.lastError = { message: 'SYNC_QUOTA_BYTES quota exceeded' };
      callback();
      runtime.lastError = null;
    },
    remove(key, callback) {
      callback();
    },
  };
  const local = {
    get(key, callback) {
      callback({ nblm_schema_version: 1 });
    },
    set(value, callback) {
      callback();
    },
    remove(key, callback) {
      callback();
    },
  };
  const window = {};
  const chrome = {
    runtime,
    storage: {
      sync,
      local,
      onChanged: { addListener() {} },
    },
  };

  const filename = path.join(__dirname, '..', 'src', 'common', 'storage.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    chrome,
    console,
    window,
  });

  await assert.rejects(
    window.NBLMPlus.storage.setSettings({ ui: { focus: true } }),
    /quota exceeded/i,
  );
});

test('defaults Notion exports to the configured data-structure page', async () => {
  const { storage } = loadStorage();

  const settings = await storage.getSettings();

  assert.equal(settings.notion.targetId, '35433b6448168009a33ecfd7c44346db');
  assert.equal(settings.notion.targetType, 'page');
});

test('migrates a legacy Notion database target without changing its type', async () => {
  const { storage } = loadStorage({}, {
    nblm_settings: {
      notion: {
        token: 'secret_test',
        databaseId: 'legacy-database-id',
      },
    },
  });

  const settings = await storage.getSettings();

  assert.equal(settings.notion.targetId, 'legacy-database-id');
  assert.equal(settings.notion.targetType, 'database');
});

test('records persistent review totals per notebook', async () => {
  const { storage } = loadStorage();

  await storage.recordReviewResult('notebook-a', true, false);
  await storage.recordReviewResult('notebook-a', false, false);
  await storage.recordReviewResult('notebook-a', true, true);

  const stats = await storage.getReviewStats('notebook-a');
  assert.equal(stats.attempts, 3);
  assert.equal(stats.correct, 2);
  assert.equal(stats.mastered, 1);
  assert.equal(typeof stats.lastReviewedAt, 'number');
});

test('lists notebooks that have wrong questions or review statistics', async () => {
  const { storage } = loadStorage({
    'nblm_wrong:notebook-a': [{ id: 'wrong-a' }],
    'nblm_review_stats:notebook-b': {
      attempts: 4,
      correct: 3,
      mastered: 1,
      lastReviewedAt: 123,
    },
  });

  const records = await storage.listReviewNotebooks();
  assert.deepEqual(
    JSON.parse(JSON.stringify(records.map((record) => ({
      notebookId: record.notebookId,
      wrongCount: record.wrongList.length,
      attempts: record.stats.attempts,
    })).sort((a, b) => a.notebookId.localeCompare(b.notebookId)))),
    [
      { notebookId: 'notebook-a', wrongCount: 1, attempts: 0 },
      { notebookId: 'notebook-b', wrongCount: 0, attempts: 4 },
    ],
  );
});

test('clears wrong questions and review statistics together', async () => {
  const { storage, localData } = loadStorage({
    'nblm_wrong:notebook-a': [{ id: 'wrong-a' }],
    'nblm_review_stats:notebook-a': { attempts: 2, correct: 1, mastered: 0, lastReviewedAt: 123 },
  });

  await storage.clearReviewData('notebook-a');

  assert.equal(localData['nblm_wrong:notebook-a'], undefined);
  assert.equal(localData['nblm_review_stats:notebook-a'], undefined);
});

test('stores quiz history by chapter and reports duplicates', async () => {
  const { storage } = loadStorage();

  const first = await storage.addQuizHistory('notebook-a', '第三章', [
    { stem: '二叉树中序遍历的结果是什么？', options: ['A', 'B'] },
    { stem: '完全二叉树的定义是什么？', options: ['A', 'B'] },
  ], 0.72);
  const second = await storage.addQuizHistory('notebook-a', '第三章', [
    { stem: '二叉树中序遍历的结果是什么', options: ['A', 'B'] },
    { stem: '红黑树为什么需要旋转？', options: ['A', 'B'] },
  ], 0.72);
  await storage.addQuizHistory('notebook-a', '第四章', [
    { stem: '第四章题目', options: [] },
  ], 0.72);

  assert.equal(first.added, 2);
  assert.equal(second.added, 1);
  assert.equal(second.exact, 1);
  assert.equal((await storage.getQuizHistory('notebook-a', '第三章')).length, 3);
  assert.equal((await storage.getQuizHistory('notebook-a', '第四章')).length, 1);
});

test('clears the blank default scope without deleting other chapter history', async () => {
  const { storage } = loadStorage();
  await storage.addQuizHistory('notebook-a', '', [{ stem: 'Default scope question' }], 0.72);
  await storage.addQuizHistory('notebook-a', 'Chapter 2', [{ stem: 'Chapter question' }], 0.72);

  await storage.clearQuizHistory('notebook-a', '');

  assert.equal((await storage.getQuizHistory('notebook-a', '')).length, 0);
  assert.equal((await storage.getQuizHistory('notebook-a', 'Chapter 2')).length, 1);
});

test('saves and updates quiz sessions, keeping only the most recent 20', async () => {
  const { storage } = loadStorage();

  for (let i = 0; i < 25; i++) {
    await storage.saveQuizSession('notebook-a', {
      id: `session-${i}`,
      startedAt: i * 1000,
    });
  }

  const sessions = await storage.getQuizSessions('notebook-a');
  assert.equal(sessions.length, 20);
  assert.equal(sessions[0].id, 'session-24');
  assert.equal(sessions[19].id, 'session-5');

  await storage.saveQuizSession('notebook-a', {
    id: 'session-10',
    startedAt: 10000,
    status: 'completed',
  });
  
  const updated = await storage.getQuizSessions('notebook-a');
  assert.equal(updated.find((s) => s.id === 'session-10').status, 'completed');
});
