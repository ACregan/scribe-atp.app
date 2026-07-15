import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleSyncSiteRoster } from "./siteRoster.js";

const OWNER_DID = "did:plc:siteowner";
const OTHER_DID = "did:plc:someone-else";
const SITE_URI = `at://${OWNER_DID}/site.standard.publication/my-site`;

function makeReq(userDid: string, body: unknown): Request {
  return { userDid, body } as unknown as Request;
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

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
  db.exec("DELETE FROM site_rosters");
});

describe("handleSyncSiteRoster — validation", () => {
  it("rejects a non-at:// siteUri", () => {
    const res = makeRes();
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: "https://not-at-proto", siteName: "x", memberDids: [] }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing siteName", () => {
    const res = makeRes();
    handleSyncSiteRoster(makeReq(OWNER_DID, { siteUri: SITE_URI, memberDids: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-array memberDids", () => {
    const res = makeRes();
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "x", memberDids: "not-an-array" }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("handleSyncSiteRoster — authorization", () => {
  it("rejects a caller who isn't the site owner parsed from siteUri", () => {
    const res = makeRes();
    handleSyncSiteRoster(
      makeReq(OTHER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: [] }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(
      db.prepare("SELECT id FROM image_folders WHERE site_uri = ?").get(SITE_URI),
    ).toBeUndefined();
  });
});

describe("handleSyncSiteRoster — folder auto-creation", () => {
  it("creates the site folder on first sync, named '{siteName} Images'", () => {
    const res = makeRes();
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: [] }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const folder = db
      .prepare("SELECT name, parent_id, user_did FROM image_folders WHERE site_uri = ?")
      .get(SITE_URI) as { name: string; parent_id: number | null; user_did: string | null };
    expect(folder).toEqual({ name: "example.com Images", parent_id: null, user_did: null });
  });

  it("does not create a second folder on a repeat sync for the same site", () => {
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: [] }),
      makeRes(),
    );
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: ["did:plc:x"] }),
      makeRes(),
    );
    const count = (
      db.prepare("SELECT COUNT(*) as n FROM image_folders WHERE site_uri = ?").get(SITE_URI) as {
        n: number;
      }
    ).n;
    expect(count).toBe(1);
  });
});

describe("handleSyncSiteRoster — wholesale replace", () => {
  it("populates site_rosters with exactly the given memberDids", () => {
    handleSyncSiteRoster(
      makeReq(OWNER_DID, {
        siteUri: SITE_URI,
        siteName: "example.com",
        memberDids: ["did:plc:a", "did:plc:b"],
      }),
      makeRes(),
    );
    const rows = db
      .prepare("SELECT member_did FROM site_rosters WHERE site_uri = ? ORDER BY member_did")
      .all(SITE_URI) as Array<{ member_did: string }>;
    expect(rows.map((r) => r.member_did)).toEqual(["did:plc:a", "did:plc:b"]);
  });

  it("replaces the previous roster entirely rather than merging with it", () => {
    handleSyncSiteRoster(
      makeReq(OWNER_DID, {
        siteUri: SITE_URI,
        siteName: "example.com",
        memberDids: ["did:plc:a", "did:plc:b"],
      }),
      makeRes(),
    );
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: ["did:plc:c"] }),
      makeRes(),
    );
    const rows = db
      .prepare("SELECT member_did FROM site_rosters WHERE site_uri = ?")
      .all(SITE_URI) as Array<{ member_did: string }>;
    expect(rows.map((r) => r.member_did)).toEqual(["did:plc:c"]);
  });

  it("removing everyone (empty memberDids) clears the roster but keeps the folder", () => {
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: ["did:plc:a"] }),
      makeRes(),
    );
    handleSyncSiteRoster(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com", memberDids: [] }),
      makeRes(),
    );
    const rosterCount = (
      db.prepare("SELECT COUNT(*) as n FROM site_rosters WHERE site_uri = ?").get(SITE_URI) as {
        n: number;
      }
    ).n;
    const folder = db
      .prepare("SELECT id FROM image_folders WHERE site_uri = ?")
      .get(SITE_URI);
    expect(rosterCount).toBe(0);
    expect(folder).toBeDefined();
  });
});
