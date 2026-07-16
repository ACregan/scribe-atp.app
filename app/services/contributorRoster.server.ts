import { Agent } from "@atproto/api";
import { SITE_COLLECTION } from "~/constants";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { contributorMemberships, type ContributorMembership } from "~/services/db.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";
import { publicUrl } from "~/services/auth.server";
import { logger } from "~/services/logger.server";
import { syncSiteChatGroup, removeSiteChatMember } from "~/services/siteChat.server";
import { parseSiteUri, resolveDidPdsUrl } from "~/services/pdsResolution.server";
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
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const siteUri = siteUriFor(did, siteSlug);
  try {
    await mutateSiteRecord(agent, did, siteSlug, (val) => {
      const contributors = ((val.contributors as SiteContributor[]) ?? []).filter(
        (c) => c.did !== contributorDid,
      );
      return { ...val, contributors, updatedAt: new Date().toISOString() };
    });
    // Image Service access is revoked the instant this row is gone (ADR
    // 0024) — it reads contributor_memberships live, no separate sync step.
    contributorMemberships.remove(contributorDid, siteUri);
    // Best-effort (ADR 0026) — a failed removeMembers call never turns an
    // already-successful roster removal into a reported failure.
    await removeSiteChatMember(agent, siteUri, contributorDid);
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
      const pdsUrl = await resolveDidPdsUrl(ownerDid);
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

// Owner-side reconciliation (ADR 0019) — run globally on every page load
// (core.tsx) for every site the Owner owns, not tied to a specific route.
// Promotes locally-accepted rows to status: "accepted" in scribe.contributors
// in place; strips locally-rejected rows out of scribe.contributors entirely
// and deletes their local mirror row once resolved (mirrors ADR 0015's
// pending_submissions "deleted once reconciled" pattern). A no-op, cheap
// read-only check when there's nothing to reconcile. This keeps
// scribe.contributors — the public, portable record — eventually correct;
// it no longer gates Image Service access, which reads contributor_memberships
// live instead (ADR 0024).
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
  let siteName = "";
  const newlyPromotedDids: string[] = [];

  await mutateSiteRecord(agent, did, siteSlug, (val) => {
    siteName = String(val.title ?? "");
    const contributors = ((val.contributors as SiteContributor[]) ?? [])
      .filter((c) => !removeDids.has(c.did))
      .map((c) => {
        if (promoteDids.has(c.did) && c.status !== "accepted") {
          newlyPromotedDids.push(c.did);
          return { ...c, status: "accepted" as const };
        }
        return c;
      });
    return { ...val, contributors, updatedAt: new Date().toISOString() };
  });

  for (const row of toRemove) {
    contributorMemberships.remove(row.contributorDid, siteUri);
    // Best-effort (ADR 0026) — never turns the roster write above into a
    // reported failure.
    await removeSiteChatMember(agent, siteUri, row.contributorDid);
  }

  // ADR 0026 — the group is created the moment a Contributor is genuinely
  // newly accepted (not on every reconcile pass — c.status !== "accepted"
  // above only pushes here the first time), per the explicit decision that
  // Site Chat has no reason to exist before that. Best-effort: never turns
  // the roster write above into a reported failure.
  if (newlyPromotedDids.length > 0) {
    await syncSiteChatGroup(agent, siteUri, siteName, newlyPromotedDids);
  }
}
