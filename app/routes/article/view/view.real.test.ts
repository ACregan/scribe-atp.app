import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./view";
import { requireAtpAgent } from "~/services/auth.server";
import { getPublicDocumentBySlug } from "~/services/submissionReview.server";

// Found live 2026-07-19 — a Contributor's read-only view of someone else's
// site links View at every article on that site, not just their own. The
// caller's own repo never has a record for an article they didn't write, so
// the loader needs to resolve cross-repo via the article's real owner DID
// (threaded through by ArticleItem as the ?ownerDid= query param) instead of
// always scanning the caller's own repo.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/submissionReview.server", () => ({
  getPublicDocumentBySlug: vi.fn(),
}));

const DID = "did:plc:owner";
const OTHER_DID = "did:plc:other-owner";

function makeAgent(overrides: { listRecords?: ReturnType<typeof vi.fn> } = {}) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords:
            overrides.listRecords ?? vi.fn().mockResolvedValue({ data: { records: [] } }),
        },
      },
    },
  } as unknown as Agent;
}

function callLoader(url: string) {
  return loader({
    request: new Request(url),
    params: { articleUrl: "my-article" },
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset().mockResolvedValue({
    agent: makeAgent(),
    did: DID,
    handle: DID,
  });
  vi.mocked(getPublicDocumentBySlug).mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("loader", () => {
  it("scans the caller's own repo when no ownerDid param is present (unchanged default behaviour)", async () => {
    const listRecords = vi.fn().mockResolvedValue({
      data: {
        records: [
          {
            uri: `at://${DID}/site.standard.document/abc`,
            cid: "cid-1",
            value: { title: "My Article", path: "/my-article" },
          },
        ],
      },
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent({ listRecords }),
      did: DID,
      handle: DID,
    });

    const result = await callLoader("http://localhost/article/view/my-article");

    expect(result.title).toBe("My Article");
    expect(getPublicDocumentBySlug).not.toHaveBeenCalled();
  });

  it("scans the caller's own repo when ownerDid matches the caller (no-op cross-repo path)", async () => {
    const listRecords = vi.fn().mockResolvedValue({
      data: {
        records: [
          {
            uri: `at://${DID}/site.standard.document/abc`,
            cid: "cid-1",
            value: { title: "My Article", path: "/my-article" },
          },
        ],
      },
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent({ listRecords }),
      did: DID,
      handle: DID,
    });

    const result = await callLoader(
      `http://localhost/article/view/my-article?ownerDid=${DID}`,
    );

    expect(result.title).toBe("My Article");
    expect(getPublicDocumentBySlug).not.toHaveBeenCalled();
  });

  it("resolves cross-repo via the public read when ownerDid names a different account", async () => {
    vi.mocked(getPublicDocumentBySlug).mockResolvedValue({
      uri: `at://${OTHER_DID}/site.standard.document/xyz`,
      cid: "cid-2",
      value: { title: "Someone Else's Article", path: "/my-article" },
    });

    const result = await callLoader(
      `http://localhost/article/view/my-article?ownerDid=${OTHER_DID}`,
    );

    expect(getPublicDocumentBySlug).toHaveBeenCalledWith(OTHER_DID, "my-article");
    expect(result.title).toBe("Someone Else's Article");
  });

  it("builds readerUrl against the article's real owner, not the caller, on the cross-repo path", async () => {
    vi.mocked(getPublicDocumentBySlug).mockResolvedValue({
      uri: `at://${OTHER_DID}/site.standard.document/xyz`,
      cid: "cid-2",
      value: { title: "Someone Else's Article", path: "/my-article" },
    });

    const result = await callLoader(
      `http://localhost/article/view/my-article?ownerDid=${OTHER_DID}`,
    );

    expect(result.readerUrl).toContain(OTHER_DID);
    expect(result.readerUrl).not.toContain(DID);
  });

  it("throws a 404 when the cross-repo public read finds nothing", async () => {
    vi.mocked(getPublicDocumentBySlug).mockResolvedValue(null);

    const thrown = await callLoader(
      `http://localhost/article/view/my-article?ownerDid=${OTHER_DID}`,
    ).catch((err) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });
});
