import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { EngagementCharts } from "../engagementCharts.server";
import styles from "./DashboardCharts.module.css";
import { Link } from "react-router";

const METRIC_LABELS = {
  recommend: "Likes",
  subscribe: "Subscribes",
  share: "Shares",
} as const;

type MetricKey = keyof typeof METRIC_LABELS;

function SiteLegend({
  series,
}: {
  series: EngagementCharts["series"];
}) {
  return (
    <ul className={styles.legend}>
      {series.map((site) => (
        <li key={site.domain} className={styles.legendItem}>
          <span
            className={styles.legendLine}
            style={{ background: site.color }}
          />
          {site.logoImageUrl ? (
            <img
              src={site.logoImageUrl}
              alt={site.title}
              className={styles.legendLogo}
            />
          ) : (
            <span className={styles.legendTitle}>{site.title}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function MiniChart({
  metricKey,
  data,
  series,
}: {
  metricKey: MetricKey;
  data: EngagementCharts["recommend"];
  series: EngagementCharts["series"];
}) {
  return (
    <div className={styles.chartBlock}>
      <h3 className={styles.chartTitle}>{METRIC_LABELS[metricKey]}</h3>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              background: "var(--surface-header)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              padding: "4px 8px",
            }}
          />
          {series.map((site) => (
            <Line
              key={site.domain}
              type="monotone"
              dataKey={site.domain}
              name={site.title}
              stroke={site.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardCharts({ charts }: { charts: EngagementCharts }) {
  const { series, recommend, subscribe, share } = charts;
  const metrics: [MetricKey, EngagementCharts["recommend"]][] = [
    ["recommend", recommend],
    ["subscribe", subscribe],
    ["share", share],
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Engagement</h2>
        <Link to="/insights" className={styles.viewAll}>
          View all →
        </Link>
      </div>
      <SiteLegend series={series} />
      {metrics.map(([key, data]) => (
        <MiniChart key={key} metricKey={key} data={data} series={series} />
      ))}
    </div>
  );
}
