const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('AI review styles wrap long content without horizontal scrolling', () => {
  const window = { NBLMPlus: {} };
  const filename = path.join(__dirname, '..', 'src', 'content', 'styles.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { window });
  const css = window.NBLMPlus.styles.shadowCss;

  assert.match(css, /\.nblm-review-preview/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.nblm-review-report/);
});
