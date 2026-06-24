import type { Route } from "./+types/migrate";
import { useFetcher } from "react-router";
import { type Agent } from "@atproto/api";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  ARTICLE_COLLECTION,
  DOCUMENT_COLLECTION,
  SITE_COLLECTION,
} from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Pill } from "~/components/Pill/Pill";
import { Spinner } from "~/components/Spinner/Spinner";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { logger } from "~/services/logger.server";

// --- Types ---

type ArticleSiteLocation = {
  siteRkey: string;
  siteUrl: string;
  urlPrefix: string;
  groupSlug: string | null;
};

type ArticlePlan = {
  rkey: string;
  uri: string;
  title: string;
  canonicalSiteUrl: string;
  path: string;
  publishedAt: string;
  isMultiSite: boolean;
  siteCount: number;
};

type MigrationPlan = {
  articles: ArticlePlan[];
  siteCount: number;
  unassigned: string[];
};

type MigrateResult = {
  ok: boolean;
  migrated?: number;
  failed?: number;
  details?: Array<{ rkey: string; ok: boolean; error?: string }>;
  error?: string;
};

// --- Helpers ---

function extractHtml(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (c.$type === "app.scribe.content.html") return String(c.html ?? "");
  }
  return "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildCanonicalSiteUrl(url: string, urlPrefix: string): string {
  return urlPrefix ? `https://${url}/${urlPrefix}` : `https://${url}`;
}

function buildMigrationPlan(
  articleRecords: Array<{ uri: string; cid: string; value: unknown }>,
  siteRecords: Array<{ uri: string; cid: string; value: unknown }>,
): MigrationPlan {
  const articleSiteMap = new Map<string, ArticleSiteLocation[]>();

  for (const siteRecord of siteRecords) {
    const v = siteRecord.value as Record<string, unknown>;
    const siteUrl = String(v.url ?? "");
    const urlPrefix = String(v.urlPrefix ?? "");
    const siteRkey = siteRecord.uri.split("/").pop()!;

    const groups =
      (v.groups as Array<{
        slug: string;
        articles?: Array<{ uri: string }>;
      }>) ?? [];
    const ungrouped = (v.ungroupedArticles as Array<{ uri: string }>) ?? [];

    for (const group of groups) {
      for (const ref of group.articles ?? []) {
        const rkey = ref.uri.split("/").pop()!;
        if (!articleSiteMap.has(rkey)) articleSiteMap.set(rkey, []);
        articleSiteMap.get(rkey)!.push({
          siteRkey,
          siteUrl,
          urlPrefix,
          groupSlug: group.slug,
        });
      }
    }
    for (const ref of ungrouped) {
      const rkey = ref.uri.split("/").pop()!;
      if (!articleSiteMap.has(rkey)) articleSiteMap.set(rkey, []);
      articleSiteMap.get(rkey)!.push({
        siteRkey,
        siteUrl,
        urlPrefix,
        groupSlug: null,
      });
    }
  }

  const articles: ArticlePlan[] = [];
  const unassigned: string[] = [];

  for (const record of articleRecords) {
    const rkey = record.uri.split("/").pop()!;
    const v = record.value as Record<string, unknown>;
    const title = String(v.title ?? "Untitled");
    const createdAt = String(v.createdAt ?? new Date().toISOString());
    const locations = articleSiteMap.get(rkey) ?? [];

    if (locations.length === 0) {
      unassigned.push(rkey);
      continue;
    }

    // Canonical site: alphabetically first by domain URL
    const sorted = [...locations].sort((a, b) =>
      a.siteUrl.localeCompare(b.siteUrl),
    );
    const canonical = sorted[0];
    const pathGroup = canonical.groupSlug ? `/${canonical.groupSlug}` : "";
    const path = `${pathGroup}/${rkey}`;

    articles.push({
      rkey,
      uri: record.uri,
      title,
      canonicalSiteUrl: buildCanonicalSiteUrl(
        canonical.siteUrl,
        canonical.urlPrefix,
      ),
      path,
      publishedAt: createdAt,
      isMultiSite: locations.length > 1,
      siteCount: locations.length,
    });
  }

  return { articles, siteCount: siteRecords.length, unassigned };
}

async function fetchPlanData(agent: Agent, did: string) {
  const [articlesResult, sitesResult] = await Promise.all([
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: ARTICLE_COLLECTION,
      limit: 100,
    }),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
    }),
  ]);
  return { articlesResult, sitesResult };
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as MigrationPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAtpAgent(request);
  const { articlesResult, sitesResult } = await fetchPlanData(agent, did);

  const plan = buildMigrationPlan(
    articlesResult.data.records as Array<{
      uri: string;
      cid: string;
      value: unknown;
    }>,
    sitesResult.data.records as Array<{
      uri: string;
      cid: string;
      value: unknown;
    }>,
  );

  return { plan, devMode: false as const };
}

// --- Action ---

export async function action({
  request,
}: Route.ActionArgs): Promise<MigrateResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }

  const { agent, did } = await requireAtpAgent(request);
  const { articlesResult, sitesResult } = await fetchPlanData(agent, did);

  const plan = buildMigrationPlan(
    articlesResult.data.records as Array<{
      uri: string;
      cid: string;
      value: unknown;
    }>,
    sitesResult.data.records as Array<{
      uri: string;
      cid: string;
      value: unknown;
    }>,
  );

  if (plan.unassigned.length > 0) {
    return {
      ok: false,
      error: `${plan.unassigned.length} unassigned article(s): ${plan.unassigned.join(", ")}`,
    };
  }

  if (plan.articles.length === 0) {
    return { ok: true, migrated: 0, failed: 0, details: [] };
  }

  const createdAtMap = new Map<string, string>(
    articlesResult.data.records.map((r) => {
      const v = r.value as Record<string, unknown>;
      return [
        r.uri.split("/").pop()!,
        String(v.createdAt ?? new Date().toISOString()),
      ];
    }),
  );

  // Step 1: Create site.standard.document records
  const details: Array<{ rkey: string; ok: boolean; error?: string }> = [];

  for (const article of plan.articles) {
    try {
      const rawRecord = articlesResult.data.records.find(
        (r) => r.uri === article.uri,
      );
      if (!rawRecord) throw new Error("Source record not found");

      const v = rawRecord.value as Record<string, unknown>;
      const html = extractHtml(v.content);
      const description =
        String(v.description ?? v.synopsis ?? "").trim() || undefined;
      const splashImageUrl = v.splashImageUrl
        ? String(v.splashImageUrl)
        : undefined;
      const createdAt = String(v.createdAt ?? new Date().toISOString());
      const updatedAt = String(v.updatedAt ?? createdAt);

      await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: article.rkey,
        record: {
          $type: DOCUMENT_COLLECTION,
          title: article.title,
          path: article.path,
          site: article.canonicalSiteUrl,
          content: { $type: "app.scribe.content.html", html },
          textContent: stripHtml(html),
          ...(splashImageUrl && { splashImageUrl }),
          ...(description && { description }),
          createdAt,
          publishedAt: article.publishedAt,
          updatedAt,
        },
      });

      details.push({ rkey: article.rkey, ok: true });
    } catch (err) {
      details.push({ rkey: article.rkey, ok: false, error: String(err) });
      logger.error(
        {
          event: "migration.create.error",
          rkey: article.rkey,
          error: String(err),
        },
        "migration.create.error",
      );
    }
  }

  // Step 2: Update site manifests — rewrite URIs and fix ArticleRef field names
  const successRkeys = new Set(details.filter((d) => d.ok).map((d) => d.rkey));

  for (const siteRecord of sitesResult.data.records) {
    try {
      const siteRkey = siteRecord.uri.split("/").pop()!;
      const v = siteRecord.value as Record<string, unknown>;

      const migrateRef = (
        ref: Record<string, unknown>,
      ): Record<string, unknown> => {
        const refUri = String(ref.uri ?? "");
        const refRkey = refUri.split("/").pop()!;
        const newUri = successRkeys.has(refRkey)
          ? refUri.replace(
              `/${ARTICLE_COLLECTION}/`,
              `/${DOCUMENT_COLLECTION}/`,
            )
          : refUri;
        return {
          uri: newUri,
          title: ref.title,
          // handle old field names (url/synopsis) alongside new ones (slug/description)
          slug: ref.slug ?? ref.url ?? refRkey,
          splashImageUrl: ref.splashImageUrl ?? null,
          description: ref.description ?? ref.synopsis ?? null,
          createdAt: ref.createdAt,
          publishedAt: ref.publishedAt ?? createdAtMap.get(refRkey),
          updatedAt: ref.updatedAt,
        };
      };

      const groups = (
        (v.groups as Array<Record<string, unknown>>) ?? []
      ).map((group) => ({
        ...group,
        articles: (
          (group.articles as Array<Record<string, unknown>>) ?? []
        ).map(migrateRef),
      }));

      const ungroupedArticles = (
        (v.ungroupedArticles as Array<Record<string, unknown>>) ?? []
      ).map(migrateRef);

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: { ...v, groups, ungroupedArticles },
        swapRecord: siteRecord.cid,
      });
    } catch (err) {
      logger.error(
        {
          event: "migration.site.update.error",
          rkey: siteRecord.uri.split("/").pop(),
          error: String(err),
        },
        "migration.site.update.error",
      );
    }
  }

  // Step 3: Delete app.scribe.article records for successfully migrated articles
  for (const detail of details.filter((d) => d.ok)) {
    try {
      const rawRecord = articlesResult.data.records.find(
        (r) => r.uri.split("/").pop() === detail.rkey,
      );
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: ARTICLE_COLLECTION,
        rkey: detail.rkey,
        swapRecord: rawRecord?.cid,
      });
    } catch (err) {
      logger.error(
        {
          event: "migration.delete.error",
          rkey: detail.rkey,
          error: String(err),
        },
        "migration.delete.error",
      );
    }
  }

  const migrated = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "migration.run", user_did: did, migrated, failed },
    "migration.run",
  );

  return { ok: true, migrated, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Migrate Articles — Scribe ATP" }];
}

export default function MigratePage({ loaderData }: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as MigrateResult | undefined;
  const isDone = result?.ok && result.migrated !== undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Documents}>
            Migrate Articles
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Migration is not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const isBlocked = plan!.unassigned.length > 0;
  const isEmpty = plan!.articles.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Migrate Articles
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Migration complete
          </p>
          <p>
            {result!.migrated} article
            {result!.migrated !== 1 ? "s" : ""} migrated to{" "}
            <code>site.standard.document</code>.
            {result!.failed
              ? ` ${result!.failed} failed — check server logs.`
              : ""}
          </p>
          {result!.details
            ?.filter((d) => !d.ok)
            .map((d) => (
              <p key={d.rkey} style={{ color: "var(--action-danger)" }}>
                {d.rkey}: {d.error}
              </p>
            ))}
        </PageSection>
      ) : isEmpty && !isBlocked ? (
        <PageSection>
          <p>
            No <code>app.scribe.article</code> records found. Nothing to
            migrate.
          </p>
        </PageSection>
      ) : (
        <>
          {isBlocked && (
            <PageSection>
              <p style={{ color: "var(--action-danger)", fontWeight: 600 }}>
                Migration blocked
              </p>
              <p>
                {plan!.unassigned.length} unassigned article
                {plan!.unassigned.length !== 1 ? "s" : ""} must be assigned to
                a site before migrating:
              </p>
              <ul>
                {plan!.unassigned.map((rkey) => (
                  <li key={rkey}>
                    <code>{rkey}</code>
                  </li>
                ))}
              </ul>
            </PageSection>
          )}
          {!isEmpty && (
            <PageSection>
              <p>
                <strong>{plan!.articles.length}</strong> article
                {plan!.articles.length !== 1 ? "s" : ""} across{" "}
                <strong>{plan!.siteCount}</strong> site
                {plan!.siteCount !== 1 ? "s" : ""} will be moved from{" "}
                <code>app.scribe.article</code> to{" "}
                <code>site.standard.document</code>.
              </p>
              {plan!.articles.some((a) => a.isMultiSite) && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
                  Multi-site articles: canonical site is the alphabetically
                  first domain.
                </p>
              )}
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
                <code>publishedAt</code> will be set to each article&apos;s{" "}
                <code>createdAt</code> as the closest available approximation.
              </p>
            </PageSection>
          )}
          {!isEmpty && (
            <PageSection>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "0.9em",
                }}
              >
                <thead>
                  <tr>
                    {["Slug", "Title", "Canonical site", "Path", "Sites"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "0.4rem 0.8rem",
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {plan!.articles.map((article) => (
                    <tr key={article.rkey}>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <code>{article.rkey}</code>
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        {article.title}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                          fontSize: "0.85em",
                        }}
                      >
                        {article.canonicalSiteUrl}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <code>{article.path}</code>
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        {article.siteCount > 1 ? (
                          <Pill variant="secondary">{article.siteCount}</Pill>
                        ) : (
                          "1"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PageSection>
          )}
          {!isBlocked && !isEmpty && (
            <PageSection>
              {result?.error && (
                <p
                  style={{
                    color: "var(--action-danger)",
                    marginBottom: "1rem",
                  }}
                >
                  Error: {result.error}
                </p>
              )}
              <fetcher.Form method="post">
                <Button type="submit" variant="danger" disabled={isRunning}>
                  {isRunning ? "Migrating…" : "Run Migration"}
                </Button>
              </fetcher.Form>
            </PageSection>
          )}
        </>
      )}
    </PageContainer>
  );
}
