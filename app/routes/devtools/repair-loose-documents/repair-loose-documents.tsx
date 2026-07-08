import type { Route } from "./+types/repair-loose-documents";
import { useFetcher } from "react-router";
import { requireAdminAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  fetchAllDocuments,
  fetchAllSites,
  buildDocLocationMap,
  buildLoosePlan,
  type LooseRepairPlan,
} from "~/services/repairLooseDocuments.server";
import { buildLooseDocumentFields } from "~/services/article.server";
import { DOCUMENT_COLLECTION } from "~/constants";
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

type RepairResult = {
  ok: boolean;
  repaired?: number;
  failed?: number;
  details?: Array<{ rkey: string; ok: boolean; error?: string }>;
  error?: string;
};

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as LooseRepairPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const [documents, sites] = await Promise.all([
    fetchAllDocuments(agent, did),
    fetchAllSites(agent, did),
  ]);

  const locationMap = buildDocLocationMap(sites);
  const plan = buildLoosePlan(documents, locationMap, did);

  return { plan, devMode: false as const };
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

  const locationMap = buildDocLocationMap(sites);
  const plan = buildLoosePlan(documents, locationMap, did);

  const details: Array<{ rkey: string; ok: boolean; error?: string }> = [];

  for (const item of plan.toRepair) {
    const doc = documents.find((d) => d.uri.split("/").pop() === item.rkey);
    if (!doc) {
      details.push({ rkey: item.rkey, ok: false, error: "Record not found" });
      continue;
    }

    try {
      const v = doc.value as Record<string, unknown>;
      const { site, path, scribe } = buildLooseDocumentFields(
        did,
        item.rkey,
        String(v.path ?? ""),
        (v.scribe as Record<string, unknown>) ?? {},
      );

      const updatedRecord: Record<string, unknown> = {
        ...v,
        site,
        path,
        scribe,
        updatedAt: new Date().toISOString(),
      };
      delete updatedRecord.publishedAt;

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: item.rkey,
        record: updatedRecord,
        swapRecord: doc.cid,
      });
      details.push({ rkey: item.rkey, ok: true });
      logger.info(
        { event: "repair-loose-documents.fix", rkey: item.rkey },
        "repair-loose-documents.fix",
      );
    } catch (err) {
      details.push({ rkey: item.rkey, ok: false, error: String(err) });
      logger.error(
        { event: "repair-loose-documents.error", rkey: item.rkey, error: String(err) },
        "repair-loose-documents.error",
      );
    }
  }

  const repaired = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "repair-loose-documents.run", user_did: did, repaired, failed },
    "repair-loose-documents.run",
  );

  return { ok: true, repaired, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Repair Loose Documents — Scribe ATP" }];
}

export default function RepairLooseDocumentsPage({ loaderData }: Route.ComponentProps) {
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
            Repair Loose Documents
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Repair is not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { toRepair, alreadyLoose, stillAssigned, skippedNonScribe } = plan!;
  const isEmpty = toRepair.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Repair Loose Documents
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
            All {alreadyLoose} unassigned document{alreadyLoose !== 1 ? "s" : ""} already have
            correct loose field values. Nothing to repair.
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
            {stillAssigned} document{stillAssigned !== 1 ? "s" : ""} currently assigned to a site
            — skipped.
            {skippedNonScribe > 0 &&
              ` ${skippedNonScribe} non-Scribe document${skippedNonScribe !== 1 ? "s" : ""} (a different site.standard app) — skipped.`}
          </p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{toRepair.length}</strong> unassigned document
              {toRepair.length !== 1 ? "s" : ""} still carr
              {toRepair.length !== 1 ? "y" : "ies"} a stale <code>site</code>,{" "}
              <code>publishedAt</code>, <code>scribe.canonicalUrl</code>, or{" "}
              <code>scribe.domain</code> value and will be reset to the loose state (
              <code>site</code> set to a reader URL, the other three cleared).
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              {alreadyLoose} already correct. {stillAssigned} currently assigned to a site —
              skipped.
              {skippedNonScribe > 0 &&
                ` ${skippedNonScribe} non-Scribe document${skippedNonScribe !== 1 ? "s" : ""} — skipped.`}
            </p>
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
                  {["Title", "Current site", "New site", "Clearing"].map((h) => (
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
                {toRepair.map((item) => {
                  const clearing = [
                    item.hadPublishedAt && "publishedAt",
                    item.hadCanonicalUrl && "canonicalUrl",
                    item.hadScribeDomain && "scribe.domain",
                  ].filter(Boolean);
                  return (
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
                          maxWidth: "16rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <code>{item.currentSite || "(empty)"}</code>
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--action-primary)",
                          maxWidth: "16rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <code>{item.newSite}</code>
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderBottom: "1px solid var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {clearing.length > 0 ? clearing.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
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
