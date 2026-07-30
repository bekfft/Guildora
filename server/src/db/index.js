import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backup as backupDatabase, DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { resolveServerDataPath } from '../config/dataPaths.js';

const { Pool } = pg;
const isPostgres = Boolean(process.env.DATABASE_URL);
const LEGACY_BASELINE_MIGRATIONS = new Set([
  '001_users.sql',
  '002_guilds.sql',
  '003_messages.sql',
  '004_guild_management.sql',
  '005_channel_permissions.sql',
  '006_everyone_membership.sql',
  '007_team_discovery.sql',
  '008_guild_invites.sql',
  '009_message_interactions.sql'
]);
let sqlite;
let pool;

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function sqliteDatabasePath() {
  return resolveServerDataPath(process.env.SQLITE_PATH, 'guildora.sqlite');
}

function sqliteDatabase() {
  if (!sqlite) {
    const databasePath = sqliteDatabasePath();
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    sqlite = new DatabaseSync(databasePath);
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  }
  return sqlite;
}

function postgresPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

export const db = {
  dialect: isPostgres ? 'postgres' : 'sqlite',

  async get(sql, params = []) {
    if (isPostgres) {
      const result = await postgresPool().query(toPostgresSql(sql), params);
      return result.rows[0] || null;
    }
    return sqliteDatabase().prepare(sql).get(...params.map((value) => typeof value === 'boolean' ? Number(value) : value)) || null;
  },

  async all(sql, params = []) {
    if (isPostgres) {
      const result = await postgresPool().query(toPostgresSql(sql), params);
      return result.rows;
    }
    return sqliteDatabase().prepare(sql).all(...params.map((value) => typeof value === 'boolean' ? Number(value) : value));
  },

  async run(sql, params = []) {
    if (isPostgres) {
      const result = await postgresPool().query(toPostgresSql(sql), params);
      return { changes: result.rowCount, rows: result.rows };
    }
    return sqliteDatabase().prepare(sql).run(...params.map((value) => typeof value === 'boolean' ? Number(value) : value));
  },

  async exec(sql) {
    if (isPostgres) {
      await postgresPool().query(sql);
      return;
    }
    sqliteDatabase().exec(sql);
  },

  async close() {
    if (pool) await pool.end();
    if (sqlite) sqlite.close();
    pool = null;
    sqlite = null;
  }
};

function migrationChecksum(source) {
  return crypto
    .createHash('sha256')
    .update(source.replace(/\r\n/g, '\n'))
    .digest('hex');
}

function selectedMigrationSource(source) {
  const marker = db.dialect === 'postgres' ? '-- dialect:postgres' : '-- dialect:sqlite';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Migrationsabschnitt ${marker} fehlt.`);
  }
  const remaining = source.slice(markerIndex + marker.length);
  const nextMarker = remaining.indexOf('-- dialect:');
  return (nextMarker >= 0 ? remaining.slice(0, nextMarker) : remaining).trim();
}

async function hasTable(tableName) {
  try {
    await db.get(`SELECT 1 AS value FROM ${tableName} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

async function ensureMigrationTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at ${db.dialect === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT'} NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createMigrationBackup(label) {
  if (isPostgres) return null;
  const sourcePath = sqliteDatabasePath();
  if (!fs.existsSync(sourcePath)) return null;

  const backupDirectory = path.join(path.dirname(sourcePath), 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDirectory, `guildora-before-${label}-${timestamp}.sqlite`);
  await backupDatabase(sqliteDatabase(), backupPath);
  console.log(`Datenbanksicherung erstellt: ${backupPath}`);
  return backupPath;
}

async function recordMigration(filename, checksum) {
  await db.run(
    'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
    [filename, checksum]
  );
}

export async function runMigrations() {
  const currentFile = fileURLToPath(import.meta.url);
  const migrationDirectory = path.join(path.dirname(currentFile), 'migrations');
  const migrationFiles = fs.readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const hasLegacySchema = await hasTable('users');
  const hasMigrationMetadata = await hasTable('schema_migrations');

  if (hasLegacySchema && !hasMigrationMetadata) {
    await createMigrationBackup('migration-baseline');
  }

  await ensureMigrationTable();

  if (hasLegacySchema && !hasMigrationMetadata) {
    await db.exec('BEGIN');
    try {
      for (const file of migrationFiles) {
        if (!LEGACY_BASELINE_MIGRATIONS.has(file)) continue;
        const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
        await recordMigration(file, migrationChecksum(source));
      }
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }

  const appliedRows = await db.all(
    'SELECT filename, checksum FROM schema_migrations ORDER BY filename'
  );
  const applied = new Map(appliedRows.map((row) => [row.filename, row.checksum]));

  for (const file of migrationFiles) {
    if (!applied.has(file)) continue;
    const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    if (applied.get(file) !== migrationChecksum(source)) {
      throw new Error(`Die bereits ausgeführte Migration ${file} wurde nachträglich verändert.`);
    }
  }

  const pending = migrationFiles.filter((file) => !applied.has(file));
  if (pending.length > 0 && hasLegacySchema) {
    await createMigrationBackup(`migration-${pending[0].replace(/\.sql$/i, '')}`);
  }

  for (const file of pending) {
    const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    const selected = selectedMigrationSource(source);
    await db.exec('BEGIN');
    try {
      await db.exec(selected);
      await recordMigration(file, migrationChecksum(source));
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
}
