import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// Resolve db path relative to the project root, not the build output
const DB_PATH = path.resolve(process.cwd(), "data/oauth.db");

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

// Reuse across HMR reloads — opening a new connection each reload leaks handles
function getDb(): Database.Database {
  if (!global.__db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    global.__db = new Database(DB_PATH);
    global.__db.pragma("journal_mode = WAL");
    migrate(global.__db);
  }
  return global.__db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS oauth_session (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

// Remove oauth_state rows older than 10 minutes — these are left behind when a
// user starts the auth flow but never completes it.
function pruneStaleState(db: Database.Database) {
  db.prepare("DELETE FROM oauth_state WHERE created_at < unixepoch() - 600").run();
}

export const db = getDb();

// Run TTL pruning once on startup; harmless if it runs on every HMR reload
pruneStaleState(db);

export const oauthStateStore = {
  get: (key: string) => {
    const row = db.prepare<string, { value: string }>(
      "SELECT value FROM oauth_state WHERE key = ?"
    ).get(key);
    return Promise.resolve(row ? JSON.parse(row.value) : undefined);
  },
  set: (key: string, val: unknown) => {
    db.prepare(
      "INSERT OR REPLACE INTO oauth_state (key, value, created_at) VALUES (?, ?, unixepoch())"
    ).run(key, JSON.stringify(val));
    return Promise.resolve();
  },
  del: (key: string) => {
    db.prepare("DELETE FROM oauth_state WHERE key = ?").run(key);
    return Promise.resolve();
  },
};

export const oauthSessionStore = {
  get: (key: string) => {
    const row = db.prepare<string, { value: string }>(
      "SELECT value FROM oauth_session WHERE key = ?"
    ).get(key);
    return Promise.resolve(row ? JSON.parse(row.value) : undefined);
  },
  set: (key: string, val: unknown) => {
    db.prepare(
      "INSERT OR REPLACE INTO oauth_session (key, value, updated_at) VALUES (?, ?, unixepoch())"
    ).run(key, JSON.stringify(val));
    return Promise.resolve();
  },
  del: (key: string) => {
    db.prepare("DELETE FROM oauth_session WHERE key = ?").run(key);
    return Promise.resolve();
  },
};
