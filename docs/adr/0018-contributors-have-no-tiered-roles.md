# ADR 0018: Contributors Have No Tiered Roles — Owner and Contributor Are the Only Two

## Status
Accepted — design finalized 2026-07-15, not yet implemented

## Context

An earlier, since-superseded pass at this design (2026-07-11) proposed two tiers of site access beyond Owner: **Contributor**, who could submit new articles or propose changes only to articles they themselves originated, and **Editor**, who could propose changes to any article on the site regardless of who wrote it. Enforcement for the distinction relied on checking whether a proposer's DID already appeared in the *target document's own* byline `contributors` array as provenance — Contributor-role required that check to pass, Editor-role skipped it.

That design assumed a "revision" pathway would exist: someone proposing a change to an *already-published* article they didn't write, requiring a computed diff for the Owner to review. Once the publish mechanism was reworked around sync-later (ADR 0014), no such pathway exists in the design at all. A Contributor's only two actions are writing an article to their own PDS and submitting it to an Owner for inclusion — every article that reaches a site arrives as a brand-new document the submitter, by definition, authored themselves. There is no scenario in which someone proposes a change to a document they don't hold, because the entire mechanism (a `scribe.pendingPublish` marker on the submitter's own document) only ever operates on documents in the submitter's own repo.

## Decision

Drop the Editor tier entirely. There are exactly two roles:

- **Owner** — controls the site: configuration, creating and deleting groups, and deciding which articles are placed in which groups. Unchanged from today.
- **Contributor** — may write articles to their own PDS and submit them to an Owner for inclusion in a site they've been added to. No other capability, and no tiers within it.

A Contributor retains ordinary, unrestricted edit rights over their *own* article, before or after it's approved — that's inherent to sync-later (ADR 0014) and not a permission grant of its own. What they cannot do, under any role, is touch an article someone else submitted.

Because every Contributor now has identical permissions, the site roster does not need a `role` field for permission-scoping purposes at all — `scribe.contributors` can be a flat list of `{did, addedAt}`, rather than carrying a role value. This also avoids a naming collision that would otherwise exist between this field and the already-shipped, purely cosmetic document-level byline `contributors[].role` (Writer/Editor/Photographer/etc., MR !117) — the two would mean entirely different things while sharing a field name if the roster ever needed permission-scoped roles of its own.

## Consequences

- **The "revision submission" feature does not exist, and is not merely deferred.** It existed solely to serve the now-removed Editor tier. There is no diff-review UI, no computed-diff mechanism, and no second mode for the review screen.
- **Once an article is published, the only person who can ever revise it going forward is whoever originally submitted it.** Not the Owner — they have no write access to a Contributor's document, the same repo-ownership asymmetry that runs through this whole design — and not any other Contributor. If the original author becomes permanently unreachable, that article is effectively frozen. The accepted workaround, requiring no new engineering, is manual: the Owner reads the original document, writes a fresh replacement via the ordinary create-and-publish flow, and credits the original author using the existing `contributors` byline feature, exactly as if it had arrived through the normal Contributor flow.
- **A malicious post-publish edit is handled the same way ADR 0014 already accepts** — via Unpublish, a manual, after-the-fact remedy, not a preventative one. No role-based restriction would have prevented this regardless, since the risk comes from a Contributor editing their *own* already-published article, not from touching someone else's.
- This is treated as an intentional scope decision for v1, in the same spirit as the original 2026-07-11 design being called off entirely at the time: reintroducing a broader-permission tier later, if real usage shows it's actually needed, means retrofitting permission checks across an already-live system rather than extending an empty slot — a real but accepted cost of starting simple.
