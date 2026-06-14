import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageResizeDecorator } from "./ImageResizeDecorator";

// ─── Lexical mocks ────────────────────────────────────────────────────────────

const mockEditor = vi.hoisted(() => ({
  update: vi.fn((fn: () => void) => fn()),
}));

const mockSetSelected = vi.fn();
const mockClearSelection = vi.fn();
const mockIsSelected = vi.hoisted(() => ({ value: false }));

vi.mock("@lexical/react/LexicalComposerContext", () => ({
  useLexicalComposerContext: () => [mockEditor],
}));

vi.mock("@lexical/react/useLexicalNodeSelection", () => ({
  useLexicalNodeSelection: () => [
    mockIsSelected.value,
    mockSetSelected,
    mockClearSelection,
  ],
}));

vi.mock("lexical", () => ({
  $getNodeByKey: vi.fn(() => ({ setWidth: vi.fn(), setAltText: vi.fn() })),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  nodeKey: "test-key",
  src: "https://example.com/img.webp",
  altText: "test image",
  width: null,
};

describe("ImageResizeDecorator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSelected.value = false;
  });

  describe("rendering", () => {
    it("renders the image with max-width when no width is set", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      const img = screen.getByAltText("test image");
      expect(img).toBeInTheDocument();
      expect(img).toHaveStyle({ maxWidth: "100%" });
    });

    it("renders the image with explicit width when width is set", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} width={480} />);
      const img = screen.getByAltText("test image");
      expect(img).toHaveStyle({ width: "480px" });
    });

    it("does not show handles when not hovered or selected", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      expect(document.querySelectorAll("[data-side]")).toHaveLength(0);
    });
  });

  describe("handle visibility", () => {
    it("shows handles on hover", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      const wrapper = screen.getByAltText("test image").parentElement!;
      fireEvent.mouseEnter(wrapper);
      expect(document.querySelectorAll("[data-side]")).toHaveLength(2);
    });

    it("hides handles when mouse leaves", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      const wrapper = screen.getByAltText("test image").parentElement!;
      fireEvent.mouseEnter(wrapper);
      fireEvent.mouseLeave(wrapper);
      expect(document.querySelectorAll("[data-side]")).toHaveLength(0);
    });

    it("shows handles when node is selected", () => {
      mockIsSelected.value = true;
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      expect(document.querySelectorAll("[data-side]")).toHaveLength(2);
    });
  });

  describe("Lexical selection", () => {
    it("calls setSelected(true) when image is clicked", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.mouseDown(screen.getByAltText("test image"));
      expect(mockSetSelected).toHaveBeenCalledWith(true);
    });

    it("calls clearSelection() before selecting", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.mouseDown(screen.getByAltText("test image"));
      const clearIndex = mockClearSelection.mock.invocationCallOrder[0];
      const setIndex = mockSetSelected.mock.invocationCallOrder[0];
      expect(clearIndex).toBeLessThan(setIndex);
    });
  });

  describe("drag behaviour", () => {
    it("shows the width badge while dragging", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} width={400} />);
      const wrapper = screen.getByAltText("test image").parentElement!;
      fireEvent.mouseEnter(wrapper);
      const rightHandle = document.querySelector('[data-side="right"]')!;

      act(() => {
        fireEvent.mouseDown(rightHandle, { clientX: 100 });
        fireEvent.mouseMove(document, { clientX: 150 });
      });

      expect(screen.getByText(/px$/)).toBeInTheDocument();
    });

    it("hides the width badge when not dragging", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} width={400} />);
      expect(screen.queryByText(/px$/)).not.toBeInTheDocument();
    });

    it("commits width to editor on mouseup", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} width={400} />);
      const wrapper = screen.getByAltText("test image").parentElement!;
      fireEvent.mouseEnter(wrapper);
      const rightHandle = document.querySelector('[data-side="right"]')!;

      // Flush effects between each event so drag listeners are attached
      act(() => {
        fireEvent.mouseDown(rightHandle, { clientX: 100 });
      });
      act(() => {
        fireEvent.mouseMove(document, { clientX: 150 });
      });
      act(() => {
        fireEvent.mouseUp(document);
      });

      expect(mockEditor.update).toHaveBeenCalled();
    });

    it("enforces 80px minimum width during drag", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} width={400} />);
      const wrapper = screen.getByAltText("test image").parentElement!;
      fireEvent.mouseEnter(wrapper);
      const rightHandle = document.querySelector('[data-side="right"]')!;

      // Flush effects between mousedown and mousemove so listeners are attached
      act(() => {
        fireEvent.mouseDown(rightHandle, { clientX: 400 });
      });
      // Drag far left — would make width negative without the clamp
      act(() => {
        fireEvent.mouseMove(document, { clientX: 0 });
      });

      const badge = screen.getByText(/px$/);
      const displayedWidth = parseInt(badge.textContent!);
      expect(displayedWidth).toBeGreaterThanOrEqual(80);
    });
  });

  describe("Alt text button", () => {
    it("shows the Alt text button when hovered", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.mouseEnter(screen.getByAltText("test image").parentElement!);
      expect(screen.getByRole("button", { name: "Alt text" })).toBeInTheDocument();
    });

    it("shows the Alt text button when node is selected", () => {
      mockIsSelected.value = true;
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      expect(screen.getByRole("button", { name: "Alt text" })).toBeInTheDocument();
    });

    it("does not show the Alt text button when neither hovered nor selected", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      expect(screen.queryByRole("button", { name: "Alt text" })).not.toBeInTheDocument();
    });

    it("opens the modal when clicked", () => {
      mockIsSelected.value = true;
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("pre-fills the textarea with the current altText", () => {
      mockIsSelected.value = true;
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      expect(screen.getByRole("textbox")).toHaveValue("test image");
    });
  });

  describe("Alt text modal", () => {
    beforeEach(() => {
      mockIsSelected.value = true;
    });

    it("Save button is disabled when altText is unchanged", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("Save button is enabled after changing the value", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "a better description" },
      });
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("Save button is enabled when alt text is cleared to empty string", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("calls editor.update when Save is clicked", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "new description" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mockEditor.update).toHaveBeenCalled();
    });

    it("closes the modal after saving", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "new description" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes the modal when Cancel is clicked without saving", () => {
      render(<ImageResizeDecorator {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: "Alt text" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
