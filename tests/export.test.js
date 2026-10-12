const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadExport(overrides = {}) {
  const overlays = [];
  const toasts = [];
  const textareas = [];
  const listeners = {};

  function h(tag, attrs, ...children) {
    const node = {
      tag,
      attrs: attrs || {},
      children: children.flat(),
      select() { this.selected = true; },
      remove() { this.removed = true; }
    };
    if (tag === 'textarea') textareas.push(node);
    return node;
  }

  const document = {
    body: { appendChild() {} },
    createElement(tag) {
      const element = {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        textContent: '',
        appendChild() {},
        querySelectorAll() { return []; },
        select() { this.selected = true; },
        remove() { this.removed = true; },
      };
      element.cloneNode = () => ({
        innerHTML: element.innerHTML,
        querySelectorAll() { return []; },
      });
      return element;
    },
    createTextNode(text) {
      return { textContent: text };
    },
    querySelector() {
      return null;
    },
  };

  const NS = {
    dom: {
      getAnswerNodes: () => [],
      getArtifactIframe: () => null,
      getOpenNote: () => null,
      getArtifact: () => null,
      ...overrides.dom,
    },
    md: {
      fromHtml: () => '',
      ...overrides.md,
    },
    ui: {
      h,
      openOverlay(body, options) {
        overlays.push({ body, options });
      },
      toast(message) {
        toasts.push(message);
      },
    },
  };

  const window = {
    NBLMPlus: NS,
    getSelection: () => null,
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    removeEventListener(type, listener) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== listener);
    },
    open() {
      return null;
    },
    ...overrides.window,
  };

  const filename = path.join(__dirname, '..', 'src', 'content', 'export.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Blob,
    URL,
    console,
    document,
    navigator: {},
    setTimeout,
    clearTimeout,
    window,
  });

  return { NS, listeners, overlays, textareas, toasts };
}

function menuAction(overlays, index) {
  return overlays[0].body.children[index].attrs.onClick;
}

test('does not open an empty preview for an artifact shell', async () => {
  const emptyArtifact = {
    cloneNode() {
      return {
        innerHTML: '<iframe></iframe>',
        querySelectorAll() {
          return [];
        },
      };
    },
    querySelectorAll() {
      return [];
    },
  };
  const state = loadExport({
    dom: { getArtifact: () => emptyArtifact },
  });

  state.NS.export.openMenu();
  await menuAction(state.overlays, 3)();

  assert.equal(state.overlays.length, 1);
  assert.match(state.toasts.at(-1), /未识别到|未找到/);
});

test('keeps mathematical superscripts and converts citation buttons', () => {
  const cloneState = {
    citationRemoved: false,
    citationReplaced: false,
    exponentReplaced: false,
  };
  const citation = {
    title: '',
    textContent: '1',
    getAttribute(name) {
      return name === 'aria-label' ? 'Source A' : null;
    },
    remove() {
      cloneState.citationRemoved = true;
    },
    replaceWith() {
      cloneState.citationReplaced = true;
    },
  };
  const exponent = {
    title: '',
    textContent: '2',
    getAttribute() {
      return null;
    },
    replaceWith() {
      cloneState.exponentReplaced = true;
    },
  };
  const clone = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector === 'input, textarea') return [];
      if (selector === 'button:not(.answer-btn), .nblm-answer-export') {
        return cloneState.citationReplaced ? [] : [citation];
      }
      if (selector === 'button[aria-label*="citation" i]') {
        return cloneState.citationRemoved || cloneState.citationReplaced ? [] : [citation];
      }
      if (selector === 'sup') {
        return cloneState.exponentReplaced ? [] : [exponent];
      }
      return [];
    },
  };
  const answer = {
    cloneNode() {
      return clone;
    },
    querySelectorAll() {
      return [];
    },
  };
  const state = loadExport({
    dom: { getAnswerNodes: () => [answer] },
    md: {
      fromHtml() {
        const exponentText = cloneState.exponentReplaced ? '[citation]' : '2';
        const citationText = cloneState.citationReplaced ? '[1]' : '';
        return `x${exponentText} ${citationText}`.trim();
      },
    },
  });

  state.NS.export.openMenu();
  menuAction(state.overlays, 1)();

  const markdown = state.textareas.at(-1).children[0];
  assert.match(markdown, /^x2 \[1\]/);
  assert.match(markdown, /\[1\] Source A/);
});

test('falls back to iframe HTML when structured quiz data is empty', async () => {
  let state;
  const iframeWindow = {
    postMessage(message) {
      for (const listener of state.listeners.message || []) {
        listener({
          source: iframeWindow,
          data: {
            type: 'NBLM_ARTIFACT_CONTENT_RESPONSE',
            requestId: message.requestId,
            success: true,
            appData: { quiz: [] },
            html: '<div>Fallback content</div>',
            title: 'Quiz',
          },
        });
      }
    },
  };
  state = loadExport({
    dom: {
      getArtifactIframe: () => ({ contentWindow: iframeWindow }),
    },
    md: {
      fromHtml(node) {
        return node.innerHTML.includes('Fallback content') ? 'Fallback content' : '';
      },
    },
  });

  state.NS.export.openMenu();
  await menuAction(state.overlays, 3)();

  assert.equal(state.overlays.length, 2);
  assert.equal(state.textareas.at(-1).children[0], 'Fallback content');
});

test('renders quiz LaTeX as readable math in the print view', async () => {
  let state;
  const printed = [];
  const printWindow = {
    document: {
      open() {},
      write(html) {
        printed.push(html);
      },
      close() {},
    },
    focus() {},
    print() {},
  };
  const iframeWindow = {
    postMessage(message) {
      for (const listener of state.listeners.message || []) {
        listener({
          source: iframeWindow,
          data: {
            type: 'NBLM_ARTIFACT_CONTENT_RESPONSE',
            requestId: message.requestId,
            success: true,
            appData: {
              quiz: [{
                question: '中间位置 $mid = \\lfloor (low + high) / 2 \\rfloor$',
                answerOptions: [
                  { text: '$mid = low + (high - low) / 2$', isCorrect: true },
                  { text: '$mid = (int)\\sqrt{low * high}$', isCorrect: false },
                ],
              }],
            },
            title: 'Quiz',
          },
        });
      }
    },
  };
  state = loadExport({
    dom: {
      getArtifactIframe: () => ({ contentWindow: iframeWindow }),
    },
    window: {
      open: () => printWindow,
    },
  });

  state.NS.export.openMenu();
  await menuAction(state.overlays, 3)();
  state.overlays.at(-1).options.footer[4].attrs.onClick();

  const printedHtml = printed.join('');
  assert.doesNotMatch(printedHtml, /\$mid|\\lfloor|\\rfloor|\\sqrt/);
  assert.match(printedHtml, /⌊ \(low \+ high\) \/ 2 ⌋/);
  assert.match(printedHtml, /√\(low \* high\)/);
  assert.match(printedHtml, /Microsoft YaHei/);
});

test('can render a quiz without answers or explanations', () => {
  const state = loadExport();
  const quiz = [{
    question: 'Question',
    answerOptions: [
      { text: 'Wrong', isCorrect: false },
      { text: 'Right', isCorrect: true },
    ],
    explanation: 'Because it is right.',
  }];

  const practice = state.NS.export.parseQuizJson(quiz, { includeAnswers: false });
  assert.match(practice.md, /Question/);
  assert.match(practice.md, /Wrong/);
  assert.match(practice.md, /Right/);
  assert.doesNotMatch(practice.md, /正确答案|Because it is right/);

  const answerKey = state.NS.export.parseQuizJson(quiz, { includeAnswers: true });
  assert.match(answerKey.md, /正确答案/);
  assert.match(answerKey.md, /Because it is right/);
});

test('injects Export once before Delete only for an identified quiz card', () => {
  const state = loadExport();
  const children = [
    { textContent: 'Rename' },
    { textContent: 'Delete' },
  ];
  const menu = {
    children,
    ownerDocument: {
      createElement() {
        return {
          dataset: {},
          textContent: '',
          setAttribute() {},
          addEventListener(type, listener) {
            this.listener = listener;
          },
        };
      },
    },
    querySelector(selector) {
      if (selector !== '[data-nblm-quiz-export]') return null;
      return children.find((child) => child.dataset && child.dataset.nblmQuizExport !== undefined) || null;
    },
    insertBefore(item, before) {
      children.splice(children.indexOf(before), 0, item);
    },
  };
  const quizCard = {
    textContent: '查找测验\n9 sources',
    getAttribute(name) {
      return name === 'data-artifact-type' ? 'quiz' : '';
    },
    querySelector() {
      return null;
    },
  };
  const noteCard = {
    textContent: '课堂笔记',
    getAttribute(name) {
      return name === 'data-artifact-type' ? 'note' : '';
    },
    querySelector() {
      return null;
    },
  };

  assert.equal(state.NS.export.injectQuizExportMenu(menu, noteCard, () => {}), false);
  assert.equal(state.NS.export.injectQuizExportMenu(menu, quizCard, () => {}), true);
  assert.deepEqual(children.map((child) => child.textContent), ['Rename', 'Export', 'Delete']);
  assert.equal(state.NS.export.injectQuizExportMenu(menu, quizCard, () => {}), true);
  assert.equal(children.filter((child) => child.textContent === 'Export').length, 1);
});

test('matches only the opened quiz title associated with the selected card', () => {
  const state = loadExport();

  assert.equal(state.NS.export.titlesMatch('查找测验', '查找测验'), true);
  assert.equal(state.NS.export.titlesMatch(' 查找 测验 ', '查找测验'), true);
  assert.equal(state.NS.export.titlesMatch('查找测验', '排序测验'), false);
  assert.equal(state.NS.export.titlesMatch('', '查找测验'), false);
});
