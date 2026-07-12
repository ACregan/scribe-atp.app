// Shared server-side helpers for fetching Bluesky profile data from the
// public, unauthenticated API. Scoped to the Contributors feature's own
// route (resolve-contributor.tsx) for now — images.tsx, core.tsx, and
// auth/callback.tsx each have their own long-standing inline copies of
// similar fetches; consolidating those is a separate, higher-risk change
// (auth/session-critical paths) left out of scope here.

export type BskyProfile = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

// `actor` may be a handle or a DID — Bluesky's API accepts either.
export async function fetchBskyProfile(
  actor: string,
): Promise<BskyProfile | null> {
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
  );
  if (!res.ok) return null;
  return (await res.json()) as BskyProfile;
}

export async function fetchBskyProfiles(
  dids: string[],
): Promise<Array<{ did: string; avatar?: string }>> {
  if (dids.length === 0) return [];
  const params = new URLSearchParams();
  dids.forEach((did) => params.append("actors", did));
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`,
  );
  if (!res.ok) return [];
  const { profiles } = (await res.json()) as {
    profiles: Array<{ did: string; avatar?: string }>;
  };
  return profiles.map((p) => ({ did: p.did, avatar: p.avatar }));
}
