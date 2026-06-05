import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "images.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS image_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_did TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES image_folders(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
