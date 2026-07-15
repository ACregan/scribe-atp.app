import { describe, it, expect, beforeEach } from "vitest";
import db from "./db.js";
import { canAccessFolder, canAccessImage, getFolder, type FolderRow } from "./access.js";

const OWNER_DID = "did:plc:siteowner";
const MEMBER_DID = "did:plc:contributor";
const OUTSIDER_DID = "did:plc:outsider";
const SITE_URI = `at://${OWNER_DID}/site.standard.publication/my-site`;

function insertPersonalFolder(userDid: string, parentId: number | null = null): number {
  return db
    .prepare("INSERT INTO image_folders (user_did, name, parent_id) VALUES (?, ?, ?)")
    .run(userDid, userDid, parentId).lastInsertRowid as number;
}

function insertSiteFolder(siteUri: string, name: string, parentId: number | null = null): number {
  return db
    .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, ?)")
    .run(siteUri, name, parentId).lastInsertRowid as number;
}

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
  db.exec("DELETE FROM site_rosters");
});

describe("canAccessFolder — personal folders", () => {
  it("allows the owning user", () => {
    const folder: FolderRow = { id: 1, user_did: OWNER_DID, site_uri: null, name: OWNER_DID, parent_id: null };
    expect(canAccessFolder(OWNER_DID, folder)).toBe(true);
  });

  it("denies a different user", () => {
    const folder: FolderRow = { id: 1, user_did: OWNER_DID, site_uri: null, name: OWNER_DID, parent_id: null };
    expect(canAccessFolder(OUTSIDER_DID, folder)).toBe(false);
  });
});

describe("canAccessFolder — site folders", () => {
  it("allows the site owner, parsed directly from site_uri — no roster row needed", () => {
    const folder: FolderRow = { id: 1, user_did: null, site_uri: SITE_URI, name: "x", parent_id: null };
    expect(canAccessFolder(OWNER_DID, folder)).toBe(true);
  });

  it("allows a DID present in site_rosters for that site_uri", () => {
    db.prepare("INSERT INTO site_rosters (site_uri, member_did) VALUES (?, ?)").run(SITE_URI, MEMBER_DID);
    const folder: FolderRow = { id: 1, user_did: null, site_uri: SITE_URI, name: "x", parent_id: null };
    expect(canAccessFolder(MEMBER_DID, folder)).toBe(true);
  });

  it("denies a DID that is neither the owner nor on the roster — the whole point of ADR 0020", () => {
    db.prepare("INSERT INTO site_rosters (site_uri, member_did) VALUES (?, ?)").run(SITE_URI, MEMBER_DID);
    const folder: FolderRow = { id: 1, user_did: null, site_uri: SITE_URI, name: "x", parent_id: null };
    expect(canAccessFolder(OUTSIDER_DID, folder)).toBe(false);
  });

  it("does not grant access to a roster row from a different site", () => {
    const otherSiteUri = `at://${OWNER_DID}/site.standard.publication/other-site`;
    db.prepare("INSERT INTO site_rosters (site_uri, member_did) VALUES (?, ?)").run(otherSiteUri, MEMBER_DID);
    const folder: FolderRow = { id: 1, user_did: null, site_uri: SITE_URI, name: "x", parent_id: null };
    expect(canAccessFolder(MEMBER_DID, folder)).toBe(false);
  });
});

describe("getFolder", () => {
  it("returns the folder row including site_uri", () => {
    const id = insertSiteFolder(SITE_URI, "Site Images");
    const folder = getFolder(id);
    expect(folder).toEqual({
      id,
      user_did: null,
      site_uri: SITE_URI,
      name: "Site Images",
      parent_id: null,
    });
  });

  it("returns undefined for a nonexistent folder", () => {
    expect(getFolder(999999)).toBeUndefined();
  });
});

describe("canAccessImage", () => {
  it("resolves access through the image's current folder, not its own user_did", () => {
    // A Contributor (MEMBER_DID) accessing an image a DIFFERENT contributor
    // uploaded, sitting in the shared site folder — full write parity
    // (ADR 0020 point 2) means this must be allowed.
    db.prepare("INSERT INTO site_rosters (site_uri, member_did) VALUES (?, ?)").run(SITE_URI, MEMBER_DID);
    const folderId = insertSiteFolder(SITE_URI, "Site Images");
    const result = db
      .prepare(
        "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("did:plc:someone-else-entirely", folderId, "f", "f.jpg", 10, 10, "{}");
    const image = { folder_id: folderId };

    expect(canAccessImage(MEMBER_DID, image)).toBe(true);
    expect(canAccessImage(OUTSIDER_DID, image)).toBe(false);
    expect(result.changes).toBe(1);
  });

  it("denies access when folder_id is null", () => {
    expect(canAccessImage(OWNER_DID, { folder_id: null })).toBe(false);
  });

  it("denies access when the referenced folder doesn't exist", () => {
    expect(canAccessImage(OWNER_DID, { folder_id: 999999 })).toBe(false);
  });
});
