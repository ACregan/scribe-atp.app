# ADR 0025: Site Chat Implementation

## Status
Accepted — design finalized 2026-07-16 (Phase 5 grill session)

## Context

ADR 0016 settled the high-level shape of Contributors Phase 5 — reuse `chat.bsky.convo`, build an inline panel rather than link out to bsky.app, never chain conversations across roster changes — but explicitly left the concrete implementation undecided, closing with: "a real message list still has to be built... more surface area than 'an input and a submit button' suggests." This ADR is that implementation pass, grilled against the actual `@atproto/api` `chat.bsky.convo` surface rather than assumption.

Three facts from that surface materially simplify what ADR 0016 anticipated:

- **`getMessages` returns `relatedProfiles: ProfileViewBasic[]` inline** with every page of messages. Sender display name/avatar resolution needs no separate `fetchBskyProfiles`-style call, unlike every other DID-to-profile need in this codebase.
- **`sendMessage` returns the created `MessageView` directly.** Appending the sent message to the list on success is just using the response — no optimistic-then-reconcile dance needed.
- **`OAUTH_SCOPE` already includes `getConvoForMembers` and `sendMessage`** (added for the existing invite-DM feature). The only net-new scope this phase needs is `getMessages`.

One fact complicates it: **`getConvoForMembers` has real failure modes tied to the Bluesky social graph** — `BlockedActorError`, `MessagesDisabledError`, `NotFollowedBySenderError`, `AccountSuspendedError` — that the existing fire-and-forget DM code (`scribe-atp-social`'s `notify.ts`) never has to handle, since it just logs and moves on. An interactive panel can't do that; someone looking at a chat column needs to know why it's empty.

This ADR also renames the feature. "Team Chat" was ADR 0016's working title, inherited from an informal "Team = site roster" framing used during the original design discussion — but `UBIQUITOUS_LANGUAGE.md` never actually defines "Team" as a term; the established naming convention for anything scoped to one Site is `Site X` (see **Site Image Folder**, ADR 0017/0020). Renamed to **Site Chat** here, with no cost since nothing was built under the old name.

## Decision

1. **Layout: a persistent right-hand column, not a drawer/tab/modal.** `/article/list/:siteSlug`'s current single scrolling `PageSection` becomes `PageSection fill` → `PageSectionColumns` → `PageSectionColumn span={8} overflow` (existing content: title, Groups, Submissions, Contributors, unchanged) and `PageSectionColumn span={4} overflow` (Site Chat) — the same two-column pattern already canonical elsewhere in this app for fixed-layout routes. Chat is always visible while working the page, not something requiring a click to reveal.

2. **Conversation resolution: once per mount, re-resolving only when the roster itself changes.** `getConvoForMembers(currentRoster)` fires once when the panel mounts. It does not independently poll or watch for same-session roster drift — `inviteContributor`/`removeContributor` are both fetcher submissions that already revalidate this route's own loader, so the panel simply re-resolves (via a `useEffect` keyed on the roster's DID set from loader data) whenever that data changes, rather than owning a second membership-watching mechanism.

3. **Polling: 10 seconds, paused when the tab isn't visible.** `getMessages` has no "since"/"after" parameter — a poll is "refetch the newest page (`limit: 50`, no cursor) and diff against what's already rendered by message `id`," not an incremental fetch. Polls run every 10s while the panel is mounted and `document.visibilityState === "visible"`; polling pauses entirely when backgrounded and fires one immediate fetch on regaining visibility. This is the app's first polling feature, so 10s is a starting judgment call (feels live without hammering a service this app doesn't operate), not derived from a measured constraint.

4. **No pagination / "load more."** A single page (`limit: 50`) is fetched on resolve and that's the whole history shown — no infinite scroll, no older-messages loading. Justified specifically by ADR 0016's own Decision: since a conversation's identity resets on every roster change, history for any given conversation instance is structurally short-lived and recent-only. Building deep pagination for something that can never span further back than the current membership's lifetime is complexity this feature doesn't need; a site accumulating more than 50 unread-since-membership-change messages is a signal to revisit, not something to design around now.

5. **Conversation-resolution failure: a persistent inline message in the chat column, distinct per error type.** `BlockedActorError` / `MessagesDisabledError` / `NotFollowedBySenderError` / `AccountSuspendedError` each render their own plain-language explanation in place of the message list — not a toast (these are per-person, usually-permanent states, not transient blips a dismiss-and-forget toast fits), not a hidden column (an honest explanation beats a silently-missing feature), and not one generic message (the fix, if any, differs per case).

6. **Send failure: this app's existing toast convention, message preserved.** A failed `sendMessage` (network error, `ConvoLockedError`, `InvalidConvoError`) uses the same pattern already used throughout this codebase for failed mutations — `useToast()`, danger variant, `autoExpire: false` (matching "Delete failed" / "Remove failed" / "Save failed" elsewhere in this exact route). The typed message stays in the input rather than being cleared, so retrying is just hitting send again.

7. **No unread badges, no `updateRead` scope.** Phase 4's badge convention (numeric counts on `AsideMenu`, site cards, the submissions section) exists to surface things on pages the Owner might not visit for days. Site Chat doesn't have that gap — it's a persistent column on the one page where you'd read it anyway. Skipped for this pass; revisit only if real usage shows people aren't visiting that page often enough to notice new messages.

8. **Scope addition: `getMessages` only, no scope-insufficient detection/messaging.** Every existing user's stored OAuth token lacks `getMessages` (it's net-new) — normally this ADR would call for detecting that specific failure and showing "log out and back in to enable Site Chat" using the same inline-message treatment as Decision 5. Explicitly not built for this pass: the CMS currently has no real users beyond its own developer's two accounts, so a one-time manual re-auth costs nothing. **Revisit before any real onboarding** — this is a deliberate, scoped-to-current-reality gap, not an oversight.

## Consequences

- `/article/list/:siteSlug` gains a real structural change (single scrolling section → two-column layout), not just an additive panel — existing Groups/Submissions/Contributors rendering is unaffected but now lives in a narrower column.
- This is the app's first polling feature and its first sustained (non-one-shot) use of `chat.bsky.convo` — rate-limit behavior under real usage remains untested, same unknown ADR 0016 already flagged, not resolved by this ADR either.
- The scope-insufficient gap (Decision 8) means this feature is not yet safe to onboard real external users without first building that detection — tracked here explicitly so it isn't forgotten.
- `UBIQUITOUS_LANGUAGE.md` gains a **Site Chat** entry; "Team Chat" is retired as a name (ADR 0016's own title still says Team Chat — read that as historical, Site Chat is the current name everywhere else).
