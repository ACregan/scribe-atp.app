import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import db from "./db.js";
import {
  setupContributorMembershipsTable,
  clearContributorMemberships,
  insertContributorMembership,
} from "./testSupport/contributorMemberships.js";

vi.mock("./queue.js", () => ({ enqueue: vi.fn() }));
vi.mock("./sse.js", () => ({ emitEvent: vi.fn() }));

const { enqueue } = await import("./queue.js");
const { emitEvent } = await import("./sse.js");
const { handleUpload } = await import("./upload.js");

setupContributorMembershipsTable();

const DID = "did:plc:owner";
const OTHER_DID = "did:plc:someone-else";

function insertFolder(userDid: string, name: string, parentId: number | null): number {
  return db
    .prepare("INSERT INTO image_folders (user_did, name, parent_id, created_at) VALUES (?, ?, ?, datetime('now'))")
    .run(userDid, name, parentId).lastInsertRowid as number;
}

function insertSiteFolder(siteUri: string, name: string, parentId: number | null): number {
  return db
    .prepare("INSERT INTO image_folders (site_uri, name, parent_id) VALUES (?, ?, ?)")
    .run(siteUri, name, parentId).lastInsertRowid as number;
}

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

beforeEach(() => {
  vi.mocked(enqueue).mockReset();
  vi.mocked(emitEvent).mockReset();
  process.env.IMAGE_STORAGE_ROOT = "/tmp/fake-storage-root";
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
  clearContributorMemberships();
});

afterEach(() => {
  delete process.env.IMAGE_STORAGE_ROOT;
});

describe("handleUpload", () => {
  it("rejects when no file was provided", async () => {
    const res = makeRes();
    await handleUpload(makeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mimetype", async () => {
    const res = makeRes();
    await handleUpload(
      makeReq({ file: { mimetype: "application/pdf", buffer: Buffer.from(""), originalname: "doc.pdf" } as never }),
      res,
    );
    expect(res.statusCode).toBe(415);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects when IMAGE_STORAGE_ROOT is not configured", async () => {
    delete process.env.IMAGE_STORAGE_ROOT;
    const res = makeRes();
    await handleUpload(
      makeReq({ file: { mimetype: "image/png", buffer: Buffer.from(""), originalname: "photo.png" } as never }),
      res,
    );
    expect(res.statusCode).toBe(500);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("accepts a valid image, enqueues the job, and returns 202", async () => {
    const res = makeRes();
    await handleUpload(
      makeReq({
        body: { uploadId: "client-provided-id" },
        file: { mimetype: "image/webp", buffer: Buffer.from("fake"), originalname: "photo.webp" } as never,
      }),
      res,
    );

    expect(res.statusCode).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.uploadId).toBe("client-provided-id");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: "client-provided-id",
        did: DID,
        originalName: "photo.webp",
      }),
    );
    expect(emitEvent).toHaveBeenCalledWith("client-provided-id", "queued", { uuid: res.body.uuid });
  });

  it("falls back to the generated uuid as uploadId when the client doesn't provide one", async () => {
    const res = makeRes();
    await handleUpload(
      makeReq({ file: { mimetype: "image/jpeg", buffer: Buffer.from("fake"), originalname: "photo.jpg" } as never }),
      res,
    );

    expect(res.body.uploadId).toBe(res.body.uuid);
  });

  it("accepts every documented mimetype", async () => {
    for (const mimetype of ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/gif"]) {
      const res = makeRes();
      await handleUpload(
        makeReq({ file: { mimetype, buffer: Buffer.from("fake"), originalname: "photo" } as never }),
        res,
      );
      expect(res.statusCode).toBe(202);
    }
  });

  it("does not pass a targetFolderId when none was provided — queue.ts falls back to the caller's own root", async () => {
    const res = makeRes();
    await handleUpload(
      makeReq({ file: { mimetype: "image/png", buffer: Buffer.from("fake"), originalname: "photo.png" } as never }),
      res,
    );
    expect(enqueue.mock.calls[0][0].targetFolderId).toBeUndefined();
  });
});

// Found live 2026-07-16: uploads always landed in the caller's own personal
// root regardless of which folder they were browsing — this is what let a
// Contributor "upload into the site folder" silently land in their own
// library instead. images.tsx now sends the currently-browsed folder's id;
// the server independently re-validates write access via canAccessFolder
// rather than trusting the client.
describe("handleUpload — folderId targeting", () => {
  it("honors a folderId the caller owns", async () => {
    const folderId = insertFolder(DID, "Vacations", null);
    const res = makeRes();
    await handleUpload(
      makeReq({
        body: { folderId: String(folderId) },
        file: { mimetype: "image/png", buffer: Buffer.from("fake"), originalname: "photo.png" } as never,
      }),
      res,
    );
    expect(enqueue.mock.calls[0][0].targetFolderId).toBe(folderId);
  });

  it("honors a site folder the caller is an accepted contributor on", async () => {
    const siteUri = `at://${OTHER_DID}/site.standard.publication/my-site`;
    insertContributorMembership(siteUri, DID);
    const folderId = insertSiteFolder(siteUri, "example.com Images", null);

    const res = makeRes();
    await handleUpload(
      makeReq({
        body: { folderId: String(folderId) },
        file: { mimetype: "image/png", buffer: Buffer.from("fake"), originalname: "photo.png" } as never,
      }),
      res,
    );
    expect(enqueue.mock.calls[0][0].targetFolderId).toBe(folderId);
  });

  it("falls back (not 403) when the given folderId belongs to a folder the caller cannot write to", async () => {
    const folderId = insertFolder(OTHER_DID, OTHER_DID, null);
    const res = makeRes();
    await handleUpload(
      makeReq({
        body: { folderId: String(folderId) },
        file: { mimetype: "image/png", buffer: Buffer.from("fake"), originalname: "photo.png" } as never,
      }),
      res,
    );
    expect(res.statusCode).toBe(202);
    expect(enqueue.mock.calls[0][0].targetFolderId).toBeUndefined();
  });

  it("falls back when folderId is not a valid number", async () => {
    const res = makeRes();
    await handleUpload(
      makeReq({
        body: { folderId: "not-a-number" },
        file: { mimetype: "image/png", buffer: Buffer.from("fake"), originalname: "photo.png" } as never,
      }),
      res,
    );
    expect(res.statusCode).toBe(202);
    expect(enqueue.mock.calls[0][0].targetFolderId).toBeUndefined();
  });
});
