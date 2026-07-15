# ADR 0015: Cross-Account Discovery via Local CMS Indexes, Not `scribe-atp-social`

## Status
Accepted — design finalized 2026-07-15, not yet implemented

## Context

The Contributors feature (ADR 0014, ADR 0018) needs two accounts to become aware of state that only exists in the other party's world:

1. A site Owner needs to learn that a Contributor has submitted an article to their site — the submission marker lives entirely on the Contributor's own PDS document (`scribe.pendingPublish`), which the Owner's session has no reason to ever look at unprompted.
2. A Contributor needs to learn which sites they've even been granted permission to submit to — that list (`scribe.contributors`) lives on the Owner's site record, which the Contributor's session has no reason to look at unprompted either, and there is no reverse index: nothing lets a DID ask "which sites list me?"

Both are instances of a problem this codebase has already solved once: AT Protocol has no global indexer, so there is no way to discover a cross-repo relationship by querying the network itself — something has to maintain a purpose-built index. `scribe-atp-social` already does exactly this for likes, shares, and subscribes: one account's PDS writes an intent record referencing another account, and the social service maintains its own local index (`actionEvents`) so the other party can query "who has liked this" without scanning every possible liker's repo.

The obvious move is to reuse that service. It was rejected for both cases here.

`scribe-atp-social`'s indexing exists specifically to support **anonymous readers on any consumer site**, who may have no `scribe-atp.app` account at all — that's why it needs its own popup-OAuth flow and its own durable AT Protocol record as the source of truth, with the local index as a pure performance optimization on top. Neither submission discovery nor membership discovery has that requirement: both only ever happen through an already-authenticated `scribe-atp.app` session (a Contributor must be logged into the CMS to submit an article at all; an Owner must be logged in to review one). There is no anonymous-reader case here to justify a second OAuth flow or a durable AT Protocol record as the intent's source of truth.

## Decision

Both discovery problems are solved with new, small, CMS-local SQLite tables — same file and pattern as `oauth_session`/`login_attempts` (see ADR 0010 for the precedent of keeping CMS-internal operational data off the AT Protocol record entirely), not routed through `scribe-atp-social`:

```sql
pending_submissions (
  document_uri TEXT UNIQUE,
  contributor_did TEXT,
  site_uri TEXT,
  owner_did TEXT,        -- parsed once from site_uri at write time, fast indexed lookup
  submitted_at TEXT,
  status TEXT,           -- 'pending' | 'rejected' — approved rows are deleted once reconciled
  rejection_reason TEXT
)

contributor_memberships (
  contributor_did TEXT,
  site_uri TEXT,
  added_at TEXT
)
```

Each table is written in the same request as the AT Protocol write that motivates it — `pending_submissions` alongside the Contributor's own `scribe.pendingPublish` write at submission time; `contributor_memberships` alongside the Owner's own `scribe.contributors` write when adding someone to a site's roster (the same action that also syncs the roster to the Image Service, ADR 0017 — one more row in a write that's already happening, not new machinery).

**Rejected submission rows must persist rather than being deleted immediately.** This is the mechanism that lets the Contributor's own reconciliation check (ADR 0014) distinguish "still pending" from "was rejected" — rejection leaves no public artifact on the Owner's site the way approval does (an appearing `ArticleRef`), so the local row, plus its `rejection_reason`, is the only signal available. The row is deleted only once the Contributor's own session has acknowledged the rejection and cleared its own `scribe.pendingPublish` marker.

Owner-facing notification built on top of `pending_submissions`: a non-expiring toast per submission (not aggregated — confirmed with the user), dismissed independently of the underlying state (dismissing the toast has no effect on whether the submission is still pending), plus a persistent "requires attention" badge cascading through the `AsideMenu`'s Sites icon, the `/sites` page, and a "New Article Submission" section on the per-site management page — all live, uncached reads against the table, disappearing only once the row is actually resolved (approved or rejected), not once merely seen.

## Consequences

- Two new small tables and two new write paths (piggybacked on writes that already have to happen for other reasons), rather than a new service or an extension to `scribe-atp-social`'s schema.
- `scribe-atp-social` remains scoped to what it was built for — anonymous, cross-site engagement events — and does not grow a second, structurally different kind of intent record (authenticated-only, always resolved through a live CMS session) that would need its own auth story bolted onto a service designed around popup OAuth for logged-out readers.
- Both tables are pure local cache/index, not sources of truth — the real state lives on the AT Protocol records (`scribe.pendingPublish`, `scribe.contributors`) and, for approved submissions, in the Owner's manifest. Reconstructability if a table were lost differs between the two, though, and is not symmetric: `pending_submissions` for a *given* site could be rebuilt by reading that site's own `scribe.contributors` roster (a small, known set of DIDs) and checking each one's documents for a matching `scribe.pendingPublish` — bounded and feasible, because the site's roster is the starting point. `contributor_memberships` has no equivalent recovery path: rebuilding "which sites is this DID a member of" would require scanning every site in existence, which is exactly the missing global index this ADR exists to work around. If that table is ever lost, membership visibility for anyone not re-added by their Owner is gone until it happens again.
