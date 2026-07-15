// Cross-repo AT Protocol read primitives, extracted from
// contributorRoster.server.ts once a third call site needed them
// (submissionReview.server.ts, ADR 0022 point 2) — the same "extract once
// truly shared" threshold that produced documentRepository.server.ts and
// siteRepository.server.ts.
//
// Found live, 2026-07-15: an authenticated agent's com.atproto.repo.getRecord
// queries the CALLER's own PDS, which cannot serve a record hosted on a
// different PDS — most real accounts are, since bsky.social is sharded
// across many PDS hosts (confirmed live: two real test accounts resolved to
// oyster.us-east and rhizopogon.us-west, and the cross-host read returned
// RecordNotFound). Reading a record that belongs to a DID other than the
// caller's own requires resolving that DID's actual PDS first, then a plain
// unauthenticated fetch against it — AT Protocol repositories are publicly
// readable without auth.

export function parseSiteUri(siteUri: string): { ownerDid: string; rkey: string } {
  const match = siteUri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!match) throw new Error(`Malformed site URI: ${siteUri}`);
  return { ownerDid: match[1], rkey: match[2] };
}

const pdsUrlCache = new Map<string, string>();

export async function resolveDidPdsUrl(did: string): Promise<string> {
  const cached = pdsUrlCache.get(did);
  if (cached) return cached;

  const didDocUrl = did.startsWith("did:web:")
    ? `https://${did.slice("did:web:".length)}/.well-known/did.json`
    : `https://plc.directory/${encodeURIComponent(did)}`;
  const res = await fetch(didDocUrl);
  if (!res.ok) throw new Error(`Failed to resolve DID document for ${did}: ${res.statusText}`);
  const doc = (await res.json()) as {
    service?: Array<{ id: string; serviceEndpoint: string }>;
  };
  const pds = doc.service?.find((s) => s.id === "#atproto_pds");
  if (!pds) throw new Error(`No PDS service found in DID document for ${did}`);

  pdsUrlCache.set(did, pds.serviceEndpoint);
  return pds.serviceEndpoint;
}
