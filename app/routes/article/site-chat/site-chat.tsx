import type { Route } from "./+types/site-chat";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  lookupSiteChatConvo,
  getSiteChatMessages,
  sendSiteChatMessage,
} from "~/services/siteChat.server";
import { devSiteChatLoader } from "~/services/devFixtures.server";
import { SITE_COLLECTION } from "~/constants";

// ADR 0025/0026 (Site Chat) — a resource route, not a page. Polled by the
// client every 10s (message mode) and looked up once per mount (resolve
// mode), both via the same loader distinguished by which query param is
// present, since both need only the caller's own authenticated session and
// nothing else route-specific enough to warrant two files.
//
// Resolve mode no longer calls getConvoForMembers (1-1 only, couldn't
// support n Contributors) — the group already exists (or doesn't)
// independently of who's asking, created out-of-band by
// reconcileContributorStatuses the moment the first Contributor is
// accepted. This route just looks up the persisted convoId for the site
// (`ownerDid` + `:siteSlug` identify it) and transparently accepts the
// group membership on the caller's behalf if it's still in "request"
// status. No separate ownership check is needed beyond that: only someone
// whose own session was actually added as a member (Owner or an accepted
// Contributor) can successfully read/accept this convoId at all —
// chat.bsky.convo's own membership rules gate it, not this route.
export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const convoId = url.searchParams.get("convoId");

  if (!useRealOAuth) return devSiteChatLoader(convoId);

  const { agent } = await requireAtpAgent(request);

  // Poll mode — an already-resolved conversation, fetching its messages.
  if (convoId) {
    return getSiteChatMessages(agent, convoId);
  }

  // Resolve mode — look up the site's persisted group conversation.
  const ownerDid = url.searchParams.get("ownerDid");
  if (!ownerDid) {
    return { ok: false as const, errorType: "unknown" as const };
  }
  const siteUri = `at://${ownerDid}/${SITE_COLLECTION}/${params.siteSlug}`;
  return lookupSiteChatConvo(agent, siteUri);
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
