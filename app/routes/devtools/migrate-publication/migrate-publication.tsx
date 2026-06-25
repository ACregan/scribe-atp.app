import type { Route } from "./+types/migrate-publication";
import { useFetcher } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { SITE_COLLECTION, DOCUMENT_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { logger } from "~/services/logger.server";

const OLD_SITE_COLLECTION = "app.scribe.site";

type PlanData = {
  oldSiteCount: number;
  newSiteCount: number;
  documentCount: number;
  documentsNeedingUpdate: number;
};

type PhaseResult = {
  ok: boolean;
  phase?: number;
  processed?: number;
  skipped?: number;
  failed?: number;
  error?: string;
};

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as PlanData | null, devMode: true as const };
  }
  const { agent, did } = await requireAtpAgent(request);
  const [oldSites, newSites, documents] = await Promise.all([
    agent.com.atproto.repo.listRecords({ repo: did, collection: OLD_SITE_COLLECTION, limit: 100 }),
    agent.com.atproto.repo.listRecords({ repo: did, collection: SITE_COLLECTION, limit: 100 }),
    agent.com.atproto.repo.listRecords({ repo: did, collection: DOCUMENT_COLLECTION, limit: 100 }),
  ]);

  const documentsNeedingUpdate = documents.data.records.filter((r) => {
    const site = String((r.value as Record<string, unknown>).site ?? "");
    return !site.startsWith("at://");
  }).length;

  return {
    plan: {
      oldSiteCount: oldSites.data.records.length,
      newSiteCount: newSites.data.records.length,
      documentCount: documents.data.records.length,
      documentsNeedingUpdate,
    },
    devMode: false as const,
  };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<PhaseResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }
  const { agent, did } = await requireAtpAgent(request);
  const formData = await request.formData();
  const phase = Number(formData.get("_phase"));

  if (phase === 1) {
    const [oldSites, newSites] = await Promise.all([
      agent.com.atproto.repo.listRecords({ repo: did, collection: OLD_SITE_COLLECTION, limit: 100 }),
      agent.com.atproto.repo.listRecords({ repo: did, collection: SITE_COLLECTION, limit: 100 }),
    ]);
    const existingRkeys = new Set(newSites.data.records.map((r) => r.uri.split("/").pop()!));

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const siteRecord of oldSites.data.records) {
      const rkey = siteRecord.uri.split("/").pop()!;
      if (existingRkeys.has(rkey)) { skipped++; continue; }

      try {
        const v = siteRecord.value as Record<string, unknown>;
        const domain = String(v.url ?? "");
        const basePath = String(v.urlPrefix ?? "");
        const title = String(v.title ?? "");
        const now = new Date().toISOString();

        await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey,
          record: {
            $type: SITE_COLLECTION,
            url: `https://${domain}`,
            name: title,
            preferences: { showInDiscover: true },
            scribe: {
              $type: SITE_COLLECTION,
              domain,
              basePath,
              title,
              ...(v.description ? { description: v.description } : {}),
              ...(v.splashImageUrl ? { splashImageUrl: v.splashImageUrl } : {}),
              ...(v.logoImageUrl ? { logoImageUrl: v.logoImageUrl } : {}),
              contributors: v.contributors ?? [],
              groups: v.groups ?? [],
              ungroupedArticles: v.ungroupedArticles ?? [],
              createdAt: v.createdAt ?? now,
              updatedAt: v.updatedAt ?? now,
            },
          },
        });
        processed++;
      } catch (err) {
        logger.error({ event: "migrate-pub.phase1.error", rkey, error: String(err) }, "migrate-pub.phase1.error");
        failed++;
      }
    }

    logger.warn({ event: "migrate-pub.phase1", user_did: did, processed, skipped, failed }, "migrate-pub.phase1");
    return { ok: true, phase: 1, processed, skipped, failed };
  }

  if (phase === 2) {
    const [oldSites, documents] = await Promise.all([
      agent.com.atproto.repo.listRecords({ repo: did, collection: OLD_SITE_COLLECTION, limit: 100 }),
      agent.com.atproto.repo.listRecords({ repo: did, collection: DOCUMENT_COLLECTION, limit: 100 }),
    ]);

    // Build lookup: composedUrl → { rkey, domain, basePath }
    const siteByUrl = new Map<string, { rkey: string; domain: string; basePath: string }>();
    for (const sr of oldSites.data.records) {
      const v = sr.value as Record<string, unknown>;
      const rkey = sr.uri.split("/").pop()!;
      const domain = String(v.url ?? "");
      const basePath = String(v.urlPrefix ?? "");
      const composedUrl = basePath ? `https://${domain}/${basePath}` : `https://${domain}`;
      siteByUrl.set(composedUrl, { rkey, domain, basePath });
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const docRecord of documents.data.records) {
      const rkey = docRecord.uri.split("/").pop()!;
      const v = docRecord.value as Record<string, unknown>;
      const siteField = String(v.site ?? "");

      if (siteField.startsWith("at://")) { skipped++; continue; }

      const siteInfo = siteByUrl.get(siteField);
      if (!siteInfo) {
        logger.warn({ event: "migrate-pub.phase2.nosite", rkey, siteField }, "migrate-pub.phase2.nosite");
        skipped++;
        continue;
      }

      try {
        const docPath = String(v.path ?? `/${rkey}`);
        const canonicalUrl = siteInfo.basePath
          ? `https://${siteInfo.domain}/${siteInfo.basePath}${docPath}`
          : `https://${siteInfo.domain}${docPath}`;
        const siteAtUri = `at://${did}/${SITE_COLLECTION}/${siteInfo.rkey}`;

        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          record: { ...v, site: siteAtUri, canonicalUrl },
          swapRecord: docRecord.cid,
        });
        processed++;
      } catch (err) {
        logger.error({ event: "migrate-pub.phase2.error", rkey, error: String(err) }, "migrate-pub.phase2.error");
        failed++;
      }
    }

    logger.warn({ event: "migrate-pub.phase2", user_did: did, processed, skipped, failed }, "migrate-pub.phase2");
    return { ok: true, phase: 2, processed, skipped, failed };
  }

  if (phase === 3) {
    const oldSites = await agent.com.atproto.repo.listRecords({ repo: did, collection: OLD_SITE_COLLECTION, limit: 100 });

    let processed = 0;
    let failed = 0;

    for (const siteRecord of oldSites.data.records) {
      const rkey = siteRecord.uri.split("/").pop()!;
      try {
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: OLD_SITE_COLLECTION,
          rkey,
          swapRecord: siteRecord.cid,
        });
        processed++;
      } catch (err) {
        logger.error({ event: "migrate-pub.phase3.error", rkey, error: String(err) }, "migrate-pub.phase3.error");
        failed++;
      }
    }

    logger.warn({ event: "migrate-pub.phase3", user_did: did, processed, failed }, "migrate-pub.phase3");
    return { ok: true, phase: 3, processed, skipped: 0, failed };
  }

  return { ok: false, error: "Unknown phase." };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Migrate Publication — Scribe ATP" }];
}

export default function MigratePublicationPage({ loaderData }: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as PhaseResult | undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Documents}>
            Migrate Publication
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Migration is not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Migrate Publication
        </PageContainerHeading>
      }
    >
      <PageSection>
        <p>
          <strong>{plan!.oldSiteCount}</strong>{" "}
          <code>app.scribe.site</code> records →{" "}
          <strong>{plan!.newSiteCount}</strong>{" "}
          <code>site.standard.publication</code> records already exist.
        </p>
        <p>
          <strong>{plan!.documentCount}</strong>{" "}
          <code>site.standard.document</code> records,{" "}
          <strong>{plan!.documentsNeedingUpdate}</strong> with URL-style{" "}
          <code>site</code> field needing update.
        </p>
      </PageSection>

      {result && (
        <PageSection>
          {result.ok ? (
            <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
              Phase {result.phase} complete — processed {result.processed}, skipped{" "}
              {result.skipped ?? 0}, failed {result.failed ?? 0}.
            </p>
          ) : (
            <p style={{ color: "var(--action-danger)" }}>Error: {result.error}</p>
          )}
        </PageSection>
      )}

      <PageSection>
        <p style={{ fontWeight: 600 }}>
          Phase 1 — Create <code>site.standard.publication</code> records
        </p>
        <p style={{ fontSize: "0.9em", color: "var(--text-secondary)" }}>
          Reads each <code>app.scribe.site</code> record and creates a matching{" "}
          <code>site.standard.publication</code> with the nested{" "}
          <code>scribe</code> extension. Skips rkeys that already exist.
        </p>
        <fetcher.Form method="post">
          <input type="hidden" name="_phase" value="1" />
          <Button type="submit" disabled={isRunning}>
            {isRunning ? "Running…" : "Run Phase 1"}
          </Button>
        </fetcher.Form>
      </PageSection>

      <PageSection>
        <p style={{ fontWeight: 600 }}>
          Phase 2 — Update <code>site.standard.document</code> records
        </p>
        <p style={{ fontSize: "0.9em", color: "var(--text-secondary)" }}>
          Rewrites the <code>site</code> field from a URL string to an AT URI
          and adds <code>canonicalUrl</code>. Skips records already using an AT
          URI.
        </p>
        <fetcher.Form method="post">
          <input type="hidden" name="_phase" value="2" />
          <Button type="submit" disabled={isRunning}>
            {isRunning ? "Running…" : "Run Phase 2"}
          </Button>
        </fetcher.Form>
      </PageSection>

      <PageSection>
        <p style={{ fontWeight: 600 }}>
          Phase 3 — Delete <code>app.scribe.site</code> records
        </p>
        <p style={{ fontSize: "0.9em", color: "var(--text-secondary)" }}>
          ⚠️ Irreversible. Only run after Phase 1 and Phase 2 complete
          successfully and all consumer sites are updated to{" "}
          <code>@scribe-atp/core@2.1.0</code>.
        </p>
        <fetcher.Form method="post">
          <input type="hidden" name="_phase" value="3" />
          <Button type="submit" variant="danger" disabled={isRunning}>
            {isRunning ? "Running…" : "Run Phase 3"}
          </Button>
        </fetcher.Form>
      </PageSection>
    </PageContainer>
  );
}
