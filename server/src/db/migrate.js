import 'dotenv/config';
import { db, runMigrations } from './index.js';

try {
  await runMigrations();
  console.log(`Migration erfolgreich ausgeführt (${db.dialect}).`);
} catch (error) {
  console.error('Migration fehlgeschlagen:', error);
  process.exitCode = 1;
} finally {
  await db.close();
}
