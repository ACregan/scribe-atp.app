import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import type { DocumentRecord } from "./documentRepository.server";

const mockListDocuments = vi.fn();
const mockPutDocument = vi.fn();

vi.mock("./documentRepository.server", () => ({
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
  putDocument: (...args: unknown[]) => mockPutDocument(...args),
}));

const DID = "did:plc:owner";

function doc(
  rkey: string,
  value: Record<string, unknown>,
  cid = `cid-${rkey}`,
): DocumentRecord {
  return {
    uri: `at://${DID}/site.standard.document/${rkey}`,
    cid,
    rkey,
    value,
  };
}

const { buildRepairPlan, applyRepairPlan } = await import(
  "./publishedAtRepair.server"
);

const mockAgent = {} as Agent;

describe("buildRepairPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flags a document with an empty-string publishedAt", async () => {
    mockListDocuments.mockResolvedValue([
      doc("a1", {
        title: "Broken Draft",
        publishedAt: "",
        scribe: { createdAt: "2026-01-01T00:00:00.000Z" },
      }),
    ]);

    const plan = await buildRepairPlan(mockAgent, DID);

    expect(plan.changes).toEqual([
      {
        uri: `at://${DID}/site.standard.document/a1`,
        rkey: "a1",
        title: "Broken Draft",
        after: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("falls back to updatedAt when scribe.createdAt is missing", async () => {
    mockListDocuments.mockResolvedValue([
      doc("a1", {
        title: "Broken Draft",
        publishedAt: "",
        updatedAt: "2026-02-02T00:00:00.000Z",
      }),
    ]);

    const plan = await buildRepairPlan(mockAgent, DID);

    expect(plan.changes[0].after).toBe("2026-02-02T00:00:00.000Z");
  });

  it("leaves a document with a real publishedAt untouched", async () => {
    mockListDocuments.mockResolvedValue([
      doc("a1", { title: "Fine", publishedAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    const plan = await buildRepairPlan(mockAgent, DID);

    expect(plan.changes).toEqual([]);
  });

  it("leaves a document with no publishedAt field at all untouched (not the corrupted case)", async () => {
    mockListDocuments.mockResolvedValue([doc("a1", { title: "Never saved" })]);

    const plan = await buildRepairPlan(mockAgent, DID);

    expect(plan.changes).toEqual([]);
  });
});

describe("applyRepairPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls putDocument with publishedAt set, cid preserved, rest of the record untouched", async () => {
    const record = doc("a1", {
      title: "Broken Draft",
      publishedAt: "",
      site: "https://reader.scribe-atp.app/did:plc:owner/site.standard.document/a1",
      scribe: { createdAt: "2026-01-01T00:00:00.000Z" },
    });
    mockListDocuments.mockResolvedValue([record]);
    mockPutDocument.mockResolvedValue({ cid: "new-cid" });

    const results = await applyRepairPlan(mockAgent, DID, {
      changes: [
        {
          uri: record.uri,
          rkey: "a1",
          title: "Broken Draft",
          after: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(mockPutDocument).toHaveBeenCalledWith(
      mockAgent,
      DID,
      "a1",
      {
        ...record.value,
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
      "cid-a1",
    );
    expect(results).toEqual([{ rkey: "a1", ok: true }]);
  });

  it("reports a per-document failure without throwing, when putDocument rejects", async () => {
    const record = doc("a1", { title: "Broken Draft", publishedAt: "" });
    mockListDocuments.mockResolvedValue([record]);
    mockPutDocument.mockRejectedValue(new Error("CID mismatch"));

    const results = await applyRepairPlan(mockAgent, DID, {
      changes: [{ uri: record.uri, rkey: "a1", title: "Broken Draft", after: "x" }],
    });

    expect(results).toEqual([
      { rkey: "a1", ok: false, error: "Error: CID mismatch" },
    ]);
  });

  it("reports failure for a document that no longer exists", async () => {
    mockListDocuments.mockResolvedValue([]);

    const results = await applyRepairPlan(mockAgent, DID, {
      changes: [{ uri: "at://x/site.standard.document/gone", rkey: "gone", title: "Gone", after: "x" }],
    });

    expect(results).toEqual([
      { rkey: "gone", ok: false, error: "Record no longer exists" },
    ]);
  });
});
