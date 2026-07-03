const ACTION_TYPES = ["recommend", "subscribe", "share"] as const;
type ActionType = (typeof ACTION_TYPES)[number];

export const SITE_COLORS = ["#2563eb", "#dc2626", "#16a34a"];

export type EngagementDayPoint = { label: string; [domain: string]: number | string };

export type EngagementCharts = {
  series: Array<{
    domain: string;
    title: string;
    logoImageUrl?: string;
    color: string;
  }>;
  recommend: EngagementDayPoint[];
  subscribe: EngagementDayPoint[];
  share: EngagementDayPoint[];
};

type SiteInput = {
  siteUrl: string;
  title: string;
  logoImageUrl?: string;
};

export async function buildEngagementCharts(
  sites: SiteInput[],
  socialServiceUrl: string,
): Promise<EngagementCharts> {
  const now = Math.floor(Date.now() / 1000);
  const from14 = now - 14 * 86400;

  const siteInfos = sites
    .filter((s) => {
      try { new URL(s.siteUrl); return true; } catch { return false; }
    })
    .map((site, i) => ({
      domain: new URL(site.siteUrl).hostname,
      siteUrl: site.siteUrl,
      title: site.title,
      logoImageUrl: site.logoImageUrl,
      color: SITE_COLORS[i % SITE_COLORS.length],
    }));

  const todayDate = new Date();
  const days14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - 13 + i);
    return d.toISOString().slice(0, 10);
  });
  const dayLabels = days14.map((d) => {
    const date = new Date(`${d}T12:00:00Z`);
    return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
  });

  const allResults = await Promise.all(
    siteInfos.flatMap((site) =>
      ACTION_TYPES.map(async (actionType) => {
        try {
          const url = new URL(`${socialServiceUrl}/counts`);
          url.searchParams.set("action_type", actionType);
          url.searchParams.set("origin", site.siteUrl);
          url.searchParams.set("group_by", "day");
          url.searchParams.set("order_by", "date");
          url.searchParams.set("from", String(from14));
          url.searchParams.set("limit", "14");
          const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(4000),
          });
          if (!res.ok) return { domain: site.domain, actionType, groups: [] as { key: string; count: number }[] };
          const data = (await res.json()) as { groups?: { key: string; count: number }[] };
          return { domain: site.domain, actionType, groups: data.groups ?? [] };
        } catch {
          return { domain: site.domain, actionType, groups: [] as { key: string; count: number }[] };
        }
      }),
    ),
  );

  const countMaps = new Map<ActionType, Map<string, Map<string, number>>>();
  for (const at of ACTION_TYPES) countMaps.set(at, new Map());
  for (const { domain, actionType, groups } of allResults) {
    const metricMap = countMaps.get(actionType as ActionType)!;
    if (!metricMap.has(domain)) metricMap.set(domain, new Map());
    const domainMap = metricMap.get(domain)!;
    for (const { key, count } of groups) domainMap.set(key, count);
  }

  const buildSeries = (actionType: ActionType): EngagementDayPoint[] =>
    days14.map((day, i) => {
      const point: EngagementDayPoint = { label: dayLabels[i] };
      const metricMap = countMaps.get(actionType)!;
      for (const site of siteInfos) {
        point[site.domain] = metricMap.get(site.domain)?.get(day) ?? 0;
      }
      return point;
    });

  return {
    series: siteInfos.map(({ domain, title, logoImageUrl, color }) => ({
      domain,
      title,
      logoImageUrl,
      color,
    })),
    recommend: buildSeries("recommend"),
    subscribe: buildSeries("subscribe"),
    share: buildSeries("share"),
  };
}
