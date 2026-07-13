import type { Route } from "./+types/repair-article-html-classes";
import { useFetcher } from "react-router";
import { requireAdminAtpAgent, useRealOAuth } from "~/services/auth.server";
import { listDocuments, putDocument } from "~/services/documentRepository.server";
import { sanitizeArticleHtml } from "~/services/article.server";
import {
  buildHtmlClassRepairPlan,
  type HtmlClassRepairPlan,
} from "~/services/repairArticleHtmlClasses.server";
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
    return { plan: null as HtmlClassRepairPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const documents = await listDocuments(agent, did);
  const plan = buildHtmlClassRepairPlan(documents);

  return { plan, devMode: false as const };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<RepairResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const documents = await listDocuments(agent, did);
  const plan = buildHtmlClassRepairPlan(documents);

  const details: Array<{ rkey: string; ok: boolean; error?: string }> = [];

  for (const item of plan.toRepair) {
    const doc = documents.find((d) => d.rkey === item.rkey);
    if (!doc) {
      details.push({ rkey: item.rkey, ok: false, error: "Record not found" });
      continue;
    }

    try {
      const content = doc.value.content as { html?: string } | undefined;
      await putDocument(
        agent,
        did,
        item.rkey,
        {
          ...doc.value,
          content: { ...content, html: sanitizeArticleHtml(content?.html ?? "") },
          updatedAt: new Date().toISOString(),
        },
        doc.cid,
      );
      details.push({ rkey: item.rkey, ok: true });
      logger.info(
        {
          event: "repair-html-classes.fix",
          rkey: item.rkey,
          removed: item.removedClasses.length,
        },
        "repair-html-classes.fix",
      );
    } catch (err) {
      details.push({ rkey: item.rkey, ok: false, error: String(err) });
      logger.error(
        { event: "repair-html-classes.error", rkey: item.rkey, error: String(err) },
        "repair-html-classes.error",
      );
    }
  }

  const repaired = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "repair-html-classes.run", user_did: did, repaired, failed },
    "repair-html-classes.run",
  );

  return { ok: true, repaired, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Repair Article HTML Classes — Scribe ATP" }];
}

export default function RepairArticleHtmlClassesPage({ loaderData }: Route.ComponentProps) {
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
            Repair Article HTML Classes
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Repair is not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { toRepair, alreadyClean } = plan!;
  const isEmpty = toRepair.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Repair Article HTML Classes
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
            All {alreadyClean} document{alreadyClean !== 1 ? "s" : ""} already have clean
            HTML. Nothing to repair.
          </p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{toRepair.length}</strong> document{toRepair.length !== 1 ? "s" : ""}{" "}
              have editor-only CSS classes baked into their saved HTML and will be
              cleaned.
              {alreadyClean > 0 && (
                <> <strong>{alreadyClean}</strong> already clean.</>
              )}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              Only classes required by @scribe-atp/styles (Prism syntax-highlighting
              token classes) are kept — everything else came from the CMS's own
              editor theme and is meaningless on any reader site.
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
                  {["Title", "Classes to remove"].map((h) => (
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
                      <code>{item.removedClasses.join(", ")}</code>
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
