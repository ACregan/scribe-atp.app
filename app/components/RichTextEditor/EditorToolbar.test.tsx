import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorToolbar } from "./EditorToolbar";

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

vi.mock("~/components/ImagePickerModal/ImagePickerModal", () => ({
  ImagePickerModal: ({
    isOpen,
    onClose,
    onPick,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onPick: (
      src: string,
      altText: string,
      sources?: { url: string; width: number }[],
    ) => void;
  }) =>
    isOpen ? (
      <div data-testid="image-picker-modal">
        <button
          onClick={() =>
            onPick("https://example.com/img.webp", "img", [
              { url: "https://example.com/img.webp", width: 600 },
            ])
          }
        >
          Pick Image
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("EditorToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.registerCommand.mockReturnValue(vi.fn());
    mockEditor.registerUpdateListener.mockReturnValue(vi.fn());
  });

  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<EditorToolbar />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders the Undo button, disabled by default", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Undo")).toBeDisabled();
    });

    it("renders the Redo button, disabled by default", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Redo")).toBeDisabled();
    });

    it("renders Bold, Italic, and Underline buttons", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Bold (Ctrl+B)")).toBeInTheDocument();
      expect(screen.getByTitle("Italic (Ctrl+I)")).toBeInTheDocument();
      expect(screen.getByTitle("Underline (Ctrl+U)")).toBeInTheDocument();
    });

    it("renders inline code and link buttons", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Inline code (Ctrl+`)")).toBeInTheDocument();
      expect(screen.getByTitle("Insert link (Ctrl+K)")).toBeInTheDocument();
    });

    it("renders the block type dropdown showing Normal by default", () => {
      render(<EditorToolbar />);
      expect(
        screen.getByRole("button", { name: /Normal/ }),
      ).toBeInTheDocument();
    });

    it("renders a font family select with all six font options", () => {
      render(<EditorToolbar />);
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
      render(<EditorToolbar />);
      expect(screen.getByTitle("Font size")).toHaveValue(15);
    });

    it("renders decrease and increase font size buttons", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Decrease font size")).toBeInTheDocument();
      expect(screen.getByTitle("Increase font size")).toBeInTheDocument();
    });

    it("renders Format and Align dropdown triggers", () => {
      render(<EditorToolbar />);
      expect(
        screen.getByRole("button", { name: /Format/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Align/ })).toBeInTheDocument();
    });

    it("renders text colour and background colour pickers", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Text colour")).toBeInTheDocument();
      expect(screen.getByTitle("Background colour")).toBeInTheDocument();
    });

    it("renders the speech-to-text button", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Start dictation")).toBeInTheDocument();
    });

    it("does not show the link URL input when not in link editing mode", () => {
      render(<EditorToolbar />);
      expect(
        screen.queryByPlaceholderText("https://…"),
      ).not.toBeInTheDocument();
    });

    it("renders the insert image button", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Insert image")).toBeInTheDocument();
    });

    it("opens the ImagePickerModal when the insert image button is clicked", () => {
      render(<EditorToolbar />);
      expect(
        screen.queryByTestId("image-picker-modal"),
      ).not.toBeInTheDocument();
      fireEvent.mouseDown(screen.getByTitle("Insert image"));
      expect(screen.getByTestId("image-picker-modal")).toBeInTheDocument();
    });

    it("dispatches INSERT_IMAGE_COMMAND when an image is picked", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Insert image"));
      fireEvent.click(screen.getByText("Pick Image"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        { type: "INSERT_IMAGE_COMMAND" },
        {
          src: "https://example.com/img.webp",
          altText: "img",
          sources: [{ url: "https://example.com/img.webp", width: 600 }],
        },
      );
    });
  });

  describe("format button commands", () => {
    it("dispatches FORMAT_TEXT_COMMAND with 'bold' when Bold is clicked", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Bold (Ctrl+B)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "bold",
      );
    });

    it("dispatches FORMAT_TEXT_COMMAND with 'italic' when Italic is clicked", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Italic (Ctrl+I)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "italic",
      );
    });

    it("dispatches FORMAT_TEXT_COMMAND with 'underline' when Underline is clicked", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Underline (Ctrl+U)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "underline",
      );
    });

    it("dispatches FORMAT_TEXT_COMMAND with 'code' when Inline code is clicked", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Inline code (Ctrl+`)"));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_TEXT",
        "code",
      );
    });
  });

  describe("dropdowns", () => {
    it("opens the block type dropdown and shows all block options", () => {
      render(<EditorToolbar />);
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
      render(<EditorToolbar />);
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
      render(<EditorToolbar />);
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
      render(<EditorToolbar />);
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
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByRole("button", { name: /Align/ }));
      fireEvent.mouseDown(screen.getByRole("button", { name: "Center" }));
      expect(mockEditor.dispatchCommand).toHaveBeenCalledWith(
        "FORMAT_ELEMENT",
        "center",
      );
    });

    it("closes a dropdown when clicking outside", () => {
      render(<EditorToolbar />);
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
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Insert link (Ctrl+K)"));
      expect(screen.getByPlaceholderText("https://…")).toBeInTheDocument();
    });

    it("hides the URL input when Escape is pressed in the link field", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Insert link (Ctrl+K)"));
      fireEvent.keyDown(screen.getByPlaceholderText("https://…"), {
        key: "Escape",
      });
      expect(
        screen.queryByPlaceholderText("https://…"),
      ).not.toBeInTheDocument();
    });

    it("dispatches TOGGLE_LINK_COMMAND when Enter is pressed with a URL", () => {
      render(<EditorToolbar />);
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

  describe("fullscreen button", () => {
    it("renders the fullscreen button", () => {
      render(<EditorToolbar />);
      expect(screen.getByTitle("Fullscreen (Ctrl+Shift+F)")).toBeInTheDocument();
    });

    it("calls onToggleFullscreen when the fullscreen button is clicked", () => {
      const onToggleFullscreen = vi.fn();
      render(<EditorToolbar onToggleFullscreen={onToggleFullscreen} />);
      fireEvent.mouseDown(screen.getByTitle("Fullscreen (Ctrl+Shift+F)"));
      expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    });

    it("shows Exit fullscreen title when isFullscreen is true", () => {
      render(<EditorToolbar isFullscreen={true} />);
      expect(screen.getByTitle("Exit fullscreen (Ctrl+Shift+F)")).toBeInTheDocument();
    });

    it("shows the fullscreen shortcut in the keyboard shortcuts modal", () => {
      render(<EditorToolbar />);
      fireEvent.mouseDown(screen.getByTitle("Keyboard shortcuts"));
      expect(screen.getByText("Fullscreen")).toBeInTheDocument();
      expect(screen.getByText("Ctrl+Shift+F")).toBeInTheDocument();
    });
  });

  describe("toolbar pin button", () => {
    it("does not render the pin button when not in fullscreen", () => {
      render(<EditorToolbar isFullscreen={false} />);
      expect(screen.queryByTitle("Pin toolbar")).not.toBeInTheDocument();
    });

    it("renders the pin button in fullscreen mode", () => {
      render(<EditorToolbar isFullscreen={true} />);
      expect(screen.getByTitle("Pin toolbar")).toBeInTheDocument();
    });

    it("calls onToggleToolbarPin when clicked", () => {
      const onToggleToolbarPin = vi.fn();
      render(<EditorToolbar isFullscreen={true} onToggleToolbarPin={onToggleToolbarPin} />);
      fireEvent.mouseDown(screen.getByTitle("Pin toolbar"));
      expect(onToggleToolbarPin).toHaveBeenCalledTimes(1);
    });

    it("shows Unpin toolbar title when pinned", () => {
      render(<EditorToolbar isFullscreen={true} toolbarPinned={true} />);
      expect(screen.getByTitle("Unpin toolbar")).toBeInTheDocument();
    });

  });
});
