import type { Route } from "./+types/migrate-document-rkeys";
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

// --- Types ---

type DocumentPlan = {
  oldRkey: string;
  oldUri: string;
  title: string;
};

type MigrationPlan = {
  toMigrate: DocumentPlan[];
  alreadyTid: number;
  total: number;
};

type MigrateResult = {
  ok: boolean;
  migrated?: number;
  failed?: number;
  details?: Array<{ oldRkey: string; newUri?: string; ok: boolean; error?: string }>;
  error?: string;
};

// --- Helpers ---

function isTid(rkey: string): boolean {
  return /^[234567a-z]{13}$/.test(rkey);
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

function buildPlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
): MigrationPlan {
  const toMigrate: DocumentPlan[] = [];
  let alreadyTid = 0;

  for (const doc of documents) {
    const rkey = doc.uri.split("/").pop()!;
    const v = doc.value as Record<string, unknown>;
    const title = String(v.title ?? "Untitled");
    if (isTid(rkey)) {
      alreadyTid++;
    } else {
      toMigrate.push({ oldRkey: rkey, oldUri: doc.uri, title });
    }
  }

  return { toMigrate, alreadyTid, total: documents.length };
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as MigrationPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAtpAgent(request);
  const documents = await fetchAllDocuments(agent, did);
  const plan = buildPlan(documents);

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
  const [documents, sites] = await Promise.all([
    fetchAllDocuments(agent, did),
    fetchAllSites(agent, did),
  ]);

  const plan = buildPlan(documents);

  if (plan.toMigrate.length === 0) {
    return { ok: true, migrated: 0, failed: 0, details: [] };
  }

  const details: Array<{ oldRkey: string; newUri?: string; ok: boolean; error?: string }> = [];

  for (const item of plan.toMigrate) {
    const doc = documents.find((d) => d.uri === item.oldUri);
    if (!doc) {
      details.push({ oldRkey: item.oldRkey, ok: false, error: "Record not found" });
      continue;
    }

    let newUri: string | undefined;

    try {
      // Step 1: create new record without rkey — PDS generates TID
      const v = doc.value as Record<string, unknown>;
      const createResult = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        record: {
          ...v,
          $type: DOCUMENT_COLLECTION,
          updatedAt: new Date().toISOString(),
        },
      });
      newUri = createResult.data.uri;

      // Step 2: update all site manifests that reference the old URI
      const rewriteRef = (ref: Record<string, unknown>): Record<string, unknown> => {
        if (String(ref.uri ?? "") !== item.oldUri) return ref;
        return { ...ref, uri: newUri };
      };

      const siteUpdates = sites.map(async (siteRecord) => {
        const sv = siteRecord.value as Record<string, unknown>;
        const siteRkey = siteRecord.uri.split("/").pop()!;

        const groups = ((sv.groups as Array<Record<string, unknown>>) ?? []).map(
          (g) => ({
            ...g,
            articles: ((g.articles as Array<Record<string, unknown>>) ?? []).map(rewriteRef),
          }),
        );

        const ungroupedArticles = (
          (sv.ungroupedArticles as Array<Record<string, unknown>>) ?? []
        ).map(rewriteRef);

        const hasRef =
          groups.some((g) =>
            ((g.articles as Array<Record<string, unknown>>) ?? []).some(
              (a) => a.uri === newUri,
            ),
          ) || ungroupedArticles.some((a) => a.uri === newUri);

        if (!hasRef) return;

        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteRkey,
          record: { ...sv, groups, ungroupedArticles },
          swapRecord: siteRecord.cid,
        });
      });

      await Promise.all(siteUpdates);

      // Step 3: delete old record
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: item.oldRkey,
        swapRecord: doc.cid,
      });

      details.push({ oldRkey: item.oldRkey, newUri, ok: true });
    } catch (err) {
      details.push({ oldRkey: item.oldRkey, newUri, ok: false, error: String(err) });
      logger.error(
        { event: "migrate-rkeys.error", oldRkey: item.oldRkey, error: String(err) },
        "migrate-rkeys.error",
      );
    }
  }

  const migrated = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "migrate-rkeys.run", user_did: did, migrated, failed },
    "migrate-rkeys.run",
  );

  return { ok: true, migrated, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Migrate Document RKeys — Scribe ATP" }];
}

export default function MigrateDocumentRkeysPage({ loaderData }: Route.ComponentProps) {
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
            Migrate Document RKeys
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Migration is not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { toMigrate, alreadyTid, total } = plan!;
  const isEmpty = toMigrate.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Migrate Document RKeys
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Migration complete
          </p>
          <p>
            {result!.migrated} record{result!.migrated !== 1 ? "s" : ""} re-keyed to TIDs.
            {result!.failed ? ` ${result!.failed} failed — check server logs.` : ""}
          </p>
          {result!.details
            ?.filter((d) => !d.ok)
            .map((d) => (
              <p key={d.oldRkey} style={{ color: "var(--action-danger)" }}>
                {d.oldRkey}: {d.error}
              </p>
            ))}
        </PageSection>
      ) : isEmpty ? (
        <PageSection>
          <p>
            All {total} <code>site.standard.document</code> record{total !== 1 ? "s" : ""} already
            use TID rkeys. Nothing to migrate.
          </p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{toMigrate.length}</strong> record{toMigrate.length !== 1 ? "s" : ""} have
              slug-based rkeys and will be re-keyed to PDS-generated TIDs.
              {alreadyTid > 0 && (
                <> <strong>{alreadyTid}</strong> already use TIDs and will be skipped.</>
              )}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              For each record: a new <code>site.standard.document</code> is created (TID rkey),
              all site manifest ArticleRefs are updated to the new URI, then the old slug-keyed
              record is deleted.
            </p>
          </PageSection>

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
                  {["Slug (current rkey)", "Title"].map((h) => (
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
                {toMigrate.map((item) => (
                  <tr key={item.oldRkey}>
                    <td
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <code>{item.oldRkey}</code>
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      {item.title}
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
                    <Spinner size="small" /> Migrating…
                  </>
                ) : (
                  "Run Migration"
                )}
              </Button>
            </fetcher.Form>
            {toMigrate.length > 1 && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9em", marginTop: "0.5rem" }}>
                Records are migrated one at a time. If one fails, the rest continue.
              </p>
            )}
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
