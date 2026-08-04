import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, isNewerVersion } from '../src/lib/appVersion.js';

test('Versionsvergleich erkennt neue Browser-Releases zuverlässig', () => {
  assert.equal(compareVersions('1.0.56', '1.0.55'), 1);
  assert.equal(compareVersions('1.1.0', '1.0.99'), 1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
  assert.equal(compareVersions('1.0.55', '1.0.55'), 0);
  assert.equal(isNewerVersion('1.0.56', '1.0.55'), true);
  assert.equal(isNewerVersion('1.0.55', '1.0.55'), false);
});
