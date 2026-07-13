import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./configure";
import { getAtpAgent, requireAuth } from "~/services/auth.server";

// Characterization tests for the configure-site route's real-OAuth path
// (useRealOAuth: true), written before extracting onto documentRepository.server.ts
// and siteRepository.server.ts. Also encodes two user-approved bug fixes
// (missing swapRecord on the site-record save, missing pagination on the
// canonical-URL cascade) — those tests assert the FIXED behavior and are
// expected to fail until the extraction+fix commit lands. Dev-bypass path is
// covered in configure.devBypass.test.ts.

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

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
    listRecords?: ReturnType<typeof vi.fn>;
    uploadBlob?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: overrides.getRecord ?? vi.fn(),
          putRecord:
            overrides.putRecord ??
            vi.fn().mockResolvedValue({ data: { cid: "new-cid" } }),
          listRecords:
            overrides.listRecords ??
            vi.fn().mockResolvedValue({ data: { records: [] } }),
        },
      },
    },
    uploadBlob: overrides.uploadBlob ?? vi.fn(),
  } as unknown as Agent;
}

function siteRecordValue(
  scribe: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    data: {
      cid: "site-cid",
      value: { $type: "site.standard.publication", scribe, ...extra },
    },
  };
}

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/site/my-site/configure");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/site/my-site/configure", {
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

function callLoader() {
  return loader({
    request: makeRequest(),
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset();
});

describe("loader", () => {
  it("maps the site record to the form shape", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecordValue(
          {
            title: "My Site",
            domain: "my.example.com",
            basePath: "blog",
            splashImageUrl: "https://x.com/s.png",
            logoImageUrl: "https://x.com/l.png",
          },
          {
            preferences: {
              showInDiscover: false,
              notifySubscribersEnabled: false,
            },
          },
        ),
      ),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callLoader();
    expect(result).toEqual({
      site: {
        rkey: SITE_SLUG,
        title: "My Site",
        url: "my.example.com",
        urlPrefix: "blog",
        description: "",
        splashImageUrl: "https://x.com/s.png",
        logoImageUrl: "https://x.com/l.png",
        showInDiscover: false,
        notifySubscribersEnabled: false,
        umami: { configured: false },
      },
    });
  });
});

describe("action — validation", () => {
  it("rejects a missing title", async () => {
    await expect(
      callAction({ title: "", url: "example.com" }),
    ).resolves.toEqual({ ok: false, error: "Title is required." });
  });

  it("rejects an invalid domain", async () => {
    await expect(
      callAction({ title: "My Site", url: "not a domain" }),
    ).resolves.toEqual({
      ok: false,
      error: "Domain must be a valid hostname (e.g. myblog.com).",
    });
  });

  it("rejects a splashImageUrl that isn't https", async () => {
    await expect(
      callAction({
        title: "My Site",
        url: "example.com",
        splashImageUrl: "http://x.com/s.png",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Splash Image URL must start with https://.",
    });
  });
});

describe("action — save (no domain/basePath change)", () => {
  it("writes the record and does not trigger the canonical-URL cascade", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const listRecords = vi.fn();
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecordValue({
            domain: "example.com",
            basePath: "blog",
            title: "Old Title",
          }),
        ),
      putRecord,
      listRecords,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      title: "New Title",
      url: "example.com",
      urlPrefix: "blog",
    });

    expect(result).toEqual({ ok: true });
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "site.standard.publication",
        rkey: SITE_SLUG,
        record: expect.objectContaining({
          url: "https://example.com",
          name: "New Title",
          scribe: expect.objectContaining({
            domain: "example.com",
            basePath: "blog",
            title: "New Title",
          }),
        }),
      }),
    );
    expect(listRecords).not.toHaveBeenCalled();
  });

  it("bug fix: writes description into scribe, not the record top level, and preserves it across a save", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecordValue({
          domain: "example.com",
          basePath: "blog",
          title: "Old Title",
          description: "Original description",
        }),
      ),
      putRecord,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      title: "New Title",
      url: "example.com",
      urlPrefix: "blog",
      description: "Original description",
    });

    expect(result).toEqual({ ok: true });
    const savedRecord = putRecord.mock.calls[0][0].record;
    expect(savedRecord).not.toHaveProperty("description");
    expect(savedRecord.scribe.description).toBe("Original description");
  });

  it("bug fix: passes the fetched cid as swapRecord on the site-record save", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecordValue({
            domain: "example.com",
            basePath: "blog",
            title: "Old Title",
          }),
        ),
      putRecord,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await callAction({
      title: "New Title",
      url: "example.com",
      urlPrefix: "blog",
    });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({ swapRecord: "site-cid" }),
    );
  });
});

describe("action — save (domain changed, triggers canonical-URL cascade)", () => {
  // Since ADR 0013, `site` holds either a loose reader URL or the document's
  // owning publication's at:// URI — never a bare `https://{domain}` string.
  // The filter (and these fixtures) match on that at:// shape; a document's
  // `site` field is never rewritten by a domain/basePath edit, since the
  // rkey (and therefore the at:// URI) doesn't change.
  const SITE_AT_URI = `at://${DID}/site.standard.publication/${SITE_SLUG}`;

  it("updates matching documents' canonicalUrl, leaving site untouched", async () => {
    const docPutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "doc-new-cid" } });
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecordValue({
            domain: "old.example.com",
            basePath: "",
            title: "Site",
          }),
        ),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? Promise.resolve({ data: { cid: "site-new-cid" } })
            : docPutRecord(args),
        ),
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: "at://x/site.standard.document/a1",
              cid: "a1-cid",
              value: { site: SITE_AT_URI, path: "/a1" },
            },
          ],
        },
      }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({ title: "Site", url: "new.example.com" });

    expect(result).toEqual({ ok: true });
    expect(docPutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        rkey: "a1",
        record: expect.objectContaining({
          site: SITE_AT_URI,
          scribe: expect.objectContaining({
            canonicalUrl: "https://new.example.com/a1",
          }),
        }),
        swapRecord: "a1-cid",
      }),
    );
  });

  it("ignores loose documents (site is a reader URL, not this site's at:// URI)", async () => {
    const docPutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "doc-new-cid" } });
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecordValue({
            domain: "old.example.com",
            basePath: "",
            title: "Site",
          }),
        ),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? Promise.resolve({ data: { cid: "site-new-cid" } })
            : docPutRecord(args),
        ),
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: "at://x/site.standard.document/loose1",
              cid: "loose1-cid",
              value: {
                site: `https://reader.scribe-atp.app/${DID}/site.standard.document/loose1`,
                path: "/loose1",
              },
            },
          ],
        },
      }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({ title: "Site", url: "new.example.com" });

    expect(result).toEqual({ ok: true });
    expect(docPutRecord).not.toHaveBeenCalled();
  });

  it("reports canonicalWarning when some document updates fail", async () => {
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecordValue({
            domain: "old.example.com",
            basePath: "",
            title: "Site",
          }),
        ),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? Promise.resolve({ data: { cid: "site-new-cid" } })
            : Promise.reject(new Error("swap failed")),
        ),
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: "at://x/site.standard.document/a1",
              cid: "a1-cid",
              value: { site: SITE_AT_URI, path: "/a1" },
            },
          ],
        },
      }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({ title: "Site", url: "new.example.com" });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        canonicalWarning: expect.any(String),
      }),
    );
  });

  it("bug fix: paginates the document scan so sites with >100 documents are fully covered", async () => {
    const docPutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "doc-new-cid" } });
    const listRecords = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          records: [
            {
              uri: "at://x/site.standard.document/page1doc",
              cid: "c1",
              value: { site: SITE_AT_URI, path: "/page1doc" },
            },
          ],
          cursor: "page2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          records: [
            {
              uri: "at://x/site.standard.document/page2doc",
              cid: "c2",
              value: { site: SITE_AT_URI, path: "/page2doc" },
            },
          ],
          cursor: undefined,
        },
      });
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecordValue({
            domain: "old.example.com",
            basePath: "",
            title: "Site",
          }),
        ),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? Promise.resolve({ data: { cid: "site-new-cid" } })
            : docPutRecord(args),
        ),
      listRecords,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await callAction({ title: "Site", url: "new.example.com" });

    expect(listRecords).toHaveBeenCalledTimes(2);
    expect(docPutRecord).toHaveBeenCalledWith(
      expect.objectContaining({ rkey: "page1doc" }),
    );
    expect(docPutRecord).toHaveBeenCalledWith(
      expect.objectContaining({ rkey: "page2doc" }),
    );
  });
});

describe("action — failure", () => {
  it("returns an error message when the PDS save fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({ title: "My Site", url: "example.com" });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Failed to save"),
    });
  });

  it("security fix: propagates a getAtpAgent redirect instead of swallowing it as a generic error", async () => {
    const redirectToLogin = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    vi.mocked(getAtpAgent).mockRejectedValue(redirectToLogin);

    const thrown = await callAction({
      title: "My Site",
      url: "example.com",
    }).catch((err) => err);

    expect(thrown).toBe(redirectToLogin);
  });
});
