import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleBrowse } from "./browse.js";
import {
  setupContributorMembershipsTable,
  clearContributorMemberships,
  insertContributorMembership,
} from "./testSupport/contributorMemberships.js";

setupContributorMembershipsTable();

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

describe("handleBrowse — no folderId (top-level shared view)", () => {
  it("returns only the caller's own personal root folder, not other users'", () => {
    insertFolder(DID, DID, null);
    insertFolder(OTHER_DID, OTHER_DID, null);

    const res = makeRes();
    handleBrowse(makeReq(), res);

    expect(res.body.folder).toBeNull();
    expect(res.body.breadcrumbs).toEqual([]);
    expect(res.body.subfolders).toHaveLength(1);
    expect(res.body.subfolders[0].user_did).toBe(DID);
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

  it("404s when fetching another user's personal folder directly — read access is owner-only", () => {
    const otherRoot = insertFolder(OTHER_DID, OTHER_DID, null);
    insertImage(OTHER_DID, otherRoot, "their-photo");

    const res = makeRes();
    handleBrowse(makeReq({ query: { folderId: String(otherRoot) } }), res);

    expect(res.statusCode).toBe(404);
  });
});

describe("handleBrowse — site-owned folders", () => {
  const SITE_URI = `at://${DID}/site.standard.publication/my-site`;

  it("top-level listing excludes a site folder for someone with no accepted contributor_memberships row", () => {
    insertFolder(OTHER_DID, OTHER_DID, null);
    insertSiteFolder(SITE_URI, "example.com Images", null);

    const res = makeRes();
    handleBrowse(makeReq({ userDid: OTHER_DID }), res);

    expect(res.body.subfolders).toHaveLength(1);
    expect(res.body.subfolders[0].user_did).toBe(OTHER_DID);
  });

  it("top-level listing includes the site folder for its owner", () => {
    insertSiteFolder(SITE_URI, "example.com Images", null);
    const res = makeRes();
    handleBrowse(makeReq({ userDid: DID }), res);
    expect(res.body.subfolders).toHaveLength(1);
  });

  it("top-level listing includes the site folder for an accepted contributor", () => {
    const memberDid = "did:plc:contributor";
    insertContributorMembership(SITE_URI, memberDid);
    insertSiteFolder(SITE_URI, "example.com Images", null);

    const res = makeRes();
    handleBrowse(makeReq({ userDid: memberDid }), res);
    expect(res.body.subfolders).toHaveLength(1);
  });

  it("404s (not 403) for a direct folderId fetch by someone with no accepted membership row — existence isn't confirmed", () => {
    const siteFolderId = insertSiteFolder(SITE_URI, "example.com Images", null);
    const res = makeRes();
    handleBrowse(makeReq({ userDid: OTHER_DID, query: { folderId: String(siteFolderId) } }), res);
    expect(res.statusCode).toBe(404);
  });

  it("allows an accepted contributor to fetch the site folder directly and see its images", () => {
    const memberDid = "did:plc:contributor";
    insertContributorMembership(SITE_URI, memberDid);
    const siteFolderId = insertSiteFolder(SITE_URI, "example.com Images", null);
    insertImage("did:plc:whoeveruploaded", siteFolderId, "shared-photo");

    const res = makeRes();
    handleBrowse(makeReq({ userDid: memberDid, query: { folderId: String(siteFolderId) } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.images).toHaveLength(1);
  });

  // Found live 2026-07-16: the client used to derive write-capability from
  // `folder.user_did === currentUserDid`, which is always false for a site
  // folder — hiding New Folder/Move/Delete/upload-into-here from the Owner
  // and every accepted Contributor alike. canWrite is the server-computed
  // fix (ADR 0024).
  it("reports canWrite: true for the site owner", () => {
    const siteFolderId = insertSiteFolder(SITE_URI, "example.com Images", null);
    const res = makeRes();
    handleBrowse(makeReq({ userDid: DID, query: { folderId: String(siteFolderId) } }), res);
    expect(res.body.folder.canWrite).toBe(true);
  });

  it("reports canWrite: true for an accepted contributor", () => {
    const memberDid = "did:plc:contributor";
    insertContributorMembership(SITE_URI, memberDid);
    const siteFolderId = insertSiteFolder(SITE_URI, "example.com Images", null);
    const res = makeRes();
    handleBrowse(makeReq({ userDid: memberDid, query: { folderId: String(siteFolderId) } }), res);
    expect(res.body.folder.canWrite).toBe(true);
  });

  it("uses the folder's own name for a site folder's breadcrumb — no 'My Images' override", () => {
    const siteFolderId = insertSiteFolder(SITE_URI, "example.com Images", null);
    const res = makeRes();
    handleBrowse(makeReq({ userDid: DID, query: { folderId: String(siteFolderId) } }), res);
    expect(res.body.breadcrumbs).toEqual([{ id: siteFolderId, name: "example.com Images" }]);
  });
});
