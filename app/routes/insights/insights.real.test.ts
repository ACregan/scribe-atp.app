import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./insights";
import { requireAuth, getAtpAgent } from "~/services/auth.server";
import {
  getUmamiConfig,
  fetchUmamiPageviews,
  fetchUmamiStats,
  fetchUmamiMetrics,
  type UmamiConfig,
} from "~/services/umami.server";

// Regression coverage for a production incident: bundling the Umami
// pageviews/stats/metrics fetches into one Promise.all + try/catch meant a
// single failing call (Top Pages/Referrers 400ing due to a wrong "type"
// param) also blanked out Pageviews/Visitors, which had been working fine.
// See backlog-umami-stats-followup memory for the full incident writeup.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/services/umami.server", () => ({
  getUmamiConfig: vi.fn(),
  fetchUmamiPageviews: vi.fn(),
  fetchUmamiStats: vi.fn(),
  fetchUmamiMetrics: vi.fn(),
}));

const DID = "did:plc:testuser";

function makeAgent(records: unknown[]) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: vi.fn().mockResolvedValue({ data: { records } }),
        },
      },
    },
  } as unknown as Agent;
}

function callLoader() {
  return loader({
    request: new Request("http://localhost/insights"),
  } as unknown as Parameters<typeof loader>[0]);
}

const SITE_RECORD = {
  uri: `at://${DID}/site.standard.publication/site-a`,
  value: { scribe: { domain: "example.com", title: "Example Site" } },
};

const FAKE_CONFIG: UmamiConfig = {
  baseUrl: "https://umami.example.com",
  websiteId: "web-id",
  websiteName: "Example",
  username: "u",
  password: "p",
  cachedJwt: null,
  jwtExpiresAt: null,
  updatedAt: 0,
};

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockResolvedValue(makeAgent([SITE_RECORD]));
  vi.mocked(getUmamiConfig).mockReturnValue(FAKE_CONFIG);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ groups: [] }) }),
  );
});

describe("loader — Umami per-metric failure isolation", () => {
  it("still populates pageviews/visitors/stats when Top Pages/Referrers fail", async () => {
    vi.mocked(fetchUmamiPageviews).mockResolvedValue([
      { date: "2026-07-01", pageviews: 10, visitors: 4 },
    ]);
    vi.mocked(fetchUmamiStats).mockResolvedValue({
      visits: 64,
      bounces: 19,
      totaltimeSeconds: 56616,
      prevVisits: 55,
      prevBounces: 27,
      prevTotaltimeSeconds: 24014,
    });
    vi.mocked(fetchUmamiMetrics).mockRejectedValue(
      new Error("Umami metrics request failed (400)."),
    );

    const result = await callLoader();
    const site = result.sites[0];

    expect(site.metrics.pageviews).toBeDefined();
    expect(site.metrics.visitors).toBeDefined();
    expect(site.metrics.summary).toBeDefined();
    expect(site.metrics.topPages).toBeUndefined();
    expect(site.metrics.topReferrers).toBeUndefined();
    // One warning per site, not one per failed metric.
    expect(result.umamiWarnings).toEqual(["Example Site"]);
  });

  it("derives bounce rate and avg duration from flat /stats fields, not nested .value", async () => {
    vi.mocked(fetchUmamiPageviews).mockResolvedValue([]);
    vi.mocked(fetchUmamiStats).mockResolvedValue({
      visits: 64,
      bounces: 19,
      totaltimeSeconds: 56616,
      prevVisits: 55,
      prevBounces: 27,
      prevTotaltimeSeconds: 24014,
    });
    vi.mocked(fetchUmamiMetrics).mockResolvedValue([]);

    const result = await callLoader();
    const summary = result.sites[0].metrics.summary!;

    // 19/64 * 100
    expect(summary.bounceRatePercent).toBeCloseTo((19 / 64) * 100);
    // 27/55 * 100
    expect(summary.prevBounceRatePercent).toBeCloseTo((27 / 55) * 100);
    // 56616 / (64 - 19)
    expect(summary.avgDurationSeconds).toBeCloseTo(56616 / 45);
    // 24014 / (55 - 27)
    expect(summary.prevAvgDurationSeconds).toBeCloseTo(24014 / 28);
  });

  it("populates everything and raises no warning when all Umami calls succeed", async () => {
    vi.mocked(fetchUmamiPageviews).mockResolvedValue([
      { date: "2026-07-01", pageviews: 10, visitors: 4 },
    ]);
    vi.mocked(fetchUmamiStats).mockResolvedValue({
      visits: 10,
      bounces: 2,
      totaltimeSeconds: 300,
      prevVisits: 8,
      prevBounces: 1,
      prevTotaltimeSeconds: 200,
    });
    vi.mocked(fetchUmamiMetrics).mockResolvedValue([{ label: "/", count: 5 }]);

    const result = await callLoader();
    const site = result.sites[0];

    expect(site.metrics.pageviews).toBeDefined();
    expect(site.metrics.topPages).toBeDefined();
    expect(site.metrics.topReferrers).toBeDefined();
    expect(result.umamiWarnings).toEqual([]);
  });

  it("uses fetchUmamiMetrics with type \"path\" for pages, not \"url\"", async () => {
    vi.mocked(fetchUmamiPageviews).mockResolvedValue([]);
    vi.mocked(fetchUmamiStats).mockResolvedValue({
      visits: 0,
      bounces: 0,
      totaltimeSeconds: 0,
      prevVisits: 0,
      prevBounces: 0,
      prevTotaltimeSeconds: 0,
    });
    vi.mocked(fetchUmamiMetrics).mockResolvedValue([]);

    await callLoader();

    expect(fetchUmamiMetrics).toHaveBeenCalledWith(
      DID,
      "site-a",
      FAKE_CONFIG,
      "path",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
