import type { Route } from "./+types/repair-document-paths";
import { useFetcher } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  fetchAllDocuments,
  fetchAllSites,
  buildDocLocationMap,
  buildPlan,
  type RepairPlan,
} from "~/services/repairDocumentPaths.server";
import { DOCUMENT_COLLECTION } from "~/constants";
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

type RepairResult = {
  ok: boolean;
  repaired?: number;
  deleted?: number;
  failed?: number;
  details?: Array<{ rkey: string; ok: boolean; error?: string }>;
  error?: string;
};

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
          // `site` is also self-healed here, not just path/canonicalUrl —
          // a stale/orphaned `site` field (pointing at a publication that
          // no longer references the document) previously caused the
          // canonical-location fallback to pick an arbitrary location,
          // once demoting a real published page below an unrelated draft.
          // See [[urgent-article-path-basepath-bug]] ("Code Assistants").
          site: `at://${did}/site.standard.publication/${item.canonicalSiteRkey}`,
          // canonicalUrl lives under scribe, not top-level (site.standard
          // lexicon spec compliance) — this previously wrote a spurious
          // top-level field and left the real scribe.canonicalUrl stale.
          scribe: {
            ...((v.scribe as Record<string, unknown>) ?? {}),
            domain: item.domain,
            canonicalUrl: item.canonicalUrl,
          },
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
