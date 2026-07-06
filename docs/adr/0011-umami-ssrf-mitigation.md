# ADR 0011: SSRF Mitigation on User-Supplied Umami Base URLs

## Status
Accepted

## Context

The Umami integration lets any authenticated author configure an arbitrary Base URL that the CMS server will fetch on their behalf (both when testing the connection and on every subsequent Insights-page load). Scribe CMS registration is open to any Bluesky account — there is no invite gate or admin approval step.

This combination — server-side fetch of a user-supplied URL, open registration — is a textbook SSRF (Server-Side Request Forgery) vector. A malicious or compromised account could set the Base URL to an internal service address or a cloud metadata endpoint and use the CMS server's network position to probe or reach things the author has no business reaching, particularly since the CMS shares a VPS with other internal services.

Two mitigation depths were considered:

- **Resolve-and-check**: resolve the hostname via DNS, reject if the resolved IP falls in a private/loopback/link-local range, then proceed with a normal fetch. Simple to implement as a shared pre-check.
- **Resolve-check-and-pin**: additionally pin the outbound connection to the specific IP validated in the check, rather than letting the HTTP client re-resolve DNS independently. This closes a DNS-rebinding gap where an attacker points DNS at a public IP to pass validation, then repoints it at an internal IP before the real request fires — but requires a custom fetch dispatcher to connect to a fixed IP while still sending the correct `Host` header.

## Decision

Resolve-and-check only, for now. A shared helper validates the resolved IP against private/loopback/link-local ranges before every outbound Umami request — both the "test connection" flow when an author connects/edits their integration, and the Insights-page loader's per-site fetch on every page load. DNS-rebinding protection (pinning the validated IP for the actual request) is deferred.

## Consequences

- The check must run on *every* fetch, not just at configuration time — a Base URL that resolved safely when saved could later be repointed at an internal address, so the Insights loader re-validates on each load rather than trusting the value saved at connect-time.
- This does not close the DNS-rebinding race (validate against public IP, connection lands on an internal IP moments later). That gap requires an attacker to actively race a narrow timing window rather than just fill in a form once — accepted as residual risk for now.
- If the CMS is ever exposed more broadly or the threat model changes, revisit with IP-pinning (resolve-check-and-pin) as the next hardening step.
