# ADR 0010: Umami Analytics Config Stored in Local SQLite, Not the AT Protocol Record

## Status
Accepted

## Context

The Insights page is gaining an opt-in per-site Umami analytics integration: each author can point a site at their own Umami instance (base URL, website ID, and an API key) to show a pageviews chart alongside the existing social metrics.

Every other piece of site configuration (`title`, `domain`, `splashImageUrl`, `logoImageUrl`, etc.) lives in the `scribe` extension object on the `site.standard.publication` record, per the project's golden rule that non-spec fields go there. The obvious default would be to add `umamiBaseUrl` / `umamiWebsiteId` / `umamiApiKey` fields to that same object.

Two problems rule this out:

1. **AT Protocol repositories are publicly readable without authentication.** Anyone can call `listRecords`/`getRecord` on a user's PDS and read the full `site.standard.publication` record. Storing a Umami API key there would leak it to any anonymous reader.
2. Even setting the secret aside, Umami configuration has no consumer outside the CMS itself — unlike `domain` or `splashImageUrl`, nothing in Reader, the public hooks, or any consumer site ever needs to read it. It isn't site metadata; it's CMS-internal operational configuration.

## Decision

All Umami configuration — including the non-secret `baseUrl` and `websiteId` fields — is stored in a new local SQLite table (same database as `oauth_session`), keyed by `(user_did, site_rkey)`, never written to the AT Protocol record. The API key is never round-tripped back to the browser after saving; the configure form shows only a boolean "configured" state and a masked input that leaves the stored key untouched when submitted blank.

## Consequences

- Site deletion must explicitly cascade-delete the corresponding `umami_config` row — there's no AT Protocol record to fall back on for cleanup.
- The Insights loader must query the local DB (not the PDS record) to know whether a site has Umami enabled.
- A future export/migration tool that moves an author's PDS content to another CMS would not carry Umami config with it — this is intentional; the config is bound to this specific Scribe CMS installation and would need to be re-entered against whatever tool replaces it.
- Consistent with `oauth_session`, the API key is stored in plaintext in SQLite — the app's existing trust boundary already assumes server/filesystem compromise is out of scope for credential protection at rest.
