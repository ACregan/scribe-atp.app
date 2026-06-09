import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function renderWithProvider(initialTheme: "light" | "dark" = "light") {
  return render(
    <ThemeProvider initialTheme={initialTheme}>
      <ThemeConsumer />
    </ThemeProvider>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let cookieJar = "";

beforeEach(() => {
  cookieJar = "";
  vi.restoreAllMocks();

  // Stub document.cookie so tests are isolated from one another.
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => cookieJar,
    set: (value: string) => {
      const [pair, ...attrs] = value.split(";").map((s) => s.trim());
      const expired = attrs.some(
        (a) => /^max-age\s*=\s*0$/i.test(a) || /^max-age\s*=\s*-\d+/i.test(a),
      );
      const name = pair.split("=")[0].trim();
      // Remove existing entry for this name.
      cookieJar = cookieJar
        .split(";")
        .map((c) => c.trim())
        .filter((c) => c && !c.startsWith(`${name}=`))
        .join("; ");
      if (!expired) {
        cookieJar = cookieJar ? `${cookieJar}; ${pair}` : pair;
      }
    },
  });

  // Default: system prefers light.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  // Reset data-theme attribute.
  document.documentElement.removeAttribute("data-theme");
});

// ── useTheme guard ────────────────────────────────────────────────────────────

describe("useTheme", () => {
  it("throws when used outside ThemeProvider", () => {
    function Rogue() {
      useTheme();
      return null;
    }
    // Suppress the React error boundary console noise.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<Rogue />)).toThrow(
      "useTheme must be used inside ThemeProvider",
    );
    consoleError.mockRestore();
  });
});

// ── ThemeProvider ─────────────────────────────────────────────────────────────

describe("ThemeProvider", () => {
  it("exposes the initialTheme when a cookie is already set to the same value", () => {
    // Cookie present → hydration effect won't change the theme.
    cookieJar = "theme=light";
    renderWithProvider("light");
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("exposes 'dark' when initialTheme is 'dark' and cookie is already dark", () => {
    cookieJar = "theme=dark";
    renderWithProvider("dark");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("resolves to 'dark' via matchMedia on first visit (no cookie, dark preference)", () => {
    // Simulate a first-ever visit: no cookie, dark preferred.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi
        .fn()
        .mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
    });
    renderWithProvider("light");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("sets data-theme on documentElement when resolving dark via matchMedia", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi
        .fn()
        .mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
    });
    renderWithProvider("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("writes the theme cookie on first visit", () => {
    // No cookie yet, light preference.
    renderWithProvider("light");
    expect(cookieJar).toContain("theme=light");
  });

  it("does not overwrite an existing theme cookie on mount", () => {
    cookieJar = "theme=dark";
    const setSpy = vi.spyOn(document, "cookie", "set");
    renderWithProvider("dark");
    // The cookie setter should not have been called for a write (no new cookie).
    const writeCalls = setSpy.mock.calls.filter((args) =>
      (args[0] as string).startsWith("theme="),
    );
    expect(writeCalls).toHaveLength(0);
  });
});

// ── toggleTheme ───────────────────────────────────────────────────────────────

describe("toggleTheme", () => {
  it("switches from light to dark when toggled", () => {
    cookieJar = "theme=light";
    renderWithProvider("light");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("switches from dark to light when toggled", () => {
    cookieJar = "theme=dark";
    renderWithProvider("dark");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("sets data-theme='dark' on documentElement when toggling light → dark", () => {
    cookieJar = "theme=light";
    renderWithProvider("light");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme='light' on documentElement when toggling dark → light", () => {
    cookieJar = "theme=dark";
    renderWithProvider("dark");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("updates the theme cookie when toggled to dark", () => {
    cookieJar = "theme=light";
    renderWithProvider("light");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(cookieJar).toContain("theme=dark");
  });

  it("updates the theme cookie when toggled to light", () => {
    cookieJar = "theme=dark";
    renderWithProvider("dark");
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(cookieJar).toContain("theme=light");
  });

  it("can toggle back and forth multiple times", () => {
    cookieJar = "theme=light";
    renderWithProvider("light");
    const toggle = screen.getByRole("button", { name: "toggle" });

    fireEvent.click(toggle);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");

    fireEvent.click(toggle);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    fireEvent.click(toggle);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });
});
