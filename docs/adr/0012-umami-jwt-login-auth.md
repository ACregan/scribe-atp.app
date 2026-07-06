# ADR 0012: Umami Auth via Login-Minted JWT, Not a Static API Key

## Status
Accepted

## Context

ADR 0010/0011 were written assuming Umami exposed a static, scoped API key (`x-umami-api-key` header) — this was the original plan's auth mechanism. Empirical testing against a real self-hosted Umami v3.1.0 instance (see the referenced guide at docs.umami.is/docs/guides/embed-analytics-in-your-app) showed this is wrong for self-hosted Umami: there is no static API key. Authentication is:

1. `POST /api/auth/login` with `{ username, password }` → `{ token }` (a JWT)
2. Every subsequent request carries `Authorization: Bearer {token}`

The JWT's expiry isn't documented, but JWTs are self-describing — the `exp` claim in the token payload gives the actual expiry without needing to guess or hardcode a lifetime.

This changes what secret Scribe CMS must store: full Umami login credentials (username + password) rather than a scoped, individually-revocable API key. A leaked credential under this model grants full account access on the author's Umami instance, not just read access to one website's stats.

## Decision

- `umami_config` stores `username` + `password` instead of `api_key`, plus a cached `jwt` and `jwt_expires_at` (decoded from the token's `exp` claim) so the server doesn't re-authenticate on every single request.
- Before any stats/pageviews fetch, check the cached JWT's expiry (with a small safety margin); only call `/api/auth/login` again when it's missing or expired. This avoids hammering the login endpoint on every Insights-page load, which risks rate-limiting or lockout on the author's instance.
- If a request using a cached-valid token still gets a 401 (e.g. the author changed their Umami password, invalidating sessions early), retry once with a fresh login before surfacing a failure.
- The connect-modal's copy in the CMS recommends creating a **dedicated, restricted Umami user** (view-only, scoped to the tracked website) rather than reusing an admin login — self-hosted Umami supports user roles, and this bounds the damage if the stored credential ever leaks.
- The storage-location decision in ADR 0010 (local SQLite, never the public AT Protocol record) and the SSRF mitigation in ADR 0011 (re-validate the resolved IP before every outbound call) are unchanged and apply identically to the login request itself, not just the stats/pageviews requests.

## Consequences

- A stored credential is more sensitive than the API-key model originally assumed — the "secure enough" reasoning from the earlier design session (matching the plaintext-in-SQLite risk tier already accepted for `oauth_session`) still applies, but the blast radius of a leak is larger. This is mitigated, not eliminated, by recommending a restricted dedicated user in the UI.
- Token caching adds a small amount of state (`jwt`, `jwt_expires_at`) and a retry-on-401 path that wouldn't exist under a static-key model — slightly more code, in exchange for not re-authenticating on every page load.
- If Umami ever adds a static API key option for self-hosted instances (as Umami Cloud may already have, unverified), this ADR would need revisiting — but the login-JWT path is the correct baseline today since it works everywhere, including third-party instances Scribe CMS doesn't control.
