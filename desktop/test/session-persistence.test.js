const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Desktop-App verwendet über Updates hinweg die persistente Electron-Sitzung', () => {
  const windowSource = read('desktop/src/window.js');
  const builderConfig = read('desktop/electron-builder.yml');

  assert.match(windowSource, /session:\s*session\.defaultSession/);
  assert.doesNotMatch(windowSource, /clearStorageData|clearCache|clearAuthCache/);
  assert.match(builderConfig, /deleteAppDataOnUninstall:\s*false/);
});

test('Sitzungswiederherstellung behandelt Netzfehler nicht als Abmeldung', () => {
  const authContext = read('client/src/context/AuthContext.jsx');
  const apiSource = read('client/src/lib/api.js');
  const protectedRoute = read('client/src/components/ProtectedRoute.jsx');
  const loginPage = read('client/src/pages/LoginPage.jsx');
  const registerPage = read('client/src/pages/RegisterPage.jsx');

  assert.match(authContext, /if \(error\.status === 401\)[\s\S]*?setUser\(null\)/);
  assert.match(authContext, /else\s*\{[\s\S]*?setSessionUnavailable\(true\)/);
  assert.match(authContext, /window\.setTimeout\(retry,\s*5_000\)/);
  assert.match(apiSource, /let refreshRequest = null/);
  assert.match(apiSource, /if \(!refreshRequest\)/);
  assert.match(protectedRoute, /loading \|\| sessionUnavailable/);
  assert.match(loginPage, /loading=\{authLoading\} onRetry=\{restoreSession\}/);
  assert.match(registerPage, /loading=\{authLoading\} onRetry=\{restoreSession\}/);
});
