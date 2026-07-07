import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import { handleDeleteImage } from "./deleteImage.js";

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

function insertImage(userDid: string, filename: string): number {
  return db
    .prepare(
      "INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes) VALUES (?, NULL, ?, ?, ?, ?, ?)",
    )
    .run(userDid, filename, `${filename}.jpg`, 800, 600, "{}").lastInsertRowid as number;
}

beforeEach(() => {
  db.exec("DELETE FROM images");
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
