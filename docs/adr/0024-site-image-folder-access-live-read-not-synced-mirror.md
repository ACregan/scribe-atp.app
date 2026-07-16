# ADR 0024: Site Image Folder Access — Live Cross-Service Read, Not a Synced Mirror

## Status
Accepted — design finalized and implemented 2026-07-16, reverses part of ADR 0020

## Context

ADR 0020 (Phase 2) chose to have the CMS *push* a site's accepted-Contributor roster into the Image Service's own `site_rosters` table, rather than have the Image Service resolve membership live. The stated reason: avoid the Image Service needing AT Protocol/PDS access (agent management, cross-repo reads) on every single Image Library request.

Found live during the Phase 1–4 manual test pass: this push model made Contributor access to a site's shared folder depend entirely on the Owner's own session happening to run `reconcileContributorStatuses` at least once after the Contributor accepted — the only place that call fired `syncSiteRoster`. A Contributor who accepted an invite had **zero** Image Library folder access until the Owner, for any reason, loaded a page that triggered that sync. Broadening the trigger to every page load (an earlier fix attempt, same session) reduced the window but didn't eliminate it — it was still fundamentally "the Owner must do *something* first," with nothing telling either party that anything was needed.

Meanwhile, `listContributorSites` (the Submit modal's "Contributor Sites" list, sub-pass 3a) already works with **zero** Owner-side dependency: it reads `contributor_memberships` — the local table the Contributor's own **accept** action writes to directly — with no synced copy, no push, no staleness window. Image Library access was solving the identical problem ("is this DID an accepted Contributor of site X, right now") with a strictly worse mechanism.

## Decision

**Drop `site_rosters` entirely. The Image Service reads `contributor_memberships` live instead, via a second read-only SQLite connection straight to the main app's `data/oauth.db` file.**

This is not the same proposition ADR 0020 rejected. That decision was specifically about avoiding **AT Protocol reads** (network calls, PDS resolution, agent lifecycle) on every Image Library request — a real cost. Reading a sibling process's local SQLite file on the same machine is a different, much cheaper thing: no network, no PDS, just a file read. Both services already run WAL mode, which is exactly the mode designed for exactly this — safe concurrent multi-connection reads across processes.

Concretely:

1. **`image-service/src/access.ts`** — `isSiteRosterMember` is replaced by a live query against a second `better-sqlite3` connection opened read-only against `CMS_DB_PATH` (new env var, defaulting to the same `data/oauth.db` resolution the main app itself uses — in practice the same absolute path when both processes share a working directory, which they do in every current deployment shape). Checks `contributor_memberships` for `(site_uri, member_did)` with `status = 'accepted'` — the exact same predicate `listContributorSites` already uses.

2. **`site_rosters` table removed** from `image-service/src/db.ts`. Nothing replaces it — there is no mirror anymore, just a live read.

3. **`PUT /api/image-service/site-roster` simplified** to `{siteUri, siteName}` only — `memberDids` is gone, since there's no roster to push. Renamed to `/site-folder` to match its narrowed purpose: it now does exactly one thing, ensure the folder exists.

4. **`contributorRoster.server.ts`'s `removeContributor` and `reconcileContributorStatuses` drop their `cookieHeader` parameter and the `syncSiteRosterBestEffort` call entirely.** There's nothing to sync. Revocation is handled by the exact same mechanism as grant now: both simply reflect `contributor_memberships`' current state, live, the instant it changes. This also removes an asymmetry the old design had — removal was already immediate (it called the sync inline), grant was not (gated behind reconciliation actually running).

5. **The global per-owned-site reconciliation added earlier this session (`core.tsx`) is kept.** It no longer gates Image Library access, but it still matters: it's what eventually promotes `scribe.contributors` on the Owner's own PDS record from `"invited"` to `"accepted"`, which is the *public*, portable source of truth for anyone reading that record directly (other tooling, a future feature, the Owner's own site-list page display). Local-table-driven Image Library access and PDS-record-driven public correctness are two different concerns that happen to share the same underlying event; only one of them still needs the Owner's session to run.

6. **New one-shot script, `scripts/backfill-site-image-folders.ts`**, for the pre-existing sites created before Phase 2's at-creation-time folder auto-creation. Restores an agent for every DID with a stored `oauth_session` row (via the exported `oauthClient` in `auth.server.ts` — no live login needed, these are already-granted OAuth tokens), enumerates each account's sites via `listSites`, and calls the same `ensureSiteFolder` helper the HTTP endpoint uses. Safe to re-run — folder creation is already idempotent (no-ops if the folder exists). Meant to be run once per real deployment, then deleted, matching this repo's established pattern for one-time devtools (see the `chore/remove-stale-devtools` history).

## Consequences

- **New coupling**: the Image Service now has a runtime dependency on being able to read the main app's SQLite file from disk. This didn't exist before — each service previously only ever touched its own database. Both must run on the same host with a shared filesystem view of `data/oauth.db` (true today; would need revisiting if the two services were ever split across hosts).
- **Reverses ADR 0020's specific "push, don't resolve live" call** — its reasoning is superseded here, not wrong on its own terms: it was correct that a *PDS* read on every request would be costly, and this ADR doesn't do that. `contributor_memberships` was already the right layer to read from all along.
- **`site_rosters` and the wholesale-sync endpoint are gone** — a future reader should not go looking for a roster-push mechanism; there isn't one anymore.
- Grant and revoke are now symmetric: both are simply "read the current state of `contributor_memberships`," with no separate propagation step for either direction.
