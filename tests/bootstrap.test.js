const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('bootstrap only shows toast for wrong answers', async () => {
  const listeners = {};
  const toasts = [];
  const window = {
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== listener);
    },
    setTimeout,
    clearTimeout,
    dispatchEvent() {},
    NBLMPlus: {
      storage: {
        setActiveNotebook: () => {},
      },
      ui: {
        toast: (msg) => toasts.push(msg),
      },
      dom: {
        getNotebookId: () => 'notebook-a',
      }
    },
  };

  const document = {
    body: {},
  };

  class MutationObserver {
    observe() {}
  }

  const filename = path.join(__dirname, '..', 'src', 'content', 'bootstrap.js');
  const context = vm.createContext({
    window,
    document,
    MutationObserver,
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    requestAnimationFrame(cb) { cb(); },
    console: { log() {} },
    history: { pushState() {}, replaceState() {} },
    location: { href: 'https://notebooklm.google.com/notebook/123' },
    Event: class Event { constructor(type) { this.type = type; } },
  });
  
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context);

  // Trigger correct answer message
  for (const listener of listeners['message'] || []) {
    listener({ data: { __nblm: 'captured', isCorrect: true, stem: 'Test' } });
  }
  
  assert.equal(toasts.length, 0, 'Should not toast when isCorrect is true');

  // Trigger wrong answer message
  for (const listener of listeners['message'] || []) {
    listener({ data: { __nblm: 'captured', isCorrect: false, stem: 'Test' } });
  }

  assert.equal(toasts.length, 1, 'Should toast when isCorrect is false');
});
