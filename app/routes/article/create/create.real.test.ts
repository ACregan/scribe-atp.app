import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./create";
import { requireAtpAgent } from "~/services/auth.server";

// Characterization tests for the create-article route's real-OAuth path
// (useRealOAuth: true). Since ADR 0013, every new article starts loose —
// no site selection at creation time. `site` is a two-step create-then-patch
// (the rkey/TID is only known after createRecord returns) rather than
// resolved from a selected site's domain. Dev-bypass path is covered
// separately in create.devBypass.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    createRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          createRecord:
            overrides.createRecord ??
            vi.fn().mockResolvedValue({
              data: {
                uri: `at://${DID}/site.standard.document/new1`,
                cid: "create-cid",
              },
            }),
          putRecord: overrides.putRecord ?? vi.fn().mockResolvedValue({ data: { cid: "patch-cid" } }),
        },
      },
    },
  } as unknown as Agent;
}

function makeRequest(
  url: string,
  entries?: Record<string, string | string[]>,
): Request {
  if (!entries) return new Request(url);
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((v) => formData.append(key, v));
    else formData.set(key, value);
  }
  return new Request(url, { method: "POST", body: formData });
}

function callAction(entries: Record<string, string | string[]>) {
  return action({
    request: makeRequest("http://localhost/article/create", entries),
  } as unknown as Parameters<typeof action>[0]);
}

function callLoader(url = "http://localhost/article/create") {
  return loader({ request: makeRequest(url) } as unknown as Parameters<
    typeof loader
  >[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset();
});

describe("loader", () => {
  it("returns no data — creation never offers a site picker", async () => {
    const result = await callLoader();
    expect(result).toEqual({});
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action", () => {
  it("rejects a missing title", async () => {
    await expect(
      callAction({ title: "", url: "my-article", content: "<p>hi</p>" }),
    ).resolves.toEqual({ error: "Title is required." });
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });

  it("rejects an invalid slug", async () => {
    await expect(
      callAction({
        title: "My Article",
        url: "Not A Slug",
        content: "<p>hi</p>",
      }),
    ).resolves.toEqual({
      error:
        "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).",
    });
  });

  it("creates the document loose, then patches `site` to the reader URL using the newly-assigned rkey", async () => {
    const createRecord = vi.fn().mockResolvedValue({
      data: {
        uri: `at://${DID}/site.standard.document/new1`,
        cid: "create-cid",
      },
    });
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "patch-cid" } });
    const agent = makeAgent({ createRecord, putRecord });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction({
      title: "My Article",
      url: "my-article",
      content: "<p>Hello <b>world</b></p>",
      description: "A description",
      splashImageUrl: "https://x.com/s.png",
      tags: ["tag1", "tag2"],
    });

    expect(result).toEqual({
      slug: "my-article",
      devMode: false,
      title: "My Article",
    });

    // Step 1: create with a placeholder site
    expect(createRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      record: expect.objectContaining({
        $type: "site.standard.document",
        title: "My Article",
        content: {
          $type: "app.scribe.content.html",
          html: "<p>Hello <b>world</b></p>",
        },
        textContent: "Hello world",
        description: "A description",
        tags: ["tag1", "tag2"],
        path: "/my-article",
        site: "",
        scribe: {
          coverImageUrl: "https://x.com/s.png",
          createdAt: expect.any(String),
        },
      }),
    });

    // Step 2: patch site to the loose reader URL, using the rkey from step 1
    expect(putRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      rkey: "new1",
      record: expect.objectContaining({
        site: `https://reader.scribe-atp.app/${DID}/site.standard.document/new1`,
      }),
      swapRecord: "create-cid",
    });
  });

  it("returns an error message when the PDS create call fails", async () => {
    const agent = makeAgent({
      createRecord: vi.fn().mockRejectedValue(new Error("PDS unavailable")),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction({
      title: "My Article",
      url: "my-article",
      content: "<p>hi</p>",
    });
    expect(result).toEqual({ error: "PDS unavailable" });
  });

  it("returns an error message when the site-field patch call fails", async () => {
    const agent = makeAgent({
      putRecord: vi.fn().mockRejectedValue(new Error("patch failed")),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction({
      title: "My Article",
      url: "my-article",
      content: "<p>hi</p>",
    });
    expect(result).toEqual({ error: "patch failed" });
  });
});
