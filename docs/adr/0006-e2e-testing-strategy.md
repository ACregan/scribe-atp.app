# E2E testing strategy: Playwright, dev bypass auth, production build

We use Playwright for E2E tests rather than Cypress. Playwright's network interception API (`page.route()`) is more ergonomic for stubbing the volume of AT Protocol XRPC calls the app makes, and its per-test browser context model maps cleanly onto the session-cookie auth model.

Tests run against the production build (`npm run build && npm run start`) on port 3008, not the Vite dev server. This validates the actual shipped artifact and eliminates a class of "passes locally, fails in prod" divergences.

The test suite runs entirely in dev bypass mode (`DEV_USE_REAL_OAUTH` unset). Real Bluesky OAuth requires a publicly reachable URL, a live PDS, and a test account — making tests slow, fragile, and environment-dependent. Dev bypass provides a stable, deterministic auth seam: login is a form submit that sets a session cookie directly, with no OAuth round-trip. This means the suite tests UI behaviour and navigation flows, not data persistence; actions return mock responses and write nothing to the PDS.

## Considered options

- **Cypress** — rejected because its iframe architecture occasionally causes friction with SSR redirects, and its network stubbing is less ergonomic for XRPC calls.
- **Real OAuth in tests** — rejected for the initial suite. A separate smoke-test suite against a staging environment with real OAuth is the right place for persistence testing, not the primary E2E suite.
- **Dev server as test target** — rejected because the Vite dev server is not the production artifact; subtle SSR and module-resolution differences can mask real bugs.
