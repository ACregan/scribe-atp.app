import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleListFolders, handleCreateFolder, handleDeleteFolder, handleMoveImage } from "./folders.js";

const DID = "did:plc:owner";
const OTHER_DID = "did:plc:someone-else";

function makeReq(overrides: Partial<Request> & { userDid?: string } = {}): Request {
  return {
    userDid: DID,
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as Request;
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
  const result = db
    .prepare("INSERT INTO image_folders (user_did, name, parent_id, created_at) VALUES (?, ?, ?, datetime('now'))")
    .run(userDid, name, parentId);
  return result.lastInsertRowid as number;
}

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
});

describe("handleListFolders", () => {
  it("returns only the requesting user's folders, ordered root-first", () => {
    const root = insertFolder(DID, DID, null);
    insertFolder(DID, "Subfolder", root);
    insertFolder(OTHER_DID, OTHER_DID, null);

    const res = makeRes();
    handleListFolders(makeReq(), res);

    expect(res.body.folders).toHaveLength(2);
    expect(res.body.folders.map((f: { name: string }) => f.name).sort()).toEqual([
      "Subfolder",
      DID,
    ]);
  });
});

describe("handleCreateFolder", () => {
  it("rejects a missing name", () => {
    const res = makeRes();
    handleCreateFolder(makeReq({ body: { parentId: 1 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing parentId", () => {
    const res = makeRes();
    handleCreateFolder(makeReq({ body: { name: "New Folder" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects creating a folder under a parent you don't own", () => {
    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    const res = makeRes();
    handleCreateFolder(makeReq({ body: { name: "New Folder", parentId: otherRoot } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("creates a folder under your own parent", () => {
    const root = insertFolder(DID, DID, null);
    const res = makeRes();
    handleCreateFolder(makeReq({ body: { name: "Vacation Photos", parentId: root } }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.folder.name).toBe("Vacation Photos");
  });

  it("rejects a duplicate folder name under the same parent", () => {
    const root = insertFolder(DID, DID, null);
    insertFolder(DID, "Vacation Photos", root);

    const res = makeRes();
    handleCreateFolder(makeReq({ body: { name: "Vacation Photos", parentId: root } }), res);
    expect(res.statusCode).toBe(409);
  });

  it("trims whitespace from the folder name", () => {
    const root = insertFolder(DID, DID, null);
    const res = makeRes();
    handleCreateFolder(makeReq({ body: { name: "  Spaced  ", parentId: root } }), res);
    expect(res.body.folder.name).toBe("Spaced");
  });
});

describe("handleDeleteFolder", () => {
  it("rejects an invalid folderId", () => {
    const res = makeRes();
    handleDeleteFolder(makeReq({ params: { folderId: "not-a-number" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects deleting a folder you don't own", () => {
    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    const sub = insertFolder(OTHER_DID, "Sub", otherRoot);
    const res = makeRes();
    handleDeleteFolder(makeReq({ params: { folderId: String(sub) } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("refuses to delete the root User Image Folder", () => {
    const root = insertFolder(DID, DID, null);
    const res = makeRes();
    handleDeleteFolder(makeReq({ params: { folderId: String(root) } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("refuses to delete a folder containing images", () => {
    const root = insertFolder(DID, DID, null);
    const sub = insertFolder(DID, "Sub", root);
    db.prepare(
      "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(DID, sub, "abc-uuid", "photo.jpg", 100, 100, "{}");

    const res = makeRes();
    handleDeleteFolder(makeReq({ params: { folderId: String(sub) } }), res);
    expect(res.statusCode).toBe(409);
  });

  it("refuses to delete a folder containing subfolders", () => {
    const root = insertFolder(DID, DID, null);
    const sub = insertFolder(DID, "Sub", root);
    insertFolder(DID, "Sub-sub", sub);

    const res = makeRes();
    handleDeleteFolder(makeReq({ params: { folderId: String(sub) } }), res);
    expect(res.statusCode).toBe(409);
  });

  it("deletes an empty, owned, non-root folder", () => {
    const root = insertFolder(DID, DID, null);
    const sub = insertFolder(DID, "Sub", root);

    const res = makeRes();
    handleDeleteFolder(makeReq({ params: { folderId: String(sub) } }), res);
    expect(res.statusCode).toBe(200);
    expect(db.prepare("SELECT id FROM image_folders WHERE id = ?").get(sub)).toBeUndefined();
  });
});

describe("handleMoveImage", () => {
  it("rejects moving an image you don't own", () => {
    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    const imgResult = db
      .prepare("INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(OTHER_DID, otherRoot, "abc-uuid", "photo.jpg", 100, 100, "{}");

    const myRoot = insertFolder(DID, DID, null);
    const res = makeRes();
    handleMoveImage(
      makeReq({ params: { imageId: String(imgResult.lastInsertRowid) }, body: { folderId: myRoot } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });

  it("rejects moving into a folder you don't own", () => {
    const myRoot = insertFolder(DID, DID, null);
    const imgResult = db
      .prepare("INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(DID, myRoot, "abc-uuid", "photo.jpg", 100, 100, "{}");

    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    const res = makeRes();
    handleMoveImage(
      makeReq({ params: { imageId: String(imgResult.lastInsertRowid) }, body: { folderId: otherRoot } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });

  it("moves an owned image to an owned folder", () => {
    const myRoot = insertFolder(DID, DID, null);
    const sub = insertFolder(DID, "Sub", myRoot);
    const imgResult = db
      .prepare("INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(DID, myRoot, "abc-uuid", "photo.jpg", 100, 100, "{}");

    const res = makeRes();
    handleMoveImage(
      makeReq({ params: { imageId: String(imgResult.lastInsertRowid) }, body: { folderId: sub } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const row = db.prepare("SELECT folder_id FROM images WHERE id = ?").get(imgResult.lastInsertRowid) as {
      folder_id: number;
    };
    expect(row.folder_id).toBe(sub);
  });
});
