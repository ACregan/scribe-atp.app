import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleEnsureSiteFolder, ensureSiteFolder } from "./siteFolder.js";

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
});

describe("handleEnsureSiteFolder — validation", () => {
  it("rejects a non-at:// siteUri", () => {
    const res = makeRes();
    handleEnsureSiteFolder(makeReq(OWNER_DID, { siteUri: "https://not-at-proto", siteName: "x" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing siteName", () => {
    const res = makeRes();
    handleEnsureSiteFolder(makeReq(OWNER_DID, { siteUri: SITE_URI }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("handleEnsureSiteFolder — authorization", () => {
  it("rejects a caller who isn't the site owner parsed from siteUri", () => {
    const res = makeRes();
    handleEnsureSiteFolder(
      makeReq(OTHER_DID, { siteUri: SITE_URI, siteName: "example.com" }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(
      db.prepare("SELECT id FROM image_folders WHERE site_uri = ?").get(SITE_URI),
    ).toBeUndefined();
  });
});

describe("handleEnsureSiteFolder — folder auto-creation", () => {
  it("creates the site folder on first call, named '{siteName} Images'", () => {
    const res = makeRes();
    handleEnsureSiteFolder(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com" }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const folder = db
      .prepare("SELECT name, parent_id, user_did FROM image_folders WHERE site_uri = ?")
      .get(SITE_URI) as { name: string; parent_id: number | null; user_did: string | null };
    expect(folder).toEqual({ name: "example.com Images", parent_id: null, user_did: null });
  });

  it("does not create a second folder on a repeat call for the same site", () => {
    handleEnsureSiteFolder(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com" }),
      makeRes(),
    );
    handleEnsureSiteFolder(
      makeReq(OWNER_DID, { siteUri: SITE_URI, siteName: "example.com" }),
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

describe("ensureSiteFolder (direct call, used by the one-shot backfill script)", () => {
  it("creates a folder when none exists", () => {
    const result = ensureSiteFolder(SITE_URI, "example.com");
    expect(result).toBeUndefined();
    const folder = db.prepare("SELECT name FROM image_folders WHERE site_uri = ?").get(SITE_URI);
    expect(folder).toEqual({ name: "example.com Images" });
  });

  it("is a no-op when a folder already exists", () => {
    ensureSiteFolder(SITE_URI, "example.com");
    ensureSiteFolder(SITE_URI, "example.com");
    const count = (
      db.prepare("SELECT COUNT(*) as n FROM image_folders WHERE site_uri = ?").get(SITE_URI) as {
        n: number;
      }
    ).n;
    expect(count).toBe(1);
  });
});
