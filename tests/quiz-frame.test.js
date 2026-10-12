const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class MutationObserver {
  observe() {}
  disconnect() {}
}

test('retries a wrong question until the correct answer marker is available', async () => {
  const classes = [
    new Set(['incorrect']),
    new Set(),
  ];
  const buttons = ['Wrong', 'Right'].map((label, index) => ({
    classList: {
      contains(name) {
        return classes[index].has(name);
      },
    },
    getAttribute(name) {
      return name === 'aria-label' ? `${String.fromCharCode(65 + index)}. ${label}` : null;
    },
    querySelector() {
      return null;
    },
    textContent: label,
  }));
  const added = [];
  const listeners = {};
  const storage = {
    getActiveNotebook: async () => 'notebook-a',
    getSettings: async () => ({ quizDefaults: { scope: 'test' } }),
    getQuizSessions: async () => [],
    saveQuizSession: async () => {},
    addWrong: async (id, item) => {
      added.push({ id, item });
    },
  };
  const parent = {
    postMessage(message) {
      if (message.type !== 'NBLM_GET_NOTEBOOK_ID') return;
      for (const listener of listeners.message || []) {
        listener({
          source: parent,
          data: {
            type: 'NBLM_NOTEBOOK_ID_RESPONSE',
            requestId: message.requestId,
            notebookId: 'notebook-a',
          },
        });
      }
    },
  };
  const document = {
    addEventListener() {},
    body: { innerHTML: '' },
    querySelector(selector) {
      if (selector === 'h1.question-text') return { textContent: 'Question' };
      if (selector === 'app-root[data-app-data]') {
        return {
          dataset: {
            appData: JSON.stringify({
              quiz: [{
                question: 'Question',
                answerOptions: [
                  { text: 'Wrong', isCorrect: false },
                  { text: 'Right', isCorrect: true },
                ],
              }],
            }),
          },
        };
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'button.answer-btn' ? buttons : [];
    },
  };
  const window = {
    NBLMPlus: { storage },
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== listener);
    },
    parent,
  };

  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-frame.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    clearTimeout,
    console,
    document,
    setTimeout,
    window,
    MutationObserver,
  });

  await window.NBLMPlus.quizFrame.scan();
  classes[1].add('correct');
  await window.NBLMPlus.quizFrame.scan();

  assert.equal(added.length, 1);
  assert.deepEqual(Array.from(added[0].item.correct), [1]);
  assert.equal(added[0].item.reviewCount, 0);
  assert.equal(added[0].item.lastReviewedAt, 0);
});

test('captures the full generated quiz into chapter history before grading', async () => {
  const listeners = {};
  const captured = [];
  const parentMessages = [];
  const storage = {
    getActiveNotebook: async () => 'notebook-a',
    getSettings: async () => ({
      quizDefaults: {
        scope: '第三章',
        avoidDuplicates: true,
        duplicateStrictness: 'standard',
      },
    }),
    getQuizSessions: async () => [],
    saveQuizSession: async () => {},
    addQuizHistory: async (notebookId, chapter, questions, threshold) => {
      captured.push({ notebookId, chapter, questions, threshold });
      return { total: questions.length, added: 1, exact: 1, similar: 0 };
    },
  };
  const parent = {
    postMessage(message) {
      parentMessages.push(message);
      if (message.type !== 'NBLM_GET_NOTEBOOK_ID') return;
      for (const listener of listeners.message || []) {
        listener({
          source: parent,
          data: {
            type: 'NBLM_NOTEBOOK_ID_RESPONSE',
            requestId: message.requestId,
            notebookId: 'notebook-a',
          },
        });
      }
    },
  };
  const document = {
    addEventListener() {},
    body: { innerHTML: '' },
    querySelector(selector) {
      if (selector === 'app-root[data-app-data]') {
        return {
          dataset: {
            appData: JSON.stringify({
              quiz: [
                { question: 'Question A', answerOptions: [{ text: 'A' }] },
                { question: 'Question B', answerOptions: [{ text: 'B' }] },
              ],
            }),
          },
        };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const window = {
    NBLMPlus: { storage },
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== listener);
    },
    parent,
  };

  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-frame.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    clearTimeout,
    console,
    document,
    setTimeout,
    window,
    MutationObserver,
  });

  await window.NBLMPlus.quizFrame.scan();

  assert.equal(captured.length, 1);
  assert.equal(captured[0].notebookId, 'notebook-a');
  assert.equal(captured[0].chapter, '第三章');
  assert.equal(captured[0].questions.length, 2);
  assert.equal(captured[0].threshold, 0.72);
  assert.equal(parentMessages.some((message) => message.__nblm === 'quiz-history'), true);
});

test('correctly identifies a right answer without adding to wrong book', async () => {
  const classes = [
    new Set(),
    new Set(), // Will be marked as correct later
  ];
  const buttons = ['Wrong', 'Right'].map((label, index) => ({
    classList: {
      contains(name) {
        return classes[index].has(name);
      },
    },
    getAttribute(name) {
      return name === 'aria-label' ? `${String.fromCharCode(65 + index)}. ${label}` : null;
    },
    querySelector() {
      return null;
    },
    textContent: label,
  }));
  const added = [];
  const parentMessages = [];
  let savedSession = null;
  const listeners = {};
  const storage = {
    getActiveNotebook: async () => 'notebook-a',
    getSettings: async () => ({ quizDefaults: { scope: 'test' } }),
    getQuizSessions: async () => [],
    saveQuizSession: async (id, session) => {
      savedSession = session;
    },
    addWrong: async (id, item) => {
      added.push({ id, item });
    },
    addQuizHistory: async () => ({}),
  };
  const parent = {
    postMessage(message) {
      parentMessages.push(message);
      if (message.type !== 'NBLM_GET_NOTEBOOK_ID') return;
      for (const listener of listeners.message || []) {
        listener({
          source: parent,
          data: {
            type: 'NBLM_NOTEBOOK_ID_RESPONSE',
            requestId: message.requestId,
            notebookId: 'notebook-a',
          },
        });
      }
    },
  };
  
  const document = {
    addEventListener(type, listener, useCapture) {
      if (type === 'click') {
        (listeners[type] ||= []).push(listener);
      }
    },
    body: { innerHTML: '' },
    querySelector(selector) {
      if (selector === 'h1.question-text') return { textContent: 'Question' };
      if (selector === 'app-root[data-app-data]') {
        return {
          dataset: {
            appData: JSON.stringify({
              quiz: [{
                question: 'Question',
                answerOptions: [
                  { text: 'Wrong', isCorrect: false },
                  { text: 'Right', isCorrect: true },
                ],
              }],
            }),
          },
        };
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'button.answer-btn' ? buttons : [];
    },
  };
  const window = {
    NBLMPlus: { storage },
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== listener);
    },
    parent,
  };

  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-frame.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    clearTimeout,
    console,
    document,
    setTimeout,
    window,
    MutationObserver,
  });

  // simulate click before grading
  const clickListeners = listeners['click'] || [];
  for (const listener of clickListeners) {
    listener({
      target: {
        closest(selector) {
          return selector === 'button.answer-btn' ? buttons[1] : null; // clicked 'Right'
        }
      }
    });
  }
  
  // now add the correct class as if graded
  classes[1].add('correct');

  await window.NBLMPlus.quizFrame.scan();

  assert.equal(added.length, 0, 'addWrong should not be called');
  assert.equal(savedSession.questions[0].isCorrect, true, 'isCorrect in session should be true');
  
  const capturedMsg = parentMessages.find(m => m.__nblm === 'captured');
  assert.ok(capturedMsg, 'captured message should be sent');
  assert.equal(capturedMsg.isCorrect, true, 'captured message isCorrect should be true');
});
