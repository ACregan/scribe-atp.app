import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleDeleteImage } from "./deleteImage.js";
import {
  setupContributorMembershipsTable,
  clearContributorMemberships,
  insertContributorMembership,
} from "./testSupport/contributorMemberships.js";

setupContributorMembershipsTable();

const DID = "did:plc:owner";
const OTHER_DID = "did:plc:someone-else";

function makeReq(overrides: Partial<Request> & { userDid?: string } = {}): Request {
  return { userDid: DID, params: {}, ...overrides } as unknown as Request;
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

// Every real image row has a folder_id pointing at a real folder — queue.ts
// always assigns one (ensureUserFolder), it's never NULL in production —
// so access checks (which resolve through the image's folder) need a real
// folder row here too, not a NULL shortcut.
function ensurePersonalFolder(userDid: string): number {
  const existing = db
    .prepare("SELECT id FROM image_folders WHERE user_did = ? AND parent_id IS NULL")
    .get(userDid) as { id: number } | undefined;
  if (existing) return existing.id;
  return db
    .prepare("INSERT INTO image_folders (user_did, name, parent_id) VALUES (?, ?, NULL)")
    .run(userDid, userDid).lastInsertRowid as number;
}

function insertImage(userDid: string, filename: string): number {
  const folderId = ensurePersonalFolder(userDid);
  return db
    .prepare(
      "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(userDid, folderId, filename, `${filename}.jpg`, 800, 600, "{}").lastInsertRowid as number;
}

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
  clearContributorMemberships();
});

afterEach(() => {
  delete process.env.IMAGE_STORAGE_ROOT;
});

describe("handleDeleteImage", () => {
  it("rejects an invalid imageId", () => {
    const res = makeRes();
    handleDeleteImage(makeReq({ params: { imageId: "not-a-number" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects deleting an image that doesn't exist (403 — same as a foreign image, doesn't leak existence)", () => {
    const res = makeRes();
    handleDeleteImage(makeReq({ params: { imageId: "9999" } }), res);
    expect(res.statusCode).toBe(403);
  });

  it("rejects deleting another user's image", () => {
    const id = insertImage(OTHER_DID, "their-photo");
    const res = makeRes();
    handleDeleteImage(makeReq({ params: { imageId: String(id) } }), res);
    expect(res.statusCode).toBe(403);
    // Not deleted.
    expect(db.prepare("SELECT id FROM images WHERE id = ?").get(id)).toBeDefined();
  });

  it("deletes an owned image's row", () => {
    const id = insertImage(DID, "my-photo");
    const res = makeRes();
    handleDeleteImage(makeReq({ params: { imageId: String(id) } }), res);
    expect(res.statusCode).toBe(200);
    expect(db.prepare("SELECT id FROM images WHERE id = ?").get(id)).toBeUndefined();
  });

  it("does not attempt filesystem cleanup when IMAGE_STORAGE_ROOT is unset", () => {
    delete process.env.IMAGE_STORAGE_ROOT;
    const id = insertImage(DID, "my-photo");
    const res = makeRes();
    // Would throw/reject if it tried fs.rm against an undefined path — the
    // row deletion + response still succeed either way.
    expect(() => handleDeleteImage(makeReq({ params: { imageId: String(id) } }), res)).not.toThrow();
    expect(res.statusCode).toBe(200);
  });
});

describe("handleDeleteImage — site-owned folders (ADR 0020 full write parity)", () => {
  const SITE_URI = `at://${DID}/site.standard.publication/my-site`;
  const CONTRIBUTOR_A = "did:plc:contributor-a";
  const CONTRIBUTOR_B = "did:plc:contributor-b";

  it("a Contributor can delete an image a different Contributor uploaded into the site folder", () => {
    insertContributorMembership(SITE_URI, CONTRIBUTOR_A);
    insertContributorMembership(SITE_URI, CONTRIBUTOR_B);
    const siteFolderId = db
      .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, NULL)")
      .run(SITE_URI, "example.com Images").lastInsertRowid as number;
    const imgResult = db
      .prepare(
        "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(CONTRIBUTOR_A, siteFolderId, "shared-photo", "photo.jpg", 100, 100, "{}");

    const res = makeRes();
    handleDeleteImage(
      makeReq({ userDid: CONTRIBUTOR_B, params: { imageId: String(imgResult.lastInsertRowid) } }),
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it("someone with no accepted membership row cannot delete an image in the site folder", () => {
    insertContributorMembership(SITE_URI, CONTRIBUTOR_A);
    const siteFolderId = db
      .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, NULL)")
      .run(SITE_URI, "example.com Images").lastInsertRowid as number;
    const imgResult = db
      .prepare(
        "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(CONTRIBUTOR_A, siteFolderId, "shared-photo", "photo.jpg", 100, 100, "{}");

    const res = makeRes();
    handleDeleteImage(makeReq({ userDid: OTHER_DID, params: { imageId: String(imgResult.lastInsertRowid) } }), res);
    expect(res.statusCode).toBe(403);
  });
});
