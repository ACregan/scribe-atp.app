import { useState, useEffect, useRef, useCallback } from "react";
import { useFetcher } from "react-router";

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

export type SiteChatResolveErrorType = "notCreatedYet" | "unknown";

type ResolveResponse =
  | { ok: true; convoId: string }
  | { ok: false; errorType: SiteChatResolveErrorType };

type MessagesResponse =
  | { ok: true; messages: SiteChatMessage[]; profiles: SiteChatProfile[] }
  | { ok: false; error: string };

type SendResponse =
  | { ok: true; message: SiteChatMessage }
  | { ok: false; error: string };

// ADR 0025 Decision 3 — feels live without hammering a service this app
// doesn't operate; a starting judgment call, not a measured constraint.
const POLL_INTERVAL_MS = 10_000;

function siteChatUrl(siteSlug: string, params: Record<string, string>): string {
  const url = new URL(
    `/article/site-chat/${siteSlug}`,
    window.location.origin,
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

// ADR 0025/0026 — one hook owning the whole Site Chat lifecycle: look up the
// site's persisted group conversation once per mount, poll every 10s while
// visible (Decision 3), dedupe against the currently-rendered messages by id
// (getMessages has no incremental/since param), and send. Kept separate
// from SiteChatPanel so the panel stays pure rendering, matching this
// file's own useDirtyTree/useSiteListDnD split.
//
// ADR 0026 — the resolve step no longer builds or filters a member list at
// all: chat.bsky.group.createGroup/addMembers already keep the group's
// actual membership in sync out-of-band (reconcileContributorStatuses,
// removeContributor), so this hook only needs the site's own identity
// (siteSlug + ownerDid) to look up its persisted convoId.
export function useSiteChat(siteSlug: string, ownerDid: string) {
  // Explicit keys — three independent fetchers per panel instance, and
  // distinguishable in tests without relying on call-order mocking.
  const resolveFetcher = useFetcher<ResolveResponse>({ key: "site-chat-resolve" });
  const pollFetcher = useFetcher<MessagesResponse>({ key: "site-chat-poll" });
  const sendFetcher = useFetcher<SendResponse>({ key: "site-chat-send" });

  const [convoId, setConvoId] = useState<string | null>(null);
  const [resolveErrorType, setResolveErrorType] =
    useState<SiteChatResolveErrorType | null>(null);
  const [messages, setMessages] = useState<SiteChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Map<string, SiteChatProfile>>(
    new Map(),
  );
  const [sendError, setSendError] = useState<string | null>(null);

  const knownMessageIdsRef = useRef<Set<string>>(new Set());

  // Resolve once per mount — the group's membership is synced entirely
  // server-side by reconcileContributorStatuses/removeContributor, so
  // there's no roster-derived key to re-resolve on; siteSlug/ownerDid
  // identify the same site chat for the whole time this component is
  // mounted.
  useEffect(() => {
    setConvoId(null);
    setResolveErrorType(null);
    setMessages([]);
    setProfiles(new Map());
    knownMessageIdsRef.current = new Set();
    resolveFetcher.load(siteChatUrl(siteSlug, { ownerDid }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSlug, ownerDid]);

  // Derived during render, not a useEffect keyed on fetcher.data — that
  // doesn't reliably re-fire in this app's React Router version (see
  // feedback-usefetcher-data-effect-unreliable memory / site-list.tsx's own
  // processedDeleteData precedent).
  const [processedResolveData, setProcessedResolveData] = useState(
    resolveFetcher.data,
  );
  if (
    resolveFetcher.state === "idle" &&
    resolveFetcher.data &&
    resolveFetcher.data !== processedResolveData
  ) {
    setProcessedResolveData(resolveFetcher.data);
    if (resolveFetcher.data.ok) {
      setConvoId(resolveFetcher.data.convoId);
    } else {
      setResolveErrorType(resolveFetcher.data.errorType);
    }
  }

  const poll = useCallback(() => {
    if (!convoId) return;
    pollFetcher.load(siteChatUrl(siteSlug, { convoId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSlug, convoId]);

  // ADR 0025 Decision 3 — 10s interval while mounted and visible, paused
  // when backgrounded, with one immediate poll on regaining visibility.
  useEffect(() => {
    if (!convoId) return;

    poll();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId !== null) return;
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        poll();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoId]);

  // getMessages has no "since" cursor — every poll refetches the newest
  // page and this dedupes against what's already rendered by message id.
  // Same derive-during-render treatment as resolve, above.
  const [processedPollData, setProcessedPollData] = useState(pollFetcher.data);
  if (
    pollFetcher.state === "idle" &&
    pollFetcher.data &&
    pollFetcher.data !== processedPollData
  ) {
    setProcessedPollData(pollFetcher.data);
    if (pollFetcher.data.ok) {
      const { messages: fetched, profiles: fetchedProfiles } = pollFetcher.data;
      const newOnes = fetched.filter((m) => !knownMessageIdsRef.current.has(m.id));
      if (newOnes.length > 0) {
        newOnes.forEach((m) => knownMessageIdsRef.current.add(m.id));
        setMessages((prev) =>
          [...prev, ...newOnes].sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
        );
      }
      if (fetchedProfiles.length > 0) {
        setProfiles((prev) => {
          const next = new Map(prev);
          fetchedProfiles.forEach((p) => next.set(p.did, p));
          return next;
        });
      }
    }
  }

  const [processedSendData, setProcessedSendData] = useState(sendFetcher.data);
  if (
    sendFetcher.state === "idle" &&
    sendFetcher.data &&
    sendFetcher.data !== processedSendData
  ) {
    setProcessedSendData(sendFetcher.data);
    if (sendFetcher.data.ok) {
      const sent = sendFetcher.data.message;
      if (!knownMessageIdsRef.current.has(sent.id)) {
        knownMessageIdsRef.current.add(sent.id);
        setMessages((prev) =>
          [...prev, sent].sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
        );
      }
      setSendError(null);
    } else {
      setSendError(sendFetcher.data.error);
    }
  }

  const isSending = sendFetcher.state !== "idle";

  function sendMessage(text: string) {
    if (!convoId || !text.trim()) return;
    const formData = new FormData();
    formData.set("convoId", convoId);
    formData.set("text", text);
    sendFetcher.submit(formData, {
      method: "post",
      action: `/article/site-chat/${siteSlug}`,
    });
  }

  return {
    convoId,
    resolveErrorType,
    messages,
    profiles,
    sendError,
    isSending,
    sendMessage,
  };
}
