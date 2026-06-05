# ADR 0002: Pin sharp to 0.31.x for VPS CPU Compatibility

## Status
Accepted

## Context
Sharp 0.33.0 changed its prebuilt binary distribution to require the x86_64-v2 microarchitecture (SSE4.2 and related instruction sets). The production VPS runs an older x64 CPU that does not meet this requirement.

Attempting to run sharp 0.34.x on this VPS produced:

```
Error: Could not load the "sharp" module using the linux-x64 runtime
Unsupported CPU: Prebuilt binaries for linux-x64 require v2 microarchitecture
```

Building from source was attempted but also failed — sharp bundles a pre-compiled libvips that carries the same microarchitecture requirement, so a source build does not help on affected hardware.

## Decision
Pin `sharp` to `^0.31.3` in `package.json`. Sharp 0.31.x prebuilt binaries support all x64 CPUs. The `@types/sharp` package is added as a dev dependency because 0.31.x does not bundle its own TypeScript declarations (bundled types were added in a later version).

## Alternatives Considered
**Build libvips from source on the VPS** — compile libvips itself for the actual CPU, then build sharp against it. This avoids the version pin but requires maintaining a C build toolchain on the server and re-running the build after each deploy. Rejected as operationally fragile for a non-critical constraint.

**Upgrade the VPS or migrate to a different provider** — would remove the constraint entirely. Deferred; no timeline.

**Replace sharp with a pure-JS alternative (e.g. jimp)** — jimp avoids native binaries entirely but is significantly slower and produces lower-quality output than sharp/libvips. Rejected given the performance requirements of the upload queue.

## Consequences
- Do not upgrade sharp past 0.31.x without first checking the production CPU: `grep -m1 flags /proc/cpuinfo | grep -o sse4_2`. A non-empty result means x86_64-v2 is supported and the pin can be relaxed.
- The sharp 0.31.x API covers all operations used by the Image Service (`metadata`, `resize`, `webp`, `toFile`) with no functional regression.
- `@types/sharp` must stay in sync with the installed sharp minor version.
