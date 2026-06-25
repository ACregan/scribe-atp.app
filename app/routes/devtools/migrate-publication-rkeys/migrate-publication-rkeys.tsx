import type { Route } from "./+types/migrate-publication-rkeys";
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

type PublicationPlan = {
  oldRkey: string;
  oldUri: string;
  name: string;
  url: string;
};

type MigrationPlan = {
  toMigrate: PublicationPlan[];
  alreadyTid: number;
  total: number;
};

type MigrateResult = {
  ok: boolean;
  migrated?: number;
  failed?: number;
  details?: Array<{
    oldRkey: string;
    newUri?: string;
    documentsUpdated?: number;
    ok: boolean;
    error?: string;
  }>;
  error?: string;
};

// --- Helpers ---

function isTid(rkey: string): boolean {
  return /^[234567a-z]{13}$/.test(rkey);
}

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

function buildPlan(
  publications: Array<{ uri: string; value: unknown }>,
): MigrationPlan {
  const toMigrate: PublicationPlan[] = [];
  let alreadyTid = 0;

  for (const pub of publications) {
    const rkey = pub.uri.split("/").pop()!;
    const v = pub.value as Record<string, unknown>;
    const name = String(v.name ?? "Untitled");
    const url = String(v.url ?? "");
    if (isTid(rkey)) {
      alreadyTid++;
    } else {
      toMigrate.push({ oldRkey: rkey, oldUri: pub.uri, name, url });
    }
  }

  return { toMigrate, alreadyTid, total: publications.length };
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as MigrationPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAtpAgent(request);
  const publications = await fetchAllPublications(agent, did);
  const plan = buildPlan(publications);

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
  const [publications, documents] = await Promise.all([
    fetchAllPublications(agent, did),
    fetchAllDocuments(agent, did),
  ]);

  const plan = buildPlan(publications);

  if (plan.toMigrate.length === 0) {
    return { ok: true, migrated: 0, failed: 0, details: [] };
  }

  const details: Array<{
    oldRkey: string;
    newUri?: string;
    documentsUpdated?: number;
    ok: boolean;
    error?: string;
  }> = [];

  for (const item of plan.toMigrate) {
    const pub = publications.find((p) => p.uri === item.oldUri);
    if (!pub) {
      details.push({ oldRkey: item.oldRkey, ok: false, error: "Record not found" });
      continue;
    }

    let newUri: string | undefined;
    let documentsUpdated = 0;

    try {
      // Step 1: create new publication record without rkey — PDS generates TID
      const v = pub.value as Record<string, unknown>;
      const createResult = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: SITE_COLLECTION,
        record: {
          ...v,
          $type: SITE_COLLECTION,
        },
      });
      newUri = createResult.data.uri;

      // Step 2: update all documents whose `site` field points to the old publication URI
      const docsToUpdate = documents.filter((doc) => {
        const dv = doc.value as Record<string, unknown>;
        return String(dv.site ?? "") === item.oldUri;
      });

      await Promise.all(
        docsToUpdate.map(async (doc) => {
          const dv = doc.value as Record<string, unknown>;
          await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: DOCUMENT_COLLECTION,
            rkey: doc.uri.split("/").pop()!,
            record: {
              ...dv,
              $type: DOCUMENT_COLLECTION,
              site: newUri,
              updatedAt: new Date().toISOString(),
            },
            swapRecord: doc.cid,
          });
          documentsUpdated++;
        }),
      );

      // Step 3: delete old publication record
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: item.oldRkey,
        swapRecord: pub.cid,
      });

      details.push({ oldRkey: item.oldRkey, newUri, documentsUpdated, ok: true });
    } catch (err) {
      details.push({
        oldRkey: item.oldRkey,
        newUri,
        documentsUpdated,
        ok: false,
        error: String(err),
      });
      logger.error(
        {
          event: "migrate-publication-rkeys.error",
          oldRkey: item.oldRkey,
          error: String(err),
        },
        "migrate-publication-rkeys.error",
      );
    }
  }

  const migrated = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "migrate-publication-rkeys.run", user_did: did, migrated, failed },
    "migrate-publication-rkeys.run",
  );

  return { ok: true, migrated, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Migrate Publication RKeys — Scribe ATP" }];
}

export default function MigratePublicationRkeysPage({
  loaderData,
}: Route.ComponentProps) {
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
            Migrate Publication RKeys
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
          Migrate Publication RKeys
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Migration complete
          </p>
          <p>
            {result!.migrated} publication{result!.migrated !== 1 ? "s" : ""} re-keyed to TIDs.
            {result!.failed ? ` ${result!.failed} failed — check server logs.` : ""}
          </p>
          {result!.details
            ?.filter((d) => d.ok)
            .map((d) => (
              <p key={d.oldRkey} style={{ fontSize: "0.9em" }}>
                <code>{d.oldRkey}</code> → <code>{d.newUri?.split("/").pop()}</code>{" "}
                <Pill>{d.documentsUpdated} doc{d.documentsUpdated !== 1 ? "s" : ""} updated</Pill>
              </p>
            ))}
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
            All {total} <code>site.standard.publication</code> record
            {total !== 1 ? "s" : ""} already use TID rkeys. Nothing to migrate.
          </p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{toMigrate.length}</strong> publication
              {toMigrate.length !== 1 ? "s" : ""} have slug-based rkeys and will be
              re-keyed to PDS-generated TIDs.
              {alreadyTid > 0 && (
                <>
                  {" "}
                  <strong>{alreadyTid}</strong> already use TIDs and will be skipped.
                </>
              )}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              For each publication: a new <code>site.standard.publication</code> is created
              (TID rkey), all <code>site.standard.document</code> records whose{" "}
              <code>site</code> field references the old URI are updated, then the old
              slug-keyed publication is deleted.
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
                  {["Slug (current rkey)", "Name", "URL"].map((h) => (
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
                      {item.name}
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <code>{item.url}</code>
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
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9em",
                  marginTop: "0.5rem",
                }}
              >
                Publications are migrated one at a time. If one fails, the rest continue.
              </p>
            )}
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
