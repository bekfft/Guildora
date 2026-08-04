import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const visualDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'guildora-visual-'));
process.env.NODE_ENV = 'test';
process.env.PORT = '3199';
process.env.SQLITE_PATH = path.join(visualDataDirectory, 'guildora.sqlite');
process.env.UPLOAD_DIR = path.join(visualDataDirectory, 'uploads');
process.env.CLIENT_ORIGIN = 'http://127.0.0.1:5189';

const [{ app }, { runMigrations, db }, { configureRealtime }] = await Promise.all([
  import('../server/src/index.js'),
  import('../server/src/db/index.js'),
  import('../server/src/realtime.js')
]);

await runMigrations();
const server = http.createServer(app);
configureRealtime(server);
server.listen(3199, '127.0.0.1', () => console.log('Visual-Test-API läuft auf Port 3199.'));

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(visualDataDirectory, { recursive: true, force: true });
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
