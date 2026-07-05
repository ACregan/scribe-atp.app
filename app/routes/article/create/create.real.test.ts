import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./create";
import { requireAtpAgent } from "~/services/auth.server";

// Characterization tests for the create-article route's real-OAuth path
// (useRealOAuth: true), written before extracting its document-creation call
// onto app/services/documentRepository.server.ts. Dev-bypass path is covered
// separately in create.devBypass.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    createRecord?: ReturnType<typeof vi.fn>;
    listRecords?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: overrides.getRecord ?? vi.fn(),
          createRecord:
            overrides.createRecord ??
            vi
              .fn()
              .mockResolvedValue({
                data: { uri: "at://x/site.standard.document/new", cid: "cid" },
              }),
          listRecords:
            overrides.listRecords ??
            vi.fn().mockResolvedValue({ data: { records: [] } }),
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
  it("loads site options and marks a valid ?site= preselection", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/site-a`,
              value: { scribe: { title: "Site A", domain: "a.com" } },
            },
          ],
        },
      }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callLoader(
      "http://localhost/article/create?site=site-a",
    );
    expect(result).toEqual({
      sites: [{ rkey: "site-a", title: "Site A", url: "a.com" }],
      preselectedSite: "site-a",
    });
  });

  it("ignores a ?site= preselection that doesn't match any of the user's sites", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({ data: { records: [] } }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callLoader(
      "http://localhost/article/create?site=nonexistent",
    );
    expect(result).toEqual({ sites: [], preselectedSite: undefined });
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

  it("creates the document with the derived fields, resolving the primary site's domain", async () => {
    const createRecord = vi
      .fn()
      .mockResolvedValue({
        data: { uri: `at://${DID}/site.standard.document/new1`, cid: "cid" },
      });
    const getRecord = vi
      .fn()
      .mockResolvedValue({
        data: { value: { scribe: { domain: "example.com" } } },
      });
    const agent = makeAgent({ createRecord, getRecord });
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
      sites: ["site-a"],
      tags: ["tag1", "tag2"],
    });

    expect(result).toEqual({
      slug: "my-article",
      devMode: false,
      title: "My Article",
    });
    expect(getRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.publication",
      rkey: "site-a",
    });
    expect(createRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      record: {
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
        site: `at://${DID}/site.standard.publication/site-a`,
        updatedAt: expect.any(String),
        scribe: {
          coverImageUrl: "https://x.com/s.png",
          createdAt: expect.any(String),
          domain: "example.com",
        },
      },
    });
  });

  it("proceeds without a resolved domain when the primary site's getRecord fails (non-fatal)", async () => {
    const createRecord = vi
      .fn()
      .mockResolvedValue({
        data: { uri: `at://${DID}/site.standard.document/new1`, cid: "cid" },
      });
    const agent = makeAgent({
      createRecord,
      getRecord: vi.fn().mockRejectedValue(new Error("not found")),
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
      sites: ["site-a"],
    });

    expect(result).toEqual({
      slug: "my-article",
      devMode: false,
      title: "My Article",
    });
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({ domain: undefined }),
        }),
      }),
    );
  });

  it("does not call addArticleToSites when no sites are selected", async () => {
    const listRecords = vi.fn();
    const agent = makeAgent({ listRecords });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    await callAction({
      title: "My Article",
      url: "my-article",
      content: "<p>hi</p>",
    });

    // addArticleToSites -> mutateSiteRecord -> getRecord/putRecord on SITE_COLLECTION;
    // none of that should happen when selectedSiteRkeys is empty.
    expect(listRecords).not.toHaveBeenCalled();
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
});
