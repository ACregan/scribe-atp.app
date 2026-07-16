import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { repairImagesFolderIdForeignKey } from "./db.js";

// Reproduces the exact broken state found live 2026-07-16: images.folder_id
// still pointing at image_folders_old after migrateImageFoldersSiteUri's
// rename (SQLite auto-rewrites the FK clause of any *other* table when the
// table it references is renamed), on a database where the migration's own
// cleanup drop never got a chance to run. Uses an isolated in-memory
// connection, not the shared db singleton, so the broken schema can be set
// up before the repair runs against it.
function makeBrokenDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE image_folders_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_did TEXT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO image_folders_old (id, user_did, name, parent_id) VALUES (1, 'did:plc:owner', 'did:plc:owner', NULL);

    CREATE TABLE image_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_did TEXT,
      site_uri TEXT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES image_folders(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO image_folders (id, user_did, name, parent_id) VALUES (1, 'did:plc:owner', 'did:plc:owner', NULL);

    CREATE TABLE images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_did TEXT NOT NULL,
      folder_id INTEGER REFERENCES image_folders_old(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      sizes TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes)
      VALUES ('did:plc:owner', 1, 'pre-existing', 'pre-existing.jpg', 10, 10, '{}');
  `);
  return db;
}

describe("repairImagesFolderIdForeignKey", () => {
  it("is a no-op on a healthy database", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE image_folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
      CREATE TABLE images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_did TEXT NOT NULL,
        folder_id INTEGER REFERENCES image_folders(id),
        filename TEXT NOT NULL, original_name TEXT NOT NULL,
        width INTEGER NOT NULL, height INTEGER NOT NULL, sizes TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    expect(() => repairImagesFolderIdForeignKey(db)).not.toThrow();
    const fks = db.prepare("PRAGMA foreign_key_list(images)").all() as { table: string }[];
    expect(fks[0].table).toBe("image_folders");
  });

  it("does nothing when the images table doesn't exist yet", () => {
    const db = new Database(":memory:");
    expect(() => repairImagesFolderIdForeignKey(db)).not.toThrow();
  });

  it("repoints images.folder_id at the live image_folders table", () => {
    const db = makeBrokenDb();

    repairImagesFolderIdForeignKey(db);

    const fks = db.prepare("PRAGMA foreign_key_list(images)").all() as { table: string }[];
    expect(fks[0].table).toBe("image_folders");
  });

  it("preserves existing image rows and their ids", () => {
    const db = makeBrokenDb();

    repairImagesFolderIdForeignKey(db);

    const row = db.prepare("SELECT id, user_did, folder_id, filename FROM images WHERE filename = ?").get(
      "pre-existing",
    ) as { id: number; user_did: string; folder_id: number; filename: string };
    expect(row).toEqual({ id: 1, user_did: "did:plc:owner", folder_id: 1, filename: "pre-existing" });
  });

  it("allows inserting against a folder created after the original migration ran — the actual reported bug", () => {
    const db = makeBrokenDb();
    // A folder created *after* the interrupted migration — only ever
    // existed in the live `image_folders` table, never in the stale
    // `image_folders_old` snapshot. This insert is what failed live.
    db.prepare(
      "INSERT INTO image_folders (id, site_uri, name, parent_id) VALUES (2, 'at://did:plc:owner/site.standard.publication/my-site', 'example.com Images', NULL)",
    ).run();

    repairImagesFolderIdForeignKey(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("did:plc:contributor", 2, "shared-photo", "photo.jpg", 10, 10, "{}"),
    ).not.toThrow();
  });

  it("drops the now-unreferenced image_folders_old table", () => {
    const db = makeBrokenDb();

    repairImagesFolderIdForeignKey(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).not.toContain("image_folders_old");
  });
});
