# Test Setup Instructions

## Required Dependencies

To run the component tests, install the following dev dependencies:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react
```

## Vite Configuration

Update `vite.config.ts` to include test configuration:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
      exclude: ["node_modules/", "src/test/"],
    },
  },
});
```

## Test Setup File

Create `test.setup.ts` in the root directory:

```typescript
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

## Running Tests

Add test script to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

Run tests with:

```bash
npm test
```

Run with coverage:

```bash
npm run test:coverage
```

## Test File Structure

Tests are located alongside components with the pattern: `ComponentName.test.tsx`

Example:

- `app/components/Button/Button.tsx`
- `app/components/Button/Button.test.tsx`

## Testing Approach

Each component test file:

1. Mocks child components to isolate testing
2. Tests rendering with various props
3. Tests user interactions
4. Tests conditional rendering
5. Aims for 100% coverage

## Current Test Files

- [x] `app/components/ArticleForm/ArticleForm.test.tsx`
- [ ] `app/components/ArticleItem/ArticleItem.test.tsx`
- [ ] `app/components/ArticleList/ArticleList.test.tsx`
- [ ] `app/components/AsideMenu/AsideMenu.test.tsx`
- [ ] `app/components/Button/Button.test.tsx`
- [ ] `app/components/FooterPortal/FooterPortal.test.tsx`
- [ ] `app/components/GroupItem/GroupItem.test.tsx`
- [ ] `app/components/GroupList/GroupList.test.tsx`
- [ ] `app/components/Input/Input.test.tsx`
- [ ] `app/components/Modal/Modal.test.tsx`
- [ ] `app/components/Modal/useModal.test.ts`
- [ ] `app/components/PageContainer/PageContainer.test.tsx`
- [ ] `app/components/RichTextEditor/RichTextEditor.test.tsx`
- [ ] `app/components/RichTextEditor/ToolbarPlugin.test.tsx`
- [ ] `app/components/Select/Select.test.tsx`
- [ ] `app/components/SiteTile/SiteTile.test.tsx`
- [ ] `app/components/Spinner/Spinner.test.tsx`
- [ ] `app/components/SvgIcon/SvgIcon.test.tsx`
- [ ] `app/components/Toast/Toast.test.tsx`
- [ ] `app/components/Toast/ToastContext.test.tsx`
- [ ] `app/components/Tooltip/Tooltip.test.tsx`

## Notes

- Tests use Vitest (compatible with Jest assertions)
- React Testing Library for component testing
- jsdom for DOM environment
- All tests are written in TypeScript
- Mocks are used to isolate components
