const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadRenderer() {
  const window = {};
  const filename = path.join(__dirname, '..', 'src', 'common', 'quiz-review-markdown.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { window });
  return window.NBLMPlus.quizReviewMarkdown;
}

test('renders empty report correctly', () => {
  const renderer = loadRenderer();
  const md = renderer.render(null);
  assert.equal(md, '# Quiz 复盘\n\n无数据');
});

test('renders full report correctly', () => {
  const renderer = loadRenderer();
  const report = {
    result: {
      summary: 'Good job overall.',
      weakTopics: [
        { topic: 'Math', mastery: 50, priority: 'high', reason: 'Failed simple additions', evidenceQuestionIds: ['q1'] }
      ],
      mistakePatterns: [
        { type: 'careless', description: 'Didn\'t read the question', evidenceQuestionIds: ['q2'] }
      ],
      studyActions: ['Review chapter 1'],
      nextQuizSpec: {
        questionCount: 5,
        difficulty: 'hard',
        focusTopics: [{ topic: 'Math', count: 5, reason: 'Needs practice' }],
        specialRequirements: ['No calculators']
      },
      externalKnowledge: ['1+1=2']
    }
  };

  const md = renderer.render(report);
  assert.match(md, /# Quiz 复盘/);
  assert.match(md, /Good job overall/);
  assert.match(md, /- \*\*Math\*\* \(掌握度: 50% \/ 优先级: high\)/);
  assert.match(md, /诊断: Failed simple additions/);
  assert.match(md, /关联题目: q1/);
  assert.match(md, /- \*\*careless\*\*: Didn't read the question/);
  assert.match(md, /1\. Review chapter 1/);
  assert.match(md, /- \*\*题量\*\*: 5题/);
  assert.match(md, /- \*\*难度\*\*: hard/);
  assert.match(md, /- Math \(5题\): Needs practice/);
  assert.match(md, /> \[!warning\] AI 外部知识补充/);
  assert.match(md, /- 1\+1=2/);
});

test('renders a semantic HTML review report', () => {
  const renderer = loadRenderer();
  const html = renderer.renderHtml({
    result: {
      summary: '需要重点复习树结构。',
      weakTopics: [{
        topic: '线索二叉树',
        mastery: 30,
        priority: 'high',
        reason: '混淆前驱和后继',
        evidenceQuestionIds: ['q3'],
      }],
      mistakePatterns: [{
        type: '概念混淆',
        description: '混淆普通树与线索树。',
        evidenceQuestionIds: ['q3'],
      }],
      studyActions: ['复习定义', '重做 q3'],
      nextQuizSpec: {
        questionCount: 5,
        difficulty: 'medium',
        focusTopics: [{
          topic: '线索二叉树',
          count: 3,
          reason: '掌握度较低',
        }],
        specialRequirements: ['加入遍历顺序判断题'],
      },
      externalKnowledge: ['额外知识'],
    },
  });

  assert.match(html, /class="nblm-review-report"/);
  assert.match(html, /<h1>Quiz 复盘<\/h1>/);
  assert.match(html, /<h2>薄弱知识点<\/h2>/);
  assert.match(html, /<ul class="nblm-review-list">/);
  assert.match(html, /线索二叉树/);
  assert.match(html, /q3/);
  assert.match(html, /nblm-review-warning/);
});

test('escapes model-provided HTML in the report preview', () => {
  const renderer = loadRenderer();
  const html = renderer.renderHtml({
    result: {
      summary: '<img src=x onerror=alert(1)>',
      weakTopics: [{
        topic: '<script>alert(1)</script>',
        mastery: 0,
        priority: 'high',
      }],
    },
  });

  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

test('omits empty report sections from HTML', () => {
  const renderer = loadRenderer();
  const html = renderer.renderHtml({
    result: {
      summary: '全部答对。',
      weakTopics: [],
      mistakePatterns: [],
      studyActions: [],
      externalKnowledge: [],
    },
  });

  assert.match(html, /全部答对/);
  assert.doesNotMatch(html, /薄弱知识点|错误模式|AI 外部知识补充/);
  assert.doesNotMatch(html, /undefined|null/);
});

test('handles long Chinese sentences without pre formatting', () => {
  const renderer = loadRenderer();
  const longReason = '不理解中序线索二叉树中结点有右孩子时的后继是右子树最左下结点，误选双亲结点。'.repeat(8);
  const html = renderer.renderHtml({
    result: {
      weakTopics: [{
        topic: '线索二叉树',
        reason: longReason,
      }],
    },
  });

  assert.match(html, new RegExp(longReason));
  assert.doesNotMatch(html, /<pre>|white-space:\s*pre/);
});

test('escapes Markdown metacharacters without executing them', () => {
  const renderer = loadRenderer();
  const html = renderer.renderHtml({
    result: {
      weakTopics: [{
        topic: '**线索二叉树**',
        reason: '`q3` 与 [q9](unsafe)',
      }],
    },
  });

  assert.match(html, /\*\*线索二叉树\*\*/);
  assert.match(html, /`q3` 与 \[q9\]\(unsafe\)/);
  assert.doesNotMatch(html, /<a href=/);
});

test('escapes angle brackets and ampersands correctly', () => {
  const renderer = loadRenderer();
  const html = renderer.renderHtml({
    result: {
      summary: 'A < B && B > C',
    },
  });

  assert.match(html, /A &lt; B &amp;&amp; B &gt; C/);
});
