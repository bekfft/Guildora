import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveServerDataPath } from '../src/config/dataPaths.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Standard-Datenpfade bleiben unabhängig vom Startordner im Serververzeichnis', () => {
  assert.equal(
    resolveServerDataPath(undefined, 'guildora.sqlite'),
    path.join(serverRoot, 'data', 'guildora.sqlite')
  );
  assert.equal(
    resolveServerDataPath(undefined, 'uploads'),
    path.join(serverRoot, 'data', 'uploads')
  );
});

test('Explizite Datenpfade aus der Umgebung bleiben möglich', () => {
  const configured = path.join(serverRoot, 'custom-data', 'guildora.sqlite');
  assert.equal(resolveServerDataPath(configured, 'ignored.sqlite'), configured);
});
