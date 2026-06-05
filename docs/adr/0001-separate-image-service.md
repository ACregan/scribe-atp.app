# ADR 0001: Image Service as a Separate Express Process

## Status
Accepted

## Context
The Image Library feature requires:
- Per-file upload progress (XHR progress events)
- Per-Variant SSE progress streams during server-side `sharp` processing
- Sequential processing queue to avoid CPU spikes on a shared VPS
- Configurable multipart upload limits (50MB per file)

The main app runs on `react-router-serve`, which does not expose the low-level HTTP primitives needed to handle SSE cleanly or configure multipart limits without ejecting to a custom server entry.

## Decision
The Image Library backend runs as a separate Express process on port 3009, not inside the main React Router app.

nginx routes `/api/image-service/*` to port 3009 and `/image-storage/*` directly to the filesystem. The main app on port 3008 is unaware of the Image Service.

Authentication is handled by sharing `SESSION_SECRET` — the Image Service replicates the `__session` cookie-verification logic to identify the requesting user's DID.

## Alternatives Considered
**Custom Express server entry in the main app** — eject from `react-router-serve` to a hand-rolled Express server, add upload and SSE middleware alongside React Router. Keeps everything in one deployable unit. Rejected because it couples unrelated concerns (image processing) into the main app's server and makes the main app harder to reason about. The one-time migration cost from `react-router-serve` also adds risk with no lasting benefit.

## Consequences
- Two processes to run and monitor on the VPS (`react-router-serve` on 3008, Image Service on 3009).
- A shared secret (`SESSION_SECRET`) must be present in both processes' environments.
- SSE, streaming uploads, file size limits, and the processing queue are all straightforward to implement in plain Express with no framework constraints.
- Image reads bypass Node.js entirely — nginx serves `/image-storage/` as static files.
