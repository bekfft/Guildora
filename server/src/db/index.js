import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;
const isPostgres = Boolean(process.env.DATABASE_URL);
let sqlite;
let pool;

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function sqliteDatabase() {
  if (!sqlite) {
    const databasePath = path.resolve(process.cwd(), process.env.SQLITE_PATH || './data/guildora.sqlite');
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

export async function runMigrations() {
  const currentFile = fileURLToPath(import.meta.url);
  const migrationDirectory = path.join(path.dirname(currentFile), 'migrations');
  const migrationFiles = fs.readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const source = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    const marker = db.dialect === 'postgres' ? '-- dialect:postgres' : '-- dialect:sqlite';
    const start = source.indexOf(marker) + marker.length;
    const remaining = source.slice(start);
    const nextMarker = remaining.indexOf('-- dialect:');
    const selected = (nextMarker >= 0 ? remaining.slice(0, nextMarker) : remaining).trim();
    await db.exec(selected);
  }
}
