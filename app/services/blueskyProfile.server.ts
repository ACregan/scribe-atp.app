// Shared server-side helpers for fetching Bluesky profile data. Scoped to
// the Contributors feature's own route (resolve-contributor.tsx) for now —
// images.tsx, core.tsx, and auth/callback.tsx each have their own
// long-standing inline copies of similar fetches; consolidating those is a
// separate, higher-risk change (auth/session-critical paths) left out of
// scope here.

import { fetchProfile, type Profile } from "@scribe-atp/core";

export type BskyProfile = Profile;

// `actor` may be a handle or a DID — Bluesky's API accepts either.
export async function fetchBskyProfile(
  actor: string,
  signal?: AbortSignal,
): Promise<BskyProfile | null> {
  try {
    return await fetchProfile(actor, signal);
  } catch {
    return null;
  }
}

// The SDK only exposes a single-identifier fetchProfile — there is no bulk
// equivalent of app.bsky.actor.getProfiles. Contributor lists are small (a
// handful of people per article), so resolving each independently via
// Promise.allSettled is cheap and, unlike the old single bulk call, one
// failed lookup no longer blanks out every other contributor's avatar.
export async function fetchBskyProfiles(
  dids: string[],
  signal?: AbortSignal,
): Promise<Array<{ did: string; handle: string; displayName?: string; avatar?: string }>> {
  if (dids.length === 0) return [];
  const results = await Promise.allSettled(
    dids.map((did) => fetchProfile(did, signal)),
  );
  return results
    .filter(
      (result): result is PromiseFulfilledResult<Profile> =>
        result.status === "fulfilled",
    )
    .map((result) => ({
      did: result.value.did,
      handle: result.value.handle,
      displayName: result.value.displayName,
      avatar: result.value.avatar,
    }));
}
