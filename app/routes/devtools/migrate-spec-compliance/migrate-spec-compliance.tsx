import type { Route } from "./+types/migrate-spec-compliance";
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
import { Spinner } from "~/components/Spinner/Spinner";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { logger } from "~/services/logger.server";

// --- Types ---

type DocChange = {
  rkey: string;
  title: string;
  fixes: string[];
};

type MigrationPlan = {
  toUpdate: DocChange[];
  alreadyCompliant: number;
  total: number;
};

type MigrationResult = {
  ok: boolean;
  updated?: number;
  failed?: number;
  details?: Array<{ rkey: string; ok: boolean; error?: string }>;
  error?: string;
};

// --- Helpers ---

async function fetchAllPublications(agent: Agent, did: string) {
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

function buildAtUriToHttpsUrl(
  publications: Array<{ uri: string; value: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const pub of publications) {
    const v = pub.value as Record<string, unknown>;
    const scribe = v.scribe as Record<string, unknown> | undefined;
    const domain = String(scribe?.domain ?? "");
    if (domain) map.set(pub.uri, `https://${domain}`);
  }
  return map;
}

function extractTextContent(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function buildPlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
  atUriToHttps: Map<string, string>,
): MigrationPlan {
  const toUpdate: DocChange[] = [];
  let alreadyCompliant = 0;

  for (const doc of documents) {
    const v = doc.value as Record<string, unknown>;
    const rkey = doc.uri.split("/").pop()!;
    const title = String(v.title ?? "Untitled");
    const fixes: string[] = [];

    const site = String(v.site ?? "");
    if (site.startsWith("at://")) {
      const httpsUrl = atUriToHttps.get(site);
      fixes.push(`site: AT URI → ${httpsUrl ?? "(unresolved)"}`);
    }

    if (v.splashImageUrl !== undefined) fixes.push("splashImageUrl → scribe.splashImageUrl");
    if (v.createdAt !== undefined) fixes.push("createdAt → scribe.createdAt");
    if (v.canonicalUrl !== undefined) fixes.push("canonicalUrl → scribe.canonicalUrl");

    const content = v.content as Record<string, unknown> | undefined;
    const html = String(content?.html ?? "");
    if (!v.textContent && html) fixes.push("textContent: generate from content");

    if (fixes.length > 0) {
      toUpdate.push({ rkey, title, fixes });
    } else {
      alreadyCompliant++;
    }
  }

  return { toUpdate, alreadyCompliant, total: documents.length };
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as MigrationPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAtpAgent(request);
  const [publications, documents] = await Promise.all([
    fetchAllPublications(agent, did),
    fetchAllDocuments(agent, did),
  ]);

  const atUriToHttps = buildAtUriToHttpsUrl(publications);
  const plan = buildPlan(documents, atUriToHttps);
  return { plan, devMode: false as const };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<MigrationResult> {
  if (!useRealOAuth) return { ok: false, error: "Not available in dev mode." };

  const { agent, did } = await requireAtpAgent(request);
  const [publications, documents] = await Promise.all([
    fetchAllPublications(agent, did),
    fetchAllDocuments(agent, did),
  ]);

  const atUriToHttps = buildAtUriToHttpsUrl(publications);
  const plan = buildPlan(documents, atUriToHttps);

  if (plan.toUpdate.length === 0) {
    return { ok: true, updated: 0, failed: 0, details: [] };
  }

  const details: Array<{ rkey: string; ok: boolean; error?: string }> = [];

  for (const item of plan.toUpdate) {
    const doc = documents.find((d) => d.uri.split("/").pop() === item.rkey);
    if (!doc) {
      details.push({ rkey: item.rkey, ok: false, error: "Record not found" });
      continue;
    }

    try {
      const dv = doc.value as Record<string, unknown>;
      const existingScribe = (dv.scribe as Record<string, unknown>) ?? {};

      // Resolve site field
      const currentSite = String(dv.site ?? "");
      const newSite = currentSite.startsWith("at://")
        ? (atUriToHttps.get(currentSite) ?? "")
        : currentSite;

      // Generate textContent if missing
      const content = dv.content as Record<string, unknown> | undefined;
      const html = String(content?.html ?? "");
      const textContent = dv.textContent
        ? String(dv.textContent)
        : html ? extractTextContent(html) : undefined;

      // Build updated scribe — absorb top-level fields
      const updatedScribe: Record<string, unknown> = {
        ...existingScribe,
        ...(dv.splashImageUrl !== undefined
          ? { splashImageUrl: dv.splashImageUrl }
          : {}),
        ...(dv.createdAt !== undefined
          ? { createdAt: dv.createdAt }
          : {}),
        ...(dv.canonicalUrl !== undefined
          ? { canonicalUrl: dv.canonicalUrl }
          : {}),
      };

      // Build updated top-level record — remove migrated fields
      const {
        splashImageUrl: _sp,
        createdAt: _ca,
        canonicalUrl: _cu,
        ...dvRest
      } = dv;

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: item.rkey,
        record: {
          ...dvRest,
          site: newSite,
          textContent: textContent || undefined,
          scribe: updatedScribe,
          updatedAt: new Date().toISOString(),
        },
        swapRecord: doc.cid,
      });

      details.push({ rkey: item.rkey, ok: true });
    } catch (err) {
      details.push({ rkey: item.rkey, ok: false, error: String(err) });
      logger.error(
        { event: "migrate-spec-compliance.error", rkey: item.rkey, error: String(err) },
        "migrate-spec-compliance.error",
      );
    }
  }

  const updated = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "migrate-spec-compliance.run", user_did: did, updated, failed },
    "migrate-spec-compliance.run",
  );

  return { ok: true, updated, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Migrate Spec Compliance — Scribe ATP" }];
}

export default function MigrateSpecCompliancePage({
  loaderData,
}: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as MigrationResult | undefined;
  const isDone = result?.ok && result.updated !== undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Documents}>
            Migrate Spec Compliance
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { toUpdate, alreadyCompliant, total } = plan!;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Migrate Spec Compliance
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Migration complete
          </p>
          <p>
            {result!.updated} document{result!.updated !== 1 ? "s" : ""} updated.
            {result!.failed ? ` ${result!.failed} failed — check server logs.` : ""}
          </p>
          {result!.details?.filter((d) => !d.ok).map((d) => (
            <p key={d.rkey} style={{ color: "var(--action-danger)" }}>
              {d.rkey}: {d.error}
            </p>
          ))}
        </PageSection>
      ) : toUpdate.length === 0 ? (
        <PageSection>
          <p>
            All {total} <code>site.standard.document</code> record
            {total !== 1 ? "s" : ""} are already spec-compliant. Nothing to migrate.
          </p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{toUpdate.length}</strong> document
              {toUpdate.length !== 1 ? "s" : ""} need updating.
              {alreadyCompliant > 0 && (
                <> <strong>{alreadyCompliant}</strong> already compliant and will be skipped.</>
              )}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              Each record will have its <code>site</code> field set to an{" "}
              <code>https://</code> URL, non-spec fields moved into{" "}
              <code>scribe.*</code>, and <code>textContent</code> generated from HTML content.
            </p>
          </PageSection>

          <PageSection>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>
              <thead>
                <tr>
                  {["Document", "Changes"].map((h) => (
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
                {toUpdate.map((item) => (
                  <tr key={item.rkey}>
                    <td style={{ padding: "0.4rem 0.8rem", borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" }}>
                      {item.title}
                      <br />
                      <code style={{ fontSize: "0.85em", color: "var(--text-secondary)" }}>{item.rkey}</code>
                    </td>
                    <td style={{ padding: "0.4rem 0.8rem", borderBottom: "1px solid var(--border-subtle)" }}>
                      <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                        {item.fixes.map((fix) => (
                          <li key={fix} style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
                            {fix}
                          </li>
                        ))}
                      </ul>
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
                  <><Spinner size="small" /> Migrating…</>
                ) : (
                  `Run Migration (${toUpdate.length} document${toUpdate.length !== 1 ? "s" : ""})`
                )}
              </Button>
            </fetcher.Form>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em", marginTop: "0.5rem" }}>
              Documents are updated one at a time. If one fails, the rest continue.
            </p>
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
