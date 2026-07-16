# ADR 0017: Image Library Site-Scoped Folders, Roster Pushed From the CMS, Not Resolved Live by the Image Service

## Status
Accepted, implemented, then partially superseded — design finalized 2026-07-15; the `site_rosters`/CMS-push mechanism this ADR sketched was replaced 2026-07-16 by a live cross-process read (see ADR 0024). The nullable `site_uri` owner column and the general "restrict site folders" shape are unaffected and still current.

## Context

The Image Library currently has no read-side access control: per the "Access control" section of this file's own documentation, any authenticated user can browse and copy URLs from any image in the library, regardless of who uploaded it. This was flagged as something that would become unworkable as the user count grows, and it became the entry point for the broader Contributors design (ADR 0014, ADR 0018): once a site has a defined roster of people permitted to write for it, that roster is also the natural boundary for a shared folder of images those same people should be able to use.

The Image Service is a deliberately separate, standalone process from the main CMS app (ADR 0001) and today never reads AT Protocol records at all — it authenticates purely by verifying the shared session cookie and checking `user_did` ownership in its own SQLite. Introducing a site-scoped shared folder means the Image Service needs to learn, for a given site, who is currently allowed to use it. Two ways to get that list were considered:

1. **The Image Service resolves it live**, doing its own public `getRecord` call against the site owner's PDS to read `scribe.contributors` directly, on demand or on a short cache TTL.
2. **The CMS pushes it**, syncing the roster into the Image Service's own database whenever it changes, piggybacked on the same action that already writes `scribe.contributors`.

Option 1 would give the Image Service its first-ever dependency on AT Protocol resolution, working against its own founding rationale (ADR 0001) of staying simple and standalone. It would also inherit a limitation already documented elsewhere in this codebase: PDS resolution as currently implemented only works reliably for `did:plc` accounts on bsky.social, not `did:web` or self-hosted PDS instances.

## Decision

The CMS pushes the roster; the Image Service never resolves it independently.

`image_folders` gains a second, mutually exclusive, nullable owner column alongside the existing `user_did` — `site_uri` — so a folder is owned by either a single user (unchanged, today's behavior) or a site (new). Everything else about a folder — subfolders, Variants, the upload/browse/move/delete endpoints — is unchanged; only what "owner" can mean is extended.

Access is granted if the caller's DID matches the folder's `user_did` (unchanged), or, for a site-owned folder, if the caller is that site's owner or appears in a new local roster table:

```sql
site_rosters (site_uri, member_did)
```

populated by a wholesale delete-and-reinsert on every roster change, mirroring `scribe.contributors` being the full source of truth — no diffing needed on either side. The sync is a new endpoint, e.g. `PUT /api/image-service/site-roster`, called by the same CMS action that already writes `scribe.contributors` (one write path, no separate cron or sync job). It reuses the *existing* session-cookie-forwarding auth pattern already used by `imageServiceClient.server.ts`'s `browseImages` (the Image Service verifies the caller via the shared `SESSION_SECRET`, same as any browser-originated request) rather than a new shared-secret mechanism like `NOTIFY_SECRET` — the caller is always a real logged-in site owner acting in their own session, not an external system, so the existing pattern already fits.

The site owner's own DID needs no separate storage for the access check — it is already embedded in `site_uri` itself (`at://<did>/site.standard.publication/<rkey>`), parseable at read time.

## Consequences

- If the sync call fails (a momentary Image Service outage, a network blip), the roster there goes stale until the next add/remove-contributor action. This is accepted as low-stakes and self-correcting rather than requiring a retry mechanism for v1 — the same acceptance-of-eventual-consistency posture as the rest of the Contributors design.
- The Image Service remains fully AT Protocol-agnostic, preserving ADR 0001's original rationale, and does not inherit the `did:web`/self-hosted-PDS resolution gap that a live-resolve approach would have carried.
- This directly resolves the "unrestricted read access" problem that motivated this ADR, scoped specifically to site-owned shared folders — the general Image Library access-control gap for personal, `user_did`-owned folders is unaffected and remains open.
