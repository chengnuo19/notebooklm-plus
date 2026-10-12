const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadQuizReview(storage = {}) {
  const window = {
    NBLMPlus: {
      storage,
      dom: {},
    },
  };
  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-review.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { console, window });
  return window.NBLMPlus.quizReview;
}

test('classifies wrong questions by review progress', () => {
  const review = loadQuizReview();

  assert.equal(review.getMasteryStatus({ reviewCount: 0, rightStreak: 0 }), 'unreviewed');
  assert.equal(review.getMasteryStatus({ reviewCount: 2, rightStreak: 1 }), 'improving');
  assert.equal(review.getMasteryStatus({ reviewCount: 2, rightStreak: 0 }), 'needsWork');
});

test('filters wrong questions by type, mastery and age', () => {
  const review = loadQuizReview();
  const now = Date.UTC(2026, 5, 14);
  const day = 24 * 60 * 60 * 1000;
  const deck = [
    { id: 'a', type: 'single', ts: now - day, reviewCount: 0, rightStreak: 0 },
    { id: 'b', type: 'multi', ts: now - 3 * day, reviewCount: 2, rightStreak: 1 },
    { id: 'c', type: 'single', ts: now - 40 * day, reviewCount: 1, rightStreak: 0 },
  ];

  assert.deepEqual(
    Array.from(review.filterDeck(deck, { type: 'single', mastery: 'needsWork', age: 'all' }, now), (item) => item.id),
    ['c'],
  );
  assert.deepEqual(
    Array.from(review.filterDeck(deck, { type: 'all', mastery: 'all', age: '7d' }, now), (item) => item.id),
    ['a', 'b'],
  );
});

test('records an answer and removes a question only when it becomes mastered', async () => {
  const calls = [];
  const review = loadQuizReview({
    removeWrong: async (notebookId, itemId) => calls.push(['remove', notebookId, itemId]),
    updateWrong: async (notebookId, itemId, patch) => calls.push(['update', notebookId, itemId, patch]),
    recordReviewResult: async (notebookId, correct, mastered) => calls.push(['stats', notebookId, correct, mastered]),
  });

  const mastered = await review.updateItem(
    'notebook-a',
    { id: 'q1', rightStreak: 1, reviewCount: 2 },
    true,
    2,
  );

  assert.equal(mastered, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['remove', 'notebook-a', 'q1'],
    ['stats', 'notebook-a', true, true],
  ]);
});
