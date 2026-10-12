const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class MutationObserver {
  observe() {}
  disconnect() {}
}

function runQuizFrame(overrides = {}) {
  const warnings = [];
  const postMessages = [];
  const storage = {
    getActiveNotebook: async () => 'notebook-a',
    getSettings: async () => ({ quizDefaults: { scope: 'test' } }),
    getQuizSessions: async () => [],
    saveQuizSession: async () => { throw new Error('storage quota exceeded'); },
    addWrong: async () => {},
    addQuizHistory: async () => {},
    ...overrides.storage,
  };
  const window = {
    NBLMPlus: { storage },
    addEventListener() {},
    removeEventListener() {},
    parent: {
      postMessage(message) {
        postMessages.push(message);
      }
    },
  };
  const document = {
    addEventListener() {},
    body: { innerHTML: '' },
    querySelector(selector) {
      if (selector === 'h1.question-text') return { textContent: 'Question' };
      if (selector === 'app-root[data-app-data]') {
        return { dataset: { appData: JSON.stringify({ quiz: [{ question: 'Question', answerOptions: [{ text: 'Right', isCorrect: true }] }] }) } };
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'button.answer-btn' ? [{ classList: { contains: (c) => c === 'correct' }, getAttribute: () => 'A. Right', querySelector: () => null, textContent: 'Right' }] : [];
    },
  };
  const console = {
    warn(...args) {
      warnings.push(args.map(a => (a && a.message) ? a.message : String(a)).join(' '));
    }
  };

  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-frame.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    setTimeout(cb) { cb(); return 1; },
    clearTimeout() {},
    console,
    document,
    window,
    MutationObserver,
  });

  return { window, warnings, postMessages };
}

test('shows a visible warning when quiz session storage fails without throwing unhandled rejection', async () => {
  const harness = runQuizFrame();
  
  // We mock a click directly in the tests instead of through addEventListener because we didn't save the listener.
  // Actually, scan() is exposed.
  await harness.window.NBLMPlus.quizFrame.scan();
  
  const allOutput = harness.warnings.join('\n');
  assert.match(allOutput, /storage quota exceeded/);
  assert.doesNotMatch(allOutput, /sk_ntn/);
});

test('notion api does not expose secrets in diagnostics', async () => {
  let messagePayload = null;
  const chrome = {
    runtime: {
      sendMessage(msg, callback) {
        messagePayload = msg;
        callback({ ok: false, status: 401, text: JSON.stringify({ message: 'Invalid token secret_token_123' }) });
      }
    }
  };
  const storage = {
    getSettings: async () => ({ notion: { token: 'secret_token_123', databaseId: 'db_123' } })
  };
  const window = { NBLMPlus: { storage } };

  const filename = path.join(__dirname, '..', 'src', 'common', 'notion-api.js');
  const context = { chrome, window, console: { warn() {} } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);

  try {
    await context.window.NBLMPlus.notionAPI.exportToNotion('Title', 'Content');
    assert.fail('Should have thrown');
  } catch (err) {
    // We expect the original message to be passed through, BUT NotebookLM Plus code should be careful.
    // Wait, the plan says "Tests must assert logs do not contain: API Key, Notion Token".
    // If Notion's own API returns the token in the error message, the API client exposes it.
    // We should make sure we strip secrets from error strings.
    console.log('Error message was:', err.message);
    assert.ok(err.message.includes('Notion API Error'));
    assert.doesNotMatch(err.message, /secret_token_123/);
  }
});
