import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Agent } from "@atproto/api";
import { db, pendingSubmissions } from "./db.server";
import { fetchBskyProfile } from "./blueskyProfile.server";
import {
  getSubmissionForReview,
  approveSubmission,
  rejectSubmission,
  reconcilePendingSubmission,
} from "./submissionReview.server";

vi.mock("./blueskyProfile.server", () => ({
  fetchBskyProfile: vi.fn(),
}));

const CONTRIBUTOR_DID = "did:plc:contributor";
const OWNER_DID = "did:plc:owner";
const RKEY = "abc123";
const DOCUMENT_URI = `at://${CONTRIBUTOR_DID}/site.standard.document/${RKEY}`;
const SITE_URI = `at://${OWNER_DID}/site.standard.publication/site-a`;

function stubFetchForDocument(
  value: Record<string, unknown> | "not-found",
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://plc.directory/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              service: [
                { id: "#atproto_pds", serviceEndpoint: "https://contributor-pds.example" },
              ],
            }),
        });
      }
      if (value === "not-found") {
        return Promise.resolve({ ok: false, status: 400 });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value }) });
    }),
  );
}

function makeAgent(overrides: {
  getRecord?: ReturnType<typeof vi.fn>;
  putRecord?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: overrides.getRecord ?? vi.fn(),
          putRecord: overrides.putRecord ?? vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    },
  } as unknown as Agent;
}

function siteRecord(groups: Array<{ slug: string; title: string; articles: unknown[] }>) {
  return {
    data: {
      cid: "site-a-cid",
      value: { scribe: { groups } },
    },
  };
}

beforeEach(() => {
  db.exec("DELETE FROM pending_submissions");
  vi.mocked(fetchBskyProfile).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSubmissionForReview", () => {
  it("returns null when there's no pending_submissions row for the document", async () => {
    const result = await getSubmissionForReview(CONTRIBUTOR_DID, RKEY);
    expect(result).toBeNull();
  });

  it("returns null when the row exists but isn't status: pending", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(DOCUMENT_URI, "not a fit");

    const result = await getSubmissionForReview(CONTRIBUTOR_DID, RKEY);
    expect(result).toBeNull();
  });

  it("returns the submission plus the cross-repo-read document fields", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    stubFetchForDocument({
      title: "My Article",
      content: { $type: "app.scribe.content.html", html: "<p>Hello</p>" },
      description: "A description",
      tags: ["tag1"],
      scribe: { coverImageUrl: "https://example.com/cover.jpg", createdAt: "2026-07-15T00:00:00.000Z" },
    });

    const result = await getSubmissionForReview(CONTRIBUTOR_DID, RKEY);

    expect(result).toEqual({
      documentUri: DOCUMENT_URI,
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      ownerDid: OWNER_DID,
      submittedAt: "2026-07-16T00:00:00.000Z",
      document: {
        title: "My Article",
        content: "<p>Hello</p>",
        description: "A description",
        splashImageUrl: "https://example.com/cover.jpg",
        tags: ["tag1"],
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    });
  });

  it("returns null when the cross-repo document read fails", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    stubFetchForDocument("not-found");

    const result = await getSubmissionForReview(CONTRIBUTOR_DID, RKEY);
    expect(result).toBeNull();
  });
});

describe("approveSubmission", () => {
  it("inserts the ArticleRef into the chosen group and deletes the pending_submissions row", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    stubFetchForDocument({
      title: "My Article",
      path: "/my-article",
      description: "A description",
      scribe: { createdAt: "2026-07-15T00:00:00.000Z" },
    });
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    const getRecord = vi.fn().mockResolvedValue(
      siteRecord([{ slug: "g1", title: "Group 1", articles: [] }]),
    );
    const agent = makeAgent({ getRecord, putRecord });

    const result = await approveSubmission(agent, OWNER_DID, DOCUMENT_URI, "g1");

    expect(result).toEqual({ ok: true });
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: OWNER_DID,
        collection: "site.standard.publication",
        rkey: "site-a",
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: [
              expect.objectContaining({
                slug: "g1",
                articles: [expect.objectContaining({ uri: DOCUMENT_URI, title: "My Article" })],
              }),
            ],
          }),
        }),
      }),
    );
    expect(pendingSubmissions.get(DOCUMENT_URI)).toBeUndefined();
  });

  it("guard: errors if the submission is no longer pending (already reviewed)", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(DOCUMENT_URI, "already handled");
    const putRecord = vi.fn();
    const agent = makeAgent({ putRecord });

    const result = await approveSubmission(agent, OWNER_DID, DOCUMENT_URI, "g1");

    expect(result).toEqual({
      ok: false,
      error: "This submission has already been reviewed.",
    });
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("guard: errors if the submission row doesn't exist at all", async () => {
    const agent = makeAgent();
    const result = await approveSubmission(agent, OWNER_DID, DOCUMENT_URI, "g1");
    expect(result).toEqual({
      ok: false,
      error: "This submission has already been reviewed.",
    });
  });

  it("errors if the chosen group doesn't exist on the site, without deleting the row", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    stubFetchForDocument({ title: "My Article", path: "/my-article" });
    const getRecord = vi.fn().mockResolvedValue(
      siteRecord([{ slug: "other-group", title: "Other", articles: [] }]),
    );
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ getRecord, putRecord });

    const result = await approveSubmission(agent, OWNER_DID, DOCUMENT_URI, "missing-group");

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('Group "missing-group" not found'),
    });
    expect(putRecord).not.toHaveBeenCalled();
    expect(pendingSubmissions.get(DOCUMENT_URI)).not.toBeUndefined();
  });

  it("errors when the Contributor's document can no longer be read", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    stubFetchForDocument("not-found");
    const agent = makeAgent();

    const result = await approveSubmission(agent, OWNER_DID, DOCUMENT_URI, "g1");

    expect(result).toEqual({
      ok: false,
      error: "Could not read the submitted article.",
    });
    expect(pendingSubmissions.get(DOCUMENT_URI)).not.toBeUndefined();
  });
});

describe("rejectSubmission", () => {
  it("sets status: rejected and stores the reason, without deleting the row", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );

    const result = rejectSubmission(DOCUMENT_URI, "Not a good fit for this site.");

    expect(result).toEqual({ ok: true });
    expect(pendingSubmissions.get(DOCUMENT_URI)).toEqual(
      expect.objectContaining({
        status: "rejected",
        rejectionReason: "Not a good fit for this site.",
      }),
    );
  });

  it("requires a non-empty reason", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );

    const result = rejectSubmission(DOCUMENT_URI, "   ");

    expect(result).toEqual({
      ok: false,
      error: "A reason is required to reject a submission.",
    });
    expect(pendingSubmissions.get(DOCUMENT_URI)?.status).toBe("pending");
  });

  it("guard: errors if the submission is no longer pending", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(DOCUMENT_URI, "first reason");

    const result = rejectSubmission(DOCUMENT_URI, "second reason");

    expect(result).toEqual({
      ok: false,
      error: "This submission has already been reviewed.",
    });
    expect(pendingSubmissions.get(DOCUMENT_URI)?.rejectionReason).toBe("first reason");
  });
});

describe("reconcilePendingSubmission", () => {
  function looseRecord(overrides: Record<string, unknown> = {}) {
    return {
      rkey: RKEY,
      uri: DOCUMENT_URI,
      cid: "doc-cid",
      value: {
        title: "My Article",
        path: "/my-article",
        site: "https://reader.scribe-atp.app/did:plc:contributor/site.standard.document/abc123",
        scribe: {
          pendingPublish: { siteUri: SITE_URI, submittedAt: "2026-07-16T00:00:00.000Z" },
        },
        ...overrides,
      },
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-op: returns null and makes no PDS calls when there's no scribe.pendingPublish", async () => {
    const record = looseRecord({ scribe: {} });
    const putRecord = vi.fn();
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, record);

    expect(result).toBeNull();
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("no-op: returns null without any network call when the local row is still status: pending", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const putRecord = vi.fn();
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, looseRecord());

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("rejected path: clears scribe.pendingPublish and removes the local row, without any cross-repo read", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "My Article",
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(DOCUMENT_URI, "Not a fit");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, looseRecord());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: CONTRIBUTOR_DID,
        collection: "site.standard.document",
        rkey: RKEY,
        record: expect.objectContaining({
          scribe: expect.not.objectContaining({ pendingPublish: expect.anything() }),
        }),
        swapRecord: "doc-cid",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ outcome: "rejected", rejectionReason: "Not a fit", siteUri: SITE_URI }),
    );
    expect(
      (result?.value.scribe as Record<string, unknown>).pendingPublish,
    ).toBeUndefined();
    expect(pendingSubmissions.get(DOCUMENT_URI)).toBeUndefined();
  });

  it("row missing + manifest read fails: no-op, leaves scribe.pendingPublish set", async () => {
    stubFetchForDocument("not-found");
    const putRecord = vi.fn();
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, looseRecord());

    expect(result).toBeNull();
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("row missing + document not found in any group: no-op", async () => {
    stubFetchForDocument({
      scribe: { domain: "example.com", basePath: "", groups: [{ slug: "g1", title: "Group 1", articles: [] }] },
    });
    const putRecord = vi.fn();
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, looseRecord());

    expect(result).toBeNull();
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("approved: finalizes the document — site, path, publishedAt, contributors credit, cleared pendingPublish", async () => {
    stubFetchForDocument({
      scribe: {
        domain: "example.com",
        basePath: "",
        groups: [
          {
            slug: "g1",
            title: "Group 1",
            articles: [{ uri: DOCUMENT_URI }],
          },
        ],
      },
    });
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: OWNER_DID,
      handle: "owner.bsky.social",
      displayName: "Site Owner",
    } as never);
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, looseRecord());

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: CONTRIBUTOR_DID,
        collection: "site.standard.document",
        rkey: RKEY,
        record: expect.objectContaining({
          site: SITE_URI,
          path: "/g1/my-article",
          contributors: [{ did: OWNER_DID, role: "Publisher", displayName: "Site Owner" }],
          scribe: expect.objectContaining({
            domain: "example.com",
            canonicalUrl: "https://example.com/g1/my-article",
          }),
        }),
        swapRecord: "doc-cid",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        outcome: "approved",
        siteUri: SITE_URI,
        siteTitle: "",
        value: expect.objectContaining({
          site: SITE_URI,
          path: "/g1/my-article",
        }),
      }),
    );
    expect(
      (result?.value.scribe as Record<string, unknown>).pendingPublish,
    ).toBeUndefined();
  });

  it("approved: dedup guard skips adding a second Publisher credit if the Owner is already listed", async () => {
    stubFetchForDocument({
      scribe: {
        domain: "example.com",
        basePath: "",
        groups: [{ slug: "g1", title: "Group 1", articles: [{ uri: DOCUMENT_URI }] }],
      },
    });
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: OWNER_DID,
      handle: "owner.bsky.social",
      displayName: "Site Owner",
    } as never);
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ putRecord });
    const record = looseRecord({
      contributors: [{ did: OWNER_DID, role: "Publisher", displayName: "Old Name" }],
    });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, record);

    expect(result?.value.contributors).toEqual([
      { did: OWNER_DID, role: "Publisher", displayName: "Old Name" },
    ]);
  });

  it("approved: falls back to handle, then DID, when the Owner has no displayName", async () => {
    stubFetchForDocument({
      scribe: {
        domain: "example.com",
        basePath: "",
        groups: [{ slug: "g1", title: "Group 1", articles: [{ uri: DOCUMENT_URI }] }],
      },
    });
    vi.mocked(fetchBskyProfile).mockResolvedValue(null);
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ putRecord });

    const result = await reconcilePendingSubmission(agent, CONTRIBUTOR_DID, looseRecord());

    expect(result?.value.contributors).toEqual([
      { did: OWNER_DID, role: "Publisher", displayName: OWNER_DID },
    ]);
  });
});
