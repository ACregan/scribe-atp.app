# ADR 0028: Personal User Image Folders Get the Same Owner-or-Contributor Read Restriction as Site Folders

## Status

Accepted, implemented 2026-07-20. Supersedes ADR 0020 point 1's "personal folders explicitly keep today's open-read behavior" and closes the gap ADR 0017/0020 both explicitly deferred.

## Context

ADR 0017 and ADR 0020 deliberately scoped the Image Library's first read-side access restriction to **site-owned** folders only, leaving personal User Image Folders openly browsable by any authenticated user — flagged each time as a known, separate, deferred gap (see [[backlog-image-library-access-control]]).

This surfaced in practice 2026-07-20: a user logged in as the `norobots.blog` account could still browse `anthonycregan.dev`'s personal Image Library folder. This was working exactly as built — `image-service/src/browse.ts`'s `canReadFolder` explicitly short-circuited to `true` for any folder with a `user_did` set — but it no longer matched the intended access model: a user should see only their own personal folder, plus the folder of any site they own or are an accepted Contributor on.

## Decision

**Read access is now symmetric with write access for every folder, personal or site-owned.** `browse.ts` no longer has a separate `canReadFolder` — it calls `access.ts`'s existing `canAccessFolder(did, folder)` directly for both the top-level "shared view" listing and a direct `folderId` fetch. `canAccessFolder` already implemented exactly the right rule for personal folders (`folder.user_did === did`); the gap was entirely in `browse.ts` bypassing that check for reads.

No changes to `access.ts` itself — the asymmetry being removed lived only in `browse.ts`.

**Pre-existing site folders backfilled.** Sites created before ADR 0020/0024's at-creation-time folder auto-create (anthonycregan.co.uk, norobots.blog, perpetualsummer.ltd) had no site-owned Image Folder at all, so their Owner and Contributors were falling back to whatever personal folders were visible to them under the old open-read rule. `scripts/backfill-site-image-folders.ts` (built alongside ADR 0024 but not yet run against production data) creates the missing folders; access for each site's Owner and accepted Contributors follows automatically since `canAccessFolder` resolves live off `contributor_memberships` — no separate grant step needed once the folder exists.

## Consequences

- A user who previously relied on browsing another account's personal folder (e.g. to reuse an image) loses that ability. No such workflow was ever a designed feature — it was the literal bug this ADR closes.
- `browse.ts`'s top-level listing and direct `folderId` fetch behave identically now; the "read is more permissive than write" split documented in ADR 0020 point 1 no longer exists anywhere in the Image Service.
- `CLAUDE.md`'s "Access control" section and `UBIQUITOUS_LANGUAGE.md`'s Site Image Folder definition (both of which stated personal folders "stay openly browsable by design") need updating alongside this ADR — see the doc-update rule at the top of the root `CLAUDE.md`.
