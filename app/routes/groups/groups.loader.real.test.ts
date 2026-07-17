import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./groups";
import { requireAuth, getAtpAgent } from "~/services/auth.server";
import { listContributorSiteCards } from "~/services/contributorRoster.server";

// Loader tests for the groups route, kept separate from groups.real.test.ts
// (which is scoped to the createGroup action per its own docstring).

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/contributorRoster.server", () => ({
  listContributorSiteCards: vi.fn(),
}));

const DID = "did:plc:testuser";

function makeAgent(
  overrides: { listRecords?: ReturnType<typeof vi.fn> } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords:
            overrides.listRecords ??
            vi.fn().mockResolvedValue({ data: { records: [] } }),
        },
      },
    },
  } as unknown as Agent;
}

function callLoader() {
  return loader({
    request: new Request("http://localhost/groups"),
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReset().mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset();
  vi.mocked(listContributorSiteCards).mockReset().mockResolvedValue([]);
});

describe("loader", () => {
  it("returns sites (owner-only) and contributorSites as separate arrays", async () => {
    vi.mocked(getAtpAgent).mockResolvedValue(
      makeAgent({
        listRecords: vi.fn().mockResolvedValue({
          data: {
            records: [
              {
                uri: `at://${DID}/site.standard.publication/my-site`,
                value: {
                  scribe: {
                    title: "My Site",
                    domain: "my-site.com",
                    basePath: "blog",
                    groups: [{ slug: "eng", title: "Engineering", articles: [{ uri: "a1" }] }],
                  },
                },
              },
            ],
          },
        }),
      }),
    );
    vi.mocked(listContributorSiteCards).mockResolvedValue([
      {
        siteUri: "at://did:plc:owner/site.standard.publication/their-site",
        ownerDid: "did:plc:owner",
        rkey: "their-site",
        cid: "cid-contributor",
        title: "Their Site",
        domain: "their-site.com",
        absoluteUrl: "https://their-site.com",
        urlPrefix: "",
        splashImageUrl: undefined,
        logoImageUrl: undefined,
        groupCount: 1,
        articleCount: 3,
        groups: [{ slug: "general", title: "General", articleCount: 3 }],
        ownerDisplayName: "Site Owner",
      },
    ]);

    const result = await callLoader();

    expect(result.sites).toEqual([
      {
        rkey: "my-site",
        title: "My Site",
        url: "my-site.com",
        urlPrefix: "blog",
        splashImageUrl: undefined,
        logoImageUrl: undefined,
        groups: [{ slug: "eng", title: "Engineering", articleCount: 1 }],
      },
    ]);
    expect(result.contributorSites).toEqual([
      {
        rkey: "their-site",
        title: "Their Site",
        url: "their-site.com",
        urlPrefix: "",
        splashImageUrl: undefined,
        logoImageUrl: undefined,
        groups: [{ slug: "general", title: "General", articleCount: 3 }],
        isContributor: true,
      },
    ]);
  });

  it("returns an empty contributorSites array when the caller has no Contributor memberships", async () => {
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent());

    const result = await callLoader();

    expect(result.contributorSites).toEqual([]);
  });
});
