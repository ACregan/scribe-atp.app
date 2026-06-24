# ADR 0008: Draft Articles Use `site.standard.document` Field Shape in `app.scribe.article`

## Status
Accepted

## Context

When migrating article records from `app.scribe.article` to `site.standard.document`, two schema strategies were considered for the draft lifecycle:

**Option 1 — Dual schema.** Drafts in `app.scribe.article` keep the current Scribe field names (`url`, `synopsis`, `content` as a raw HTML string). On publish, a mapping step renames fields to `site.standard.document` conventions (`path`, `description`, `content` as `app.scribe.content.html` union, etc.).

**Option 2 — Single schema.** Drafts in `app.scribe.article` use the `site.standard.document` field shape from the moment of creation — including `path`, `description`, and `content` as `app.scribe.content.html`. The `site` and `publishedAt` fields are simply absent on drafts; everything else is identical to the published record.

The distinction matters because the `site.standard.document` lexicon introduces several fields we want to expose in the article creation flow (tags, rich content type union, `path`-based slug), not only at publish time.

## Decision

**Option 2** — drafts in `app.scribe.article` use the `site.standard.document` field shape throughout.

The key fields that differ from the old schema:

| Old field (`app.scribe.article`) | New field (both collections) | Notes |
|---|---|---|
| `url` | `path` | `/{group-slug}/{article-slug}` or `/{article-slug}` |
| `synopsis` | `description` | Renamed to match standard.site |
| `content` (raw HTML string) | `content` (`app.scribe.content.html` union) | Wrapped; `textContent` added alongside |

The article slug (rkey) is unchanged — it is still derived from the article's path segment and used as the `rkey` in both collections.

## Consequences

- The `app.scribe.article` → `site.standard.document` publish step only needs to add two fields (`site`, `publishedAt`), delete the draft, and create the document. No field renaming in flight.
- Drafts and published articles share the same field vocabulary. The CMS edit route needs no field-name translation between states.
- CMS code that reads `app.scribe.article` records can use the same field accessors as code that reads `site.standard.document` records.
- The old `url` and `synopsis` field names are gone completely. Consumer site code referencing these fields breaks at the TypeScript boundary — this is an intended breaking change in the major version bump.
- Tags (future feature) can be added to the draft creation form without touching the publish path.
