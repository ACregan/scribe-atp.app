import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleBrowse } from "./browse.js";

const DID = "did:plc:owner";
const OTHER_DID = "did:plc:someone-else";

function makeReq(overrides: Partial<Request> & { userDid?: string } = {}): Request {
  return { userDid: DID, query: {}, ...overrides } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function insertFolder(userDid: string, name: string, parentId: number | null): number {
  return db
    .prepare("INSERT INTO image_folders (user_did, name, parent_id, created_at) VALUES (?, ?, ?, datetime('now'))")
    .run(userDid, name, parentId).lastInsertRowid as number;
}

function insertImage(userDid: string, folderId: number, filename: string) {
  db.prepare(
    "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(userDid, folderId, filename, `${filename}.jpg`, 800, 600, JSON.stringify({ thumb: { width: 300, height: 225 } }));
}

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
});

describe("handleBrowse — no folderId (top-level shared view)", () => {
  it("returns all users' root folders, no images", () => {
    insertFolder(DID, DID, null);
    insertFolder(OTHER_DID, OTHER_DID, null);

    const res = makeRes();
    handleBrowse(makeReq(), res);

    expect(res.body.folder).toBeNull();
    expect(res.body.breadcrumbs).toEqual([]);
    expect(res.body.subfolders).toHaveLength(2);
    expect(res.body.images).toEqual([]);
  });
});

describe("handleBrowse — with folderId", () => {
  it("rejects a non-numeric folderId", () => {
    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: "abc" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("404s for a folder that doesn't exist", () => {
    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: "9999" } }), res);
    expect(res.statusCode).toBe(404);
  });

  it("shows 'My Images' as the display name for the current user's own root", () => {
    const root = insertFolder(DID, DID, null);
    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: String(root) } }), res);
    expect(res.body.breadcrumbs).toEqual([{ id: root, name: "My Images" }]);
  });

  it("shows the real folder name for another user's root (browsing someone else's library)", () => {
    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: String(otherRoot) } }), res);
    expect(res.body.breadcrumbs).toEqual([{ id: otherRoot, name: OTHER_DID }]);
  });

  it("builds a multi-level breadcrumb trail from root to the current folder", () => {
    const root = insertFolder(DID, DID, null);
    const child = insertFolder(DID, "Vacations", root);
    const grandchild = insertFolder(DID, "2026", child);

    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: String(grandchild) } }), res);

    expect(res.body.breadcrumbs).toEqual([
      { id: root, name: "My Images" },
      { id: child, name: "Vacations" },
      { id: grandchild, name: "2026" },
    ]);
  });

  it("returns subfolders and images within the requested folder, parsing sizes JSON", () => {
    const root = insertFolder(DID, DID, null);
    insertFolder(DID, "Sub", root);
    insertImage(DID, root, "photo-uuid");

    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: String(root) } }), res);

    expect(res.body.subfolders).toHaveLength(1);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].sizes).toEqual({ thumb: { width: 300, height: 225 } });
  });

  it("does not restrict browsing to your own folders (read access is shared)", () => {
    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    insertImage(OTHER_DID, otherRoot, "their-photo");

    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: String(otherRoot) } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.images).toHaveLength(1);
  });
});
