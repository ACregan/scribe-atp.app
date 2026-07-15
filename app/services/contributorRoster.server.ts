import { Agent } from "@atproto/api";
import { SITE_COLLECTION } from "~/constants";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { contributorMemberships } from "~/services/db.server";
import type { SiteContributor } from "~/hooks/types";
import type { SiteRecordValue } from "~/routes/article/site-list/siteTree";

// Contributors feature, Phase 1 (ADR 0014/0015/0018/0019) — roster
// mutations for scribe.contributors, kept in lock-step with the local
// contributor_memberships mirror. Sibling to siteManifest.server.ts's
// createGroup/deleteGroup, which this follows for style: manual
// fetch-validate-write for the case that can fail validation (invite),
// mutateSiteRecord's fetch->transform->write-back for the cases that can't
// (remove, reconcile).

function siteUriFor(did: string, siteRkey: string): string {
  return `at://${did}/${SITE_COLLECTION}/${siteRkey}`;
}

export async function inviteContributor(
  agent: Agent,
  did: string,
  siteSlug: string,
  contributorDid: string,
): Promise<{ ok: true } | { error: string }> {
  if (contributorDid === did) {
    return { error: "You can't invite yourself to your own site." };
  }

  try {
    const rec = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: SITE_COLLECTION,
      rkey: siteSlug,
    });
    const pubRecord = rec.data.value as Record<string, unknown>;
    const scribe = pubRecord.scribe as SiteRecordValue;
    const existing = (scribe.contributors as SiteContributor[]) ?? [];
    if (existing.some((c) => c.did === contributorDid)) {
      return { error: "This person is already on the roster for this site." };
    }

    const addedAt = new Date().toISOString();
    const entry: SiteContributor = {
      did: contributorDid,
      addedAt,
      status: "invited",
    };

    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: SITE_COLLECTION,
      rkey: siteSlug,
      record: {
        ...pubRecord,
        scribe: {
          ...scribe,
          contributors: [...existing, entry],
          updatedAt: addedAt,
        },
      },
      swapRecord: rec.data.cid,
    });

    contributorMemberships.upsert(
      contributorDid,
      siteUriFor(did, siteSlug),
      addedAt,
      "invited",
    );
  } catch (err) {
    console.error("Failed to invite contributor:", err);
    return { error: `Failed to invite contributor: ${String(err)}` };
  }
  return { ok: true };
}

export async function removeContributor(
  agent: Agent,
  did: string,
  siteSlug: string,
  contributorDid: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await mutateSiteRecord(agent, did, siteSlug, (val) => ({
      ...val,
      contributors: ((val.contributors as SiteContributor[]) ?? []).filter(
        (c) => c.did !== contributorDid,
      ),
      updatedAt: new Date().toISOString(),
    }));
    contributorMemberships.remove(contributorDid, siteUriFor(did, siteSlug));
  } catch (err) {
    console.error("Failed to remove contributor:", err);
    return { ok: false, error: err };
  }
  return { ok: true };
}

// Invitee-side — recorded locally only. The invitee's own session can never
// write the Owner's site.standard.publication record directly (ADR 0014's
// cross-repo write asymmetry); the Owner-side reconciliation below is what
// eventually syncs this back into scribe.contributors.
export function acceptInvitation(contributorDid: string, siteUri: string): void {
  contributorMemberships.setStatus(contributorDid, siteUri, "accepted");
}

export function rejectInvitation(contributorDid: string, siteUri: string): void {
  contributorMemberships.setStatus(contributorDid, siteUri, "rejected");
}

// Owner-side reconciliation (ADR 0019) — run from the site's own
// /article/list/:siteSlug loader on every visit, not a separate global check.
// Promotes locally-accepted rows to status: "accepted" in scribe.contributors
// in place; strips locally-rejected rows out of scribe.contributors entirely
// and deletes their local mirror row once resolved (mirrors ADR 0015's
// pending_submissions "deleted once reconciled" pattern). A no-op, cheap
// read-only check when there's nothing to reconcile.
export async function reconcileContributorStatuses(
  agent: Agent,
  did: string,
  siteSlug: string,
): Promise<void> {
  const siteUri = siteUriFor(did, siteSlug);
  const localRows = contributorMemberships.listForSite(siteUri);
  const toPromote = localRows.filter((r) => r.status === "accepted");
  const toRemove = localRows.filter((r) => r.status === "rejected");
  if (toPromote.length === 0 && toRemove.length === 0) return;

  const removeDids = new Set(toRemove.map((r) => r.contributorDid));
  const promoteDids = new Set(toPromote.map((r) => r.contributorDid));

  await mutateSiteRecord(agent, did, siteSlug, (val) => ({
    ...val,
    contributors: ((val.contributors as SiteContributor[]) ?? [])
      .filter((c) => !removeDids.has(c.did))
      .map((c) =>
        promoteDids.has(c.did) && c.status !== "accepted"
          ? { ...c, status: "accepted" as const }
          : c,
      ),
    updatedAt: new Date().toISOString(),
  }));

  for (const row of toRemove) {
    contributorMemberships.remove(row.contributorDid, siteUri);
  }
}
