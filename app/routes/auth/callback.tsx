import { redirect } from "react-router";
import type { Route } from "./+types/callback";
import { createAuthSession, oauthClient } from "~/services/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;

  try {
    const { session } = await oauthClient.callback(params);
    const did = session.sub;

    // Resolve the DID to a human-readable handle via the public Bluesky API
    let handle: string = did;
    try {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
      );
      if (res.ok) {
        const profile = (await res.json()) as { handle?: string };
        if (profile.handle) handle = profile.handle;
      }
    } catch {
      // Fall back to raw DID if profile fetch fails
    }

    return createAuthSession(request, { did, handle }, "/");
  } catch (err) {
    console.error("OAuth callback error:", err);
    return redirect("/login?error=auth_failed");
  }
}
