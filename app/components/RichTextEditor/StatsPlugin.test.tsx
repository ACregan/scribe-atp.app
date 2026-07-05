import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  countWords,
  countChars,
  readingTime,
  StatsPlugin,
} from "./StatsPlugin";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("lexical", () => ({
  $getRoot: () => ({ getAllTextNodes: () => [] }),
}));

vi.mock("@lexical/react/LexicalComposerContext", () => ({
  useLexicalComposerContext: () => [{ registerUpdateListener: () => () => {} }],
}));

// ─── countWords ───────────────────────────────────────────────────────────────

describe("countWords", () => {
  it("counts simple words", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace only", () => {
    expect(countWords("   ")).toBe(0);
  });

  it("handles multiple spaces between words", () => {
    expect(countWords("one   two   three")).toBe(3);
  });

  it("handles leading and trailing whitespace", () => {
    expect(countWords("  hello world  ")).toBe(2);
  });

  it("counts hyphenated words as one", () => {
    expect(countWords("well-known fact")).toBe(2);
  });
});

// ─── countChars ───────────────────────────────────────────────────────────────

describe("countChars", () => {
  it("counts characters including spaces", () => {
    expect(countChars("hello world")).toBe(11);
  });

  it("returns 0 for empty string", () => {
    expect(countChars("")).toBe(0);
  });

  it("counts spaces", () => {
    expect(countChars("a b")).toBe(3);
  });
});

// ─── readingTime ──────────────────────────────────────────────────────────────

describe("readingTime", () => {
  it("returns '< 1 min read' for 0 words", () => {
    expect(readingTime(0)).toBe("< 1 min read");
  });

  it("returns '< 1 min read' for 224 words", () => {
    expect(readingTime(224)).toBe("< 1 min read");
  });

  it("returns '1 min read' for exactly 225 words", () => {
    expect(readingTime(225)).toBe("1 min read");
  });

  it("returns '1 min read' for 449 words", () => {
    expect(readingTime(449)).toBe("1 min read");
  });

  it("returns '2 min read' for 450 words", () => {
    expect(readingTime(450)).toBe("2 min read");
  });
});

// ─── StatsPlugin rendering ────────────────────────────────────────────────────

describe("StatsPlugin", () => {
  it("renders the stats bar in zero state on mount", () => {
    render(<StatsPlugin />);
    expect(screen.getByText(/0 words/)).toBeInTheDocument();
    expect(screen.getByText(/0 chars/)).toBeInTheDocument();
    expect(screen.getByText(/< 1 min read/)).toBeInTheDocument();
  });

  it("uses · as separator between stats", () => {
    render(<StatsPlugin />);
    const bar = screen.getByText(/0 words/);
    expect(bar.textContent).toMatch(/·/);
  });

  describe("stats pin button", () => {
    it("does not render the pin button when not in fullscreen", () => {
      render(<StatsPlugin isFullscreen={false} />);
      expect(screen.queryByTitle("Pin stats")).not.toBeInTheDocument();
    });

    it("renders the pin button in fullscreen mode", () => {
      render(<StatsPlugin isFullscreen={true} />);
      expect(screen.getByTitle("Pin stats")).toBeInTheDocument();
    });

    it("calls onToggleStatsPin when clicked", () => {
      const onToggleStatsPin = vi.fn();
      render(<StatsPlugin isFullscreen={true} onToggleStatsPin={onToggleStatsPin} />);
      fireEvent.mouseDown(screen.getByTitle("Pin stats"));
      expect(onToggleStatsPin).toHaveBeenCalledTimes(1);
    });

    it("shows Unpin stats title when pinned", () => {
      render(<StatsPlugin isFullscreen={true} statsPinned={true} />);
      expect(screen.getByTitle("Unpin stats")).toBeInTheDocument();
    });

    it("does not apply barHidden when pinned even if chrome is not visible", () => {
      const { container } = render(
        <StatsPlugin isFullscreen={true} chromVisible={false} statsPinned={true} />,
      );
      expect(container.firstChild).not.toHaveClass("barHidden");
    });
  });
});
