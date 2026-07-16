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

// ADR 0024 — cross-process connection to the main CMS app's own SQLite file,
// read-only by convention (never call anything but SELECT through this).
// Used solely by access.ts to check contributor_memberships for site-folder
// access, replacing the old site_rosters mirror. Same host, same filesystem
// — both processes already run from the same cwd via `npm run dev`'s
// concurrently, so this resolves to the identical file the main app itself
// opens. Deliberately not opened with `readonly`/`fileMustExist`: whichever
// process starts first is allowed to create the (empty) file — the other
// process's own migrate() call fills in the real schema moments later. A
// query racing that startup window (table not created yet) is caught by the
// caller and treated as "can't confirm access", not a crash.
let cmsDb: Database.Database | undefined;

export function getCmsDb(): Database.Database {
  if (!cmsDb) {
    const cmsDbPath =
      process.env.CMS_DB_PATH ?? path.join(process.cwd(), "data", "oauth.db");
    cmsDb = new Database(cmsDbPath);
  }
  return cmsDb;
}

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
`);

export default db;
