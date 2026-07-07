import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("./queue.js", () => ({ enqueue: vi.fn() }));
vi.mock("./sse.js", () => ({ emitEvent: vi.fn() }));

const { enqueue } = await import("./queue.js");
const { emitEvent } = await import("./sse.js");
const { handleUpload } = await import("./upload.js");

const DID = "did:plc:owner";

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
});
