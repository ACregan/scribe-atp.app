# ADR 0029: Automatic `srcset` Generation on Image Insertion

## Status

Accepted, implemented 2026-07-21.

## Context

The Image Service already generates multiple size Variants (thumb/600/1200/1800/max) for every uploaded image, but the Lexical editor's Image Picker only ever inserts a single fixed `<img src>` — whichever Variant the author manually clicked. On photo-heavy sites (e.g. norobots.blog's travel posts) this means every reader downloads the same large file regardless of their actual viewport — a phone gets the same ~3000px `max` image as a desktop monitor.

`<picture>` with `<source media="...">` was considered and rejected: that construct is for **art direction** — swapping to a genuinely different image (different crop) or a different format per breakpoint. Every Scribe Variant is the same crop, same format (WebP), just a different resolution of the same source image. The correct primitive for that is `srcset` + `sizes` on a plain `<img>`, which lets the browser pick a resolution based on actual rendered size and device pixel ratio — something breakpoint-based `<picture>` can't do as precisely.

## Decision

**No toggle, no "responsive mode" — every image insertion transparently gets a `srcset` going forward, with zero change to the author's existing click-through flow.** The author still picks a single Variant exactly as before, and that choice remains the `<img>`'s `src` attribute unchanged. `ImagePickerModal`'s `handlePick` additionally builds a `sources: { url, width }[]` array from every Variant present in the picked image's `sizes` map (including the picked one, and `thumb`) and passes it through `INSERT_IMAGE_COMMAND`'s payload. `ImageNode` gains a new `__sources` field to carry this; `exportDOM` emits `srcset`/`sizes` alongside the existing `src` whenever more than one source exists.

**Including the already-picked variant and `thumb` in `sources`, rather than filtering them out:** per the WHATWG spec, once `srcset` carries width (`w`) descriptors, `srcset`-aware browsers ignore `src` as a candidate entirely — it becomes pure legacy fallback. There's no correctness reason to exclude anything, and keeping `sources` a straight 1:1 mirror of the image's `sizes` map avoids a class of subtle filtering bugs for no benefit.

**`sources` is self-describing — no hidden `data-*` attribute.** `srcset`'s own `"url Nw"` pairs already encode everything needed to reconstruct `__sources` on re-import (`importDOM`'s `convertImageElement` parses the `srcset` attribute directly). This also means an externally-authored `<img srcset>` (e.g. pasted from elsewhere) round-trips correctly, not just Scribe's own output. Backward compatibility is automatic: an old saved article's plain `<img>` has no `srcset` attribute, so `__sources` resolves to `null` and behavior is byte-for-byte identical to before this change.

**`sizes` uses a generic default** (`(max-width: 768px) 100vw, 700px`) rather than a per-site value — the three consumer sites (norobots.blog, anthonycregan.co.uk-2025, perpetual-summer-ltd) don't share one fixed content-column width; their CSS is mostly fluid/viewport-relative. When the author has manually drag-resized the image (`ImageResizeDecorator`'s existing `__width` field), `sizes` uses that exact pixel value instead — a more reliable per-image signal than any site-wide guess, and free to compute since `__width` already exists for the unrelated manual-resize feature.

**A single-candidate `srcset` is omitted entirely** (`__sources.length > 1` guard in `exportDOM`) — it gives the browser nothing to choose between, and naturally covers thumb-only images (small originals that never generated any larger Variant, "no upscaling") with no special-casing needed.

## Consequences

- No new UI surface at all — this was explicitly considered and rejected in favor of the always-on approach, since the fallback-`src` question it was meant to solve (which Variant to hardcode as `src` for `srcset`-blind consumers) is made moot by keeping `src` as whatever the author already picks today.
- No sanitizer changes needed — confirmed against the actual installed DOMPurify config (`article.server.ts`, `view.tsx`, `review.tsx`) that `srcset`/`sizes` are already in its default allowlist. Also confirmed no consumer site re-sanitizes independently (`@scribe-atp/react`'s `ScribeContent` does a plain `dangerouslySetInnerHTML`), so this is a single-repo (`scribe-atp.app`) change.
- Confirmed no other code in this repo parses saved article HTML for `<img>` tags (no RSS/feed generation, no cross-post preview-image extraction exists here) — nothing else could be affected by `srcset` appearing.
- The live editor canvas (`ImageNode.decorate()` / `ImageResizeDecorator`) is unaffected — `srcset` is purely a published/exported-HTML concern, not something the WYSIWYG view needs to render.
