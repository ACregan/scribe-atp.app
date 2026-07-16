import { Agent, ChatBskyConvoGetConvoForMembers } from "@atproto/api";
import { logger } from "~/services/logger.server";

// ADR 0016/0025 (Site Chat) — same proxy header pattern already used by
// contributorRoster.server.ts's sendInviteDm and scribe-atp-social's
// notify.ts for this exact service-proxied lexicon.
const CHAT_PROXY_HEADERS = {
  headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" },
};

export type SiteChatResolveErrorType =
  | "blocked"
  | "messagesDisabled"
  | "notFollowed"
  | "accountSuspended"
  | "unknown";

export type SiteChatResolveResult =
  | { ok: true; convoId: string }
  | { ok: false; errorType: SiteChatResolveErrorType };

// ADR 0025 Decision 2/5 — resolved fresh against the *current* roster every
// call, never cached/stored (matches ADR 0016's no-chaining decision: a
// different member set is, correctly, a different conversation). The four
// error types map to getConvoForMembers's actual failure modes — real,
// social-graph-dependent states (blocked, doesn't follow the sender,
// messages disabled, account suspended), each needing its own inline
// explanation rather than one generic "chat unavailable".
export async function resolveSiteChatConvo(
  agent: Agent,
  memberDids: string[],
): Promise<SiteChatResolveResult> {
  try {
    const res = await agent.api.chat.bsky.convo.getConvoForMembers(
      { members: memberDids },
      CHAT_PROXY_HEADERS,
    );
    return { ok: true, convoId: res.data.convo.id };
  } catch (err) {
    let errorType: SiteChatResolveErrorType = "unknown";
    if (err instanceof ChatBskyConvoGetConvoForMembers.BlockedActorError) {
      errorType = "blocked";
    } else if (err instanceof ChatBskyConvoGetConvoForMembers.MessagesDisabledError) {
      errorType = "messagesDisabled";
    } else if (err instanceof ChatBskyConvoGetConvoForMembers.NotFollowedBySenderError) {
      errorType = "notFollowed";
    } else if (err instanceof ChatBskyConvoGetConvoForMembers.AccountSuspendedError) {
      errorType = "accountSuspended";
    }
    logger.warn(
      { event: "site_chat.resolve_failed", errorType, error: String(err) },
      "failed to resolve Site Chat conversation",
    );
    return { ok: false, errorType };
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
// no optimistic-then-reconcile step.
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
