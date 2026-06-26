import type { Route } from "./+types/repair-document-paths";
import { useFetcher } from "react-router";
import { type Agent } from "@atproto/api";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
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

const STALE_RKEY = "alt-text-test";

// --- Types ---

type DocumentRepairPlan = {
  rkey: string;
  title: string;
  currentPath: string;
  expectedPath: string;
  canonicalUrl: string;
};

type RepairPlan = {
  toRepair: DocumentRepairPlan[];
  toDelete: string[];
  alreadyCorrect: number;
  orphaned: number;
};

type RepairResult = {
  ok: boolean;
  repaired?: number;
  deleted?: number;
  failed?: number;
  details?: Array<{ rkey: string; ok: boolean; error?: string }>;
  error?: string;
};

// --- Helpers ---

function isTid(rkey: string): boolean {
  return /^[234567a-z]{13}$/.test(rkey);
}

function buildCanonicalUrl(domain: string, basePath: string, docPath: string): string {
  return basePath
    ? `https://${domain}/${basePath}${docPath}`
    : `https://${domain}${docPath}`;
}

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

type DocLocation = {
  slug: string;
  groupSlug: string | null;
  domain: string;
  basePath: string;
};

function buildDocLocationMap(
  sites: Array<{ uri: string; cid: string; value: unknown }>,
): Map<string, DocLocation> {
  const map = new Map<string, DocLocation>();

  for (const siteRecord of sites) {
    const v = siteRecord.value as Record<string, unknown>;
    const scribe = (v.scribe as Record<string, unknown>) ?? {};
    const domain = String(scribe.domain ?? "");
    const basePath = String(scribe.basePath ?? "");
    if (!domain) continue;

    const groups = ((scribe.groups as Array<Record<string, unknown>>) ?? []);
    const ungrouped = ((scribe.ungroupedArticles as Array<Record<string, unknown>>) ?? []);

    for (const group of groups) {
      const groupSlug = String(group.slug ?? "");
      const articles = ((group.articles as Array<Record<string, unknown>>) ?? []);
      for (const ref of articles) {
        const tid = String(ref.uri ?? "").split("/").pop()!;
        const slug = String(ref.slug ?? "");
        if (tid && slug) map.set(tid, { slug, groupSlug, domain, basePath });
      }
    }

    for (const ref of ungrouped) {
      const tid = String(ref.uri ?? "").split("/").pop()!;
      const slug = String(ref.slug ?? "");
      if (tid && slug) map.set(tid, { slug, groupSlug: null, domain, basePath });
    }
  }

  return map;
}

function buildPlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
  locationMap: Map<string, DocLocation>,
): RepairPlan {
  const toRepair: DocumentRepairPlan[] = [];
  const toDelete: string[] = [];
  let alreadyCorrect = 0;
  let orphaned = 0;

  for (const doc of documents) {
    const rkey = doc.uri.split("/").pop()!;
    const v = doc.value as Record<string, unknown>;
    const title = String(v.title ?? "Untitled");
    const currentPath = String(v.path ?? "");

    if (rkey === STALE_RKEY) {
      toDelete.push(rkey);
      continue;
    }

    const location = locationMap.get(rkey);

    if (!location) {
      // Draft — not in any manifest. Flag if path looks corrupted (ends with TID).
      const lastSegment = currentPath.split("/").pop() ?? "";
      if (isTid(lastSegment)) orphaned++;
      continue;
    }

    const expectedPath = location.groupSlug
      ? `/${location.groupSlug}/${location.slug}`
      : `/${location.slug}`;

    if (currentPath === expectedPath) {
      alreadyCorrect++;
      continue;
    }

    toRepair.push({
      rkey,
      title,
      currentPath,
      expectedPath,
      canonicalUrl: buildCanonicalUrl(location.domain, location.basePath, expectedPath),
    });
  }

  return { toRepair, toDelete, alreadyCorrect, orphaned };
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as RepairPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAtpAgent(request);
  const [documents, sites] = await Promise.all([
    fetchAllDocuments(agent, did),
    fetchAllSites(agent, did),
  ]);

  const locationMap = buildDocLocationMap(sites);
  const plan = buildPlan(documents, locationMap);

  return { plan, devMode: false as const };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<RepairResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }

  const { agent, did } = await requireAtpAgent(request);
  const [documents, sites] = await Promise.all([
    fetchAllDocuments(agent, did),
    fetchAllSites(agent, did),
  ]);

  const locationMap = buildDocLocationMap(sites);
  const plan = buildPlan(documents, locationMap);

  const details: Array<{ rkey: string; ok: boolean; error?: string }> = [];
  let deleted = 0;

  // Delete stale test record first
  for (const rkey of plan.toDelete) {
    const doc = documents.find((d) => d.uri.split("/").pop() === rkey);
    try {
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey,
        swapRecord: doc?.cid,
      });
      deleted++;
      logger.info({ event: "repair-paths.delete", rkey }, "repair-paths.delete");
    } catch (err) {
      details.push({ rkey, ok: false, error: `Delete failed: ${String(err)}` });
      logger.error({ event: "repair-paths.delete.error", rkey, error: String(err) }, "repair-paths.delete.error");
    }
  }

  // Repair corrupted paths
  for (const item of plan.toRepair) {
    const doc = documents.find((d) => d.uri.split("/").pop() === item.rkey);
    if (!doc) {
      details.push({ rkey: item.rkey, ok: false, error: "Record not found" });
      continue;
    }

    try {
      const v = doc.value as Record<string, unknown>;
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: item.rkey,
        record: {
          ...v,
          path: item.expectedPath,
          canonicalUrl: item.canonicalUrl,
          updatedAt: new Date().toISOString(),
        },
        swapRecord: doc.cid,
      });
      details.push({ rkey: item.rkey, ok: true });
      logger.info(
        { event: "repair-paths.fix", rkey: item.rkey, path: item.expectedPath },
        "repair-paths.fix",
      );
    } catch (err) {
      details.push({ rkey: item.rkey, ok: false, error: String(err) });
      logger.error(
        { event: "repair-paths.error", rkey: item.rkey, error: String(err) },
        "repair-paths.error",
      );
    }
  }

  const repaired = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "repair-paths.run", user_did: did, repaired, deleted, failed },
    "repair-paths.run",
  );

  return { ok: true, repaired, deleted, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Repair Document Paths — Scribe ATP" }];
}

export default function RepairDocumentPathsPage({ loaderData }: Route.ComponentProps) {
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
            Repair Document Paths
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Repair is not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { toRepair, toDelete, alreadyCorrect, orphaned } = plan!;
  const isEmpty = toRepair.length === 0 && toDelete.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Repair Document Paths
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Repair complete
          </p>
          <p>
            {result!.repaired} record{result!.repaired !== 1 ? "s" : ""} repaired.
            {result!.deleted ? ` ${result!.deleted} deleted.` : ""}
            {result!.failed ? ` ${result!.failed} failed — check server logs.` : ""}
          </p>
          {result!.details
            ?.filter((d) => !d.ok)
            .map((d) => (
              <p key={d.rkey} style={{ color: "var(--action-danger)" }}>
                <code>{d.rkey}</code>: {d.error}
              </p>
            ))}
        </PageSection>
      ) : isEmpty ? (
        <PageSection>
          <p>
            All {alreadyCorrect} published document{alreadyCorrect !== 1 ? "s" : ""} already have
            correct paths. Nothing to repair.
          </p>
          {orphaned > 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              {orphaned} draft document{orphaned !== 1 ? "s" : ""} not in any publication manifest
              — skipped.
            </p>
          )}
        </PageSection>
      ) : (
        <>
          {toDelete.length > 0 && (
            <PageSection>
              <p>
                <strong>{toDelete.length}</strong> stale record{toDelete.length !== 1 ? "s" : ""}{" "}
                will be deleted:
              </p>
              <ul>
                {toDelete.map((rkey) => (
                  <li key={rkey}>
                    <code>{rkey}</code>
                  </li>
                ))}
              </ul>
            </PageSection>
          )}

          {toRepair.length > 0 && (
            <PageSection>
              <p>
                <strong>{toRepair.length}</strong> published document
                {toRepair.length !== 1 ? "s" : ""} have paths containing TIDs instead of
                human-readable slugs and will be repaired.
                {alreadyCorrect > 0 && (
                  <> <strong>{alreadyCorrect}</strong> already correct.</>
                )}
              </p>
              {orphaned > 0 && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
                  {orphaned} unpublished draft{orphaned !== 1 ? "s" : ""} with potentially
                  corrupted paths cannot be automatically repaired (no manifest entry) — skipped.
                </p>
              )}
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "0.9em",
                  marginTop: "1rem",
                }}
              >
                <thead>
                  <tr>
                    {["Title", "Current path", "Repaired path"].map((h) => (
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
                  {toRepair.map((item) => (
                    <tr key={item.rkey}>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        {item.title}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--action-danger)",
                        }}
                      >
                        <code>{item.currentPath}</code>
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--action-primary)",
                        }}
                      >
                        <code>{item.expectedPath}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PageSection>
          )}

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
