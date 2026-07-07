import type { Route } from "./+types/repair-document-site-uris";
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

type StaleDocument = {
  docUri: string;
  docRkey: string;
  title: string;
  oldSiteUri: string;
  newSiteUri: string;
};

type RepairPlan = {
  stale: StaleDocument[];
  total: number;
  alreadyCurrent: number;
};

type RepairResult = {
  ok: boolean;
  repaired?: number;
  failed?: number;
  details?: Array<{
    docRkey: string;
    oldSiteUri: string;
    newSiteUri: string;
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

// Build a map of publication url → current TID-keyed URI.
// Used to find the correct publication URI for any document whose `site` field
// is stale (still points to a slug-keyed publication that no longer exists or
// should have a TID rkey).
function buildUrlToCurrentPubUri(
  publications: Array<{ uri: string; value: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const pub of publications) {
    const rkey = pub.uri.split("/").pop()!;
    if (!isTid(rkey)) continue;
    const v = pub.value as Record<string, unknown>;
    const url = String(v.url ?? "");
    if (url) map.set(url, pub.uri);
  }
  return map;
}

// Build a map of did:collection:slug-rkey → did:collection:tid-rkey for all
// publications that have been migrated. Keyed by the old slug-URI so documents
// can look up their correct new site URI.
function buildSlugUriToTidUri(
  publications: Array<{ uri: string; value: unknown }>,
  did: string,
  urlToCurrentPubUri: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const pub of publications) {
    const rkey = pub.uri.split("/").pop()!;
    // Only slug-keyed publications need a redirect entry
    if (isTid(rkey)) continue;
    const v = pub.value as Record<string, unknown>;
    const url = String(v.url ?? "");
    // Look up the TID-keyed pub for the same URL
    const tidUri = url ? urlToCurrentPubUri.get(url) : undefined;
    if (tidUri) map.set(pub.uri, tidUri);
  }

  // Also catch documents that reference a slug-keyed URI even if the slug
  // publication record no longer exists — derive the expected URI from the slug.
  // For robustness, also index by synthesised slug URI for any TID pub.
  for (const pub of publications) {
    const rkey = pub.uri.split("/").pop()!;
    if (!isTid(rkey)) continue;
    const v = pub.value as Record<string, unknown>;
    const scribe = v.scribe as Record<string, unknown> | undefined;
    if (!scribe) continue;
    const domain = String(scribe.domain ?? "");
    if (!domain) continue;
    // Historical slug was derived from domain — reconstruct common patterns
    const slugFromDomain = domain.replace(/\./g, "-");
    const slugUri = `at://${did}/${SITE_COLLECTION}/${slugFromDomain}`;
    if (!map.has(slugUri)) map.set(slugUri, pub.uri);
  }

  return map;
}

function buildRepairPlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
  slugUriToTidUri: Map<string, string>,
): RepairPlan {
  const stale: StaleDocument[] = [];
  let alreadyCurrent = 0;

  for (const doc of documents) {
    const v = doc.value as Record<string, unknown>;
    const siteUri = String(v.site ?? "");
    const docRkey = doc.uri.split("/").pop()!;
    const title = String(v.title ?? "Untitled");
    const newSiteUri = slugUriToTidUri.get(siteUri);
    if (newSiteUri && newSiteUri !== siteUri) {
      stale.push({
        docUri: doc.uri,
        docRkey,
        title,
        oldSiteUri: siteUri,
        newSiteUri,
      });
    } else {
      alreadyCurrent++;
    }
  }

  return { stale, total: documents.length, alreadyCurrent };
}

// --- Loader ---

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as RepairPlan | null, devMode: true as const };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const [publications, documents] = await Promise.all([
    fetchAllPublications(agent, did),
    fetchAllDocuments(agent, did),
  ]);

  const urlToCurrentPubUri = buildUrlToCurrentPubUri(publications);
  const slugUriToTidUri = buildSlugUriToTidUri(publications, did, urlToCurrentPubUri);
  const plan = buildRepairPlan(documents, slugUriToTidUri);

  return { plan, devMode: false as const };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<RepairResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }

  const { agent, did } = await requireAdminAtpAgent(request);
  const [publications, documents] = await Promise.all([
    fetchAllPublications(agent, did),
    fetchAllDocuments(agent, did),
  ]);

  const urlToCurrentPubUri = buildUrlToCurrentPubUri(publications);
  const slugUriToTidUri = buildSlugUriToTidUri(publications, did, urlToCurrentPubUri);
  const plan = buildRepairPlan(documents, slugUriToTidUri);

  if (plan.stale.length === 0) {
    return { ok: true, repaired: 0, failed: 0, details: [] };
  }

  const details: Array<{
    docRkey: string;
    oldSiteUri: string;
    newSiteUri: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const item of plan.stale) {
    const doc = documents.find((d) => d.uri === item.docUri);
    if (!doc) {
      details.push({
        docRkey: item.docRkey,
        oldSiteUri: item.oldSiteUri,
        newSiteUri: item.newSiteUri,
        ok: false,
        error: "Document record not found",
      });
      continue;
    }

    try {
      const dv = doc.value as Record<string, unknown>;
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: item.docRkey,
        record: {
          ...dv,
          $type: DOCUMENT_COLLECTION,
          site: item.newSiteUri,
          updatedAt: new Date().toISOString(),
        },
        swapRecord: doc.cid,
      });
      details.push({
        docRkey: item.docRkey,
        oldSiteUri: item.oldSiteUri,
        newSiteUri: item.newSiteUri,
        ok: true,
      });
    } catch (err) {
      details.push({
        docRkey: item.docRkey,
        oldSiteUri: item.oldSiteUri,
        newSiteUri: item.newSiteUri,
        ok: false,
        error: String(err),
      });
      logger.error(
        {
          event: "repair-document-site-uris.error",
          docRkey: item.docRkey,
          error: String(err),
        },
        "repair-document-site-uris.error",
      );
    }
  }

  const repaired = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;

  logger.warn(
    { event: "repair-document-site-uris.run", user_did: did, repaired, failed },
    "repair-document-site-uris.run",
  );

  return { ok: true, repaired, failed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Repair Document Site URIs — Scribe ATP" }];
}

export default function RepairDocumentSiteUrisPage({
  loaderData,
}: Route.ComponentProps) {
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
            Repair Document Site URIs
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { stale, total, alreadyCurrent } = plan!;
  const isEmpty = stale.length === 0;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Repair Document Site URIs
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Repair complete
          </p>
          <p>
            {result!.repaired} document{result!.repaired !== 1 ? "s" : ""} updated.
            {result!.failed ? ` ${result!.failed} failed — check server logs.` : ""}
          </p>
          {result!.details
            ?.filter((d) => !d.ok)
            .map((d) => (
              <p key={d.docRkey} style={{ color: "var(--action-danger)" }}>
                {d.docRkey}: {d.error}
              </p>
            ))}
        </PageSection>
      ) : isEmpty ? (
        <PageSection>
          <p>
            All {total} <code>site.standard.document</code> record
            {total !== 1 ? "s" : ""} have current site URIs. Nothing to repair.
          </p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{stale.length}</strong> document
              {stale.length !== 1 ? "s" : ""} have a <code>site</code> field pointing to
              a slug-keyed publication URI. These will be updated to the TID-keyed URI.
              {alreadyCurrent > 0 && (
                <>
                  {" "}
                  <strong>{alreadyCurrent}</strong> already point to TID-keyed publications
                  and will be skipped.
                </>
              )}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em" }}>
              Run this after <strong>Migrate Publication RKeys</strong> to fix any documents
              not updated during that migration.
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
                  {["Document", "Stale site rkey", "New site rkey"].map((h) => (
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
                {stale.map((item) => (
                  <tr key={item.docUri}>
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
                      }}
                    >
                      <code>{item.oldSiteUri.split("/").pop()}</code>
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <code>{item.newSiteUri.split("/").pop()}</code>
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
            {stale.length > 1 && (
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9em",
                  marginTop: "0.5rem",
                }}
              >
                Documents are updated one at a time. If one fails, the rest continue.
              </p>
            )}
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
