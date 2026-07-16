import type { Route } from "./+types/site-chat";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  resolveSiteChatConvo,
  getSiteChatMessages,
  sendSiteChatMessage,
} from "~/services/siteChat.server";
import { devSiteChatLoader } from "~/services/devFixtures.server";

// ADR 0025 (Site Chat) — a resource route, not a page. Polled by the
// client every 10s (message mode) and called once per roster change
// (resolve mode), both via the same loader distinguished by which query
// param is present, since both need only the caller's own authenticated
// session and nothing else route-specific enough to warrant two files.
// `:siteSlug` isn't read here — it's kept in the URL purely for
// readability/future logging. No ownership check against it either: the
// caller only ever gets a conversation with the `members` DIDs *they*
// supply, using their *own* session — identical in effect to starting a
// Bluesky DM directly, which chat.bsky.convo's own social-graph rules
// (blocked/not-followed/etc.) already gate, not this route.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const convoId = url.searchParams.get("convoId");

  if (!useRealOAuth) return devSiteChatLoader(convoId);

  const { agent } = await requireAtpAgent(request);

  // Poll mode — an already-resolved conversation, fetching its messages.
  if (convoId) {
    return getSiteChatMessages(agent, convoId);
  }

  // Resolve mode — no convoId yet, resolve one from the current roster.
  const members = (url.searchParams.get("members") ?? "")
    .split(",")
    .filter(Boolean);
  if (members.length === 0) {
    return { ok: false as const, errorType: "unknown" as const };
  }
  return resolveSiteChatConvo(agent, members);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const convoId = formData.get("convoId") as string;
  const text = ((formData.get("text") as string) ?? "").trim();

  if (!convoId || !text) {
    return { ok: false as const, error: "A message is required." };
  }

  if (!useRealOAuth) {
    return {
      ok: true as const,
      message: {
        id: `dev-${Date.now()}`,
        text,
        senderDid: "did:dev:user",
        sentAt: new Date().toISOString(),
      },
    };
  }

  const { agent } = await requireAtpAgent(request);
  return sendSiteChatMessage(agent, convoId, text);
}
