const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('grants the background worker access to configured AI providers', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'),
  );

  assert.ok(manifest.host_permissions.includes('https://api.deepseek.com/*'));
  assert.ok(manifest.host_permissions.includes('https://open.bigmodel.cn/*'));
});
