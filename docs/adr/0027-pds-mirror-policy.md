# ADR 0027: When Local State May Mirror PDS State — One Policy

## Status

Accepted — 2026-07-17

## Context

The Contributors feature (ADR 0014–0026) went through several rounds of local caching/mirroring of PDS-sourced state, each solved independently: `contributor_memberships` (ADR 0015), `pending_submissions` (ADR 0015), the `ArticleRef` snapshot embedded in `site.standard.publication` (predates Contributors, documented in `CLAUDE.md`), and `site_rosters` — a push-synced mirror that went stale and was deleted in favor of a live cross-service read (ADR 0024). ADR 0024 is, in substance, a correction of ADR 0020's caching choice, but it was written scoped to Image Library access specifically. It never generalized into a rule the next feature could check itself against — which is exactly how `site_rosters` got built in the first place: not out of carelessness, but because there was no written answer to "is a local mirror okay here" beyond precedent scattered across several ADRs.

This ADR writes that rule down once, audits every local table currently in the schema against it, and records the verdict — so the next feature that's tempted to cache PDS state has one place to check first instead of re-deriving the reasoning from ADR 0024's Image Library-specific framing.

This ADR does **not** revisit whether the PDS should be the source of truth at all. That question was raised and considered separately: replacing it with a traditional database (treating `site.standard.document`/`site.standard.publication` as generated output rather than the record) would relocate the sync-bug class rather than remove it — DB→PDS writes would need their own outbox/reconciliation story, and PDS writes made by any other AT Protocol client would become "foreign writes" the DB has to detect — while also undercutting the app's core value proposition that the author owns their content on their own PDS. The actual defect pattern behind the Contributors pain (four uncoordinated answers to "avoid a cross-repo read") has a cheaper fix: one consistent policy, not a different source of truth.

## Decision

**Rule 1 — Default is live read.** Any state whose source of truth is a PDS record (this repo's own, or another repo's) is read live from that record at use time. A local table or an embedded snapshot that duplicates PDS-sourced content is the exception, and must satisfy Rules 2–4 to exist at all.

**Rule 2 — Same-request write.** A permitted mirror is written in the same request/action as the PDS write that motivates it — never propagated later via a scheduled sync, a background job, or a different, unrelated session happening to trigger it. This is precisely what `site_rosters` violated: a Contributor's acceptance wrote `scribe.contributors`, but the mirror only updated whenever the Owner's own session next ran `reconcileContributorStatuses` — an unbounded, silent gap. `contributor_memberships` and `pending_submissions` both satisfy this rule today: each is written alongside the PDS write that motivates it, in the same action.

**Rule 3 — Access and authorization decisions are always a live read, never a mirror.** If a value decides "can this DID see or do X right now," it must be read at decision time — either a live PDS read, or a live read of a local table that the *acting party's own* session maintains (not a value pushed by someone else's session). This is the exact correction ADR 0024 made: Image Library access moved from the pushed `site_rosters` mirror to a live read of `contributor_memberships`, the same table `listContributorSites` was already reading correctly.

**Rule 4 — Document reconstructability.** Every permitted mirror's ADR or table comment states whether and how it could be rebuilt if lost, and says so explicitly when the answer is "not globally." ADR 0015 already recorded this asymmetry: `pending_submissions` for a given site is rebuildable from that site's own `scribe.contributors` roster (a small, bounded scan); `contributor_memberships` has no equivalent path — rebuilding "which sites is this DID a member of" would require scanning every site in existence, the exact missing global index this table exists to work around.

**Rule 5 — Scope exclusions.** This policy governs local duplication of *PDS-record content*. It does not govern:

- (a) App-operational data deliberately kept off the PDS entirely — `oauth_state`, `oauth_session`, `login_attempts`, `umami_config`. `umami_config` is the existing precedent (ADR 0010): analytics credentials have no reason to ever live on a portable content record.
- (b) System-of-record state for a non-PDS external service that cannot be reconstructed from any repo — `site_chat_convos.convo_id`, assigned by `chat.bsky.group.createGroup` (Bluesky's chat service). There is no AT Protocol lookup that recovers a group ID from membership; the local row is the only record of it, not a cache of one.
- (c) A service's own domain data that references but does not duplicate a PDS record — `image_folders`/`images`, which own the Image Library's folder tree and Variant metadata; `site_uri` scopes a folder to a site without copying any publication content.

A future reader should not treat any of the above as a policy violation waiting to be fixed.

**Rule 6 — Sanctioned exception: deferred public-correctness PDS promotion.** `reconcileContributorStatuses` promoting `scribe.contributors` from `"invited"` to `"accepted"` on the Owner's own next visit is a permitted exception to Rule 2's "same-request" spirit, on two grounds that must both continue to hold:

1. Since ADR 0024, nothing reads that promoted status for an access decision — access is gated entirely by the live-read `contributor_memberships` table instead. The promotion is purely about the *public, portable* record being correct for any external reader of the Owner's PDS directly (other tooling, a future feature, the Owner's own site-list display) — not a gate anything in this app relies on.
2. The write is capability-bound: only the Owner's own OAuth agent can write the Owner's `site.standard.publication` record. No live-read alternative exists that a different session could perform instead — deferring to the Owner's session isn't a shortcut, it's the only session that can ever do this write.

**Caveat this ADR records rather than lets ride on ADR 0024's framing:** ADR 0026 attached a second consumer to the same reconciliation pass — `syncSiteChatGroup`, which creates the site's Bluesky chat group at first promotion. Chat-group creation is considerably more user-visible than a background record fix (a Contributor may notice "no chat yet" in a way they'd never notice a lagging `scribe.contributors` status), so ADR 0024 point 5's "this is low-stakes, it's just public correctness" framing no longer fully covers everything riding on this code path. The exception remains justified for the same reason as the original promotion — `chat.bsky.group.createGroup` is also owner-only, so no session but the Owner's could ever perform it regardless of mechanism — but a future feature that wants to attach a third consumer to this same deferred pass should re-check both grounds above, not assume the precedent automatically extends.

## Audit

The schema has exactly two definition points: `migrate()` in `app/services/db.server.ts` and the top-level `db.exec` in `image-service/src/db.ts` — both are the sole idempotent `CREATE TABLE IF NOT EXISTS` migration seams per the HMR-safety convention, so this audit is closed and exhaustive, not a best-effort sample. One additional mirror exists outside either schema: `ArticleRef`, embedded inside `site.standard.publication` itself.

| Table / field | Verdict | Basis |
| --- | --- | --- |
| `contributor_memberships` | Compliant | Same-request write (Rule 2, ADR 0015); live-read for access decisions (Rule 3, ADR 0024); reconstructability documented as non-global (Rule 4, ADR 0015) |
| `pending_submissions` | Compliant | Same-request write (Rule 2); per-site reconstructable (Rule 4); local-authoritative by design for rejection state, not a stale copy of a PDS gate |
| `pending_submissions.document_title` | Compliant, display-only | Every consumer is a render or toast string (`site-list.tsx`, `core.tsx`, `list.tsx`) — verified zero occurrences in `submissionReview.server.ts`/`review.tsx`; nothing decision-relevant reads it, so staleness is cosmetic at worst |
| `ArticleRef` (embedded in `site.standard.publication`) | Compliant | `buildArticleRef` (`article.server.ts`) mirrors the full documented field set (`uri, title, slug, splashImageUrl, description, tags, contributors, bskyPostRef, publishedAt, createdAt, updatedAt`), matching `ArticleRef` in `app/hooks/types.ts` field-for-field; keep-alive refresh confirmed on edit of a published document and on submission approval |
| `site_chat_convos` | Out of scope (Rule 5b) | Not a PDS mirror — sole record of a Bluesky-chat-service-assigned ID with no reconstruction path |
| `reconcileContributorStatuses` promotion | Sanctioned exception (Rule 6) | See Rule 6 and its caveat above |
| `oauth_state`, `oauth_session`, `login_attempts`, `umami_config` | Out of scope (Rule 5a) | Not PDS content |
| `image_folders`, `images` | Out of scope (Rule 5c) | Own domain data; `site_uri` is a reference, not a copy |

No table in the current schema is non-compliant.

## Consequences

- The next feature that considers caching PDS state to avoid a cross-repo read has one policy to check against instead of re-deriving ADR 0024's reasoning from its Image Library-specific framing.
- `site_rosters`-shaped mistakes — a mirror whose freshness depends on an unrelated party's session happening to trigger a sync — are now a named anti-pattern (Rule 2), not something the next feature has to rediscover the hard way.
- Rule 6's exception is explicitly conditional, not a blanket precedent: a third feature wanting to piggyback on `reconcileContributorStatuses`'s deferred pass must re-check both grounds, not cite ADR 0026 as settled cover.
- This ADR found nothing to fix. If a future audit or a new feature's schema change finds a gap against Rules 1–4, the remediation path is already established and needs no new machinery: for an unmirrored `ArticleRef` field, add it to `ArticleRef` in `app/hooks/types.ts` → `buildArticleRef` in `article.server.ts` → `nodeFromRef`/`articleRefFromNode` in `siteTree.ts` → extend the round-trip test in `siteTree.test.ts` (the propagation path `CLAUDE.md` already prescribes); for a cached field that becomes decision-relevant, stop caching it and read the source live per Rule 3.
