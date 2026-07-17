import { Agent } from "@atproto/api";
import { siteChatConvos } from "~/services/db.server";
import { logger } from "~/services/logger.server";

// ADR 0016/0025/0026 (Site Chat) — same proxy header pattern already used by
// contributorRoster.server.ts's sendInviteDm and scribe-atp-social's
// notify.ts for this exact service-proxied lexicon. chat.bsky.group.* lives
// on the same proxied service as chat.bsky.convo.*, so one header constant
// covers both namespaces.
const CHAT_PROXY_HEADERS = {
  headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" },
};

// ADR 0026 — chat.bsky.convo.getConvoForMembers is strictly 1-1 ("Always
// returns the same direct (non-group) conversation"), which cannot support
// the actual requirement (1 Owner + up to ~20 Contributors). The group
// namespace (chat.bsky.group.*) supports real, persistent, member-mutable
// group conversations instead: createGroup (owner-only, non-idempotent —
// hence the local site_chat_convos persistence below), addMembers,
// removeMembers. This replaces the old per-request resolveSiteChatConvo.

// Called from reconcileContributorStatuses at the exact moment one or more
// Contributors are newly accepted — never gated behind a page/chat visit
// (explicit user decision: "the chat feature has no reason to exist until a
// contributor has been added to the site"). Best-effort: a failure here
// must never turn an already-successful roster write into a reported
// failure, same posture as sendInviteDm. Without a drift-reconciliation
// pass, a failed call here does leave that Contributor durably missing from
// the group until the next roster change touches this site — an accepted
// trade-off, not yet a problem with no real user base.
export async function syncSiteChatGroup(
  agent: Agent,
  siteUri: string,
  siteName: string,
  newlyAcceptedDids: string[],
): Promise<void> {
  if (newlyAcceptedDids.length === 0) return;

  const existingConvoId = siteChatConvos.get(siteUri);
  try {
    if (!existingConvoId) {
      // createGroup's `members` excludes the caller — the owner (whoever
      // calls this, always the Owner's own session) is implicitly the
      // group's creator with "accepted" status; only the named `members`
      // start out "pending".
      const res = await agent.api.chat.bsky.group.createGroup(
        { members: newlyAcceptedDids, name: siteName },
        CHAT_PROXY_HEADERS,
      );
      siteChatConvos.create(siteUri, res.data.convo.id, new Date().toISOString());
    } else {
      await agent.api.chat.bsky.group.addMembers(
        { convoId: existingConvoId, members: newlyAcceptedDids },
        CHAT_PROXY_HEADERS,
      );
    }
  } catch (err) {
    logger.warn(
      { event: "site_chat.group_sync_failed", siteUri, error: String(err) },
      "failed to create/update Site Chat group membership",
    );
  }
}

// Called from removeContributor and the rejected-row branch of
// reconcileContributorStatuses. A no-op if the group doesn't exist yet
// (nothing to remove from).
export async function removeSiteChatMember(
  agent: Agent,
  siteUri: string,
  memberDid: string,
): Promise<void> {
  const convoId = siteChatConvos.get(siteUri);
  if (!convoId) return;
  try {
    await agent.api.chat.bsky.group.removeMembers(
      { convoId, members: [memberDid] },
      CHAT_PROXY_HEADERS,
    );
  } catch (err) {
    logger.warn(
      { event: "site_chat.remove_member_failed", siteUri, memberDid, error: String(err) },
      "failed to remove Site Chat group member",
    );
  }
}

export type SiteChatLookupErrorType = "notCreatedYet" | "unknown";

export type SiteChatLookupResult =
  | { ok: true; convoId: string }
  | { ok: false; errorType: SiteChatLookupErrorType };

// Replaces the old per-request resolveSiteChatConvo — the group already
// exists (or doesn't) independently of who's looking, so this is a local
// lookup, not a getConvoForMembers-style resolve. addMembers puts new
// Contributors in "request" status on the group side (they must accept
// before they can read/send); this transparently calls acceptConvo on the
// caller's own behalf the first time their own session hits it, so
// Contributors never see a manual "accept this chat" step.
export async function lookupSiteChatConvo(
  agent: Agent,
  siteUri: string,
): Promise<SiteChatLookupResult> {
  const convoId = siteChatConvos.get(siteUri);
  if (!convoId) return { ok: false, errorType: "notCreatedYet" };

  try {
    const res = await agent.api.chat.bsky.convo.getConvo(
      { convoId },
      CHAT_PROXY_HEADERS,
    );
    if (res.data.convo.status === "request") {
      await agent.api.chat.bsky.convo.acceptConvo({ convoId }, CHAT_PROXY_HEADERS);
    }
    return { ok: true, convoId };
  } catch (err) {
    logger.warn(
      { event: "site_chat.lookup_failed", siteUri, error: String(err) },
      "failed to look up Site Chat conversation",
    );
    return { ok: false, errorType: "unknown" };
  }
}

export type SiteChatMessage = {
  id: string;
  text: string;
  senderDid: string;
  sentAt: string;
};

export type SiteChatProfile = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type SiteChatMessagesResult =
  | { ok: true; messages: SiteChatMessage[]; profiles: SiteChatProfile[] }
  | { ok: false; error: string };

// ADR 0025 Decision 3/4 — single page (limit 50), no cursor, no "load more".
// getMessages returns relatedProfiles inline with the page, so sender
// display info needs no separate fetchBskyProfiles-style call. Deleted and
// system messages are dropped — only real message content is rendered.
// Unchanged by the group-chat redesign: getMessages operates identically on
// a group convoId as it does on a direct one.
export async function getSiteChatMessages(
  agent: Agent,
  convoId: string,
): Promise<SiteChatMessagesResult> {
  try {
    const res = await agent.api.chat.bsky.convo.getMessages(
      { convoId, limit: 50 },
      CHAT_PROXY_HEADERS,
    );
    const messages: SiteChatMessage[] = res.data.messages
      .filter(
        (m): m is Extract<(typeof res.data.messages)[number], { text: string }> =>
          m.$type === "chat.bsky.convo.defs#messageView",
      )
      .map((m) => ({
        id: m.id as string,
        text: m.text,
        senderDid: (m.sender as { did: string }).did,
        sentAt: m.sentAt as string,
      }));
    const profiles: SiteChatProfile[] = (res.data.relatedProfiles ?? []).map((p) => ({
      did: p.did,
      handle: p.handle,
      displayName: p.displayName,
      avatar: p.avatar,
    }));
    return { ok: true, messages, profiles };
  } catch (err) {
    logger.warn(
      { event: "site_chat.get_messages_failed", convoId, error: String(err) },
      "failed to fetch Site Chat messages",
    );
    return { ok: false, error: "Failed to load messages" };
  }
}

export type SiteChatSendResult =
  | { ok: true; message: SiteChatMessage }
  | { ok: false; error: string };

// ADR 0025 Decision 6 — sendMessage returns the created MessageView
// directly, so the caller can append it to the local list on success with
// no optimistic-then-reconcile step. Unchanged by the group-chat redesign.
export async function sendSiteChatMessage(
  agent: Agent,
  convoId: string,
  text: string,
): Promise<SiteChatSendResult> {
  try {
    const res = await agent.api.chat.bsky.convo.sendMessage(
      {
        convoId,
        message: { $type: "chat.bsky.convo.defs#messageInput", text },
      },
      CHAT_PROXY_HEADERS,
    );
    return {
      ok: true,
      message: {
        id: res.data.id,
        text: res.data.text,
        senderDid: res.data.sender.did,
        sentAt: res.data.sentAt,
      },
    };
  } catch (err) {
    logger.warn(
      { event: "site_chat.send_failed", convoId, error: String(err) },
      "failed to send Site Chat message",
    );
    return { ok: false, error: "Failed to send message" };
  }
}
