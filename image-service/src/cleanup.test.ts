import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import db from "./db.js";
import { startupCleanup } from "./cleanup.js";

const DID = "did:plc:owner";
let storageRoot: string;

beforeEach(() => {
  db.exec("DELETE FROM images");
  storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-test-"));
  process.env.IMAGE_STORAGE_ROOT = storageRoot;
});

afterEach(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
  delete process.env.IMAGE_STORAGE_ROOT;
});

function makeUuidDir(userDid: string, uuid: string) {
  const dir = path.join(storageRoot, userDid, uuid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "max.webp"), "fake image data");
  return dir;
}

describe("startupCleanup", () => {
  it("removes a UUID directory with no corresponding images row", () => {
    const orphan = makeUuidDir(DID, "orphan-uuid");

    startupCleanup();

    expect(fs.existsSync(orphan)).toBe(false);
  });

  it("keeps a UUID directory that has a matching images row", () => {
    const kept = makeUuidDir(DID, "real-uuid");
    db.prepare(
      "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, NULL, ?, ?, ?, ?, ?)",
    ).run(DID, "real-uuid", "photo.jpg", 800, 600, "{}");

    startupCleanup();

    expect(fs.existsSync(kept)).toBe(true);
  });

  it("does nothing when IMAGE_STORAGE_ROOT is not set", () => {
    delete process.env.IMAGE_STORAGE_ROOT;
    const orphan = makeUuidDir(DID, "orphan-uuid"); // uses last-set storageRoot path directly

    expect(() => startupCleanup()).not.toThrow();
    // Nothing was touched since the function returned early.
    expect(fs.existsSync(orphan)).toBe(true);
  });

  it("does not throw when the storage root does not exist on disk", () => {
    process.env.IMAGE_STORAGE_ROOT = path.join(storageRoot, "does-not-exist");
    expect(() => startupCleanup()).not.toThrow();
  });
});
