const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('injects frame scripts with a valid executeScript target', async () => {
  let onCommitted;
  let injection;

  const chrome = {
    runtime: {
      onMessage: {
        addListener() {},
      },
    },
    webNavigation: {
      onCommitted: {
        addListener(listener) {
          onCommitted = listener;
        },
      },
    },
    scripting: {
      executeScript(options) {
        injection = options;
        return Promise.resolve([]);
      },
    },
  };

  const filename = path.join(__dirname, '..', 'src', 'background.js');
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    { chrome, console, importScripts() {} },
  );

  onCommitted({
    tabId: 7,
    frameId: 3,
    url: 'blob:https://example.scf.usercontent.goog/quiz',
  });
  await Promise.resolve();

  assert.deepEqual(
    JSON.parse(JSON.stringify(injection.target)),
    { tabId: 7, frameIds: [3] },
  );
});
