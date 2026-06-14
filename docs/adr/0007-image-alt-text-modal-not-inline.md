# ADR 0007: Image Alt Text Editing via Modal, Not Inline Input

## Status
Accepted

## Context

The Lexical rich text editor renders images via `ImageNode`, a `DecoratorNode` whose `decorate()` method returns `<ImageResizeDecorator>`. Lexical portals decorator components into the contenteditable's DOM tree — the decorator renders **inside** the contenteditable, not alongside it.

An inline `<input>` or `<textarea>` for alt text editing was attempted inside `ImageResizeDecorator`. It produced five interlocking failure modes:

1. **Event bubbling** — Every keydown and input event from the field bubbled up to Lexical's native listeners on the contenteditable ancestor. React's `stopPropagation` fired too late (after Lexical had already processed the event). Native `addEventListener` on the outer wrapper was required but difficult to manage reliably.
2. **Lexical clears selection on blur** — Clicking the inline input moved focus off the contenteditable, triggering Lexical's blur handler (`$setSelection(null)`). `isSelected` from `useLexicalNodeSelection` became false, hiding the controls that contained the input the user had just clicked.
3. **Decorator remounts** — Lexical reconciliation (triggered by `onPointerDown → updateEditorSync → flushSync → $commitPendingUpdates`) unmounted and remounted the decorator during the same interaction cycle that set `showControls = true`. React `useState` reset on remount, closing the UI before the user could interact with it.
4. **Async update race** — `editor.update()` without `{ discrete: true }` is a microtask. Clicking Save immediately after editing triggered the form read before the alt text update was committed to the node.
5. **Dirty-state gap** — Typing into local React state did not change Lexical state, so `HiddenFieldPlugin` never fired `onChange` and the Save button stayed disabled.

All five issues were individually solvable, but they all had to hold simultaneously. The combination proved too fragile to ship reliably.

## Decision

Alt text is edited via a `<Modal>` (`<dialog showModal()>`) opened by an `"Alt text"` button on the image. The modal renders inside `ImageResizeDecorator` but the `<dialog>` element is promoted to the browser's top layer by `showModal()`, which:

- Provides a browser-enforced focus trap — keyboard events inside the modal do not reach the contenteditable's Lexical listeners (eliminates issue 1)
- Keeps modal visibility state independent of Lexical selection — `isModalOpen` is not driven by `isSelected` (eliminates issue 2)
- Uses a module-level `Set<NodeKey>` for `isModalOpen` state rather than `useState`, so decorator remounts do not close the modal (eliminates issue 3)
- Uses `editor.update(fn, { discrete: true })` on Save to commit synchronously (eliminates issue 4)
- Calls `editor.update` from the Save handler, which changes the node's HTML output, which `HiddenFieldPlugin` catches via `registerUpdateListener` (eliminates issue 5)

## Consequences

- Alt text editing requires an explicit open/save interaction rather than clicking directly on the image. This is a minor UX cost.
- The `"Alt text"` button appears on hover or when the image node is selected (bottom-left corner, same pill style as the Reset Size button). Authors who have never encountered the feature will discover it naturally on hover.
- Images are inserted with empty `alt=""` by default (changed from `image.original_name`). A filename is worse than empty from a screen reader perspective; empty is a valid decorative-image declaration and prompts the author to add meaningful alt text.
- If a future Lexical version provides a stable mechanism for rendering decorator UI outside the contenteditable (e.g. a dedicated decorator portal target), the inline approach could be revisited. The five failure modes documented above should be re-evaluated against the new API before doing so.
