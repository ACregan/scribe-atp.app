import type { Route } from "./+types/insights";
import { useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { requireAuth, getAtpAgent, useRealOAuth } from "~/services/auth.server";
import { SITE_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { Spinner } from "~/components/Spinner/Spinner";
import { useToast } from "~/components/Toast/ToastContext";
import { logger } from "~/services/logger.server";
import { getUmamiConfig, fetchUmamiPageviews } from "~/services/umami.server";
import styles from "./insights.module.css";

const ACTION_TYPES = ["recommend", "subscribe", "share"] as const;
type ActionType = (typeof ACTION_TYPES)[number];

const METRIC_LABELS: Record<ActionType, string> = {
  recommend: "Likes",
  subscribe: "Subscribes",
  share: "Shares",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DayStat = { day: string; thisWeek: number; prevWeek: number };
type SiteMetricData = Record<ActionType, DayStat[]> & {
  pageviews?: DayStat[];
  visitors?: DayStat[];
};
type SiteData = {
  siteUrl: string;
  title: string;
  logoImageUrl?: string;
  metrics: SiteMetricData;
};

function buildDaySlots(
  countsByDate: Map<string, number>,
  thisWeekDays: string[],
  prevWeekDays: string[],
): DayStat[] {
  return thisWeekDays.map((day, i) => ({
    day: DAY_NAMES[new Date(`${day}T12:00:00Z`).getUTCDay()],
    thisWeek: countsByDate.get(day) ?? 0,
    prevWeek: countsByDate.get(prevWeekDays[i]) ?? 0,
  }));
}

function mockDayStats(baseCount: number): DayStat[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day: DAY_NAMES[(new Date().getDay() - 6 + i + 7) % 7],
    thisWeek: Math.max(0, baseCount + Math.round((Math.random() - 0.3) * 3)),
    prevWeek: Math.max(0, baseCount + Math.round((Math.random() - 0.5) * 3)),
  }));
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  const now = Math.floor(Date.now() / 1000);
  const from14 = now - 14 * 86400;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(`${todayStr}T12:00:00Z`);

  const thisWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - 6 + i);
    return d.toISOString().slice(0, 10);
  });
  const prevWeekDays = thisWeekDays.map((day) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  });

  if (!useRealOAuth) {
    const mockSites: SiteData[] = [
      { siteUrl: "https://norobots.blog", title: "NoRobots.blog" },
      { siteUrl: "https://anthonycregan.co.uk", title: "Anthony Cregan" },
      { siteUrl: "https://perpetualsummer.ltd", title: "Perpetual Summer" },
    ].map((s, i) => ({
      ...s,
      metrics: {
        recommend: mockDayStats(4),
        subscribe: mockDayStats(2),
        share: mockDayStats(1),
        // Only the first mock site shows Umami configured, matching the
        // per-site opt-in behaviour of the real loader below.
        ...(i === 0
          ? { pageviews: mockDayStats(40), visitors: mockDayStats(15) }
          : {}),
      },
    }));
    return { sites: mockSites, umamiWarnings: [] as string[] };
  }

  const agent = await getAtpAgent(did);
  const sitesResult = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });

  type SiteInfo = {
    rkey: string;
    siteUrl: string;
    title: string;
    logoImageUrl?: string;
  };

  const sites: SiteInfo[] = sitesResult.data.records
    .map((record): SiteInfo | null => {
      const scribe = (record.value as Record<string, unknown>).scribe as
        | Record<string, unknown>
        | undefined;
      if (!scribe) return null;
      const domain = String(scribe.domain ?? "");
      if (!domain) return null;
      return {
        rkey: record.uri.split("/").pop()!,
        siteUrl: `https://${domain}`,
        title: String(scribe.title ?? domain),
        logoImageUrl: scribe.logoImageUrl
          ? String(scribe.logoImageUrl)
          : undefined,
      };
    })
    .filter((s): s is SiteInfo => s !== null);

  const socialServiceUrl =
    process.env.SOCIAL_SERVICE_URL ?? "https://social.scribe-atp.app";

  const allResults = await Promise.all(
    sites.flatMap((site) =>
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
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return { siteUrl: site.siteUrl, actionType, groups: [] };
          const data = (await res.json()) as {
            groups?: { key: string; count: number }[];
          };
          return {
            siteUrl: site.siteUrl,
            actionType,
            groups: data.groups ?? [],
          };
        } catch {
          return { siteUrl: site.siteUrl, actionType, groups: [] };
        }
      }),
    ),
  );

  const countMap = new Map<string, Record<ActionType, Map<string, number>>>();
  for (const { siteUrl, actionType, groups } of allResults) {
    if (!countMap.has(siteUrl)) {
      countMap.set(siteUrl, {
        recommend: new Map(),
        subscribe: new Map(),
        share: new Map(),
      });
    }
    const byDate = countMap.get(siteUrl)![actionType as ActionType];
    for (const { key, count } of groups) byDate.set(key, count);
  }

  // Umami is opt-in per site (see ADR 0010) — only sites with a config row
  // fetch pageviews, and a fetch failure for one site never affects others.
  const nowMs = Date.now();
  const from14Ms = nowMs - 14 * 86400 * 1000;
  const umamiFailedTitles: string[] = [];

  const umamiResults = await Promise.all(
    sites.map(async (site) => {
      const config = getUmamiConfig(did, site.rkey);
      if (!config)
        return { siteUrl: site.siteUrl, pageviewsByDate: null, visitorsByDate: null };
      try {
        const points = await fetchUmamiPageviews(
          did,
          site.rkey,
          config,
          from14Ms,
          nowMs,
        );
        const pageviewsByDate = new Map<string, number>();
        const visitorsByDate = new Map<string, number>();
        for (const p of points) {
          pageviewsByDate.set(p.date, p.pageviews);
          visitorsByDate.set(p.date, p.visitors);
        }
        return { siteUrl: site.siteUrl, pageviewsByDate, visitorsByDate };
      } catch (err) {
        logger.warn(
          {
            event: "insights.umami_fetch_error",
            site: site.siteUrl,
            error: String(err),
          },
          "insights.umami_fetch_error",
        );
        umamiFailedTitles.push(site.title);
        return { siteUrl: site.siteUrl, pageviewsByDate: null, visitorsByDate: null };
      }
    }),
  );
  const umamiPageviewsMap = new Map(
    umamiResults.map(({ siteUrl, pageviewsByDate }) => [siteUrl, pageviewsByDate]),
  );
  const umamiVisitorsMap = new Map(
    umamiResults.map(({ siteUrl, visitorsByDate }) => [siteUrl, visitorsByDate]),
  );

  const siteMetrics: SiteData[] = sites.map((site) => {
    const metrics: SiteMetricData = ACTION_TYPES.reduce((acc, actionType) => {
      const byDate =
        countMap.get(site.siteUrl)?.[actionType] ?? new Map<string, number>();
      acc[actionType] = buildDaySlots(byDate, thisWeekDays, prevWeekDays);
      return acc;
    }, {} as SiteMetricData);

    const pageviewsByDate = umamiPageviewsMap.get(site.siteUrl);
    if (pageviewsByDate) {
      metrics.pageviews = buildDaySlots(pageviewsByDate, thisWeekDays, prevWeekDays);
    }
    const visitorsByDate = umamiVisitorsMap.get(site.siteUrl);
    if (visitorsByDate) {
      metrics.visitors = buildDaySlots(visitorsByDate, thisWeekDays, prevWeekDays);
    }

    return { ...site, metrics };
  });

  return { sites: siteMetrics, umamiWarnings: umamiFailedTitles };
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Insights — Scribe ATP" }];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

function MetricChart({ data, label }: { data: DayStat[]; label: string }) {
  const total = data.reduce((s, d) => s + d.thisWeek, 0);
  const prevTotal = data.reduce((s, d) => s + d.prevWeek, 0);
  const delta = total - prevTotal;

  return (
    <div className={styles.metricChart}>
      <div className={styles.metricHeader}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricTotal}>{total}</span>
        {delta !== 0 && (
          <span
            className={
              delta > 0 ? styles.metricDeltaUp : styles.metricDeltaDown
            }
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
        >
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              background: "var(--surface-header)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="prevWeek"
            name="Prev week"
            fill="#94a3b8"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="thisWeek"
            name="This week"
            fill="#2563eb"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SiteCard({ site }: { site: SiteData }) {
  return (
    <div className={styles.siteCard}>
      <div className={styles.siteCardHeader}>
        {site.logoImageUrl && (
          <img
            className={styles.siteIcon}
            src={site.logoImageUrl}
            alt={`${site.title} logo`}
          />
        )}
        <h2 className={styles.siteTitle}>{site.title}</h2>
        <p className={styles.siteUrl}>{site.siteUrl}</p>
      </div>
      <div className={styles.chartsRow}>
        {ACTION_TYPES.map((actionType) => (
          <MetricChart
            key={actionType}
            data={site.metrics[actionType]}
            label={METRIC_LABELS[actionType]}
          />
        ))}
        {site.metrics.pageviews && (
          <MetricChart data={site.metrics.pageviews} label="Pageviews" />
        )}
        {site.metrics.visitors && (
          <MetricChart data={site.metrics.visitors} label="Visitors" />
        )}
      </div>
    </div>
  );
}

export default function Insights({ loaderData }: Route.ComponentProps) {
  const { sites, umamiWarnings } = loaderData;
  const { addToast } = useToast();

  // Fires once on initial mount only — not on later revalidations, so a
  // background refresh doesn't re-stack the same warnings.
  useEffect(() => {
    umamiWarnings.forEach((title) => {
      addToast({
        heading: `Analytics unavailable for ${title}`,
        variant: "danger",
        autoExpire: false,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContainer
      fixed
      title={
        <PageContainerHeading icon={SvgImageList.BarChart}>
          Insights
        </PageContainerHeading>
      }
    >
      <PageSection overflow>
        {sites.length === 0 ? (
          <p className={styles.empty}>No sites found.</p>
        ) : (
          <div className={styles.siteList}>
            {sites.map((site) => (
              <SiteCard key={site.siteUrl} site={site} />
            ))}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}
