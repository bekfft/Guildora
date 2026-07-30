const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeConfig } = require('../src/bootstrap');

test('akzeptiert nur HTTPS-App-Adressen und bekannte Felder', () => {
  assert.deepEqual(normalizeConfig({
    appUrl: 'https://guildora.example/',
    minVersion: '1.2.0',
    notice: ' Wartung ',
    script: 'alert(1)'
  }), {
    appUrl: 'https://guildora.example',
    minVersion: '1.2.0',
    notice: 'Wartung'
  });
  assert.equal(normalizeConfig({ appUrl: 'http://guildora.example' }), null);
  assert.equal(normalizeConfig({ appUrl: 'kaputt' }), null);
});
