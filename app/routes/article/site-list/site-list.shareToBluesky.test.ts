import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { action } from "./site-list";
import { requireAuth, getAtpAgent } from "~/services/auth.server";

// Behavioral coverage for the shareToBluesky intent specifically — unlike
// every other intent in this route (which delegates immediately to a
// mockable siteManifest.server export, characterized in
// site-list.action.real.test.ts's dispatch-only style), shareToBluesky's
// PDS orchestration is implemented directly in the action, calling
// @scribe-atp/core's crossPostToBluesky plus several raw agent calls. That
// needs a functional agent mock, not a sentinel, so it gets its own file.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  rethrowIfRedirect: (err: unknown) => {
    if (err instanceof Response) throw err;
  },
  useRealOAuth: true,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";
const RKEY = "doc1";
const DOCUMENT_URI = `at://${DID}/site.standard.document/${RKEY}`;

function makeAgent(
  overrides: {
    createRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const docValue = {
    $type: "site.standard.document",
    title: "My Article",
    description: "A great article",
    scribe: { canonicalUrl: "https://norobots.blog/my-article", coverImageUrl: "" },
  };
  const siteValue = {
    $type: "site.standard.publication",
    scribe: {
      groups: [],
      ungroupedArticles: [{ uri: DOCUMENT_URI, title: "My Article" }],
    },
  };

  const getRecord = vi.fn().mockImplementation(({ collection }) => {
    if (collection === "site.standard.document") {
      return Promise.resolve({ data: { value: docValue, cid: "doc-cid" } });
    }
    return Promise.resolve({ data: { value: siteValue, cid: "site-cid" } });
  });

  return {
    com: {
      atproto: {
        repo: {
          getRecord,
          createRecord:
            overrides.createRecord ??
            vi.fn().mockResolvedValue({
              data: {
                uri: `at://${DID}/app.bsky.feed.post/post1`,
                cid: "post-cid",
              },
            }),
          putRecord:
            overrides.putRecord ??
            vi.fn().mockResolvedValue({ data: { cid: "new-cid" } }),
        },
      },
    },
  } as unknown as Agent;
}

function callAction(entries: Record<string, string>) {
  const formData = new FormData();
  formData.set("_intent", "shareToBluesky");
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  const request = new Request("http://localhost/article/list/my-site", {
    method: "POST",
    body: formData,
  });
  return action({
    request,
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset();
});

describe("action — shareToBluesky", () => {
  it("rejects missing uri/text without touching the agent", async () => {
    await expect(callAction({ uri: "", text: "" })).resolves.toEqual({
      ok: false,
      error: "Missing required fields.",
    });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("creates a bsky post via the shared crossPostToBluesky helper, with the correct embed shape", async () => {
    const createRecord = vi.fn().mockResolvedValue({
      data: { uri: `at://${DID}/app.bsky.feed.post/post1`, cid: "post-cid" },
    });
    const agent = makeAgent({ createRecord });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({ uri: DOCUMENT_URI, text: "Check this out" });

    expect(result).toEqual({
      ok: true,
      uri: DOCUMENT_URI,
      bskyPostRef: { uri: `at://${DID}/app.bsky.feed.post/post1`, cid: "post-cid" },
    });

    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: DID,
        collection: "app.bsky.feed.post",
        record: expect.objectContaining({
          $type: "app.bsky.feed.post",
          text: "Check this out",
          embed: {
            $type: "app.bsky.embed.external",
            external: {
              uri: "https://norobots.blog/my-article",
              title: "My Article",
              description: "A great article",
              associatedRefs: [
                {
                  $type: "com.atproto.repo.strongRef",
                  uri: DOCUMENT_URI,
                  cid: "doc-cid",
                },
                {
                  $type: "com.atproto.repo.strongRef",
                  uri: `at://${DID}/site.standard.publication/${SITE_SLUG}`,
                  cid: "site-cid",
                },
              ],
            },
          },
        }),
      }),
    );
  });

  it("writes the resulting bskyPostRef back onto the document record", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({ putRecord });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await callAction({ uri: DOCUMENT_URI, text: "Check this out" });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: DID,
        collection: "site.standard.document",
        rkey: RKEY,
        record: expect.objectContaining({
          bskyPostRef: {
            uri: `at://${DID}/app.bsky.feed.post/post1`,
            cid: "post-cid",
          },
        }),
      }),
    );
  });

  it("returns a graceful error instead of throwing when the PDS call fails", async () => {
    const agent = makeAgent({
      createRecord: vi.fn().mockRejectedValue(new Error("PDS unavailable")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({ uri: DOCUMENT_URI, text: "Check this out" });

    expect(result).toEqual({
      ok: false,
      error: "Share failed: PDS unavailable",
    });
  });

  it("security fix: propagates a getAtpAgent redirect instead of swallowing it as a generic error", async () => {
    const redirectToLogin = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    vi.mocked(getAtpAgent).mockRejectedValue(redirectToLogin);

    const thrown = await callAction({
      uri: DOCUMENT_URI,
      text: "Check this out",
    }).catch((err) => err);

    expect(thrown).toBe(redirectToLogin);
  });
});
