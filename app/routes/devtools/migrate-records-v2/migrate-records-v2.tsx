import type { Route } from "./+types/migrate-records-v2";
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

// Publication rkeys that belong to Scribe-managed sites (not third-party records)
const SCRIBE_PUBLICATION_RKEYS = [
  "3mp4nd5iciq2s", // anthonycregan.co.uk
  "3mp4nd46xwr2h", // norobots.blog
  "3mp4nd3onon26", // perpetualsummer.ltd
];

// Publication with logoImageBlob to remove
const PUB_WITH_LOGO_BLOB = "3mp4nd5iciq2s";

// --- Types ---

type DocChange = {
  rkey: string;
  title: string;
  fixes: string[];
};

type PubChange = {
  rkey: string;
  title: string;
  fixes: string[];
};

type MigrationPlan = {
  docsToUpdate: DocChange[];
  pubsToUpdate: PubChange[];
  docsCompliant: number;
  pubsCompliant: number;
};

type MigrationResult = {
  ok: boolean;
  docsUpdated?: number;
  docsFailed?: number;
  pubsUpdated?: number;
  pubsFailed?: number;
  details?: Array<{ id: string; ok: boolean; error?: string }>;
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

// Build a map from HTTPS URL → publication AT URI (for site field migration)
function buildHttpsToAtUri(
  publications: Array<{ uri: string; value: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const pub of publications) {
    const v = pub.value as Record<string, unknown>;
    const scribe = v.scribe as Record<string, unknown> | undefined;
    const domain = String(scribe?.domain ?? "");
    if (domain) map.set(`https://${domain}`, pub.uri);
  }
  return map;
}

function buildDocPlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
  httpsToAtUri: Map<string, string>,
): DocChange[] {
  const toUpdate: DocChange[] = [];

  for (const doc of documents) {
    const v = doc.value as Record<string, unknown>;
    const rkey = doc.uri.split("/").pop()!;
    const title = String(v.title ?? "Untitled");
    const scribe = (v.scribe as Record<string, unknown>) ?? {};
    const fixes: string[] = [];

    // 1. site → AT URI
    const site = String(v.site ?? "");
    if (!site.startsWith("at://")) {
      const atUri = httpsToAtUri.get(site);
      if (atUri) fixes.push(`site: "${site}" → AT URI`);
      else if (site) fixes.push(`site: "${site}" → (unresolved — will clear)`);
    }

    // 2. Remove publishedAt if empty string
    if (v.publishedAt === "") fixes.push("remove empty publishedAt");

    // 3. Remove contributors if empty array
    if (Array.isArray(v.contributors) && (v.contributors as unknown[]).length === 0)
      fixes.push("remove empty contributors");

    // 4. Delete scribe.splashImageBlob
    if (scribe.splashImageBlob !== undefined) fixes.push("delete scribe.splashImageBlob");

    // 5. Rename scribe.splashImageUrl → scribe.coverImageUrl
    if (scribe.splashImageUrl !== undefined && scribe.coverImageUrl === undefined)
      fixes.push("scribe.splashImageUrl → scribe.coverImageUrl");

    // 6. Add scribe.domain if missing
    if (!scribe.domain) {
      const currentSite = site.startsWith("at://") ? site : (httpsToAtUri.get(site) ?? "");
      if (currentSite) fixes.push("add scribe.domain");
    }

    // 7. Move top-level canonicalUrl → scribe.canonicalUrl
    if (v.canonicalUrl !== undefined) fixes.push("canonicalUrl → scribe.canonicalUrl");

    if (fixes.length > 0) toUpdate.push({ rkey, title, fixes });
  }

  return toUpdate;
}

function buildPubPlan(
  publications: Array<{ uri: string; cid: string; value: unknown }>,
): PubChange[] {
  const toUpdate: PubChange[] = [];

  for (const pub of publications) {
    const rkey = pub.uri.split("/").pop()!;
    if (!SCRIBE_PUBLICATION_RKEYS.includes(rkey)) continue;

    const v = pub.value as Record<string, unknown>;
    const scribe = (v.scribe as Record<string, unknown>) ?? {};
    const title = String(scribe.title ?? rkey);
    const fixes: string[] = [];

    if (scribe.$type !== undefined) fixes.push("delete scribe.$type");
    if (rkey === PUB_WITH_LOGO_BLOB && scribe.logoImageBlob !== undefined)
      fixes.push("delete scribe.logoImageBlob");

    if (fixes.length > 0) toUpdate.push({ rkey, title, fixes });
  }

  return toUpdate;
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

  const httpsToAtUri = buildHttpsToAtUri(publications);
  const docsToUpdate = buildDocPlan(documents, httpsToAtUri);
  const pubsToUpdate = buildPubPlan(publications);
  const docsCompliant = documents.length - docsToUpdate.length;
  const pubsCompliant =
    publications.filter((p) =>
      SCRIBE_PUBLICATION_RKEYS.includes(p.uri.split("/").pop()!),
    ).length - pubsToUpdate.length;

  return {
    plan: { docsToUpdate, pubsToUpdate, docsCompliant, pubsCompliant } as MigrationPlan,
    devMode: false as const,
  };
}

// --- Action ---

export async function action({ request }: Route.ActionArgs): Promise<MigrationResult> {
  if (!useRealOAuth) return { ok: false, error: "Not available in dev mode." };

  const { agent, did } = await requireAtpAgent(request);
  const [publications, documents] = await Promise.all([
    fetchAllPublications(agent, did),
    fetchAllDocuments(agent, did),
  ]);

  const httpsToAtUri = buildHttpsToAtUri(publications);

  // Build a map from publication AT URI → domain for scribe.domain
  const atUriToDomain = new Map<string, string>();
  for (const pub of publications) {
    const v = pub.value as Record<string, unknown>;
    const scribe = (v.scribe as Record<string, unknown>) ?? {};
    const domain = String(scribe.domain ?? "");
    if (domain) atUriToDomain.set(pub.uri, domain);
  }

  const docsToUpdate = buildDocPlan(documents, httpsToAtUri);
  const pubsToUpdate = buildPubPlan(publications);
  const details: Array<{ id: string; ok: boolean; error?: string }> = [];

  // Migrate documents
  for (const item of docsToUpdate) {
    const doc = documents.find((d) => d.uri.split("/").pop() === item.rkey);
    if (!doc) {
      details.push({ id: item.rkey, ok: false, error: "Record not found" });
      continue;
    }

    try {
      const dv = doc.value as Record<string, unknown>;
      const existingScribe = (dv.scribe as Record<string, unknown>) ?? {};

      // 1. Resolve site → AT URI
      const currentSite = String(dv.site ?? "");
      const newSite = currentSite.startsWith("at://")
        ? currentSite
        : (httpsToAtUri.get(currentSite) ?? "");

      // 2/3. Strip empty publishedAt and contributors
      const { publishedAt, contributors, ...dvRest } = dv as Record<string, unknown> & {
        publishedAt?: string;
        contributors?: unknown[];
      };
      const keepPublishedAt = publishedAt && publishedAt !== "" ? publishedAt : undefined;
      const keepContributors =
        Array.isArray(contributors) && contributors.length > 0 ? contributors : undefined;

      // 4/5. Update scribe: delete splashImageBlob, rename splashImageUrl → coverImageUrl
      const {
        splashImageBlob: _sib,
        splashImageUrl: legacySplashUrl,
        canonicalUrl: _topLevelCanonical,
        ...dvRestNoLegacy
      } = dvRest;

      const {
        $type: _scribeType,
        splashImageBlob: _scribeSib,
        splashImageUrl: scribeSplashUrl,
        ...existingScribeRest
      } = existingScribe as Record<string, unknown> & {
        $type?: unknown;
        splashImageBlob?: unknown;
        splashImageUrl?: string;
      };

      const coverImageUrl =
        existingScribeRest.coverImageUrl ?? scribeSplashUrl ?? legacySplashUrl ?? undefined;

      // 6. Add scribe.domain
      const domain = newSite ? (atUriToDomain.get(newSite) ?? "") : "";

      // 7. Move top-level canonicalUrl → scribe.canonicalUrl
      const topLevelCanonical = _topLevelCanonical as string | undefined;
      const canonicalUrl =
        existingScribeRest.canonicalUrl ?? topLevelCanonical ?? undefined;

      const updatedScribe: Record<string, unknown> = {
        ...existingScribeRest,
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(domain ? { domain } : {}),
        ...(canonicalUrl ? { canonicalUrl } : {}),
      };

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: item.rkey,
        record: {
          ...dvRestNoLegacy,
          site: newSite,
          ...(keepPublishedAt ? { publishedAt: keepPublishedAt } : {}),
          ...(keepContributors ? { contributors: keepContributors } : {}),
          scribe: updatedScribe,
          updatedAt: new Date().toISOString(),
        },
        swapRecord: doc.cid,
      });

      details.push({ id: item.rkey, ok: true });
    } catch (err) {
      details.push({ id: item.rkey, ok: false, error: String(err) });
      logger.error(
        { event: "migrate-records-v2.doc.error", rkey: item.rkey, error: String(err) },
        "migrate-records-v2.doc.error",
      );
    }
  }

  // Migrate publications
  for (const item of pubsToUpdate) {
    const pub = publications.find((p) => p.uri.split("/").pop() === item.rkey);
    if (!pub) {
      details.push({ id: `pub:${item.rkey}`, ok: false, error: "Record not found" });
      continue;
    }

    try {
      const pv = pub.value as Record<string, unknown>;
      const existingScribe = (pv.scribe as Record<string, unknown>) ?? {};

      const {
        $type: _st,
        logoImageBlob: _lib,
        ...cleanedScribe
      } = existingScribe as Record<string, unknown> & {
        $type?: unknown;
        logoImageBlob?: unknown;
      };

      // Only remove logoImageBlob from the designated publication
      const scribeToWrite =
        item.rkey === PUB_WITH_LOGO_BLOB
          ? cleanedScribe
          : (({ $type: _t, ...rest }) => rest)(existingScribe as Record<string, unknown> & { $type?: unknown });

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: item.rkey,
        record: {
          ...pv,
          scribe: scribeToWrite,
        },
        swapRecord: pub.cid,
      });

      details.push({ id: `pub:${item.rkey}`, ok: true });
    } catch (err) {
      details.push({ id: `pub:${item.rkey}`, ok: false, error: String(err) });
      logger.error(
        { event: "migrate-records-v2.pub.error", rkey: item.rkey, error: String(err) },
        "migrate-records-v2.pub.error",
      );
    }
  }

  const docsUpdated = details.filter((d) => d.ok && !d.id.startsWith("pub:")).length;
  const docsFailed = details.filter((d) => !d.ok && !d.id.startsWith("pub:")).length;
  const pubsUpdated = details.filter((d) => d.ok && d.id.startsWith("pub:")).length;
  const pubsFailed = details.filter((d) => !d.ok && d.id.startsWith("pub:")).length;

  logger.warn(
    {
      event: "migrate-records-v2.run",
      user_did: did,
      docsUpdated,
      docsFailed,
      pubsUpdated,
      pubsFailed,
    },
    "migrate-records-v2.run",
  );

  return { ok: true, docsUpdated, docsFailed, pubsUpdated, pubsFailed, details };
}

// --- Component ---

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Migrate Records v2 — Scribe ATP" }];
}

export default function MigrateRecordsV2Page({
  loaderData,
}: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as MigrationResult | undefined;
  const isDone = result?.ok && result.docsUpdated !== undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Documents}>
            Migrate Records v2
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { docsToUpdate, pubsToUpdate, docsCompliant, pubsCompliant } = plan!;
  const totalChanges = docsToUpdate.length + pubsToUpdate.length;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Migrate Records v2
        </PageContainerHeading>
      }
    >
      {isDone ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Migration complete
          </p>
          <p>
            Documents: {result!.docsUpdated} updated
            {result!.docsFailed ? `, ${result!.docsFailed} failed` : ""}.
            {" "}Publications: {result!.pubsUpdated} updated
            {result!.pubsFailed ? `, ${result!.pubsFailed} failed` : ""}.
          </p>
          {result!.details?.filter((d) => !d.ok).map((d) => (
            <p key={d.id} style={{ color: "var(--action-danger)" }}>
              {d.id}: {d.error}
            </p>
          ))}
        </PageSection>
      ) : totalChanges === 0 ? (
        <PageSection>
          <p>
            All records are already up to date. {docsCompliant} document
            {docsCompliant !== 1 ? "s" : ""} and {pubsCompliant} publication
            {pubsCompliant !== 1 ? "s" : ""} are compliant. Nothing to migrate.
          </p>
        </PageSection>
      ) : (
        <>
          {docsToUpdate.length > 0 && (
            <PageSection>
              <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
                Documents ({docsToUpdate.length} to update, {docsCompliant} already compliant)
              </h2>
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
                  {docsToUpdate.map((item) => (
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
          )}

          {pubsToUpdate.length > 0 && (
            <PageSection>
              <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
                Publications ({pubsToUpdate.length} to update, {pubsCompliant} already compliant)
              </h2>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9em" }}>
                <thead>
                  <tr>
                    {["Publication", "Changes"].map((h) => (
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
                  {pubsToUpdate.map((item) => (
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
                  <><Spinner size="small" /> Migrating…</>
                ) : (
                  `Run Migration (${totalChanges} record${totalChanges !== 1 ? "s" : ""})`
                )}
              </Button>
            </fetcher.Form>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9em", marginTop: "0.5rem" }}>
              Records are updated one at a time. Failures are logged; the rest continue.
            </p>
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
