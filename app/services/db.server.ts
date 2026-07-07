import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// Resolve db path relative to the project root, not the build output.
// Overridable so tests can point at an isolated `:memory:` database instead
// of the real one on disk (see test.setup.ts / auth.server.test.ts).
const DB_PATH = process.env.CMS_DB_PATH ?? path.resolve(process.cwd(), "data/oauth.db");

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

// Reuse across HMR reloads — opening a new connection each reload leaks handles
function getDb(): Database.Database {
  if (!global.__db) {
    if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    global.__db = new Database(DB_PATH);
    global.__db.pragma("journal_mode = WAL");
  }
  // Always run migrations — IF NOT EXISTS makes them idempotent. This ensures
  // new tables are applied to existing connections on HMR reload.
  migrate(global.__db);
  return global.__db;
}

// One-time repair: an earlier deploy created umami_config with the api_key
// schema (before ADR 0012's login-JWT rework), and CREATE TABLE IF NOT
// EXISTS is a no-op against an already-existing table — so the corrected
// schema below never applied in place. The old static-key auth never
// actually worked against self-hosted Umami (no static key exists there),
// so no connect attempt could have persisted a usable row — safe to drop
// and let the create-table below rebuild it with the current schema.
function repairUmamiConfigSchema(db: Database.Database) {
  const columns = db
    .prepare("PRAGMA table_info(umami_config)")
    .all() as { name: string }[];
  if (columns.length === 0) return; // table doesn't exist yet
  if (columns.some((c) => c.name === "username")) return; // already current

  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM umami_config")
    .get() as { count: number };
  if (count > 0) {
    console.warn(
      `[db.server] Dropping ${count} umami_config row(s) using the old api_key schema — see ADR 0012.`,
    );
  }
  db.exec("DROP TABLE umami_config;");
}

function migrate(db: Database.Database) {
  repairUmamiConfigSchema(db);
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

    -- username/password, not a static API key: self-hosted Umami has no
    -- static-key auth (see ADR 0012). cached_jwt/jwt_expires_at avoid
    -- re-authenticating on every request.
    CREATE TABLE IF NOT EXISTS umami_config (
      user_did       TEXT    NOT NULL,
      site_rkey      TEXT    NOT NULL,
      base_url       TEXT    NOT NULL,
      website_id     TEXT    NOT NULL,
      website_name   TEXT    NOT NULL,
      username       TEXT    NOT NULL,
      password       TEXT    NOT NULL,
      cached_jwt     TEXT,
      jwt_expires_at INTEGER,
      updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
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
// (docs/adr/0010-umami-config-stored-locally-not-on-pds.md). Credentials are
// username/password, not a static API key — self-hosted Umami has no static
// key auth; see ADR 0012 (docs/adr/0012-umami-jwt-login-auth.md).
export type UmamiConfig = {
  baseUrl: string;
  websiteId: string;
  websiteName: string;
  username: string;
  password: string;
  cachedJwt: string | null;
  jwtExpiresAt: number | null;
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
          website_name: string;
          username: string;
          password: string;
          cached_jwt: string | null;
          jwt_expires_at: number | null;
          updated_at: number;
        }
      >(
        "SELECT base_url, website_id, website_name, username, password, cached_jwt, jwt_expires_at, updated_at FROM umami_config WHERE user_did = ? AND site_rkey = ?",
      )
      .get(userDid, siteRkey);
    if (!row) return undefined;
    return {
      baseUrl: row.base_url,
      websiteId: row.website_id,
      websiteName: row.website_name,
      username: row.username,
      password: row.password,
      cachedJwt: row.cached_jwt,
      jwtExpiresAt: row.jwt_expires_at,
      updatedAt: row.updated_at,
    };
  },
  set: (
    userDid: string,
    siteRkey: string,
    config: {
      baseUrl: string;
      websiteId: string;
      websiteName: string;
      username: string;
      password: string;
    },
  ) => {
    // Credentials changed — invalidate any cached token so the next fetch
    // re-authenticates against the newly-saved username/password.
    db.prepare(
      `INSERT INTO umami_config (user_did, site_rkey, base_url, website_id, website_name, username, password, cached_jwt, jwt_expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, unixepoch())
       ON CONFLICT(user_did, site_rkey) DO UPDATE SET
         base_url = excluded.base_url,
         website_id = excluded.website_id,
         website_name = excluded.website_name,
         username = excluded.username,
         password = excluded.password,
         cached_jwt = NULL,
         jwt_expires_at = NULL,
         updated_at = excluded.updated_at`,
    ).run(
      userDid,
      siteRkey,
      config.baseUrl,
      config.websiteId,
      config.websiteName,
      config.username,
      config.password,
    );
  },
  setCachedJwt: (
    userDid: string,
    siteRkey: string,
    jwt: string,
    expiresAt: number,
  ) => {
    db.prepare(
      "UPDATE umami_config SET cached_jwt = ?, jwt_expires_at = ? WHERE user_did = ? AND site_rkey = ?",
    ).run(jwt, expiresAt, userDid, siteRkey);
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
