import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolbarPlugin } from "./ToolbarPlugin";

// ─── Mock editor ──────────────────────────────────────────────────────────────

const mockEditor = vi.hoisted(() => ({
  registerCommand: vi.fn(() => vi.fn()),
  registerUpdateListener: vi.fn(() => vi.fn()),
  dispatchCommand: vi.fn(),
  update: vi.fn(),
}));

// ─── Lexical React context ────────────────────────────────────────────────────

vi.mock("@lexical/react/LexicalComposerContext", () => ({
  useLexicalComposerContext: () => [mockEditor],
}));

// ─── Lexical core ─────────────────────────────────────────────────────────────

vi.mock("lexical", () => ({
  $getSelection: vi.fn(() => null),
  $isRangeSelection: vi.fn(() => false),
  $isElementNode: vi.fn(() => false),
  $isRootOrShadowRoot: vi.fn(() => false),
  $isTextNode: vi.fn(() => false),
  $createParagraphNode: vi.fn(() => ({})),
  CAN_REDO_COMMAND: "CAN_REDO",
  CAN_UNDO_COMMAND: "CAN_UNDO",
  COMMAND_PRIORITY_CRITICAL: 4,
  COMMAND_PRIORITY_NORMAL: 2,
  FORMAT_ELEMENT_COMMAND: "FORMAT_ELEMENT",
  FORMAT_TEXT_COMMAND: "FORMAT_TEXT",
  INDENT_CONTENT_COMMAND: "INDENT",
  KEY_DOWN_COMMAND: "KEY_DOWN",
  OUTDENT_CONTENT_COMMAND: "OUTDENT",
  REDO_COMMAND: "REDO",
  SELECTION_CHANGE_COMMAND: "SELECTION_CHANGE",
  UNDO_COMMAND: "UNDO",
  createCommand: vi.fn((type: string) => ({ type })),
  DecoratorNode: class {},
  TextNode: class {
    static importDOM() {
      return null;
    }
  },
}));

// ─── Lexical plugins ──────────────────────────────────────────────────────────

vi.mock("@lexical/utils", () => ({
  mergeRegister:
    (...fns: Array<() => void>) =>
    () =>
      fns.forEach((f) => f()),
  $findMatchingParent: vi.fn(() => null),
  $getNearestNodeOfType: vi.fn(() => null),
}));

vi.mock("@lexical/list", () => ({
  $isListNode: vi.fn(() => false),
  INSERT_CHECK_LIST_COMMAND: "INSERT_CHECK_LIST",
  INSERT_ORDERED_LIST_COMMAND: "INSERT_ORDERED_LIST",
  INSERT_UNORDERED_LIST_COMMAND: "INSERT_UNORDERED_LIST",
  ListNode: class {},
}));

vi.mock("@lexical/rich-text", () => ({
  $createHeadingNode: vi.fn(() => ({})),
  $createQuoteNode: vi.fn(() => ({})),
  $isHeadingNode: vi.fn(() => false),
}));

vi.mock("@lexical/code", () => ({
  $createCodeNode: vi.fn(() => ({})),
  $isCodeNode: vi.fn(() => false),
}));

vi.mock("@lexical/link", () => ({
  $isLinkNode: vi.fn(() => false),
  TOGGLE_LINK_COMMAND: "TOGGLE_LINK",
}));

vi.mock("@lexical/selection", () => ({
  $getSelectionStyleValueForProperty: vi.fn(() => ""),
  $isAtNodeEnd: vi.fn(() => false),
  $patchStyleText: vi.fn(),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ToolbarPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.registerCommand.mockReturnValue(vi.fn());
    mockEditor.registerUpdateListener.mockReturnValue(vi.fn());
  });

  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<ToolbarPlugin />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders the Undo button, disabled by default", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Undo")).toBeDisabled();
    });

    it("renders the Redo button, disabled by default", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Redo")).toBeDisabled();
    });

    it("renders Bold, Italic, and Underline buttons", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Bold (Ctrl+B)")).toBeInTheDocument();
      expect(screen.getByTitle("Italic (Ctrl+I)")).toBeInTheDocument();
      expect(screen.getByTitle("Underline (Ctrl+U)")).toBeInTheDocument();
    });

    it("renders inline code and link buttons", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Inline code (Ctrl+`)")).toBeInTheDocument();
      expect(screen.getByTitle("Insert link (Ctrl+K)")).toBeInTheDocument();
    });

    it("renders the block type dropdown showing Normal by default", () => {
      render(<ToolbarPlugin />);
      expect(
        screen.getByRole("button", { name: /Normal/ }),
      ).toBeInTheDocument();
    });

    it("renders a font family select with all six font options", () => {
      render(<ToolbarPlugin />);
      const select = screen.getByTitle("Font family");
      expect(select).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Arial" })).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Courier New" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Georgia" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Verdana" }),
      ).toBeInTheDocument();
    });

    it("renders a font size input with default value 15", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Font size")).toHaveValue(15);
    });

    it("renders decrease and increase font size buttons", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Decrease font size")).toBeInTheDocument();
      expect(screen.getByTitle("Increase font size")).toBeInTheDocument();
    });

    it("renders Format and Align dropdown triggers", () => {
      render(<ToolbarPlugin />);
      expect(
        screen.getByRole("button", { name: /Format/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Align/ })).toBeInTheDocument();
    });

    it("renders text colour and background colour pickers", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Text colour")).toBeInTheDocument();
      expect(screen.getByTitle("Background colour")).toBeInTheDocument();
    });

    it("renders the speech-to-text button", () => {
      render(<ToolbarPlugin />);
      expect(screen.getByTitle("Start dictation")).toBeInTheDocument();
    });

    it("does not show the link URL input when not in link editing mode", () => {
      render(<ToolbarPlugin />);
      expect(
        screen.queryByPlaceholderText("https://…"),
      ).not.toBeInTheDocument();
    });
  });

  describe("format button commands", () => {
    it("dispatches FORMAT_TEXT_COMMAND with 'bold' when Bold is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Bold (Ctrl+B)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "bold",
      );
    });

    it("dispatches FORMAT_TEXT_COMMAND with 'italic' when Italic is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Italic (Ctrl+I)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "italic",
      );
    });

    it("dispatches FORMAT_TEXT_COMMAND with 'underline' when Underline is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Underline (Ctrl+U)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "underline",
      );
    });

    it("dispatches FORMAT_TEXT_COMMAND with 'code' when Inline code is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Inline code (Ctrl+`)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "code",
      );
    });
  });

  describe("dropdowns", () => {
    it("opens the block type dropdown and shows all block options", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Normal/ }));
      expect(
        screen.getByRole("button", { name: /Heading 1/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Bullet List/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Code Block/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Quote/ }),
      ).toBeInTheDocument();
    });

    it("opens the Format dropdown and shows formatting options", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Format/ }));
      expect(
        screen.getByRole("button", { name: /Strikethrough/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Subscript/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Clear formatting/ }),
      ).toBeInTheDocument();
    });

    it("opens the Align dropdown and shows alignment options", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Align/ }));
      expect(screen.getByRole("button", { name: "Left" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Center" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Indent" }),
      ).toBeInTheDocument();
    });

    it("dispatches a format command when a Format dropdown item is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Format/ }));
      fireEvent.mouseDown(
        screen.getByRole("button", { name: /Strikethrough/ }),
      );
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "strikethrough",
      );
    });

    it("dispatches an align command when an Align dropdown item is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Align/ }));
      fireEvent.mouseDown(screen.getByRole("button", { name: "Center" }));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_ELEMENT",
        "center",
      );
    });

    it("closes a dropdown when clicking outside", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Format/ }));
      expect(
        screen.getByRole("button", { name: /Strikethrough/ }),
      ).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(
        screen.queryByRole("button", { name: /Strikethrough/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("link editing", () => {
    it("shows the URL input when Insert link is clicked", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Insert link (Ctrl+K)"));
      expect(screen.getByPlaceholderText("https://…")).toBeInTheDocument();
    });

    it("hides the URL input when Escape is pressed in the link field", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Insert link (Ctrl+K)"));
      fireEvent.keyDown(screen.getByPlaceholderText("https://…"), {
        key: "Escape",
      });
      expect(
        screen.queryByPlaceholderText("https://…"),
      ).not.toBeInTheDocument();
    });

    it("dispatches TOGGLE_LINK_COMMAND when Enter is pressed with a URL", () => {
      render(<ToolbarPlugin />);
      fireEvent.mouseDown(screen.getByTitle("Insert link (Ctrl+K)"));
      const input = screen.getByPlaceholderText("https://…");
      fireEvent.change(input, { target: { value: "https://example.com" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith("TOGGLE_LINK", {
        url: "https://example.com",
        target: "_blank",
        rel: "noopener noreferrer",
      });
    });
  });
});
