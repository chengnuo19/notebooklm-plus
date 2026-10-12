const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('removes the layout-tweaks feature while retaining toolbar position support', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const scripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
  const toolbar = read('src/content/toolbar.js');
  const bootstrap = read('src/content/bootstrap.js');
  const options = read('src/ui/options.html');

  assert.equal(scripts.includes('src/content/ui-tweaks.js'), false);
  assert.doesNotMatch(toolbar, /uiTweaks|界面优化/);
  assert.doesNotMatch(bootstrap, /uiTweaks|applySettings/);
  assert.doesNotMatch(options, /ui-focus|ui-wide|ui-dark|ui-font|ui-line/);
  assert.match(toolbar, /toolbarRight|toolbarBottom/);
});
