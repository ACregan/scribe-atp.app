# ADR 0013: Document `site` Field Is the Sole Loose-vs-Published Signal

## Status
Accepted — implemented and merged (MR !103, 2026-07-08)

## Context

`standard-reader.app` — an independent, third-party `site.standard` aggregator — was found listing Scribe articles that are not published, including articles the CMS considers Draft or Unpublished. Root cause, confirmed against the live PDS record for `did:plc:e2lcgwxhymx3q6u7blziecdr/site.standard.document/3mp47vxbfg226`:

- `app/routes/article/create/create.tsx` writes the document's top-level `site` field as a real `at://.../site.standard.publication/<rkey>` URI the moment *any* site is selected at creation time — even though the article only lands in that site's `scribe.ungroupedArticles` (the CMS's internal "Unpublished" state, not "Published").
- `site.standard`'s own spec (https://standard.site/docs/lexicons/document/) defines a "loose document" as one whose `site` field holds a plain `https://...` URL. An `at://` URI means "assigned to this publication." Third-party readers have no visibility into Scribe's internal `scribe.groups`/`scribe.ungroupedArticles` split — that state lives entirely inside the *publication* record, not the document. From outside, `site` being an AT URI is the only signal there is, and Scribe has been setting it long before an article is actually published.
- This is a regression, not a new problem. ADR 0008 and ADR 0009 already established that `site` and `publishedAt` should be **absent** on drafts — but that was written for the two-collection model, where drafts lived in `app.scribe.article` and were only promoted to `site.standard.document` at genuine publish time (see 7b2f99e, "Migrate CMS fully to site.standard.document; remove app.scribe.article", 2026-06-26). That migration collapsed drafts and published articles into one collection but no ADR captured how "not yet published" should now be expressed without a separate collection to omit fields from — the invariant was silently lost.
- Two further, independently-broken code paths compound the problem. Neither can be trusted to leave a document correctly "unpublished":
  - `moveArticleToDraft` (the dedicated "Move to Drafts" button) deletes `publishedAt` and `scribe.canonicalUrl` on unpublish, but never touches `site` or `scribe.domain`.
  - `saveSiteOrder` (drag-and-drop + "Save Order") has entirely separate logic (`computeDocumentPathUpdates`'s `ungroupedMoves` branch) that *recomputes* `scribe.canonicalUrl`/`path` when an article is dragged out of a group — but the recomputed URL still carries the site's domain, `publishedAt` is never deleted (only ever added), and `site`/`scribe.domain` are never referenced in this function at all.
- Separately: `ArticleForm`'s "Assign to sites" is a genuine multi-select (`multiple` prop; `addArticleToSites`/`computeSiteAssignmentChanges` push/diff the same document into several sites' manifests at once). This directly conflicts with `site` being a single value — the spec's model is one document, one publication.

## Decision

1. **`site` has exactly three possible shapes, and they form the whole state machine:**
   - **Loose** (not yet published): `site` = `https://reader.scribe-atp.app/<did>/site.standard.document/<rkey>` — a real, resolvable URL to the document's own standalone Reader view (Reader renders any document by rkey regardless of state; this is not a placeholder). Never a bare empty string, which is what a zero-site draft gets today.
   - **Published**: `site` = `at://<did>/site.standard.publication/<rkey>` of the one site it's published to. Set **only** at the instant the article is placed into a named group.
   - There is no third, "assigned but not grouped" shape. Assignment and publication happen together, atomically.
2. **One document, one site.** "Assign to sites" becomes a single-select. `computeSiteAssignmentChanges`'s N-site diff collapses to a single move-from-A-to-B.
3. **Creation always produces a loose document.** Site selection is removed from `create.tsx` entirely — no `selectedSiteRkeys`, no `addArticleToSites`, no creation-time `scribe.domain` resolution. The only path to assignment is the Publish action, used after the fact.
4. **Publishing is one consolidated action:** a Publish button opens a modal — pick a site, then pick a group (with a "create new group" option) — and both are applied together via (a refactor of) `publishArticleToGroup`.
5. **Unpublishing is one consolidated action:** removes the `ArticleRef` from the site's manifest entirely (merging today's `moveArticleToDraft` + `removeArticleFromSite`) and resets `site`, `scribe.domain`, `publishedAt`, and `scribe.canonicalUrl` together, back to the loose state, in a single write.
6. **Drag-and-drop survives only where it can't cross the loose/published boundary:** reordering within a group, and moving between two groups of the *same* site (the article is published throughout both operations — this is the part of `computeDocumentPathUpdates`/`saveSiteOrder` that already works correctly today). The `ungroupedMoves` branch, and the ungrouped-origin half of `groupMoves` (`needsPublishedAt: !oldGroupByUri.has(...)`), are deleted outright — once the per-site view has no "Unpublished Draft Articles" section to drag into or out of, that transition has no UI path left to trigger it.
7. **`scribe.ungroupedArticles` becomes vestigial** on publication records (should always be empty going forward). The global `/article/list` page's existing "Unassigned Drafts" section needs no change — it's already defined correctly as "documents referenced by no site manifest at all."

## Consequences

- Fixes the actual leak: a `site.standard`-compliant aggregator will only ever see an article once it's genuinely published, because `site` only ever becomes an AT URI at that exact moment.
- Removes an entire class of bug by construction: there is one canonical publish transition and one canonical unpublish transition, not two independently-maintained implementations that can (and did) drift apart.
- Restates, and satisfies more strictly than, the intent behind ADR 0008/0009 (`site`/`publishedAt` "absent on drafts") — extended to a single-collection world, and corrected to use a real resolvable URL rather than an absent field, since the spec requires "loose" to be an explicit `https://` value, not an omission.
- Requires a one-time data migration (existing published/unpublished articles across every site already carry live AT URIs) — see the phased migration plan. Not addressed by this ADR alone.
- Two existing code paths need updating as a direct consequence, independent of the migration itself:
  - `site/configure.tsx`'s domain-change handler filters documents by `record.value.site === oldSiteHttpsUrl` (a plain `https://olddomain` string). Once loose documents legitimately hold a `https://` value, this filter will start matching loose (reader-URL) documents too unless it's updated to distinguish "loose" from "assigned to my old domain."
  - `repairDocumentPaths.server.ts` does `String(doc.site).split("/").pop()` assuming AT-URI shape; needs an explicit `startsWith("at://")` guard so a loose document's reader URL doesn't get misparsed as a site rkey.
- Breaking for the small number of currently multi-assigned articles (fewer than 20 total, confirmed by inspection). No automated heuristic decides which single site "wins" — each is manually reassigned to one site by a human, deliberately, per the phased plan.
