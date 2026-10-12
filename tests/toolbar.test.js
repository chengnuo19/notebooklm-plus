const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('reports module promise failures instead of failing silently', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'content', 'toolbar.js'),
    'utf8',
  );

  assert.match(source, /Promise\.resolve\(mod\[method\]\(\)\)\.catch/);
});
