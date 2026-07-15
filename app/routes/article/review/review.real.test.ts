import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./review";
import { requireAtpAgent } from "~/services/auth.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";
import {
  getSubmissionForReview,
  approveSubmission,
  rejectSubmission,
} from "~/services/submissionReview.server";
import * as siteManifest from "~/services/siteManifest.server";
import { db, pendingSubmissions } from "~/services/db.server";

// Dispatch-only, characterization-style tests — submissionReview.server.ts's
// own functions have full behavioral coverage in
// submissionReview.server.test.ts. What's tested here: the route's own
// logic (params → documentUri, the ownerDid guard on both loader and
// action, cross-repo site-record fetch for the group list, the
// create-new-group-inline branch, and dispatch).

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/blueskyProfile.server", () => ({
  fetchBskyProfile: vi.fn(),
}));

vi.mock("~/services/submissionReview.server", () => ({
  getSubmissionForReview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));

vi.mock("~/services/siteManifest.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/siteManifest.server")>();
  return { ...actual, createGroup: vi.fn() };
});

const OWNER_DID = "did:plc:owner";
const CONTRIBUTOR_DID = "did:plc:contributor";
const RKEY = "abc123";
const SITE_URI = `at://${OWNER_DID}/site.standard.publication/site-a`;
const DOCUMENT_URI = `at://${CONTRIBUTOR_DID}/site.standard.document/${RKEY}`;
const PARAMS = { contributorDid: CONTRIBUTOR_DID, rkey: RKEY };

function makeAgent(siteScribe: Record<string, unknown> = { title: "Site A", groups: [] }) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: vi.fn().mockResolvedValue({
            data: { cid: "site-a-cid", value: { scribe: siteScribe } },
          }),
        },
      },
    },
  } as unknown as Agent;
}

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/article/review");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/review", {
    method: "POST",
    body: formData,
  });
}

function callLoader() {
  return loader({
    request: makeRequest(),
    params: PARAMS,
  } as unknown as Parameters<typeof loader>[0]);
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
    params: PARAMS,
  } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset().mockResolvedValue({
    agent: makeAgent(),
    did: OWNER_DID,
    handle: OWNER_DID,
  });
  vi.mocked(getSubmissionForReview).mockReset();
  vi.mocked(approveSubmission).mockReset();
  vi.mocked(rejectSubmission).mockReset();
  vi.mocked(fetchBskyProfile).mockReset().mockResolvedValue(null);
  vi.mocked(siteManifest.createGroup).mockReset();
  db.exec("DELETE FROM pending_submissions");
});

describe("loader", () => {
  it("404s when getSubmissionForReview returns null", async () => {
    vi.mocked(getSubmissionForReview).mockResolvedValue(null);

    const thrown = await callLoader().catch((err) => err);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it("404s when the submission belongs to a different Owner than the caller", async () => {
    vi.mocked(getSubmissionForReview).mockResolvedValue({
      documentUri: DOCUMENT_URI,
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      ownerDid: "did:plc:someoneelse",
      submittedAt: "2026-07-16T00:00:00.000Z",
      document: {
        title: "Title",
        content: "<p>x</p>",
        description: "",
        splashImageUrl: "",
        tags: [],
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    });

    const thrown = await callLoader().catch((err) => err);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it("returns the submission merged with the site's groups and the Contributor's profile", async () => {
    vi.mocked(getSubmissionForReview).mockResolvedValue({
      documentUri: DOCUMENT_URI,
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      ownerDid: OWNER_DID,
      submittedAt: "2026-07-16T00:00:00.000Z",
      document: {
        title: "Submitted Article",
        content: "<p>Hello</p>",
        description: "A description",
        splashImageUrl: "",
        tags: ["tag1"],
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent({
        title: "Site A",
        groups: [{ slug: "g1", title: "Group 1" }],
      }),
      did: OWNER_DID,
      handle: OWNER_DID,
    });
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: CONTRIBUTOR_DID,
      handle: "contributor.bsky.social",
      displayName: "Cora Tributor",
    } as never);

    const result = await callLoader();

    expect(result).toEqual(
      expect.objectContaining({
        siteSlug: "site-a",
        siteTitle: "Site A",
        groups: [{ slug: "g1", title: "Group 1" }],
        contributorHandle: "contributor.bsky.social",
        contributorDisplayName: "Cora Tributor",
        document: expect.objectContaining({ title: "Submitted Article" }),
      }),
    );
  });
});

describe("action", () => {
  it("returns 'Submission not found' when no local pending_submissions row exists", async () => {
    const result = await callAction({ _intent: "approveSubmission", groupSlug: "g1" });
    expect(result).toEqual({ ok: false, error: "Submission not found." });
    expect(approveSubmission).not.toHaveBeenCalled();
  });

  it("returns 'Submission not found' when the local row belongs to a different owner", async () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      "did:plc:someoneelse",
      "Title",
      "2026-07-16T00:00:00.000Z",
    );

    const result = await callAction({ _intent: "approveSubmission", groupSlug: "g1" });
    expect(result).toEqual({ ok: false, error: "Submission not found." });
  });

  describe("approveSubmission intent", () => {
    beforeEach(() => {
      pendingSubmissions.create(
        DOCUMENT_URI,
        CONTRIBUTOR_DID,
        SITE_URI,
        OWNER_DID,
        "Title",
        "2026-07-16T00:00:00.000Z",
      );
    });

    it("dispatches straight to approveSubmission with the parsed siteSlug and groupSlug", async () => {
      vi.mocked(approveSubmission).mockResolvedValue({ ok: true });

      const result = await callAction({ _intent: "approveSubmission", groupSlug: "g1" });

      expect(approveSubmission).toHaveBeenCalledWith(
        expect.anything(),
        OWNER_DID,
        DOCUMENT_URI,
        "g1",
      );
      expect(result).toEqual({ ok: true, siteSlug: "site-a" });
    });

    it("creates a new group first when groupSlug is the new-group sentinel", async () => {
      vi.mocked(siteManifest.createGroup).mockResolvedValue({ ok: true });
      vi.mocked(approveSubmission).mockResolvedValue({ ok: true });

      const result = await callAction({
        _intent: "approveSubmission",
        groupSlug: "__new__",
        newGroupTitle: "Engineering",
      });

      expect(siteManifest.createGroup).toHaveBeenCalledWith(
        expect.anything(),
        OWNER_DID,
        "site-a",
        { title: "Engineering", slug: "engineering" },
      );
      expect(approveSubmission).toHaveBeenCalledWith(
        expect.anything(),
        OWNER_DID,
        DOCUMENT_URI,
        "engineering",
      );
      expect(result).toEqual({ ok: true, siteSlug: "site-a" });
    });

    it("requires a new group title when creating inline", async () => {
      const result = await callAction({ _intent: "approveSubmission", groupSlug: "__new__" });

      expect(result).toEqual({ ok: false, error: "New group title is required." });
      expect(approveSubmission).not.toHaveBeenCalled();
    });

    it("surfaces a group-creation error without calling approveSubmission", async () => {
      vi.mocked(siteManifest.createGroup).mockResolvedValue({
        error: "A group with this name already exists.",
      });

      const result = await callAction({
        _intent: "approveSubmission",
        groupSlug: "__new__",
        newGroupTitle: "Engineering",
      });

      expect(result).toEqual({
        ok: false,
        error: "A group with this name already exists.",
      });
      expect(approveSubmission).not.toHaveBeenCalled();
    });
  });

  describe("rejectSubmission intent", () => {
    beforeEach(() => {
      pendingSubmissions.create(
        DOCUMENT_URI,
        CONTRIBUTOR_DID,
        SITE_URI,
        OWNER_DID,
        "Title",
        "2026-07-16T00:00:00.000Z",
      );
    });

    it("dispatches to rejectSubmission with the document URI and reason", async () => {
      vi.mocked(rejectSubmission).mockReturnValue({ ok: true });

      const result = await callAction({ _intent: "rejectSubmission", reason: "Not a fit" });

      expect(rejectSubmission).toHaveBeenCalledWith(DOCUMENT_URI, "Not a fit");
      expect(result).toEqual({ ok: true, siteSlug: "site-a" });
    });
  });
});
