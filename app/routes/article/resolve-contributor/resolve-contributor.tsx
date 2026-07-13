import type { Route } from "./+types/resolve-contributor";
import { requireAuth, useRealOAuth } from "~/services/auth.server";
import {
  fetchBskyProfile,
  fetchBskyProfiles,
} from "~/services/blueskyProfile.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const url = new URL(request.url);
  const dids = url.searchParams.getAll("did");
  if (dids.length > 0) {
    if (!useRealOAuth) {
      return Response.json({ profiles: [] });
    }
    try {
      const profiles = await fetchBskyProfiles(dids, request.signal);
      return Response.json({ profiles });
    } catch {
      return Response.json({ profiles: [] });
    }
  }

  const handle = url.searchParams.get("handle")?.trim();
  if (!handle) {
    return Response.json({ error: "Enter a Bluesky handle" }, { status: 400 });
  }

  if (!useRealOAuth) {
    return Response.json({
      did: `did:dev:${handle}`,
      handle,
      displayName: handle,
      avatar: undefined,
    });
  }

  try {
    const profile = await fetchBskyProfile(handle, request.signal);
    if (!profile) {
      return Response.json(
        { error: "Bluesky account not found" },
        { status: 404 },
      );
    }
    return Response.json({
      did: profile.did,
      handle: profile.handle,
      displayName: profile.displayName || profile.handle,
      avatar: profile.avatar,
    });
  } catch {
    return Response.json(
      { error: "Failed to resolve Bluesky account" },
      { status: 502 },
    );
  }
}
