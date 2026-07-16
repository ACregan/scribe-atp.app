import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleListFolders, handleCreateFolder, handleDeleteFolder, handleMoveImage } from "./folders.js";
import {
  setupContributorMembershipsTable,
  clearContributorMemberships,
  insertContributorMembership,
} from "./testSupport/contributorMemberships.js";

setupContributorMembershipsTable();

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

function insertSiteFolder(siteUri: string, name: string, parentId: number | null): number {
  return db
    .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, ?)")
    .run(siteUri, name, parentId).lastInsertRowid as number;
}

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
  clearContributorMemberships();
});

describe("handleListFolders", () => {
  it("returns the requesting user's own folders, ordered root-first", () => {
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

  // ADR 0020 point 2 (full write parity) — this list backs the Move / Bulk
  // Move / Add to New Folder destination pickers, so it must include site
  // folders the caller can write to, not just ones they personally own.
  it("includes a site folder the caller owns", () => {
    const siteUri = `at://${DID}/site.standard.publication/my-site`;
    insertSiteFolder(siteUri, "example.com Images", null);

    const res = makeRes();
    handleListFolders(makeReq({ userDid: DID }), res);

    expect(res.body.folders.map((f: { name: string }) => f.name)).toContain(
      "example.com Images",
    );
  });

  it("includes a site folder the caller is an accepted contributor on", () => {
    const siteUri = `at://${DID}/site.standard.publication/my-site`;
    const contributorDid = "did:plc:contributor";
    insertContributorMembership(siteUri, contributorDid);
    insertSiteFolder(siteUri, "example.com Images", null);

    const res = makeRes();
    handleListFolders(makeReq({ userDid: contributorDid }), res);

    expect(res.body.folders.map((f: { name: string }) => f.name)).toContain(
      "example.com Images",
    );
  });

  it("excludes a site folder the caller has no accepted membership for", () => {
    const siteUri = `at://${DID}/site.standard.publication/my-site`;
    insertSiteFolder(siteUri, "example.com Images", null);

    const res = makeRes();
    handleListFolders(makeReq({ userDid: OTHER_DID }), res);

    expect(res.body.folders).toHaveLength(0);
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

// ADR 0020 point 2 — Contributors get full write parity with the Owner
// inside a site folder: one access check, no tiers.
describe("site-owned folders — full write parity for Contributors", () => {
  const SITE_URI = `at://${DID}/site.standard.publication/my-site`;
  const CONTRIBUTOR_A = "did:plc:contributor-a";
  const CONTRIBUTOR_B = "did:plc:contributor-b";

  function insertSiteFolder(name: string, parentId: number | null): number {
    return db
      .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, ?)")
      .run(SITE_URI, name, parentId).lastInsertRowid as number;
  }

  beforeEach(() => {
    insertContributorMembership(SITE_URI, CONTRIBUTOR_A);
    insertContributorMembership(SITE_URI, CONTRIBUTOR_B);
  });

  it("a Contributor can create a subfolder inside the site folder", () => {
    const siteRoot = insertSiteFolder("example.com Images", null);
    const res = makeRes();
    handleCreateFolder(
      makeReq({ userDid: CONTRIBUTOR_A, body: { name: "Event Photos", parentId: siteRoot } }),
      res,
    );
    expect(res.statusCode).toBe(201);
  });

  it("a subfolder created by a Contributor inherits the site's ownership, not the Contributor's own", () => {
    const siteRoot = insertSiteFolder("example.com Images", null);
    handleCreateFolder(
      makeReq({ userDid: CONTRIBUTOR_A, body: { name: "Event Photos", parentId: siteRoot } }),
      makeRes(),
    );
    const subfolder = db
      .prepare("SELECT user_did, site_uri FROM image_folders WHERE name = ?")
      .get("Event Photos") as { user_did: string | null; site_uri: string | null };
    expect(subfolder).toEqual({ user_did: null, site_uri: SITE_URI });
  });

  it("a different Contributor can delete a subfolder they didn't create", () => {
    const siteRoot = insertSiteFolder("example.com Images", null);
    handleCreateFolder(
      makeReq({ userDid: CONTRIBUTOR_A, body: { name: "Event Photos", parentId: siteRoot } }),
      makeRes(),
    );
    const subfolder = db
      .prepare("SELECT id FROM image_folders WHERE name = ?")
      .get("Event Photos") as { id: number };

    const res = makeRes();
    handleDeleteFolder(makeReq({ userDid: CONTRIBUTOR_B, params: { folderId: String(subfolder.id) } }), res);
    expect(res.statusCode).toBe(200);
  });

  it("a Contributor can move an image someone else uploaded within the site folder", () => {
    const siteRoot = insertSiteFolder("example.com Images", null);
    const targetSub = db
      .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, ?)")
      .run(SITE_URI, "Sub", siteRoot).lastInsertRowid as number;
    const imgResult = db
      .prepare(
        "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(CONTRIBUTOR_A, siteRoot, "abc-uuid", "photo.jpg", 100, 100, "{}");

    const res = makeRes();
    handleMoveImage(
      makeReq({
        userDid: CONTRIBUTOR_B,
        params: { imageId: String(imgResult.lastInsertRowid) },
        body: { folderId: targetSub },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it("the Owner (not just Contributors) can also manage the site folder — owner DID is parsed from site_uri, no roster row needed", () => {
    const siteRoot = insertSiteFolder("example.com Images", null);
    const res = makeRes();
    handleCreateFolder(makeReq({ userDid: DID, body: { name: "Owner's Subfolder", parentId: siteRoot } }), res);
    expect(res.statusCode).toBe(201);
  });

  it("someone not on the roster still cannot create a subfolder in the site folder", () => {
    const siteRoot = insertSiteFolder("example.com Images", null);
    const res = makeRes();
    handleCreateFolder(
      makeReq({ userDid: OTHER_DID, body: { name: "Intruder", parentId: siteRoot } }),
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});
