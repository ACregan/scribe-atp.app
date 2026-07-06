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
  }
  // Always run migrations — IF NOT EXISTS makes them idempotent. This ensures
  // new tables are applied to existing connections on HMR reload.
  migrate(global.__db);
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

    CREATE TABLE IF NOT EXISTS login_attempts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ip         TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS login_attempts_ip_created
      ON login_attempts (ip, created_at);

    CREATE TABLE IF NOT EXISTS umami_config (
      user_did   TEXT    NOT NULL,
      site_rkey  TEXT    NOT NULL,
      base_url   TEXT    NOT NULL,
      website_id TEXT    NOT NULL,
      api_key    TEXT    NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_did, site_rkey)
    );
  `);
}

// Remove oauth_state rows older than 10 minutes — these are left behind when a
// user starts the auth flow but never completes it.
function pruneStaleState(db: Database.Database) {
  db.prepare("DELETE FROM oauth_state WHERE created_at < unixepoch() - 600").run();
}

// Remove login_attempts rows outside the 15-minute rate-limit window.
function pruneStaleLoginAttempts(db: Database.Database) {
  db.prepare("DELETE FROM login_attempts WHERE created_at < unixepoch() - 900").run();
}

// Remove OAuth sessions inactive for more than 90 days (GDPR retention policy).
// updated_at is refreshed on every session write, so this reflects true inactivity.
const NINETY_DAYS = 90 * 24 * 60 * 60;
function pruneStaleOAuthSessions(db: Database.Database) {
  db.prepare("DELETE FROM oauth_session WHERE updated_at < unixepoch() - ?").run(NINETY_DAYS);
}

export const db = getDb();

// Run TTL pruning once on startup; harmless if it runs on every HMR reload
pruneStaleState(db);
pruneStaleLoginAttempts(db);
pruneStaleOAuthSessions(db);

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

const RATE_LIMIT_WINDOW = 900; // 15 minutes in seconds
const RATE_LIMIT_MAX = 10;

export const loginAttempts = {
  record: (ip: string) => {
    db.prepare("INSERT INTO login_attempts (ip) VALUES (?)").run(ip);
  },
  count: (ip: string): number => {
    const row = db
      .prepare<[string, number], { n: number }>(
        "SELECT COUNT(*) as n FROM login_attempts WHERE ip = ? AND created_at > unixepoch() - ?"
      )
      .get(ip, RATE_LIMIT_WINDOW);
    return row?.n ?? 0;
  },
  isLimited: (ip: string): boolean => loginAttempts.count(ip) >= RATE_LIMIT_MAX,
};

// Deliberately never written to the AT Protocol record — see ADR 0010
// (docs/adr/0010-umami-config-stored-locally-not-on-pds.md).
export type UmamiConfig = {
  baseUrl: string;
  websiteId: string;
  apiKey: string;
  updatedAt: number;
};

export const umamiConfigStore = {
  get: (userDid: string, siteRkey: string): UmamiConfig | undefined => {
    const row = db
      .prepare<
        [string, string],
        {
          base_url: string;
          website_id: string;
          api_key: string;
          updated_at: number;
        }
      >(
        "SELECT base_url, website_id, api_key, updated_at FROM umami_config WHERE user_did = ? AND site_rkey = ?",
      )
      .get(userDid, siteRkey);
    if (!row) return undefined;
    return {
      baseUrl: row.base_url,
      websiteId: row.website_id,
      apiKey: row.api_key,
      updatedAt: row.updated_at,
    };
  },
  set: (
    userDid: string,
    siteRkey: string,
    config: { baseUrl: string; websiteId: string; apiKey: string },
  ) => {
    db.prepare(
      `INSERT INTO umami_config (user_did, site_rkey, base_url, website_id, api_key, updated_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(user_did, site_rkey) DO UPDATE SET
         base_url = excluded.base_url,
         website_id = excluded.website_id,
         api_key = excluded.api_key,
         updated_at = excluded.updated_at`,
    ).run(userDid, siteRkey, config.baseUrl, config.websiteId, config.apiKey);
  },
  del: (userDid: string, siteRkey: string) => {
    db.prepare(
      "DELETE FROM umami_config WHERE user_did = ? AND site_rkey = ?",
    ).run(userDid, siteRkey);
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
