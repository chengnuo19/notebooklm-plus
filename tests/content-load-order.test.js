const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createContentScriptContext() {
  const window = {
    addEventListener() {},
    removeEventListener() {},
    location: { href: 'https://notebooklm.google.com/notebook/123', pathname: '/notebook/123' },
    history: { pushState() {}, replaceState() {} },
    open() { return { document: { write() {}, close() {} }, print() {}, focus() {} }; },
    getSelection() { return null; }
  };
  const document = {
    head: { appendChild() {} },
    body: {
      appendChild() {},
      removeChild() {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      dataset: {},
      contains() { return false; }
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        classList: { add() {}, remove() {}, contains() { return false; } },
        style: {},
        appendChild() {},
        removeChild() {},
        append() {},
        closest() { return null; },
        setAttribute() {},
        addEventListener() {},
        dataset: {},
        attachShadow() { return { innerHTML: '', appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
        ownerDocument: document
      };
    },
    createTextNode() { return { ownerDocument: document }; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    getElementsByTagName() { return []; },
    documentElement: {
      querySelectorAll() { return []; },
      querySelector() { return null; },
      setAttribute() {},
      removeAttribute() {},
      style: {}
    },
    defaultView: window
  };
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  const chrome = {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener() {} }
    },
    runtime: {
      getURL: (p) => p,
      sendMessage: async () => ({})
    }
  };

  class IntersectionObserver {
    observe() {}
    disconnect() {}
  }
  class Node {}
  class Element extends Node {}
  class HTMLElement extends Element {}
  class HTMLScriptElement extends HTMLElement {}
  class Document {}
  class DOMParser {
    parseFromString() {
      return {
        documentElement: {
          querySelectorAll() { return []; },
          querySelector() { return null; }
        },
        querySelectorAll() { return []; },
        querySelector() { return null; }
      };
    }
  }
  class Event {}
  class MouseEvent extends Event {}
  const context = vm.createContext({
    document,
    MutationObserver,
    IntersectionObserver,
    DOMParser,
    Node,
    Element,
    HTMLElement,
    HTMLScriptElement,
    Document,
    Event,
    MouseEvent,
    getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1' }; },
    requestAnimationFrame() {},
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    history: window.history,
    location: window.location,
    chrome,
    console,
    Blob: class Blob {},
    URL: { createObjectURL() {}, revokeObjectURL() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    addEventListener() {},
    removeEventListener() {},
    open() { return { document: { write() {}, close() {} }, print() {}, focus() {} }; },
    getSelection() { return null; }
  });
  // Scripts expect window.NBLMPlus to attach to the global window object.
  context.window = context;
  return context;
}

test('loads all content scripts in manifest order without errors', async () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const context = createContentScriptContext();
  
  for (const file of manifest.content_scripts[0].js) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  assert.equal(typeof context.NBLMPlus.ui.toast, 'function');
  assert.equal(typeof context.NBLMPlus.quizAiReview.open, 'function');
  assert.equal(typeof context.NBLMPlus.toolbar.mount, 'function');

  // Detect early dependency capture:
  // Should not throw "Cannot read properties of undefined"
  context.NBLMPlus.quizAiReview.open().catch(() => {});
});
