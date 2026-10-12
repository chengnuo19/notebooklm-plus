const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadPrompt() {
  const window = {
    NBLMPlus: {
      storage: {},
      dom: {},
      questionDedup: {
        buildExclusionBlock(history) {
          return history.length ? '\n\n历史排除：\n1. ' + history[0].stem : '';
        },
      },
    },
  };
  const filename = path.join(__dirname, '..', 'src', 'content', 'quiz-prompt.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { console, window });
  return window.NBLMPlus.quizPrompt;
}

test('appends chapter history when duplicate prevention is enabled', () => {
  const prompt = loadPrompt();
  const result = prompt.buildQuizPrompt(
    '范围：{{scope}}',
    { scope: '第三章', types: ['single'], count: 10, difficulty: 'medium', language: 'zh' },
    { enabled: true, history: [{ stem: '旧题' }] },
  );

  assert.match(result, /范围：第三章/);
  assert.match(result, /历史排除/);
  assert.match(result, /旧题/);
});

test('does not append history when duplicate prevention is disabled', () => {
  const prompt = loadPrompt();
  const result = prompt.buildQuizPrompt(
    '范围：{{scope}}',
    { scope: '第三章', types: ['single'], count: 10, difficulty: 'medium', language: 'zh' },
    { enabled: false, history: [{ stem: '旧题' }] },
  );

  assert.doesNotMatch(result, /历史排除|旧题/);
});
