import { Agent } from "@atproto/api";
import { SITE_COLLECTION } from "~/constants";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { contributorMemberships, type ContributorMembership } from "~/services/db.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";
import { publicUrl } from "~/services/auth.server";
import { syncSiteRoster } from "~/services/imageServiceClient.server";
import { logger } from "~/services/logger.server";
import type { SiteContributor } from "~/hooks/types";
import type { SiteRecordValue } from "~/routes/article/site-list/siteTree";

// ADR 0019 — chat.bsky is a service-proxied lexicon, not part of the
// authenticated user's own repo, hence the Atproto-Proxy header rather than
// a plain agent call. Same proxy DID and call shape scribe-atp-social's
// notify.ts already uses for subscriber DMs — the difference here is the
// caller: the Owner's own OAuth session, not that service's fixed
// app-password identity, per the grill session's decision to keep
// scribe-atp-social scoped to anonymous engagement events only.
const CHAT_PROXY_HEADERS = { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } };

// chat.bsky.convo.defs#messageInput has no auto-linkification — a bare URL
// in `text` renders as plain text in Bluesky's own chat UI (confirmed live,
// 2026-07-15: the first real-account test sent the invite link as inert
// text). Facet ranges are UTF-8 *byte* offsets into `text`, not character
// offsets — matters here because displayName is untrusted user profile data
// and may contain multi-byte characters before the link.
function linkFacet(text: string, uri: string) {
  const start = text.indexOf(uri);
  const byteStart = Buffer.byteLength(text.slice(0, start), "utf8");
  const byteEnd = byteStart + Buffer.byteLength(uri, "utf8");
  return {
    index: { byteStart, byteEnd },
    features: [{ $type: "app.bsky.richtext.facet#link", uri }],
  };
}

// Best-effort — failure here must never fail the invite itself. The roster
// write (scribe.contributors + contributor_memberships) is the state that
// actually matters; the DM is a nudge, and the invitee can still discover
// the invitation via the global on-login check (ADR 0019 Decision 6)
// even if this never sends.
async function sendInviteDm(
  agent: Agent,
  contributorDid: string,
  siteDomain: string,
): Promise<void> {
  try {
    const profile = await fetchBskyProfile(contributorDid);
    const greetingName = profile?.displayName || profile?.handle || "there";
    const text = `Hi ${greetingName}, I'd like to invite you to contribute to ${siteDomain}. Please click here (${publicUrl}) and login to accept the invite.`;

    const convo = await agent.api.chat.bsky.convo.getConvoForMembers(
      { members: [contributorDid] },
      CHAT_PROXY_HEADERS,
    );
    await agent.api.chat.bsky.convo.sendMessage(
      {
        convoId: convo.data.convo.id,
        message: {
          $type: "chat.bsky.convo.defs#messageInput",
          text,
          facets: [linkFacet(text, publicUrl)],
        },
      },
      CHAT_PROXY_HEADERS,
    );
  } catch (err) {
    logger.warn(
      { event: "contributor.invite_dm_failed", contributorDid, error: String(err) },
      "invite DM failed — roster write already succeeded, not retried",
    );
  }
}

// ADR 0020 — best-effort, same posture as sendInviteDm: a sync failure must
// never turn a successful scribe.contributors write into a reported error.
// The Image Service's roster mirror goes stale until the next call that
// touches this site's roster, which is accepted as low-stakes and
// self-correcting (same posture ADR 0017 already takes for this exact call).
async function syncSiteRosterBestEffort(
  siteUri: string,
  siteName: string,
  memberDids: string[],
  cookieHeader: string,
): Promise<void> {
  try {
    await syncSiteRoster(siteUri, siteName, memberDids, cookieHeader);
  } catch (err) {
    logger.warn(
      { event: "contributor.site_roster_sync_failed", siteUri, error: String(err) },
      "Image Service roster sync failed — roster write already succeeded, not retried",
    );
  }
}

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

    // Best-effort (see sendInviteDm) — never turns a successful roster
    // write into a reported failure.
    await sendInviteDm(agent, contributorDid, String(scribe.domain ?? ""));
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
  cookieHeader: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const siteUri = siteUriFor(did, siteSlug);
  let acceptedDids: string[] = [];
  let siteDomain = "";
  try {
    await mutateSiteRecord(agent, did, siteSlug, (val) => {
      const contributors = ((val.contributors as SiteContributor[]) ?? []).filter(
        (c) => c.did !== contributorDid,
      );
      acceptedDids = contributors.filter((c) => c.status === "accepted").map((c) => c.did);
      siteDomain = String(val.domain ?? "");
      return { ...val, contributors, updatedAt: new Date().toISOString() };
    });
    contributorMemberships.remove(contributorDid, siteUri);

    // Revoke Image Service access immediately, regardless of the removed
    // contributor's prior status (ADR 0020 point 3) — best-effort, see
    // syncSiteRosterBestEffort.
    await syncSiteRosterBestEffort(siteUri, siteDomain, acceptedDids, cookieHeader);
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

export type PendingInvitation = {
  siteUri: string;
  siteTitle: string;
  siteDomain: string;
};

// Exported for list.tsx's submit action (ADR 0021 point 1) — the action
// derives publish-vs-submit for itself by parsing the owner DID out of the
// submitted site URI, rather than trusting a client-supplied flag.
export function parseSiteUri(siteUri: string): { ownerDid: string; rkey: string } {
  const match = siteUri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!match) throw new Error(`Malformed site URI: ${siteUri}`);
  return { ownerDid: match[1], rkey: match[2] };
}

// Found live, 2026-07-15: an authenticated agent's com.atproto.repo.getRecord
// queries the CALLER's own PDS, which cannot serve a record hosted on a
// different PDS — most real accounts are, since bsky.social is sharded
// across many PDS hosts (confirmed live: two real test accounts resolved to
// oyster.us-east and rhizopogon.us-west, and the cross-host read returned
// RecordNotFound). Every prior use of getRecord in this app's Contributors
// code reads the CALLER's own record (their own repo, same PDS as their
// agent, so this never surfaced there) — this is the first genuinely
// cross-account read in the feature. Same resolution steps as
// @scribe-atp/core's resolvePds (not imported directly — that helper isn't
// part of the package's public API surface), reimplemented here rather than
// reused across a package boundary for one small lookup.
const pdsUrlCache = new Map<string, string>();

async function resolveOwnerPdsUrl(did: string): Promise<string> {
  const cached = pdsUrlCache.get(did);
  if (cached) return cached;

  const didDocUrl = did.startsWith("did:web:")
    ? `https://${did.slice("did:web:".length)}/.well-known/did.json`
    : `https://plc.directory/${encodeURIComponent(did)}`;
  const res = await fetch(didDocUrl);
  if (!res.ok) throw new Error(`Failed to resolve DID document for ${did}: ${res.statusText}`);
  const doc = (await res.json()) as {
    service?: Array<{ id: string; serviceEndpoint: string }>;
  };
  const pds = doc.service?.find((s) => s.id === "#atproto_pds");
  if (!pds) throw new Error(`No PDS service found in DID document for ${did}`);

  pdsUrlCache.set(did, pds.serviceEndpoint);
  return pds.serviceEndpoint;
}

// Shared by listPendingInvitations (status: "invited") and listContributorSites
// (status: "accepted", ADR 0021 point 3) — both need the identical resolution
// work (site record + Owner profile, via the cross-repo PDS-read pattern
// above), differing only in which status they filter contributor_memberships
// for. Resolves the Owner's display name eagerly alongside the site record
// (ADR 0021 point 4) rather than lazily once a Contributor site is selected
// in the modal — the Contributor Sites list for any one person is realistically
// small, so this costs little and avoids a network delay on selection.
// Best-effort per site: one that's since been deleted or is otherwise
// unreadable is silently dropped from the list rather than failing the whole
// page's load.
type ResolvedMembershipSite = {
  siteUri: string;
  siteTitle: string;
  siteDomain: string;
  ownerDisplayName: string;
};

async function resolveMembershipSites(
  memberships: ContributorMembership[],
): Promise<ResolvedMembershipSite[]> {
  const results = await Promise.allSettled(
    memberships.map(async (m): Promise<ResolvedMembershipSite> => {
      const { ownerDid, rkey } = parseSiteUri(m.siteUri);
      const pdsUrl = await resolveOwnerPdsUrl(ownerDid);
      const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
      url.searchParams.set("repo", ownerDid);
      url.searchParams.set("collection", SITE_COLLECTION);
      url.searchParams.set("rkey", rkey);
      const [siteRes, ownerProfile] = await Promise.all([
        fetch(url),
        fetchBskyProfile(ownerDid),
      ]);
      if (!siteRes.ok) throw new Error(`Failed to fetch site record: ${siteRes.status}`);
      const data = (await siteRes.json()) as { value: Record<string, unknown> };
      const scribe = data.value.scribe as Record<string, unknown> | undefined;
      return {
        siteUri: m.siteUri,
        siteTitle: String(scribe?.title ?? ""),
        siteDomain: String(scribe?.domain ?? ""),
        ownerDisplayName: ownerProfile?.displayName || ownerProfile?.handle || ownerDid,
      };
    }),
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.warn(
        {
          event: "contributor.membership_site_lookup_failed",
          siteUri: memberships[i].siteUri,
          error: String(r.reason),
        },
        "failed to resolve a membership's site — dropped from the list",
      );
    }
  });

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ResolvedMembershipSite> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

// Invitee-side discovery (ADR 0019 Decision 6) — a global, on-any-login
// check, not tied to a specific route or the DM link.
export async function listPendingInvitations(
  contributorDid: string,
): Promise<PendingInvitation[]> {
  const invited = contributorMemberships
    .listForContributor(contributorDid)
    .filter((m) => m.status === "invited");
  const resolved = await resolveMembershipSites(invited);
  return resolved.map(({ siteUri, siteTitle, siteDomain }) => ({
    siteUri,
    siteTitle,
    siteDomain,
  }));
}

// "Contributor Sites" group for the unified Publish/Submit modal (ADR 0021
// point 3) — every site this DID is an *accepted* Contributor on. Merely
// "invited" doesn't count (ADR 0019/0020's accepted-only-gates-access
// posture, applied here too — no submit access before acceptance).
export type ContributorSite = {
  siteUri: string;
  siteTitle: string;
  siteDomain: string;
  ownerDisplayName: string;
};

export async function listContributorSites(
  contributorDid: string,
): Promise<ContributorSite[]> {
  const accepted = contributorMemberships
    .listForContributor(contributorDid)
    .filter((m) => m.status === "accepted");
  return resolveMembershipSites(accepted);
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
  cookieHeader: string,
): Promise<void> {
  const siteUri = siteUriFor(did, siteSlug);
  const localRows = contributorMemberships.listForSite(siteUri);
  const toPromote = localRows.filter((r) => r.status === "accepted");
  const toRemove = localRows.filter((r) => r.status === "rejected");
  if (toPromote.length === 0 && toRemove.length === 0) return;

  const removeDids = new Set(toRemove.map((r) => r.contributorDid));
  const promoteDids = new Set(toPromote.map((r) => r.contributorDid));

  let acceptedDids: string[] = [];
  let siteDomain = "";
  await mutateSiteRecord(agent, did, siteSlug, (val) => {
    const contributors = ((val.contributors as SiteContributor[]) ?? [])
      .filter((c) => !removeDids.has(c.did))
      .map((c) =>
        promoteDids.has(c.did) && c.status !== "accepted"
          ? { ...c, status: "accepted" as const }
          : c,
      );
    acceptedDids = contributors.filter((c) => c.status === "accepted").map((c) => c.did);
    siteDomain = String(val.domain ?? "");
    return { ...val, contributors, updatedAt: new Date().toISOString() };
  });

  for (const row of toRemove) {
    contributorMemberships.remove(row.contributorDid, siteUri);
  }

  // Only sync on an actual promotion (ADR 0020 point 3) — a rejected
  // invitee never had Image Service access to begin with, so a
  // reject-only reconciliation pass has nothing to sync.
  if (toPromote.length > 0) {
    await syncSiteRosterBestEffort(siteUri, siteDomain, acceptedDids, cookieHeader);
  }
}
