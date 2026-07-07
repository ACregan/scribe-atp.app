import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleBulkMove, handleBulkDelete } from "./bulkOperations.js";

const DID = "did:plc:owner";
const OTHER_DID = "did:plc:someone-else";

function makeReq(overrides: Partial<Request> & { userDid?: string } = {}): Request {
  return { userDid: DID, body: {}, ...overrides } as unknown as Request;
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

function insertImage(userDid: string, folderId: number | null, filename: string): number {
  return db
    .prepare(
      "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(userDid, folderId, filename, `${filename}.jpg`, 800, 600, "{}").lastInsertRowid as number;
}

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
});

describe("handleBulkMove — validation", () => {
  it("rejects a non-array imageIds", () => {
    const res = makeRes();
    handleBulkMove(makeReq({ body: { imageIds: "not-an-array", folderIds: [], destinationFolderId: 1 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-array folderIds", () => {
    const res = makeRes();
    handleBulkMove(makeReq({ body: { imageIds: [], folderIds: "nope", destinationFolderId: 1 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-integer destinationFolderId", () => {
    const res = makeRes();
    handleBulkMove(makeReq({ body: { imageIds: [], folderIds: [], destinationFolderId: 1.5 } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("handleBulkMove — ownership", () => {
  it("rejects when any image is not owned by the requester", () => {
    const myRoot = insertFolder(DID, DID, null);
    const theirImage = insertImage(OTHER_DID, null, "their-photo");

    const res = makeRes();
    handleBulkMove(
      makeReq({ body: { imageIds: [theirImage], folderIds: [], destinationFolderId: myRoot } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });

  it("rejects when any folder is not owned by the requester", () => {
    const myRoot = insertFolder(DID, DID, null);
    const theirFolder = insertFolder(OTHER_DID, "Theirs", null);

    const res = makeRes();
    handleBulkMove(
      makeReq({ body: { imageIds: [], folderIds: [theirFolder], destinationFolderId: myRoot } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });

  it("rejects moving into a destination folder you don't own", () => {
    const theirRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    const myImage = insertImage(DID, null, "my-photo");

    const res = makeRes();
    handleBulkMove(
      makeReq({ body: { imageIds: [myImage], folderIds: [], destinationFolderId: theirRoot } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});

describe("handleBulkMove — cycle detection", () => {
  it("rejects moving a folder into itself", () => {
    const root = insertFolder(DID, DID, null);
    const folder = insertFolder(DID, "Folder", root);

    const res = makeRes();
    handleBulkMove(makeReq({ body: { imageIds: [], folderIds: [folder], destinationFolderId: folder } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects moving a folder into its own descendant", () => {
    const root = insertFolder(DID, DID, null);
    const parent = insertFolder(DID, "Parent", root);
    const child = insertFolder(DID, "Child", parent);

    const res = makeRes();
    handleBulkMove(makeReq({ body: { imageIds: [], folderIds: [parent], destinationFolderId: child } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("allows moving a folder to an unrelated destination", () => {
    const root = insertFolder(DID, DID, null);
    const a = insertFolder(DID, "A", root);
    const b = insertFolder(DID, "B", root);

    const res = makeRes();
    handleBulkMove(makeReq({ body: { imageIds: [], folderIds: [a], destinationFolderId: b } }), res);
    expect(res.statusCode).toBe(200);
    const row = db.prepare("SELECT parent_id FROM image_folders WHERE id = ?").get(a) as { parent_id: number };
    expect(row.parent_id).toBe(b);
  });
});

describe("handleBulkMove — execution", () => {
  it("moves both images and folders to the destination atomically", () => {
    const root = insertFolder(DID, DID, null);
    const dest = insertFolder(DID, "Dest", root);
    const folderToMove = insertFolder(DID, "Moving", root);
    const image1 = insertImage(DID, root, "photo1");
    const image2 = insertImage(DID, root, "photo2");

    const res = makeRes();
    handleBulkMove(
      makeReq({
        body: { imageIds: [image1, image2], folderIds: [folderToMove], destinationFolderId: dest },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect((db.prepare("SELECT folder_id FROM images WHERE id = ?").get(image1) as { folder_id: number }).folder_id).toBe(dest);
    expect((db.prepare("SELECT folder_id FROM images WHERE id = ?").get(image2) as { folder_id: number }).folder_id).toBe(dest);
    expect(
      (db.prepare("SELECT parent_id FROM image_folders WHERE id = ?").get(folderToMove) as { parent_id: number })
        .parent_id,
    ).toBe(dest);
  });
});

describe("handleBulkDelete — validation and ownership", () => {
  it("rejects a non-array imageIds", () => {
    const res = makeRes();
    handleBulkDelete(makeReq({ body: { imageIds: "nope", folderIds: [] } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects when any image is not owned by the requester", () => {
    const theirImage = insertImage(OTHER_DID, null, "their-photo");
    const res = makeRes();
    handleBulkDelete(makeReq({ body: { imageIds: [theirImage], folderIds: [], confirm: true } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("refuses to delete a root User Image Folder", () => {
    const root = insertFolder(DID, DID, null);
    const res = makeRes();
    handleBulkDelete(makeReq({ body: { imageIds: [], folderIds: [root], confirm: true } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("handleBulkDelete — dry run (confirm not true)", () => {
  it("returns counts without deleting anything", () => {
    const root = insertFolder(DID, DID, null);
    const sub = insertFolder(DID, "Sub", root);
    insertImage(DID, sub, "photo1");
    const directImage = insertImage(DID, root, "photo2");

    const res = makeRes();
    handleBulkDelete(makeReq({ body: { imageIds: [directImage], folderIds: [sub] } }), res);

    expect(res.body).toEqual({ ok: false, folderCount: 1, imageCount: 2 });
    // Nothing was actually deleted.
    expect(db.prepare("SELECT id FROM image_folders WHERE id = ?").get(sub)).toBeDefined();
    expect(db.prepare("SELECT id FROM images WHERE id = ?").get(directImage)).toBeDefined();
  });

  it("counts images nested in descendant folders, not just direct children", () => {
    const root = insertFolder(DID, DID, null);
    const parent = insertFolder(DID, "Parent", root);
    const child = insertFolder(DID, "Child", parent);
    insertImage(DID, child, "deeply-nested-photo");

    const res = makeRes();
    handleBulkDelete(makeReq({ body: { imageIds: [], folderIds: [parent] } }), res);

    // parent + child = 2 folders; 1 image nested two levels down.
    expect(res.body).toEqual({ ok: false, folderCount: 2, imageCount: 1 });
  });
});

describe("handleBulkDelete — confirmed delete", () => {
  it("deletes images, descendant folders, and directly-specified images together", () => {
    const root = insertFolder(DID, DID, null);
    const folderToDelete = insertFolder(DID, "ToDelete", root);
    const nestedFolder = insertFolder(DID, "Nested", folderToDelete);
    const nestedImage = insertImage(DID, nestedFolder, "nested-photo");
    const directImage = insertImage(DID, root, "direct-photo");

    const res = makeRes();
    handleBulkDelete(
      makeReq({ body: { imageIds: [directImage], folderIds: [folderToDelete], confirm: true } }),
      res,
    );

    expect(res.body).toEqual({ ok: true, folderCount: 2, imageCount: 2 });
    expect(db.prepare("SELECT id FROM image_folders WHERE id = ?").get(folderToDelete)).toBeUndefined();
    expect(db.prepare("SELECT id FROM image_folders WHERE id = ?").get(nestedFolder)).toBeUndefined();
    expect(db.prepare("SELECT id FROM images WHERE id = ?").get(nestedImage)).toBeUndefined();
    expect(db.prepare("SELECT id FROM images WHERE id = ?").get(directImage)).toBeUndefined();
    // The root survives — it wasn't in the delete list.
    expect(db.prepare("SELECT id FROM image_folders WHERE id = ?").get(root)).toBeDefined();
  });
});
