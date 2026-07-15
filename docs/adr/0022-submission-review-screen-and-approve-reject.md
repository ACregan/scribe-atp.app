# ADR 0022: Submission Review Screen, Approve/Reject Mechanics, and PDS-Resolution Extraction

## Status
Accepted — design finalized 2026-07-16 (Phase 3 sub-pass 2 grill session), not yet implemented

## Context

ADR 0014's Decision points 2 and 4 sketch sub-pass 3b at a conceptual level: a review screen that's a "close sibling" of `/article/view`, and an Approve action that "extends `publishArticleToGroup`." Working through the concrete build surfaced that "extends" undersold how little actually carries over — `publishArticleToGroup` does a same-repo document read *and write-back*, and the write-back half is categorically impossible here: AT Protocol has no cross-repo write, so the Owner's session can never touch the Contributor's document. That's the entire reason ADR 0014 needs a separate Contributor-side finalizing write later (sub-pass 3c). This ADR resolves what Approve/Reject actually do, given that constraint.

This is also the third place this feature needs to resolve an arbitrary DID's PDS and read a public record from it cross-repo (after `listPendingInvitations` and `listContributorSites`, both in `contributorRoster.server.ts`) — crossing this codebase's own established extraction threshold (the same reasoning that produced `documentRepository.server.ts`/`siteRepository.server.ts`).

## Decision

**1. New route `/article/review/:contributorDid/:rkey`**, sibling to `/article/view/:articleUrl`, not a variant of it. The loader reconstructs `documentUri = at://{contributorDid}/site.standard.document/{rkey}`, looks it up via `pendingSubmissions.get(documentUri)` to get `siteUri`/`ownerDid`/`submittedAt` — the DB row is the single source of truth for "which site/owner this belongs to," not a second URL segment — and **guards `ownerDid === caller's own did`** before doing anything else. Only then does it do the cross-repo public read of the Contributor's document. Reached via a link from the plain submissions list on `/article/list/:siteSlug`.

**2. Extract the PDS-resolution primitives into a new shared `app/services/pdsResolution.server.ts`**: the module-level `pdsUrlCache`, `resolveOwnerPdsUrl` (renamed `resolveDidPdsUrl` — it resolves any DID's PDS, not just an "owner's"), and `parseSiteUri` (already collection-agnostic despite its name — parses any `at://did/collection/rkey`). `contributorRoster.server.ts` keeps `listPendingInvitations`/`listContributorSites`/`resolveMembershipSites` but imports these primitives rather than defining them; the new `submissionReview.server.ts` (Decision 3) and `list.tsx`'s submit action both import from here too.

**3. Approve is a new, standalone function (`approveSubmission`) in a new `app/services/submissionReview.server.ts`** — not a parameterized branch of `publishArticleToGroup`. It does only the Owner-side half of a publish:
   - Cross-repo **public** read of the Contributor's document (plain `fetch` via `resolveDidPdsUrl`, no agent — documents are publicly readable).
   - `buildArticleRef({...})` (already exported from `article.server.ts`, already field-only with no repo assumption — no changes needed there) from the read fields, with `publishedAt` stamped now.
   - `mutateSiteRecord` on the **Owner's own** site, inserting the resulting `ArticleRef` into the chosen group's `articles` array — same helper `publishArticleToGroup` already uses for its own "move into group" step, the one piece of real overlap.
   - Delete the `pending_submissions` row (ADR 0015 — approve deletes immediately, no local trace needed).
   - Chat post: no-op for now (Phase 5).

   **Approve's group picker has full parity with the Publish modal** — existing groups plus a "+ Create new group" option that creates the group first, exactly the same `NEW_GROUP_VALUE` sentinel pattern `list.tsx`'s action already uses.

**4. Reject** (`rejectSubmission`, same new file) opens a confirmation modal with a **required, non-empty** reason `Textarea` (the confirm button stays disabled until non-empty, same pattern as the "new group title" field) — a rejection with no explanation gives the Contributor nothing actionable. Writes `pendingSubmissions.reject(documentUri, reason)`; the row persists (not deleted) so the Contributor's own reconciliation check (sub-pass 3c) can later distinguish "still pending" from "rejected, here's why."

**5. Both `approveSubmission` and `rejectSubmission` re-check `pendingSubmissions.get(documentUri)` at the very start**, returning `{ ok: false, error: "This submission has already been reviewed." }` if the row is missing or its `status` isn't `"pending"` — guards a double-click or a submission open in two tabs from double-inserting an `ArticleRef` or double-processing a reject. Server-side, not just UI-disabling, matching ADR 0021 point 5's posture for the submit guards.

**6. `pending_submissions` gains a `document_title` column**, written once at submission time. `list.tsx`'s submit action already has `value.title` in hand from the `getDocument` call it does for the existing guards — this is a free addition, not a new fetch. `site-list.tsx`'s loader reads `pendingSubmissions.listForOwner(did)` (filtered to the current site) directly from local SQLite to render the plain "New Article Submission" list — no cross-repo read needed just to show a title. Contributor handle/displayName for the row still comes from the existing `fetchBskyProfiles` call already on that page for the Contributors roster (a cheap, already-batched Bluesky profile lookup, not a PDS document read).

**7. Site-deletion and roster-removal edge cases:**
   - A site deleted after a submission exists leaves an orphaned `pending_submissions` row — **backlogged**, matching ADR 0020's identical precedent for the Site Image Folder's site-deletion cleanup gap. Not a new corner being cut; the same accepted gap in the same feature.
   - A Contributor removed from the roster after submitting, before Approve/Reject, needs **no special handling** — approve/reject only require a public read of the Contributor's document, which works regardless of current roster status, and an Owner may legitimately want to formally reject (with a reason) the exact submission that prompted the removal. `removeContributor` does not touch `pending_submissions`.

**8. Action pattern:** the review screen's action returns data (not a redirect) on success; the component does `addToast(...)` + `navigate("/article/list/{siteSlug}")` in a `useEffect`, the same "Toast + navigate" pattern already documented in `CLAUDE.md` for `site/configure`. The page itself shows only Approve, Reject, and a Back link — no Edit or "View Published" (it's someone else's not-yet-published document).

## Consequences

- `contributorRoster.server.ts`'s existing tests that exercise `parseSiteUri`/PDS resolution indirectly (via `listPendingInvitations`/`listContributorSites`) are unaffected by the extraction as long as the re-exported behavior is identical — but any test importing `parseSiteUri` directly needs its import path updated to `pdsResolution.server.ts`.
- `publishArticleToGroup` itself is untouched by this phase — Approve does not extend it, per Decision 3. A future reader should not go looking for an "approve from submission" branch inside it.
- The submissions list is deliberately "plain" per Phase 3's own explicit scope note — no toast, no badge, no chat post. Those are Phase 4 and Phase 5 respectively, layered on top of the same `pending_submissions` data this sub-pass populates and reads.
- Sub-pass 3c (Contributor-side reconciliation) still needs its own grill session — this ADR does not resolve how the Contributor's own next-login check detects approval/rejection, only what the Owner-side Approve/Reject actions themselves do.
