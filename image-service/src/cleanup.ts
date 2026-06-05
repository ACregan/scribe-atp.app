import fs from "node:fs";
import path from "node:path";
import db from "./db.js";

// On startup, remove any UUID directories that have no corresponding images row.
// These are orphaned by a process restart mid-upload.
export function startupCleanup() {
  const storageRoot = process.env.IMAGE_STORAGE_ROOT;
  if (!storageRoot || !fs.existsSync(storageRoot)) return;

  try {
    const userDirs = fs
      .readdirSync(storageRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const userDir of userDirs) {
      const userPath = path.join(storageRoot, userDir.name);
      const uuidDirs = fs
        .readdirSync(userPath, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const uuidDir of uuidDirs) {
        const row = db.prepare("SELECT id FROM images WHERE filename = ?").get(uuidDir.name);
        if (!row) {
          const orphanPath = path.join(userPath, uuidDir.name);
          console.log(`[cleanup] removing orphaned directory: ${orphanPath}`);
          fs.rmSync(orphanPath, { recursive: true, force: true });
        }
      }
    }
  } catch (err) {
    console.error("[cleanup] startup cleanup error:", err);
  }
}
