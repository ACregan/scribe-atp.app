import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { action } from "./site-list";
import { requireAuth, getAtpAgent } from "~/services/auth.server";
import * as siteManifest from "~/services/siteManifest.server";
import * as contributorRoster from "~/services/contributorRoster.server";

// Dispatch-only smoke tests for the site-list action's real-OAuth path
// (useRealOAuth: true). This file used to characterize each intent's full
// PDS-orchestration behavior directly; that coverage now lives in
// app/services/siteManifest.server.test.ts, the module the action delegates
// to. What's left here: the route's own logic (formData parsing, pure
// validation not delegated to the module, and dispatch — does `_intent=X`
// call the right module function with the right args and pass its result
// straight through). validateGroupFields and computeDocumentPathUpdates stay
// real (pure, no I/O); every I/O-bearing export is mocked.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/siteManifest.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/siteManifest.server")>();
  return {
    ...actual,
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    saveSiteOrder: vi.fn(),
    removeArticleFromSite: vi.fn(),
    unpublishArticle: vi.fn(),
  };
});

vi.mock("~/services/contributorRoster.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/contributorRoster.server")>();
  return {
    ...actual,
    inviteContributor: vi.fn(),
    removeContributor: vi.fn(),
  };
});

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";
const AGENT_SENTINEL = { sentinel: "agent" } as unknown as Agent;

function makeRequest(entries: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/list/my-site", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset().mockResolvedValue(AGENT_SENTINEL);
  vi.mocked(siteManifest.createGroup).mockReset();
  vi.mocked(siteManifest.deleteGroup).mockReset();
  vi.mocked(siteManifest.saveSiteOrder).mockReset();
  vi.mocked(siteManifest.removeArticleFromSite).mockReset();
  vi.mocked(siteManifest.unpublishArticle).mockReset();
  vi.mocked(contributorRoster.inviteContributor).mockReset();
  vi.mocked(contributorRoster.removeContributor).mockReset();
});

describe("action — createGroup", () => {
  it("rejects a missing title without calling the module", async () => {
    await expect(
      callAction({ _intent: "createGroup", title: "" }),
    ).resolves.toEqual({
      error: "Group title is required.",
    });
    expect(siteManifest.createGroup).not.toHaveBeenCalled();
  });

  it("rejects an invalid slug override without calling the module", async () => {
    await expect(
      callAction({
        _intent: "createGroup",
        title: "Engineering",
        slug: "bad slug!",
      }),
    ).resolves.toEqual({
      error: "URL path must be lowercase letters, numbers and hyphens only.",
    });
    expect(siteManifest.createGroup).not.toHaveBeenCalled();
  });

  it("dispatches to createGroup with the derived slug and passes its result through", async () => {
    vi.mocked(siteManifest.createGroup).mockResolvedValue({ ok: true });

    await expect(
      callAction({ _intent: "createGroup", title: "Engineering" }),
    ).resolves.toEqual({ ok: true });

    expect(siteManifest.createGroup).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      { title: "Engineering", slug: "engineering" },
    );
  });
});

describe("action — deleteGroup", () => {
  it("rejects a missing group slug without calling the module", async () => {
    await expect(
      callAction({ _intent: "deleteGroup", rkey: "" }),
    ).resolves.toEqual({
      ok: false,
      error: "Missing group ID.",
    });
    expect(siteManifest.deleteGroup).not.toHaveBeenCalled();
  });

  it("dispatches to deleteGroup and passes its result through", async () => {
    vi.mocked(siteManifest.deleteGroup).mockResolvedValue({
      ok: true,
      deletedSlug: "engineering",
    });

    await expect(
      callAction({ _intent: "deleteGroup", rkey: "engineering" }),
    ).resolves.toEqual({ ok: true, deletedSlug: "engineering" });

    expect(siteManifest.deleteGroup).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      "engineering",
    );
  });
});

describe("action — saveSite", () => {
  it("rejects missing site data without calling the module", async () => {
    await expect(callAction({ _intent: "saveSite" })).resolves.toEqual({
      error: "No data.",
    });
    expect(siteManifest.saveSiteOrder).not.toHaveBeenCalled();
  });

  it("dispatches to saveSiteOrder with the parsed tree and passes its result through", async () => {
    vi.mocked(siteManifest.saveSiteOrder).mockResolvedValue({ ok: true });
    const groups = [{ slug: "g1", title: "G1", articles: [] }];
    const ungroupedArticles: unknown[] = [];

    await expect(
      callAction({
        _intent: "saveSite",
        siteData: JSON.stringify({ groups, ungroupedArticles }),
      }),
    ).resolves.toEqual({ ok: true });

    expect(siteManifest.saveSiteOrder).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      { groups, ungroupedArticles },
    );
  });
});

describe("action — removeArticle", () => {
  const articleUri = `at://${DID}/site.standard.document/article1`;

  it("redirects immediately when uri is missing, without calling the module", async () => {
    const response = (await callAction({
      _intent: "removeArticle",
      uri: "",
    })) as Response;
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(siteManifest.removeArticleFromSite).not.toHaveBeenCalled();
  });

  it("dispatches to removeArticleFromSite and always redirects", async () => {
    vi.mocked(siteManifest.removeArticleFromSite).mockResolvedValue({
      ok: true,
    });

    const response = (await callAction({
      _intent: "removeArticle",
      uri: articleUri,
    })) as Response;

    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(siteManifest.removeArticleFromSite).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      articleUri,
    );
  });
});

describe("action — inviteContributor", () => {
  it("rejects a missing contributorDid without calling the module", async () => {
    await expect(
      callAction({ _intent: "inviteContributor", contributorDid: "" }),
    ).resolves.toEqual({ error: "No Bluesky account selected." });
    expect(contributorRoster.inviteContributor).not.toHaveBeenCalled();
  });

  it("dispatches to inviteContributor and passes its result through", async () => {
    vi.mocked(contributorRoster.inviteContributor).mockResolvedValue({ ok: true });

    await expect(
      callAction({
        _intent: "inviteContributor",
        contributorDid: "did:plc:newcontributor",
      }),
    ).resolves.toEqual({ ok: true });

    expect(contributorRoster.inviteContributor).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      "did:plc:newcontributor",
    );
  });
});

describe("action — removeContributor", () => {
  it("rejects a missing contributorDid without calling the module", async () => {
    await expect(
      callAction({ _intent: "removeContributor", contributorDid: "" }),
    ).resolves.toEqual({ ok: false, error: "Missing contributor." });
    expect(contributorRoster.removeContributor).not.toHaveBeenCalled();
  });

  it("dispatches to removeContributor and returns the removed DID on success", async () => {
    vi.mocked(contributorRoster.removeContributor).mockResolvedValue({ ok: true });

    await expect(
      callAction({
        _intent: "removeContributor",
        contributorDid: "did:plc:existingcontributor",
      }),
    ).resolves.toEqual({ ok: true, removedDid: "did:plc:existingcontributor" });

    expect(contributorRoster.removeContributor).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      "did:plc:existingcontributor",
    );
  });

  it("surfaces a module failure as ok:false with a stringified error", async () => {
    vi.mocked(contributorRoster.removeContributor).mockResolvedValue({
      ok: false,
      error: new Error("InvalidSwap"),
    });

    await expect(
      callAction({
        _intent: "removeContributor",
        contributorDid: "did:plc:existingcontributor",
      }),
    ).resolves.toEqual({ ok: false, error: "Error: InvalidSwap" });
  });
});

describe("action — moveToDraft (unpublish, ADR 0013)", () => {
  const articleUri = `at://${DID}/site.standard.document/article1`;

  it("redirects immediately when uri is missing, without calling the module", async () => {
    const response = (await callAction({
      _intent: "moveToDraft",
      uri: "",
    })) as Response;
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(siteManifest.unpublishArticle).not.toHaveBeenCalled();
  });

  it("dispatches to unpublishArticle and always redirects", async () => {
    vi.mocked(siteManifest.unpublishArticle).mockResolvedValue({ ok: true });

    const response = (await callAction({
      _intent: "moveToDraft",
      uri: articleUri,
    })) as Response;

    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(siteManifest.unpublishArticle).toHaveBeenCalledWith(
      AGENT_SENTINEL,
      DID,
      SITE_SLUG,
      articleUri,
    );
  });
});
