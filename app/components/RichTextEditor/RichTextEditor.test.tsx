import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RichTextEditor } from "./RichTextEditor";

// ─── Mock EditorToolbar — tested separately ──────────────────────────────────
vi.mock("./EditorToolbar", () => ({
  EditorToolbar: () => <div data-testid="toolbar" />,
}));

// ─── Mock all Lexical React adapters ─────────────────────────────────────────
vi.mock("@lexical/react/LexicalComposer", () => ({
  LexicalComposer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@lexical/react/LexicalRichTextPlugin", () => ({
  RichTextPlugin: () => <div data-testid="rich-text-plugin" />,
}));

vi.mock("@lexical/react/LexicalContentEditable", () => ({
  ContentEditable: () => <div data-testid="content-editable" />,
}));

vi.mock("@lexical/react/LexicalHistoryPlugin", () => ({
  HistoryPlugin: () => null,
}));

vi.mock("@lexical/react/LexicalOnChangePlugin", () => ({
  OnChangePlugin: () => null,
}));

vi.mock("@lexical/react/LexicalListPlugin", () => ({
  ListPlugin: () => null,
}));

vi.mock("@lexical/react/LexicalCheckListPlugin", () => ({
  CheckListPlugin: () => null,
}));

vi.mock("@lexical/react/LexicalLinkPlugin", () => ({
  LinkPlugin: () => null,
}));

// useLexicalComposerContext is called by the inline plugins (CodeHighlight, InitialValue, HiddenField)
const mockEditor = vi.hoisted(() => ({
  update: vi.fn(),
  registerUpdateListener: vi.fn(() => () => {}),
  registerCommand: vi.fn(() => () => {}),
}));

vi.mock("@lexical/react/LexicalComposerContext", () => ({
  useLexicalComposerContext: () => [mockEditor],
}));

// ─── Mock Lexical node packages (only need to exist as importable) ─────────────
vi.mock("@lexical/code", () => ({
  registerCodeHighlighting: vi.fn(() => () => {}),
  CodeNode: class {},
  CodeHighlightNode: class {},
}));

vi.mock("@lexical/html", () => ({
  $generateHtmlFromNodes: vi.fn(() => ""),
  $generateNodesFromDOM: vi.fn(() => []),
}));

vi.mock("@lexical/rich-text", () => ({
  HeadingNode: class {},
  QuoteNode: class {},
}));

vi.mock("@lexical/list", () => ({
  ListNode: class {},
  ListItemNode: class {},
}));

vi.mock("@lexical/link", () => ({
  LinkNode: class {},
  AutoLinkNode: class {},
}));

vi.mock("lexical", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lexical")>();
  return {
    ...actual,
    $getRoot: vi.fn(() => ({ clear: vi.fn(), select: vi.fn() })),
    $insertNodes: vi.fn(),
  };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RichTextEditor", () => {
  it("renders a label when provided", () => {
    render(<RichTextEditor name="content" label="Article Content" />);
    expect(screen.getByText("Article Content")).toBeInTheDocument();
  });

  it("renders no label when label prop is omitted", () => {
    const { container } = render(<RichTextEditor name="content" />);
    expect(container.querySelector("label")).not.toBeInTheDocument();
  });

  it("renders the toolbar after mounting", () => {
    render(<RichTextEditor name="content" />);
    expect(screen.getByTestId("toolbar")).toBeInTheDocument();
  });

  it("renders the rich text plugin area", () => {
    render(<RichTextEditor name="content" />);
    expect(screen.getByTestId("rich-text-plugin")).toBeInTheDocument();
  });

  it("renders a hidden textarea with the correct name for form submission", () => {
    const { container } = render(<RichTextEditor name="article-content" />);
    const field = container.querySelector('textarea[name="article-content"]');
    expect(field).toBeInTheDocument();
  });

  it("initialises the hidden textarea value to defaultValue", () => {
    const { container } = render(
      <RichTextEditor name="content" defaultValue="<p>Hello world</p>" />,
    );
    const field = container.querySelector(
      "textarea[hidden]",
    ) as HTMLTextAreaElement;
    expect(field?.value).toBe("<p>Hello world</p>");
  });

  it("initialises with an empty string when defaultValue is not provided", () => {
    const { container } = render(<RichTextEditor name="content" />);
    const field = container.querySelector(
      "textarea[hidden]",
    ) as HTMLTextAreaElement;
    expect(field?.value).toBe("");
  });
});
