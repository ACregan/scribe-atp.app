import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./home";
import { getAuthSession, getAtpAgent } from "~/services/auth.server";
import { listContributorSiteCards } from "~/services/contributorRoster.server";

// Loader tests scoped to the Contributor-sites wiring added to the
// Dashboard's Sites column (found live 2026-07-17 — Contributors had no
// link anywhere to a site they contribute to). Not a full characterization
// suite for this loader's many other branches (nuke, engagement charts,
// etc.) — those are untouched by this change.

vi.mock("~/services/auth.server", () => ({
  getAuthSession: vi.fn(),
  getAtpAgent: vi.fn(),
  rethrowIfRedirect: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/contributorRoster.server", () => ({
  listContributorSiteCards: vi.fn(),
}));

vi.mock("./engagementCharts.server", () => ({
  buildEngagementCharts: vi.fn().mockResolvedValue(null),
}));

const DID = "did:plc:testuser";

function makeAgent(overrides: { listRecords?: ReturnType<typeof vi.fn> } = {}) {
  const listRecords =
    overrides.listRecords ?? vi.fn().mockResolvedValue({ data: { records: [] } });
  return {
    com: { atproto: { repo: { listRecords } } },
  } as unknown as Agent;
}

function callLoader() {
  return loader({
    request: new Request("http://localhost/"),
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(getAuthSession).mockReset().mockResolvedValue({
    did: DID,
    handle: "test.user",
    isAuthenticated: true,
  });
  vi.mocked(getAtpAgent).mockReset().mockResolvedValue(makeAgent());
  vi.mocked(listContributorSiteCards).mockReset().mockResolvedValue([]);
});

describe("loader — Contributor sites", () => {
  it("appends Contributor sites after the caller's own, tagged isContributor", async () => {
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
        articleCount: 2,
        groups: [{ slug: "general", title: "General", articleCount: 2 }],
        ownerDisplayName: "Site Owner",
      },
    ]);

    const result = await callLoader();

    expect(result.sites).toEqual([
      {
        rkey: "their-site",
        title: "Their Site",
        siteUrl: "https://their-site.com",
        splashImageUrl: undefined,
        logoImageUrl: undefined,
        groups: [{ slug: "general", title: "General", articleCount: 2 }],
        isContributor: true,
      },
    ]);
  });

  it("returns no Contributor sites when the caller has no accepted memberships", async () => {
    const result = await callLoader();
    expect(result.sites).toEqual([]);
  });
});
