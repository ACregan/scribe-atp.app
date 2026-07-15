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

    -- Local mirror of scribe.contributors (ADR 0015/0019) — lets a
    -- Contributor's own login discover pending/active roster entries across
    -- every site without a global AT Protocol indexer. status is kept in
    -- lock-step with the roster entry at all three transitions (invite by
    -- the Owner; accept/reject by the invitee's own session, reconciled back
    -- into scribe.contributors on the Owner's next visit to that site's
    -- article-list page). added_at mirrors the roster entry's own addedAt
    -- verbatim, not a locally-generated timestamp, so the two never drift.
    CREATE TABLE IF NOT EXISTS contributor_memberships (
      contributor_did TEXT NOT NULL,
      site_uri         TEXT NOT NULL,
      added_at         TEXT NOT NULL,
      status           TEXT NOT NULL,
      PRIMARY KEY (contributor_did, site_uri)
    );

    -- Owner-side discovery of a Contributor's submission (ADR 0015) — written
    -- in the same request as the Contributor's own scribe.pendingPublish
    -- write. owner_did is parsed once from site_uri at write time so lookups
    -- for "submissions to my sites" don't need to re-parse every row.
    -- Approved rows are deleted once reconciled (Phase 3c); rejected rows
    -- persist until the Contributor's own reconciliation check acknowledges
    -- them — that local status is the only signal available, since rejection
    -- leaves no public artifact on the Owner's site the way approval does.
    -- document_title (ADR 0022 point 6) is cached from the Contributor's own
    -- document at submission time — the submit action already has it in hand
    -- from the getDocument call it does for its own guards — so the Owner's
    -- plain submissions list (site-list.tsx) can render a title without a
    -- cross-repo read on every page visit.
    CREATE TABLE IF NOT EXISTS pending_submissions (
      document_uri     TEXT NOT NULL UNIQUE,
      contributor_did  TEXT NOT NULL,
      site_uri         TEXT NOT NULL,
      owner_did        TEXT NOT NULL,
      document_title   TEXT NOT NULL,
      submitted_at     TEXT NOT NULL,
      status           TEXT NOT NULL,
      rejection_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS pending_submissions_owner
      ON pending_submissions (owner_did);
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

export type ContributorMembershipStatus = "invited" | "accepted" | "rejected";

export type ContributorMembership = {
  contributorDid: string;
  siteUri: string;
  addedAt: string;
  status: ContributorMembershipStatus;
};

type ContributorMembershipRow = {
  contributor_did: string;
  site_uri: string;
  added_at: string;
  status: ContributorMembershipStatus;
};

function fromRow(row: ContributorMembershipRow): ContributorMembership {
  return {
    contributorDid: row.contributor_did,
    siteUri: row.site_uri,
    addedAt: row.added_at,
    status: row.status,
  };
}

export const contributorMemberships = {
  // Invite time — the only point a new row is created. addedAt should be the
  // exact same ISO string written to scribe.contributors so the two never
  // disagree about when the invite happened.
  upsert: (
    contributorDid: string,
    siteUri: string,
    addedAt: string,
    status: ContributorMembershipStatus,
  ) => {
    db.prepare(
      `INSERT INTO contributor_memberships (contributor_did, site_uri, added_at, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(contributor_did, site_uri) DO UPDATE SET
         added_at = excluded.added_at,
         status = excluded.status`,
    ).run(contributorDid, siteUri, addedAt, status);
  },
  // Accept/reject — the invitee's own session flipping their own local row.
  setStatus: (
    contributorDid: string,
    siteUri: string,
    status: ContributorMembershipStatus,
  ) => {
    db.prepare(
      "UPDATE contributor_memberships SET status = ? WHERE contributor_did = ? AND site_uri = ?",
    ).run(status, contributorDid, siteUri);
  },
  // Owner removes someone from the roster, or the Owner-side reconciliation
  // resolves a rejected row — either way, once scribe.contributors no longer
  // has the entry, the local mirror shouldn't either.
  remove: (contributorDid: string, siteUri: string) => {
    db.prepare(
      "DELETE FROM contributor_memberships WHERE contributor_did = ? AND site_uri = ?",
    ).run(contributorDid, siteUri);
  },
  get: (contributorDid: string, siteUri: string): ContributorMembership | undefined => {
    const row = db
      .prepare<[string, string], ContributorMembershipRow>(
        "SELECT contributor_did, site_uri, added_at, status FROM contributor_memberships WHERE contributor_did = ? AND site_uri = ?",
      )
      .get(contributorDid, siteUri);
    return row ? fromRow(row) : undefined;
  },
  // "Which sites am I a contributor of?" — the Contributor-side discovery
  // check (global, on-login), keyed purely by the logged-in DID.
  listForContributor: (contributorDid: string): ContributorMembership[] => {
    const rows = db
      .prepare<[string], ContributorMembershipRow>(
        "SELECT contributor_did, site_uri, added_at, status FROM contributor_memberships WHERE contributor_did = ?",
      )
      .all(contributorDid);
    return rows.map(fromRow);
  },
  // Owner-side reconciliation on the site's article-list page — accepted
  // rows get promoted in scribe.contributors, rejected rows get stripped out.
  listForSite: (siteUri: string): ContributorMembership[] => {
    const rows = db
      .prepare<[string], ContributorMembershipRow>(
        "SELECT contributor_did, site_uri, added_at, status FROM contributor_memberships WHERE site_uri = ?",
      )
      .all(siteUri);
    return rows.map(fromRow);
  },
};

export type PendingSubmissionStatus = "pending" | "rejected";

export type PendingSubmission = {
  documentUri: string;
  contributorDid: string;
  siteUri: string;
  ownerDid: string;
  documentTitle: string;
  submittedAt: string;
  status: PendingSubmissionStatus;
  rejectionReason: string | null;
};

type PendingSubmissionRow = {
  document_uri: string;
  contributor_did: string;
  site_uri: string;
  owner_did: string;
  document_title: string;
  submitted_at: string;
  status: PendingSubmissionStatus;
  rejection_reason: string | null;
};

const PENDING_SUBMISSION_COLUMNS =
  "document_uri, contributor_did, site_uri, owner_did, document_title, submitted_at, status, rejection_reason";

function fromSubmissionRow(row: PendingSubmissionRow): PendingSubmission {
  return {
    documentUri: row.document_uri,
    contributorDid: row.contributor_did,
    siteUri: row.site_uri,
    ownerDid: row.owner_did,
    documentTitle: row.document_title,
    submittedAt: row.submitted_at,
    status: row.status,
    rejectionReason: row.rejection_reason,
  };
}

export const pendingSubmissions = {
  // Written in the same request as the Contributor's own scribe.pendingPublish
  // write (ADR 0015) — one document can only ever have one pending_submissions
  // row at a time (enforced by the UNIQUE constraint on document_uri and the
  // submit action's own pre-write guard, ADR 0021 point 5).
  create: (
    documentUri: string,
    contributorDid: string,
    siteUri: string,
    ownerDid: string,
    documentTitle: string,
    submittedAt: string,
  ) => {
    db.prepare(
      `INSERT INTO pending_submissions (document_uri, contributor_did, site_uri, owner_did, document_title, submitted_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    ).run(documentUri, contributorDid, siteUri, ownerDid, documentTitle, submittedAt);
  },
  get: (documentUri: string): PendingSubmission | undefined => {
    const row = db
      .prepare<[string], PendingSubmissionRow>(
        `SELECT ${PENDING_SUBMISSION_COLUMNS} FROM pending_submissions WHERE document_uri = ?`,
      )
      .get(documentUri);
    return row ? fromSubmissionRow(row) : undefined;
  },
  // Reject (Phase 3b) — the row persists with the reason; it's the only
  // signal the Contributor's own reconciliation check (Phase 3c) has, since
  // rejection leaves no public artifact on the Owner's site the way approval
  // does.
  reject: (documentUri: string, reason: string) => {
    db.prepare(
      "UPDATE pending_submissions SET status = 'rejected', rejection_reason = ? WHERE document_uri = ?",
    ).run(reason, documentUri);
  },
  // Approve (Phase 3b) deletes the row immediately — no local trace needed
  // once the ArticleRef appears in the Owner's manifest, that's the
  // authoritative signal. Reject (Phase 3c) deletes it once the Contributor's
  // reconciliation check has acknowledged it.
  remove: (documentUri: string) => {
    db.prepare("DELETE FROM pending_submissions WHERE document_uri = ?").run(documentUri);
  },
  // Owner-side review list (Phase 3b) — every submission awaiting a decision
  // for any of the Owner's sites.
  listForOwner: (ownerDid: string): PendingSubmission[] => {
    const rows = db
      .prepare<[string], PendingSubmissionRow>(
        `SELECT ${PENDING_SUBMISSION_COLUMNS} FROM pending_submissions WHERE owner_did = ?`,
      )
      .all(ownerDid);
    return rows.map(fromSubmissionRow);
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
