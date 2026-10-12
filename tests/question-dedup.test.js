const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadDedup() {
  const window = {};
  const filename = path.join(__dirname, '..', 'src', 'common', 'question-dedup.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { window });
  return window.NBLMPlus.questionDedup;
}

test('normalizes numbering, punctuation, whitespace and case', () => {
  const dedup = loadDedup();
  assert.equal(dedup.normalizeQuestion('  12. What IS a Binary Tree?  '), 'whatisabinarytree');
  assert.equal(dedup.normalizeQuestion('（3）二叉树 的 中序遍历？'), '二叉树的中序遍历');
});

test('classifies exact, similar and new questions', () => {
  const dedup = loadDedup();
  const history = [
    { stem: '二叉树中序遍历的结果是什么？' },
    { stem: '完全二叉树最多有多少个叶子节点？' },
  ];

  assert.equal(dedup.findDuplicate('二叉树中序遍历的结果是什么', history, 0.72).kind, 'exact');
  assert.equal(dedup.findDuplicate('二叉树的中序遍历结果是什么？', history, 0.72).kind, 'similar');
  assert.equal(dedup.findDuplicate('红黑树为什么需要旋转？', history, 0.72), null);
});

test('builds a bounded exclusion block from recent history', () => {
  const dedup = loadDedup();
  const block = dedup.buildExclusionBlock([
    { stem: '旧题一' },
    { stem: '旧题二' },
  ], 1);

  assert.match(block, /禁止重复或仅做同义改写/);
  assert.match(block, /1\. 旧题二/);
  assert.doesNotMatch(block, /旧题一/);
});
