import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Overridable so tests can point at an isolated `:memory:` database instead
// of the real one on disk (see test.setup.ts).
const dbPath = process.env.IMAGE_DB_PATH ?? (() => {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "images.db");
})();

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// One-time repair: image_folders.user_did was NOT NULL before ADR 0020 (site-
// owned folders, Phase 2 of Contributors) needed a folder to be owned by
// either a user or a site — never both, never neither. SQLite has no direct
// `ALTER COLUMN ... DROP NOT NULL`, so an already-existing table with the old
// schema needs the standard recreate-copy-drop-rename procedure. Only runs
// once per database — a fresh (or already-migrated) database skips straight
// to the CREATE TABLE IF NOT EXISTS below, which already has the final shape.
function migrateImageFoldersSiteUri(db: Database.Database) {
  const columns = db.prepare("PRAGMA table_info(image_folders)").all() as { name: string }[];
  if (columns.length === 0) return; // table doesn't exist yet — created fresh below
  if (columns.some((c) => c.name === "site_uri")) return; // already migrated

  db.exec(`
    ALTER TABLE image_folders RENAME TO image_folders_old;

    CREATE TABLE image_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_did TEXT,
      site_uri TEXT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES image_folders(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (user_did IS NOT NULL AND site_uri IS NULL) OR
        (user_did IS NULL AND site_uri IS NOT NULL)
      )
    );

    INSERT INTO image_folders (id, user_did, name, parent_id, created_at)
      SELECT id, user_did, name, parent_id, created_at FROM image_folders_old;

    DROP TABLE image_folders_old;
  `);
}

migrateImageFoldersSiteUri(db);

db.exec(`
  CREATE TABLE IF NOT EXISTS image_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_did TEXT,
    site_uri TEXT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES image_folders(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (user_did IS NOT NULL AND site_uri IS NULL) OR
      (user_did IS NULL AND site_uri IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_did TEXT NOT NULL,
    folder_id INTEGER REFERENCES image_folders(id),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    sizes TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Local mirror of a site's accepted-Contributor roster (ADR 0017/0020) —
  -- wholesale-replaced on every sync call from the CMS, never diffed. Not a
  -- source of truth; scribe.contributors on the Owner's PDS record is.
  CREATE TABLE IF NOT EXISTS site_rosters (
    site_uri TEXT NOT NULL,
    member_did TEXT NOT NULL,
    PRIMARY KEY (site_uri, member_did)
  );
`);

export default db;
