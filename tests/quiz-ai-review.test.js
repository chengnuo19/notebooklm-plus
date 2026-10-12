const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadReview({ sessions, wrong = [], settings, response, uiAtLoad = true }) {
  const overlays = [];
  const toasts = [];
  const filledSpecs = [];

  const ui = {
    h(tag, attrs, ...children) {
      return { tag, attrs: attrs || {}, children };
    },
    openOverlay(body, options) {
      overlays.push({ body, options });
      return {};
    },
    toast(message) {
      toasts.push(message);
    },
  };
  const modules = {
      storage: {
        getQuizSessions: async () => sessions,
        getWrong: async () => wrong,
        getSettings: async () => settings,
      },
      dom: { getNotebookId: () => 'notebook-1' },
      md: { render: (markdown) => `<article>${markdown}</article>` },
      quizReviewMarkdown: {
        render: () => '# Markdown report',
        renderHtml: () => '<section class="nblm-review-report"><h1>Quiz 复盘</h1></section>',
      },
      quizPrompt: {
        fillNextQuizPrompt: async (spec) => {
          filledSpecs.push(spec);
        },
      },
  };
  if (uiAtLoad) modules.ui = ui;
  const window = { NBLMPlus: modules };
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        callback(response);
      },
    },
  };
  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-ai-review.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { chrome, console, window });
  if (!uiAtLoad) window.NBLMPlus.ui = ui;

  return {
    review: window.NBLMPlus.quizAiReview,
    overlays,
    toasts,
    filledSpecs,
  };
}

test('renders a real AI review and passes its next quiz spec to the prompt builder', async () => {
  const nextQuizSpec = { questionCount: 6, difficulty: 'medium' };
  const harness = loadReview({
    sessions: [
      { id: 'older', status: 'completed', completedAt: 10, questions: [{ id: 'q1' }] },
      { id: 'latest', status: 'completed', completedAt: 20, questions: [{ id: 'q2' }] },
    ],
    settings: { ai: { provider: 'deepseek', apiKey: 'secret' } },
    response: { result: { summary: 'Review', nextQuizSpec } },
  });

  await harness.review.open();

  assert.equal(harness.overlays.length, 1);
  assert.equal(harness.overlays[0].options.title, 'AI Quiz 复盘');
  const nextButton = harness.overlays[0].options.footer[0];
  await nextButton.attrs.onClick();
  assert.deepEqual(harness.filledSpecs, [nextQuizSpec]);
});

test('does not open an empty review when the background returns invalid data', async () => {
  const harness = loadReview({
    sessions: [{
      id: 'session',
      status: 'completed',
      completedAt: 20,
      questions: [{ id: 'q1' }],
    }],
    settings: { ai: { provider: 'deepseek', apiKey: 'secret' } },
    response: undefined,
  });

  await harness.review.open();

  assert.equal(harness.overlays.length, 0);
  assert.match(harness.toasts.at(-1), /未返回有效复盘结果/);
});

test('reviews the latest answered session when NotebookLM never marks it completed', async () => {
  const harness = loadReview({
    sessions: [
      {
        id: 'active-session',
        status: 'active',
        startedAt: 30,
        totalQuestions: 10,
        questions: [{ id: 'q1', isCorrect: false }, { id: 'q2', isCorrect: true }],
      },
    ],
    settings: { ai: { provider: 'deepseek', apiKey: 'secret' } },
    response: { result: { summary: 'Partial review', nextQuizSpec: {} } },
  });

  await harness.review.open();

  assert.equal(harness.overlays.length, 1);
  assert.match(harness.overlays[0].options.title, /2\/10/);
});

test('falls back to the wrong-question book when no quiz session was captured', async () => {
  const harness = loadReview({
    sessions: [],
    wrong: [{
      id: 'wrong-1',
      stem: 'Question',
      options: ['A', 'B'],
      correct: [1],
      mine: [0],
      type: 'single',
      ts: 40,
    }],
    settings: { ai: { provider: 'deepseek', apiKey: 'secret' } },
    response: { result: { summary: 'Wrong-book review', nextQuizSpec: {} } },
  });

  await harness.review.open();

  assert.equal(harness.overlays.length, 1);
  assert.match(harness.overlays[0].options.title, /错题记录/);
});

test('generates a useful local review when no AI provider is configured', async () => {
  const harness = loadReview({
    sessions: [{
      id: 'session',
      status: 'completed',
      completedAt: 20,
      totalQuestions: 2,
      questions: [
        { id: 'q1', stem: 'Wrong question', isCorrect: false, type: 'single' },
        { id: 'q2', stem: 'Right question', isCorrect: true, type: 'single' },
      ],
    }],
    settings: { ai: { provider: 'none' } },
  });

  await harness.review.open();

  assert.equal(harness.overlays.length, 1);
  assert.match(harness.overlays[0].options.title, /本地分析/);
  assert.doesNotMatch(harness.toasts.join('\n'), /配置 AI 服务/);
});

test('still opens when the UI module is initialized after the review script', async () => {
  const harness = loadReview({
    sessions: [{
      id: 'session',
      status: 'completed',
      completedAt: 20,
      questions: [{ id: 'q1', isCorrect: true }],
    }],
    settings: { ai: { provider: 'none' } },
    uiAtLoad: false,
  });

  await harness.review.open();

  assert.equal(harness.overlays.length, 1);
});

test('uses the report HTML renderer instead of wrapping markdown in pre', async () => {
  const harness = loadReview({
    sessions: [{
      id: 'session',
      status: 'completed',
      completedAt: 20,
      questions: [{ id: 'q1', isCorrect: false }],
    }],
    settings: { ai: { provider: 'none' } },
  });

  await harness.review.open();

  const preview = harness.overlays[0].body.children[0];
  assert.match(preview.attrs.html, /nblm-review-report/);
  assert.doesNotMatch(preview.attrs.html, /<pre>|# Markdown report/);
});

test('static source does not contain NS.md.render or pre tags for markdown', () => {
  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-ai-review.js');
  const source = fs.readFileSync(filename, 'utf8');
  assert.doesNotMatch(source, /NS\.md\.render|<pre>\$\{markdownText\}<\/pre>/);
});
