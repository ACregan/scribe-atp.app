# Test Setup

## Stack

- **Vitest** — test runner (compatible with Jest assertion API)
- **@testing-library/react** — component rendering and interaction helpers
- **@testing-library/jest-dom** — DOM matchers (`toBeInTheDocument`, etc.)
- **jsdom** — DOM environment for tests

## Configuration

Tests use a standalone `vitest.config.ts` separate from `vite.config.ts`. This avoids loading the React Router build plugin during test runs (`vite.config.ts` skips `reactRouter()` when `process.env.VITEST` is set, but the standalone config is cleaner).

**`vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./test.setup.ts",
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "test.setup.ts", "**/*.module.css"],
    },
  },
});
```

**`test.setup.ts`**

```typescript
import "@testing-library/jest-dom";
```

`@testing-library/react` handles `cleanup` automatically when Vitest's `globals: true` is set — no manual `afterEach` needed.

## Commands

```bash
npm test              # watch mode
npm run test:run      # single run (CI)
npm run test:coverage # single run with coverage report
```

## File conventions

- Component tests are co-located: `app/components/Foo/Foo.test.tsx`
- Pure function tests are co-located with the source: `app/hooks/utils.test.ts`
- Hook tests co-located: `app/components/Modal/useModal.test.ts`

## Mocking conventions

- **Child components** are mocked with `vi.mock(...)` to isolate the component under test
- **React Router primitives** (`Form`, `Link`, `NavLink`) are mocked per-file
- **dnd-kit hooks** (`useSortable`, `useDndContext`) are mocked to return static values; `vi.hoisted()` is required for any mock variable referenced inside a `vi.mock()` factory
- **Lexical editor internals** are mocked wholesale in `RichTextEditor.test.tsx` and `ToolbarPlugin.test.tsx`; `useLexicalComposerContext` is mocked via `vi.hoisted`

## Testing philosophy

- Prefer testing **observable behaviour** — what the user sees, what handlers are called, what the DOM communicates
- **Pure function tests** are highest value: no mocking needed and they catch silent data corruption (e.g. the `buildTreeFromSite`/`treeToSiteData` round-trip)
- **Component tests** mock aggressively to isolate the unit — they verify rendering and interaction, not business logic
- **Business logic lives in route loaders/actions** — those are the next priority for test coverage

## Current test files

### Components

- [x] `app/components/ArticleForm/ArticleForm.test.tsx`
- [x] `app/components/ArticleItem/ArticleItem.test.tsx`
- [x] `app/components/ArticleList/ArticleList.test.tsx`
- [x] `app/components/AsideMenu/AsideMenu.test.tsx`
- [x] `app/components/Button/Button.test.tsx`
- [x] `app/components/FooterPortal/FooterPortal.test.tsx`
- [x] `app/components/GroupItem/GroupItem.test.tsx`
- [x] `app/components/GroupList/GroupList.test.tsx`
- [x] `app/components/Input/Input.test.tsx`
- [x] `app/components/Modal/Modal.test.tsx`
- [x] `app/components/Modal/useModal.test.ts`
- [x] `app/components/PageContainer/PageContainer.test.tsx`
- [x] `app/components/RichTextEditor/RichTextEditor.test.tsx`
- [x] `app/components/RichTextEditor/ToolbarPlugin.test.tsx`
- [x] `app/components/Select/Select.test.tsx`
- [x] `app/components/SiteTile/SiteTile.test.tsx`
- [x] `app/components/Spinner/Spinner.test.tsx`
- [x] `app/components/SvgIcon/SvgIcon.test.tsx`
- [x] `app/components/Toast/Toast.test.tsx`
- [x] `app/components/Toast/ToastContext.test.tsx`
- [x] `app/components/Tooltip/Tooltip.test.tsx`

### Pure functions / utilities

- [x] `app/constants.test.ts` — `SLUG_RE`, `DOMAIN_RE` valid/invalid cases; collection name constants
- [x] `app/hooks/utils.test.ts` — `slugFromUri`, `flattenArticles` ordering, `resolveIdentifier`
- [x] `app/routes/article/site-list/siteTree.test.ts` — `toSlug`, `buildTreeFromSite`, `treeToSiteData`, full round-trip suite

### Next priority

Route loader/action tests (slug validation, site assignment logic, orphan detection).
