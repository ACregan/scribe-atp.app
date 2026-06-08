# ADR 0004: Two-Layer CSS Token System for Theming

## Status
Accepted

## Context
Dark mode requires that every colour in the UI can be reassigned for a different theme. The app already had a partial two-layer structure in `colours.css`: raw palette values (`--blue-ribbon: #0070f3`) alongside thin semantic aliases (`--blue: var(--blue-ribbon)`). Components were referencing both layers inconsistently — some used palette names directly, some used aliases.

## Decision
CSS variables are split across two files with a strict rule: components may only reference tokens from `tokens.css`, never palette values from `colours.css`.

**`colours.css`** — palette only. Every named colour the app uses, defined once. No component ever imports or references these directly; they exist solely to be consumed by `tokens.css`.

**`tokens.css`** — semantic assignments. Tokens are role-scoped where possible (`--surface-background`, `--text-primary`, `--border-color`) with component-scoped tokens only for elements that genuinely have no shared role (e.g. `--aside-background`). The `[data-theme="dark"]` block at the bottom of this file reassigns tokens to different palette values — no new raw colour values appear in the dark block, only `var(--palette-name)` references.

Theming then reduces to one question: what does each semantic token map to in dark mode?

## Alternatives Considered
**Single file** — keep both layers in `colours.css`. Simpler, but the boundary between "what colours exist" and "what colours mean" is invisible. Nothing stops a developer from reaching for `var(--blue-ribbon)` in a component, which bypasses the token system and breaks in dark mode silently.

**Component-scoped tokens only** — one token per component property (`--button-primary-background`, `--modal-background`). Maximum control, but a large token surface area and the `[data-theme="dark"]` block has to redeclare every component individually rather than reshaping roles that flow through multiple components at once.

## Consequences
- Migrating existing components to use semantic tokens is the bulk of the dark mode implementation work — components currently reference palette names directly and need updating.
- Adding a new component requires picking from existing semantic tokens rather than reaching for raw colours; this is intentional friction that keeps the palette from growing ad-hoc.
- Syntax highlighting colours inside the Lexical rich text editor are an explicit exception — they use many hardcoded Prism-style token colours and are deferred from the initial dark mode implementation.
