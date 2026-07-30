const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const desktopRoot = path.resolve(__dirname, '..');
const clientSource = path.resolve(desktopRoot, '..', 'client', 'src');
const nativeDialogPattern = /\bwindow\.(?:alert|confirm|prompt)\s*\(|(?<![.\w$])(?:alert|confirm|prompt)\s*\(/;

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

test('client uses Guildora dialogs instead of native browser dialogs', () => {
  const violations = sourceFiles(clientSource)
    .filter((file) => /\.[jt]sx?$/.test(file))
    .filter((file) => nativeDialogPattern.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(clientSource, file));

  assert.deepEqual(violations, []);
});
