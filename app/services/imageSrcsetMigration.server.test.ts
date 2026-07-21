import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Agent } from "@atproto/api";
import type { DocumentRecord } from "./documentRepository.server";

const mockListDocuments = vi.fn();
const mockPutDocument = vi.fn();

vi.mock("./documentRepository.server", () => ({
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
  putDocument: (...args: unknown[]) => mockPutDocument(...args),
}));

// getImageDb() is a lazy module-level singleton opened once against
// process.env.IMAGE_DB_PATH — a real temp file (not ":memory:") is required
// so this test's own seeding connection and the module's own connection
// share the same underlying data; two independent ":memory:" connections
// would each get their own private, empty database.
const dbPath = path.join(os.tmpdir(), `image-srcset-migration-test-${Date.now()}.db`);
process.env.IMAGE_DB_PATH = dbPath;

let seedDb: Database.Database;

beforeAll(() => {
  seedDb = new Database(dbPath);
  seedDb.exec(`
    CREATE TABLE images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_did TEXT NOT NULL,
      folder_id INTEGER,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      sizes TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
});

afterAll(() => {
  seedDb.close();
  fs.rmSync(dbPath, { force: true });
});

function seedImage(userDid: string, filename: string, sizes: Record<string, { width: number; height: number }>) {
  seedDb
    .prepare(
      "INSERT INTO images (user_did, filename, original_name, width, height, sizes) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userDid, filename, `${filename}.jpg`, 3000, 2000, JSON.stringify(sizes));
}

const DID = "did:plc:owner";
const ORIGIN = "https://norobots.blog";

function doc(rkey: string, html: string, title = "Untitled"): DocumentRecord {
  return {
    uri: `at://${DID}/site.standard.document/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    value: {
      title,
      content: { $type: "app.scribe.content.html", html },
    },
  };
}

const { buildMigrationPlan, applyMigrationPlan } = await import(
  "./imageSrcsetMigration.server"
);

const mockAgent = {} as Agent;

describe("buildMigrationPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedDb.exec("DELETE FROM images");
  });

  it("skips images that already have a srcset", async () => {
    seedImage(DID, "abc", { "600": { width: 600, height: 400 }, max: { width: 3000, height: 2000 } });
    mockListDocuments.mockResolvedValue([
      doc(
        "r1",
        `<img src="${ORIGIN}/image-storage/${DID}/abc/max.webp" srcset="already here 600w">`,
      ),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
  });

  it("leaves a non-Scribe (external) image untouched", async () => {
    mockListDocuments.mockResolvedValue([
      doc("r1", `<img src="https://elsewhere.example/photo.jpg">`),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
  });

  it("skips an image with no matching row in the Image Service DB", async () => {
    // No seedImage call — this filename doesn't exist in the DB, simulating
    // an image deleted from the library since the article was published.
    mockListDocuments.mockResolvedValue([
      doc("r1", `<img src="${ORIGIN}/image-storage/${DID}/deleted-uuid/max.webp">`),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
  });

  it("leaves a thumb-only image untouched (single candidate, nothing to choose between)", async () => {
    seedImage(DID, "small", { thumb: { width: 300, height: 200 } });
    mockListDocuments.mockResolvedValue([
      doc("r1", `<img src="${ORIGIN}/image-storage/${DID}/small/thumb.webp">`),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
  });

  it("adds srcset and the generic sizes default for a multi-variant image with no manual width", async () => {
    seedImage(DID, "abc", {
      "600": { width: 600, height: 400 },
      "1200": { width: 1200, height: 800 },
      max: { width: 3000, height: 2000 },
    });
    mockListDocuments.mockResolvedValue([
      doc("r1", `<img src="${ORIGIN}/image-storage/${DID}/abc/max.webp" alt="a photo">`, "My Post"),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(1);
    expect(plan.totalImages).toBe(1);

    const change = plan.changes[0];
    expect(change.title).toBe("My Post");
    expect(change.images).toHaveLength(1);
    expect(change.images[0].afterTag).toContain(
      `srcset="${ORIGIN}/image-storage/${DID}/abc/600.webp 600w, ${ORIGIN}/image-storage/${DID}/abc/1200.webp 1200w, ${ORIGIN}/image-storage/${DID}/abc/max.webp 3000w"`,
    );
    expect(change.images[0].afterTag).toContain('sizes="100vw"');
    expect(change.updatedHtml).toContain("srcset=");
  });

  it("orders srcset entries by VARIANT_ORDER (thumb, 600, 1200, 1800, max), not raw object key order", async () => {
    // Object.entries() on this exact key set would numeric-sort "600" and
    // "1200" ahead of "thumb", producing 600,1200,thumb,max instead of the
    // canonical thumb,600,1200,max — this fixture reproduces that real
    // production case (a portrait image, hence the non-round widths).
    seedImage(DID, "portrait", {
      "600": { width: 237, height: 600 },
      "1200": { width: 474, height: 1200 },
      thumb: { width: 118, height: 300 },
      max: { width: 1185, height: 3000 },
    });
    mockListDocuments.mockResolvedValue([
      doc("r1", `<img src="${ORIGIN}/image-storage/${DID}/portrait/max.webp">`),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes[0].images[0].afterTag).toContain(
      `srcset="${ORIGIN}/image-storage/${DID}/portrait/thumb.webp 118w, ${ORIGIN}/image-storage/${DID}/portrait/600.webp 237w, ${ORIGIN}/image-storage/${DID}/portrait/1200.webp 474w, ${ORIGIN}/image-storage/${DID}/portrait/max.webp 1185w"`,
    );
  });

  it("uses the image's own inline width as the sizes value when one is set", async () => {
    seedImage(DID, "abc", {
      "600": { width: 600, height: 400 },
      max: { width: 3000, height: 2000 },
    });
    mockListDocuments.mockResolvedValue([
      doc(
        "r1",
        `<img src="${ORIGIN}/image-storage/${DID}/abc/max.webp" style="width: 400px; max-width: 100%;">`,
      ),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes[0].images[0].afterTag).toContain('sizes="400px"');
  });

  it("resolves the uploader's did from the URL, not the document owner's, for site-shared images", async () => {
    const uploaderDid = "did:plc:contributor";
    seedImage(uploaderDid, "shared", {
      "600": { width: 600, height: 400 },
      max: { width: 3000, height: 2000 },
    });
    mockListDocuments.mockResolvedValue([
      doc("r1", `<img src="${ORIGIN}/image-storage/${uploaderDid}/shared/max.webp">`),
    ]);

    // Called with the site owner's DID (DID), but the image was uploaded by
    // a different Contributor — the lookup must use the did embedded in the
    // URL itself, not the document owner's.
    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].images[0].afterTag).toContain(uploaderDid);
  });

  it("excludes a document entirely when it has no eligible images", async () => {
    mockListDocuments.mockResolvedValue([
      doc("r1", "<p>No images here.</p>"),
      doc("r2", ""),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
    expect(plan.totalImages).toBe(0);
  });
});

describe("buildMigrationPlan — repairing the stale 700px sizes value", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedDb.exec("DELETE FROM images");
  });

  it("repairs sizes to 100vw on an already-migrated image with no manual width, leaving src/srcset untouched", async () => {
    const srcset = `${ORIGIN}/image-storage/${DID}/abc/600.webp 600w, ${ORIGIN}/image-storage/${DID}/abc/max.webp 3000w`;
    mockListDocuments.mockResolvedValue([
      doc(
        "r1",
        `<img src="${ORIGIN}/image-storage/${DID}/abc/max.webp" alt="" style="max-width: 100%;" srcset="${srcset}" sizes="(max-width: 768px) 100vw, 700px">`,
        "My Post",
      ),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].images).toHaveLength(1);

    const { afterTag } = plan.changes[0].images[0];
    expect(afterTag).toContain('sizes="100vw"');
    expect(afterTag).toContain(`srcset="${srcset}"`); // untouched
    expect(afterTag).toContain(`src="${ORIGIN}/image-storage/${DID}/abc/max.webp"`); // untouched
  });

  it("repairs sizes to the manual width when the image has one, not 100vw", async () => {
    mockListDocuments.mockResolvedValue([
      doc(
        "r1",
        `<img src="${ORIGIN}/image-storage/${DID}/abc/max.webp" style="width: 400px; max-width: 100%;" srcset="${ORIGIN}/image-storage/${DID}/abc/max.webp 3000w, ${ORIGIN}/image-storage/${DID}/abc/600.webp 600w" sizes="(max-width: 768px) 100vw, 700px">`,
      ),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes[0].images[0].afterTag).toContain('sizes="400px"');
  });

  it("does not touch an image that already has srcset and a correct (non-stale) sizes value", async () => {
    mockListDocuments.mockResolvedValue([
      doc(
        "r1",
        `<img src="${ORIGIN}/image-storage/${DID}/abc/max.webp" srcset="${ORIGIN}/image-storage/${DID}/abc/max.webp 3000w, ${ORIGIN}/image-storage/${DID}/abc/600.webp 600w" sizes="100vw">`,
      ),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
  });

  it("does not touch an image with a stale-looking sizes value that isn't Scribe-hosted", async () => {
    mockListDocuments.mockResolvedValue([
      doc(
        "r1",
        `<img src="https://elsewhere.example/photo.jpg" srcset="https://elsewhere.example/photo.jpg 600w, https://elsewhere.example/photo-big.jpg 1200w" sizes="(max-width: 768px) 100vw, 700px">`,
      ),
    ]);

    const plan = await buildMigrationPlan(mockAgent, DID);
    expect(plan.changes).toHaveLength(0);
  });
});

describe("applyMigrationPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls putDocument with the updated html merged into the existing record, cid preserved", async () => {
    const existing = doc("r1", "irrelevant — value.content is what gets merged", "My Post");
    mockListDocuments.mockResolvedValue([existing]);
    mockPutDocument.mockResolvedValue({ cid: "new-cid" });

    const plan = {
      changes: [
        {
          uri: existing.uri,
          rkey: "r1",
          cid: existing.cid,
          title: "My Post",
          images: [{ filename: "abc", beforeTag: "<img>", afterTag: "<img srcset>" }],
          updatedHtml: "<p>updated</p>",
        },
      ],
      totalImages: 1,
    };

    const results = await applyMigrationPlan(mockAgent, DID, plan);

    expect(results).toEqual([{ rkey: "r1", ok: true }]);
    expect(mockPutDocument).toHaveBeenCalledWith(
      mockAgent,
      DID,
      "r1",
      {
        title: "My Post",
        content: { $type: "app.scribe.content.html", html: "<p>updated</p>" },
      },
      "cid-r1",
    );
  });

  it("reports a per-document failure without throwing, when putDocument rejects", async () => {
    const existing = doc("r1", "html", "My Post");
    mockListDocuments.mockResolvedValue([existing]);
    mockPutDocument.mockRejectedValue(new Error("CID mismatch"));

    const plan = {
      changes: [
        {
          uri: existing.uri,
          rkey: "r1",
          cid: existing.cid,
          title: "My Post",
          images: [{ filename: "abc", beforeTag: "<img>", afterTag: "<img srcset>" }],
          updatedHtml: "<p>updated</p>",
        },
      ],
      totalImages: 1,
    };

    const results = await applyMigrationPlan(mockAgent, DID, plan);
    expect(results).toEqual([{ rkey: "r1", ok: false, error: "Error: CID mismatch" }]);
  });

  it("reports failure for a document that no longer exists", async () => {
    mockListDocuments.mockResolvedValue([]); // record was deleted between preview and apply

    const plan = {
      changes: [
        {
          uri: "at://did/site.standard.document/gone",
          rkey: "gone",
          cid: "old-cid",
          title: "Deleted Post",
          images: [{ filename: "abc", beforeTag: "<img>", afterTag: "<img srcset>" }],
          updatedHtml: "<p>updated</p>",
        },
      ],
      totalImages: 1,
    };

    const results = await applyMigrationPlan(mockAgent, DID, plan);
    expect(results).toEqual([
      { rkey: "gone", ok: false, error: "Record no longer exists" },
    ]);
    expect(mockPutDocument).not.toHaveBeenCalled();
  });
});
