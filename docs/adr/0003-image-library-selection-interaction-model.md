# ADR 0003: Image Library Selection — Mode-Sensitive Interaction Model

## Status
Accepted

## Context
The Image Library grid shows folders and images together. Adding multi-select required deciding whether single-click selects items (desktop file manager style) or navigates into folders (current web behaviour).

Two models were considered:

**Model A — Always-select:** Single click always selects any item. Double-click navigates into a folder or opens an image preview. Pure WIMP desktop behaviour.

**Model B — Mode-sensitive:** Single click on a folder navigates (current behaviour, unchanged). CTRL+click on any item activates selection mode and toggles that item. Once in selection mode, plain single clicks also select. Double-click on an image opens the preview modal regardless of mode.

## Decision
Use **Model B**.

## Alternatives Considered
**Model A** was rejected because the Image Library is a web UI where the dominant use case is browsing, uploading, and copying URLs — not bulk operations. Forcing all users to double-click every folder they want to enter is friction for the majority case to serve the minority. Model B preserves the familiar navigation feel and layers power-user multi-select on top.

## Consequences
- Folder navigation on single-click is unchanged — no retraining cost for existing users.
- Selection mode is entered explicitly via CTRL+click; it is exited by clicking the ✕ in the action toolbar, clicking empty grid space, or pressing Escape.
- Dragging a selected item moves all selected items. Dragging an unselected item moves only that item (selection is untouched), matching Explorer/Finder behaviour.
