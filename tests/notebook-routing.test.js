const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('the parent page returns its own notebook id to a child frame', () => {
  const listeners = {};
  const responses = [];
  const window = {
    NBLMPlus: {
      storage: {
        getSettings: async () => ({}),
        setActiveNotebook: async () => {},
        onChanged() {},
      },
      dom: { getNotebookId: () => 'notebook-a' },
      toolbar: { mount() {}, ensureMounted() {} },
      export: { scanAnswers() {} },
      quizObserver: { scan() {}, reset() {} },
      ui: { closeOverlay() {}, toast() {} },
      uiTweaks: { apply() {} },
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatchEvent() {},
  };
  const document = { body: {} };
  const history = {
    pushState() {},
    replaceState() {},
  };
  const frame = {
    postMessage(message) {
      responses.push(message);
    },
  };
  class MutationObserver {
    observe() {}
  }

  const filename = path.join(__dirname, '..', 'src', 'content', 'bootstrap.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Event,
    MutationObserver,
    clearTimeout,
    console,
    document,
    history,
    location: { href: 'https://notebooklm.google.com/notebook/notebook-a' },
    requestAnimationFrame() {},
    setInterval() {},
    setTimeout,
    window,
  });

  listeners.message({
    source: frame,
    data: { type: 'NBLM_GET_NOTEBOOK_ID', requestId: 'request-1' },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(responses)), [{
    type: 'NBLM_NOTEBOOK_ID_RESPONSE',
    requestId: 'request-1',
    notebookId: 'notebook-a',
  }]);
});

test('a quiz frame prefers the notebook id from its parent tab', async () => {
  const listeners = {};
  const added = [];
  const parent = {
    postMessage(message) {
      if (message.type !== 'NBLM_GET_NOTEBOOK_ID') return;
      listeners.message({
        source: parent,
        data: {
          type: 'NBLM_NOTEBOOK_ID_RESPONSE',
          requestId: message.requestId,
          notebookId: 'notebook-a',
        },
      });
    },
  };
  const buttons = [
    { label: 'Wrong', classes: new Set(['incorrect']) },
    { label: 'Right', classes: new Set(['correct']) },
  ].map((button, index) => ({
    classList: { contains: (name) => button.classes.has(name) },
    getAttribute: (name) => name === 'aria-label'
      ? `${String.fromCharCode(65 + index)}. ${button.label}`
      : null,
    querySelector: () => null,
    textContent: button.label,
  }));
  const storage = {
    getActiveNotebook: async () => 'notebook-b',
    addWrong: async (id) => {
      added.push(id);
    },
  };
  const documentListeners = {};
  const document = {
    body: { innerHTML: '' },
    addEventListener(type, listener) {
      (documentListeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      documentListeners[type] = (documentListeners[type] || [])
        .filter((item) => item !== listener);
    },
    querySelector(selector) {
      if (selector === 'h1.question-text') return { textContent: 'Question' };
      if (selector === 'app-root[data-app-data]') {
        return { dataset: { appData: '{"quiz":[]}' } };
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
      listeners[type] = listener;
    },
    removeEventListener() {},
    parent,
  };

  class MutationObserver {
    observe() {}
    disconnect() {}
  }
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

  assert.deepEqual(added, ['notebook-a']);
});
