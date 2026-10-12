const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('all manifest script and icon resources exist', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const resources = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((entry) => entry.js || []),
  ];

  for (const resource of resources) {
    assert.equal(
      fs.existsSync(path.join(root, resource)),
      true,
      `Missing manifest resource: ${resource}`,
    );
  }
});

test('content scripts maintain required dependency ordering', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;

  const index = (file) => {
    const i = scripts.indexOf(file);
    assert.ok(i >= 0, `Script not found in manifest: ${file}`);
    return i;
  };

  assert.ok(index('src/common/storage.js') < index('src/content/quiz-ai-review.js'));
  assert.ok(index('src/common/quiz-review-markdown.js') < index('src/content/quiz-ai-review.js'));
  assert.ok(index('src/content/styles.js') < index('src/content/toolbar.js'));
  assert.ok(index('src/content/toolbar.js') < index('src/content/bootstrap.js'));
});
