import type { Route } from "./+types/respond";
import { requireAuth, useRealOAuth } from "~/services/auth.server";
import { acceptInvitation, rejectInvitation } from "~/services/contributorRoster.server";

// Resource route only — never navigated to directly, just the fetcher
// target for the global Accept/Reject modal in the core layout (ADR 0019
// Decision 6). Both actions are local-only writes (contributor_memberships),
// so unlike every other action in this feature there's no agent/PDS call
// here at all — the invitee's own session can never write the Owner's
// site.standard.publication record directly (ADR 0014's cross-repo write
// asymmetry); the Owner-side reconciliation on their next site-list visit
// is what eventually syncs this back into scribe.contributors.
export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;
  const siteUri = formData.get("siteUri") as string;

  if (!siteUri) return { ok: false, error: "Missing site." };
  if (!useRealOAuth) return { ok: true };

  if (intent === "acceptInvitation") {
    acceptInvitation(did, siteUri);
    return { ok: true };
  }

  if (intent === "rejectInvitation") {
    rejectInvitation(did, siteUri);
    return { ok: true };
  }

  return { ok: false, error: "Unknown intent." };
}
