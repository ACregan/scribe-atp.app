import type { Route } from "./+types/repair-publication-refs";
import { useFetcher } from "react-router";
import { type Agent } from "@atproto/api";
import { requireAdminAtpAgent, useRealOAuth } from "~/services/auth.server";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { logger } from "~/services/logger.server";

// --- Types ---

type StaleRef = {
  siteRkey: string;
  oldUri: string;
  newUri: string;
  slug: string;
};

type RepairPlan = {
  staleRefs: StaleRef[];
};

type RepairResult = {
  ok: boolean;
  repaired?: number;
  failed?: number;
  details?: Array<{ siteRkey: string; oldUri: string; newUri: string; ok: boolean; error?: string }>;
  error?: string;
};

// --- Helpers ---

async function fetchAllDocuments(agent: Agent, did: string) {
  const records: Array<{ uri: string; cid: string; value: unknown }> = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 100,
      cursor,
    });
    records.push(...(result.data.records as typeof records));
    cursor = result.data.cursor;
  } while (cursor);
  return records;
}

async function fetchAllSites(agent: Agent, did: string) {
  const records: Array<{ uri: string; cid: string; value: unknown }> = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
      cursor,
    });
    records.push(...(result.data.records as typeof records));
    cursor = result.data.cursor;
  } while (cursor);
  return records;
}

function buildSlugToTidMap(
  documents: Array<{ uri: string; value: unknown }>,
  did: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of documents) {
    const v = doc.value as Record<string, unknown>;
    const path = v.path as string | undefined;
    if (!path) continue;
    const slug = path.split("/").pop();
    if (!slug) continue;
    const oldSlugUri = `at://${did}/${DOCUMENT_COLLECTION}/${slug}`;
    if (oldSlugUri !== doc.uri) {
      map.set(oldSlugUri, doc.uri);
    }
  }
  return map;
}

function findStaleRefs(
  sites: Array<{ uri: string; value: unknown }>,
  slugToTid: Map<string, string>
): StaleRef[] {
  const stale: StaleRef[] = [];
  for (const site of sites) {
    const sv = site.value as Record<string, unknown>;
    const scribe = (sv.scribe as Record<string, unknown>) ?? {};
    const siteRkey = site.uri.split("/").pop()!;

    const allRefs = [
      ...((scribe.ungroupedArticles as Array<Record<string, unknown>>) ?? []),
      ...((scribe.groups as Array<Record<string, unknown>>) ?? []).flatMap(
        (g) => (g.articles as Array<Record<string, unknown>>) ?? []
      ),
    ];

    for (const ref of allRefs) {
      const oldUri = String(ref.uri ?? "");
      const newUri = slugToTid.get(oldUri);
      if (newUri && newUri !== oldUri) {
        const slug = oldUri.split("/").pop()!;
        stale.push({ siteRkey, oldUri, newUri, slug });
      }
    }
  }
  return stale;
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as RepairPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const [documents, sites] = await Promise.all([
    fetchAllDocuments(agent, did),
    fetchAllSites(agent, did),
  ]);

  const slugToTid = buildSlugToTidMap(documents, did);
  const staleRefs = findStaleRefs(sites, slugToTid);

  return { plan: { staleRefs }, devMode: false as const };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<RepairResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const [documents, sites] = await Promise.all([
    fetchAllDocuments(agent, did),
    fetchAllSites(agent, did),
  ]);

  const slugToTid = buildSlugToTidMap(documents, did);
  const staleRefs = findStaleRefs(sites, slugToTid);

  if (staleRefs.length === 0) {
    return { ok: true, repaired: 0, failed: 0, details: [] };
  }

  const details: Array<{ siteRkey: string; oldUri: string; newUri: string; ok: boolean; error?: string }> = [];

  // Group stale refs by siteRkey so we do one putRecord per site
  const bySite = new Map<string, StaleRef[]>();
  for (const ref of staleRefs) {
    const existing = bySite.get(ref.siteRkey) ?? [];
    existing.push(ref);
    bySite.set(ref.siteRkey, existing);
  }

  for (const [siteRkey, refs] of bySite) {
    const siteRecord = sites.find((s) => s.uri.split("/").pop() === siteRkey);
    if (!siteRecord) {
      for (const ref of refs) {
        details.push({ siteRkey, oldUri: ref.oldUri, newUri: ref.newUri, ok: false, error: "Site record not found" });
      }
      continue;
    }

    try {
      const sv = siteRecord.value as Record<string, unknown>;
      const scribe = (sv.scribe as Record<string, unknown>) ?? {};

      const rewriteRef = (ref: Record<string, unknown>): Record<string, unknown> => {
        const oldUri = String(ref.uri ?? "");
        const newUri = slugToTid.get(oldUri);
        return newUri && newUri !== oldUri ? { ...ref, uri: newUri } : ref;
      };

      const groups = ((scribe.groups as Array<Record<string, unknown>>) ?? []).map(
        (g) => ({
          ...g,
          articles: ((g.articles as Array<Record<string, unknown>>) ?? []).map(rewriteRef),
        })
      );

      const ungroupedArticles = (
        (scribe.ungroupedArticles as Array<Record<string, unknown>>) ?? []
      ).map(rewriteRef);

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: {
          ...sv,
          scribe: { ...scribe, groups, ungroupedArticles },
        },
        swapRecord: siteRecord.cid,
      });

      for (const ref of refs) {
        details.push({ siteRkey, oldUri: ref.oldUri, newUri: ref.newUri, ok: true });
      }
    } catch (err) {
      for (const ref of refs) {
        details.push({ siteRkey, oldUri: ref.oldUri, newUri: ref.newUri, ok: false, error: String(err) });
      }
      logger.error(
        { event: "repair-publication-refs.error", siteRkey, error: String(err) },
        "repair-publication-refs.error"
      );
    }
  }

  const repaired = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "repair-publication-refs.run", user_did: did, repaired, failed },
    "repair-publication-refs.run"
  );

  return { ok: true, repaired, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Repair Publication Refs — Scribe ATP" }];
}

export default function RepairPublicationRefsPage({ loaderData }: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as RepairResult | undefined;
  const isDone = result?.ok && result.repaired !== undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Documents}>
            Repair Publication Refs
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { staleRefs } = plan!;
  const isEmpty = staleRefs.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Repair Publication Refs
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Repair complete
          </p>
          <p>
            {result!.repaired} ref{result!.repaired !== 1 ? "s" : ""} updated.
            {result!.failed ? ` ${result!.failed} failed — check server logs.` : ""}
          </p>
          {result!.details
            ?.filter((d) => !d.ok)
            .map((d) => (
              <p key={d.oldUri} style={{ color: "var(--action-danger)" }}>
                {d.siteRkey} / {d.oldUri.split("/").pop()}: {d.error}
              </p>
            ))}
        </PageSection>
      ) : isEmpty ? (
        <PageSection>
          <p>No stale publication refs found. All sites are up to date.</p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{staleRefs.length}</strong> publication ref{staleRefs.length !== 1 ? "s" : ""} still
              point to slug-based document URIs. These will be rewritten to the correct TID URIs.
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              The previous migration updated <code>app.scribe.site</code> records but not{" "}
              <code>site.standard.publication</code> records. This script fixes that.
            </p>
          </PageSection>

          <PageSection>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>
              <thead>
                <tr>
                  {["Site", "Slug (stale rkey)"].map((h) => (
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
                  ))}
                </tr>
              </thead>
              <tbody>
                {staleRefs.map((item) => (
                  <tr key={`${item.siteRkey}:${item.oldUri}`}>
                    <td style={{ padding: "0.4rem 0.8rem", borderBottom: "1px solid var(--border-subtle)" }}>
                      <code>{item.siteRkey}</code>
                    </td>
                    <td style={{ padding: "0.4rem 0.8rem", borderBottom: "1px solid var(--border-subtle)" }}>
                      <code>{item.slug}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PageSection>

          <PageSection>
            {result?.error && (
              <p style={{ color: "var(--action-danger)", marginBottom: "1rem" }}>
                Error: {result.error}
              </p>
            )}
            <fetcher.Form method="post">
              <Button type="submit" variant="danger" disabled={isRunning}>
                {isRunning ? (
                  <>
                    <Spinner size="small" /> Repairing…
                  </>
                ) : (
                  "Run Repair"
                )}
              </Button>
            </fetcher.Form>
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
