import { describe, it, expect, vi, beforeEach } from "vitest";
import db from "./db.js";

vi.mock("./variants.js", () => ({
  generateVariants: vi.fn(),
}));
vi.mock("./sse.js", () => ({
  emitEvent: vi.fn(),
  closeSSE: vi.fn(),
}));

const { generateVariants } = await import("./variants.js");
const { emitEvent, closeSSE } = await import("./sse.js");
const { enqueue } = await import("./queue.js");

const DID = "did:plc:owner";

beforeEach(() => {
  db.exec("DELETE FROM images");
  db.exec("DELETE FROM image_folders");
  vi.mocked(generateVariants).mockReset();
  vi.mocked(emitEvent).mockReset();
  vi.mocked(closeSSE).mockReset();
});

describe("enqueue / processJob", () => {
  it("creates the user's root folder on first upload and inserts the image row", async () => {
    vi.mocked(generateVariants).mockResolvedValue({
      sizes: { thumb: { width: 300, height: 300, bytes: 1000 } },
      sourceWidth: 1000,
      sourceHeight: 1000,
    });

    enqueue({
      uploadId: "upload-1",
      did: DID,
      uuid: "uuid-1",
      fileBuffer: Buffer.from("fake"),
      originalName: "photo.jpg",
      outputDir: "/tmp/does-not-matter",
    });

    await vi.waitFor(() => {
      const row = db.prepare("SELECT * FROM images WHERE filename = ?").get("uuid-1");
      expect(row).toBeDefined();
    });

    const folder = db
      .prepare("SELECT id FROM image_folders WHERE user_did = ? AND parent_id IS NULL")
      .get(DID) as { id: number };
    expect(folder).toBeDefined();

    const image = db.prepare("SELECT * FROM images WHERE filename = ?").get("uuid-1") as {
      folder_id: number;
      width: number;
      height: number;
      sizes: string;
    };
    expect(image.folder_id).toBe(folder.id);
    expect(image.width).toBe(1000);
    expect(image.height).toBe(1000);
    expect(JSON.parse(image.sizes)).toEqual({ thumb: { width: 300, height: 300, bytes: 1000 } });

    expect(closeSSE).toHaveBeenCalledWith("upload-1");
  });

  it("reuses the existing root folder on a second upload rather than creating another", async () => {
    vi.mocked(generateVariants).mockResolvedValue({
      sizes: {},
      sourceWidth: 100,
      sourceHeight: 100,
    });

    enqueue({
      uploadId: "upload-1",
      did: DID,
      uuid: "uuid-1",
      fileBuffer: Buffer.from("fake"),
      originalName: "photo1.jpg",
      outputDir: "/tmp/x",
    });
    await vi.waitFor(() => {
      expect(db.prepare("SELECT id FROM images WHERE filename = ?").get("uuid-1")).toBeDefined();
    });

    enqueue({
      uploadId: "upload-2",
      did: DID,
      uuid: "uuid-2",
      fileBuffer: Buffer.from("fake"),
      originalName: "photo2.jpg",
      outputDir: "/tmp/x",
    });
    await vi.waitFor(() => {
      expect(db.prepare("SELECT id FROM images WHERE filename = ?").get("uuid-2")).toBeDefined();
    });

    const folderCount = (
      db.prepare("SELECT COUNT(*) as n FROM image_folders WHERE user_did = ? AND parent_id IS NULL").get(DID) as {
        n: number;
      }
    ).n;
    expect(folderCount).toBe(1);
  });

  it("emits an error event and does not insert a row when variant generation fails", async () => {
    vi.mocked(generateVariants).mockRejectedValue(new Error("sharp blew up"));

    enqueue({
      uploadId: "upload-fail",
      did: DID,
      uuid: "uuid-fail",
      fileBuffer: Buffer.from("fake"),
      originalName: "bad.jpg",
      outputDir: "/tmp/does-not-exist-either",
    });

    await vi.waitFor(() => {
      expect(closeSSE).toHaveBeenCalledWith("upload-fail");
    });

    expect(emitEvent).toHaveBeenCalledWith("upload-fail", "error", { message: "Processing failed" });
    expect(db.prepare("SELECT id FROM images WHERE filename = ?").get("uuid-fail")).toBeUndefined();
  });
});
