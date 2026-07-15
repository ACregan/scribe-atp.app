# ADR 0023: Contributor-Side Reconciliation — Where It Runs, Check Order, and Idempotency

## Status
Accepted — design finalized 2026-07-16 (Phase 3 sub-pass 3 grill session), not yet implemented

## Context

ADR 0014's Decision point 3 specs sub-pass 3c at the mechanics level: on the Contributor's next session, any document still carrying `scribe.pendingPublish` needs a public read of the target site's manifest to detect approval (triggering a finalizing write) or a check of the local `pending_submissions` row for a persisted rejection (triggering cleanup). This ADR resolves where that check actually runs, in what order, and what happens when it races or fails partway.

## Decision

**1. Runs inline in `list.tsx`'s own loader**, over the same document set it already fetches via `listDocuments(agent, did)` — no global check in `core.tsx` (unlike invitation discovery, this is a background write with nothing to surface globally), no separate route or button. Mirrors the only existing precedent for this shape of thing in the codebase: the Owner-side `reconcileContributorStatuses`, which runs inline in `site-list.tsx`'s own loader as a side effect of a GET, best-effort, every visit.

**2. Per-document check order — local row first, cross-repo read only when ambiguous.** `approveSubmission`/`rejectSubmission` (sub-pass 3b) already fully own the local `pending_submissions` row's lifecycle, so its current state is a free, no-network signal:
   - Row exists, `status: "pending"` → nothing decided yet, no-op. **No cross-repo read.**
   - Row exists, `status: "rejected"` → declined (a rejection never produces a public artifact, so the local row is the entire signal per ADR 0015). Clear `scribe.pendingPublish` on the Contributor's own document and `pendingSubmissions.remove(documentUri)` — **no cross-repo read needed here either.**
   - Row is missing → ambiguous (approved-and-deleted by 3b, or lost/corrupted — an already-accepted gap per ADR 0015's Consequences). This is the **only** case needing the cross-repo manifest read: found in a group → approved, do the finalizing write; not found anywhere → genuinely can't tell, no-op, self-correcting on the next visit.

   Consequence: most visits do zero network calls — not just when there are no pending documents, but for every document whose local row still says `"pending"`.

**3. Not blocking in the common case; bounded when it isn't.** Zero pending documents (or all still genuinely `"pending"` per Decision 2) costs nothing. When a cross-repo read is actually needed, every pending document's check runs in parallel via `Promise.allSettled` (same pattern `resolveMembershipSites` already uses), each with a 5-second fetch timeout (matching the Image Service browse fetch's existing `AbortSignal.timeout(5000)` precedent) — one slow or dead PDS host skips that document for this visit rather than stalling the whole page.

**4. Approved-group identification and path construction.** Scan every group in the read manifest's `scribe.groups` for one whose `articles` array contains an entry with `uri === documentUri`; that group's `slug` is what was chosen. Reuse `buildDocumentPathAndUrl(domain, basePath, groupSlug, articleSlug)` (already in `siteManifest.server.ts`, already used by `publishArticleToGroup`) for the new `path`/`canonicalUrl` — same helper, fed the discovered slug instead of one chosen by the publishing session itself. The article's own slug is derived from the document's current loose `path` the same way `approveSubmission` already does.

**5. Publisher credit.** `fetchBskyProfile(ownerDid)` → `displayName || handle || ownerDid`. Append `{ did: ownerDid, role: "Publisher", displayName }` to the document's `contributors` array — matches the existing `contributors?: {did, role?, displayName?}[]` schema field the manual byline UI (MR !117) already uses. Dedup guard: skip the append if an entry with that `did` already exists. Purely defensive — in the normal path `scribe.pendingPublish` is cleared in the same write that adds this credit, so a second run never re-enters this branch for the same document; the guard only matters for edge cases like a retry after a partial failure.

**6. Error handling: per-document try/catch, best-effort, log and continue.** One document's failure (network error, malformed manifest, anything) must not break the page load or stop other documents from being checked — matches every other best-effort pattern already in this feature (`sendInviteDm`, `syncSiteRosterBestEffort`).

**7. Idempotency relies on existing machinery, no new guard needed.** The finalizing write already uses `putRecord` with `swapRecord` set to the document's current `cid` — the standard optimistic-concurrency pattern this codebase uses for every document write. A race (two tabs, fast double-navigation) simply means the second write's `swapRecord` no longer matches, so it fails — caught by Decision 6's try/catch and skipped, self-correcting on the next visit.

## Consequences

- `list.tsx`'s loader gains real PDS write side effects on what's nominally a GET request — an established quirk in this codebase (same as `reconcileContributorStatuses`), not a new one introduced here.
- The "row missing but genuinely lost" ambiguity from Decision 2 has no resolution path of its own — it inherits the same accepted gap ADR 0015 already documents for a lost `pending_submissions` table. A document stuck this way stays loose with `scribe.pendingPublish` set indefinitely, even though it may actually be live on the Owner's site. Not solved here.
- This closes out Phase 3 end-to-end (submit → review/approve/reject → reconciliation). Phase 4 (toasts/badges) and Phase 5 (chat) both build on the data this phase populates but neither is required for the core workflow to function.
