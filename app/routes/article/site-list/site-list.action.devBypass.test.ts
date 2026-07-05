import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./site-list";
import { requireAuth, getAtpAgent } from "~/services/auth.server";

// Characterization tests for the site-list action's dev-bypass path
// (useRealOAuth: false). Companion to site-list.action.real.test.ts — see that
// file's header comment for context.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

const DID = "did:dev:testuser";
const SITE_SLUG = "my-site";

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
  vi.mocked(getAtpAgent).mockClear();
});

describe("action — dev-bypass path", () => {
  it("createGroup: validates unconditionally, then returns the optimistic literal without touching the agent", async () => {
    await expect(
      callAction({ _intent: "createGroup", title: "" }),
    ).resolves.toEqual({
      error: "Group title is required.",
    });
    await expect(
      callAction({ _intent: "createGroup", title: "Engineering" }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("deleteGroup: returns the optimistic literal without touching the agent", async () => {
    await expect(
      callAction({ _intent: "deleteGroup", rkey: "engineering" }),
    ).resolves.toEqual({ ok: true, deletedSlug: "engineering" });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("saveSite: returns the optimistic literal without parsing siteData or touching the agent", async () => {
    await expect(
      callAction({ _intent: "saveSite", siteData: "not valid json" }),
    ).resolves.toEqual({ ok: true });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("removeArticle: redirects without touching the agent", async () => {
    const response = (await callAction({
      _intent: "removeArticle",
      uri: "at://did/site.standard.document/a1",
    })) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("moveToDraft: redirects without touching the agent", async () => {
    const response = (await callAction({
      _intent: "moveToDraft",
      uri: "at://did/site.standard.document/a1",
    })) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("publishArticle: returns the optimistic literal without touching the agent", async () => {
    await expect(
      callAction({
        _intent: "publishArticle",
        uri: "at://did/site.standard.document/a1",
        groupSlug: "g1",
      }),
    ).resolves.toEqual({
      ok: true,
      uri: "at://did/site.standard.document/a1",
      groupSlug: "g1",
      notification: null,
    });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });
});
