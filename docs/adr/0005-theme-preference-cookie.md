# ADR 0005: Theme Preference Stored in a Separate Unsigned Cookie

## Status
Accepted

## Context
Dark mode requires persisting the user's light/dark preference across sessions and making it available server-side so the correct `data-theme` attribute can be set on `<html>` during SSR — avoiding a flash of the wrong theme on page load.

## Decision
Theme preference is stored in a dedicated `theme` cookie, separate from the existing `__session` auth cookie. The cookie is unsigned, holds either `"light"` or `"dark"`, and is set with `max-age` of one year so it survives across sessions.

The root loader reads the `theme` cookie directly from the `Cookie` header and passes the value to `root.tsx`, which applies it as `<html data-theme="...">`. On the client, the theme context writes the cookie directly via `document.cookie` — no server round-trip is needed for a UI preference that requires no validation.

For a brand new visitor (no cookie yet), the server renders `data-theme="light"` as a safe fallback. A small inline `<script>` in `<head>` corrects this before the first paint if `prefers-color-scheme: dark` is detected, eliminating any flash on the very first ever load. A `useEffect` then writes the resolved preference to the cookie so all subsequent loads are handled correctly server-side.

## Alternatives Considered
**Add `theme` to `__session`** — one fewer cookie, but `__session` is HMAC-signed and auth-scoped. Writing a theme change would require re-signing and rewriting the entire session. The session is also not set with a long `max-age` (it expires with the browser session), which would lose the preference. Mixing UI state with auth state creates coupling with no benefit.

**`localStorage` only (no cookie)** — no server-side visibility, so the root loader cannot set `data-theme` during SSR. The theme must be applied client-side after hydration on every page load, which causes a flash on every visit, not just the first.
