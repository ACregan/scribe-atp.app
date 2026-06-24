# ADR 0009: `publishedAt` and `createdAt` as Distinct Temporal Fields

## Status
Accepted

## Context

The `site.standard.document` lexicon includes a `publishedAt` field. The Scribe CMS also captures when a draft was first created. There were two approaches for how to handle these timestamps:

**Option A — `publishedAt` only.** Use `publishedAt` for both moments: set it at draft creation, and never change it. Simple; single timestamp field; requires no Scribe extension fields.

**Option B — `publishedAt` + `createdAt` as separate fields.** `publishedAt` records the moment the draft becomes a published document (moved to `site.standard.document`). `createdAt` is a Scribe extension field that records the moment the draft was first created in `app.scribe.article`. These two fields capture different events and may be weeks apart.

The `site.standard.document` lexicon does not define a `createdAt` field — it would be a Scribe extension.

## Decision

**Option B** — `publishedAt` and `createdAt` are distinct fields with distinct semantics.

- `publishedAt` — set at the instant a draft is moved to `site.standard.document`. Absent on draft records. Standard.site aggregators and Bluesky use this to sort and display content chronologically. It must not be set earlier than the actual publish moment, as this would misrepresent the article's editorial timeline to the ecosystem.

- `createdAt` — a Scribe extension field, set once at draft creation, carried through to the `site.standard.document` record and never changed. Allows the CMS to show "started writing this 3 weeks ago" metadata. Not consumed by standard.site aggregators.

## Consequences

- `publishedAt` is absent on all draft records in `app.scribe.article`. CMS code that renders article dates must handle this — show `createdAt` for drafts, `publishedAt` for published records.
- During the migration script, existing records have no separate "publish date" — the old `createdAt` is used as the `publishedAt` approximation for all migrated articles. A note is shown in the CMS UI for migrated articles flagging that `publishedAt` is an estimate.
- Standard.site-compatible aggregators receive accurate chronological ordering for new articles published after the migration. Pre-migration articles are ordered by their creation date, which is the best available approximation.
- Extension fields are permissible in AT Protocol lexicons; `createdAt` does not conflict with the `site.standard.document` schema.
