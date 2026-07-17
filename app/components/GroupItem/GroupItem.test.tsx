import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GroupItem, { GroupItemPreview } from "./GroupItem";
import type { TreeArticle } from "./GroupItem";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: "transform 250ms ease",
    isDragging: false,
  })),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  verticalListSortingStrategy: {},
}));

const useDndContextMock = vi.hoisted(() => vi.fn(() => ({ over: null })));
vi.mock("@dnd-kit/core", () => ({
  useDndContext: useDndContextMock,
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: vi.fn((t) => t || "none"),
    },
  },
}));

vi.mock("react-router", () => ({
  Form: React.forwardRef<HTMLFormElement, React.ComponentPropsWithRef<"form">>(
    ({ children, method, onSubmit, style }, ref) => (
      <form ref={ref} method={method} onSubmit={onSubmit} style={style}>
        {children}
      </form>
    ),
  ),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

const useModalMock = { isOpen: false, open: vi.fn(), close: vi.fn() };
vi.mock("../Modal/useModal", () => ({ useModal: () => useModalMock }));

vi.mock("../Modal/Modal", () => ({
  Modal: ({
    isOpen,
    title,
    children,
    footer,
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title} data-testid="modal">
        <h2>{title}</h2>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => (
    <svg data-testid="svg-icon" data-icon={name} />
  ),
  SvgImageList: { DragHandle: "drag-handle", Trash: "trash" },
}));

vi.mock("../Button/Button", () => ({
  Button: ({
    children,
    type,
    variant,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    type?: "button" | "submit" | "reset";
    variant?: string;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type={type}
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock("../Spinner/Spinner", () => ({
  Spinner: ({ size }: { size?: string }) => (
    <span data-testid="spinner" data-size={size} />
  ),
}));

vi.mock("../ArticleItem/ArticleItem", () => ({
  default: ({
    title,
    uri,
    readOnly,
    currentUserDid,
  }: {
    title: string;
    uri: string;
    readOnly?: boolean;
    currentUserDid?: string;
  }) => (
    <li
      data-testid="article-item"
      data-uri={uri}
      data-readonly={String(!!readOnly)}
      data-current-user-did={currentUserDid ?? ""}
    >
      {title}
    </li>
  ),
}));

vi.mock("../Tooltip/Tooltip", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipBubble: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// ─── fixtures ────────────────────────────────────────────────────────────────

const sampleArticles: TreeArticle[] = [
  {
    id: "a:article-1",
    uri: "at://did/site.standard.document/article-1",
    title: "Article One",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "a:article-2",
    uri: "at://did/site.standard.document/article-2",
    title: "Article Two",
    createdAt: "2024-01-02T00:00:00.000Z",
  },
];

const defaultProps = {
  id: "g:test-group",
  title: "Test Group",
  slug: "test-group",
  articleChildren: [] as TreeArticle[],
  urlAndPrefix: "example.com/blog",
  // Matches pre-existing test assumptions below (single "Drop articles
  // here" empty state, one button = delete). Tests for the other two empty
  // states override this explicitly.
  siteHasAnyArticles: true,
};

// ─── tests ───────────────────────────────────────────────────────────────────

describe("GroupItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModalMock.isOpen = false;
    useDndContextMock.mockReturnValue({ over: null });
  });

  describe("root mode (isRoot=true)", () => {
    it("renders Ungrouped Articles heading", () => {
      render(<GroupItem {...defaultProps} isRoot />);
      expect(
        screen.getByText("Unpublished Draft Articles"),
      ).toBeInTheDocument();
    });

    it("renders Groups heading", () => {
      render(<GroupItem {...defaultProps} isRoot />);
      expect(
        screen.getByRole("heading", { name: "Groups" }),
      ).toBeInTheDocument();
    });

    it("does not render a drag handle", () => {
      render(<GroupItem {...defaultProps} isRoot />);
      expect(screen.queryByTestId("svg-icon")).not.toBeInTheDocument();
    });

    it("does not render a delete button", () => {
      render(<GroupItem {...defaultProps} isRoot />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders article children", () => {
      render(
        <GroupItem {...defaultProps} isRoot articleChildren={sampleArticles} />,
      );
      expect(screen.getByText("Article One")).toBeInTheDocument();
      expect(screen.getByText("Article Two")).toBeInTheDocument();
    });

    it("shows drop zone when no articles", () => {
      render(<GroupItem {...defaultProps} isRoot articleChildren={[]} />);
      expect(screen.getByText("Drop articles here")).toBeInTheDocument();
    });

    it("hides drop zone when articles are present", () => {
      render(
        <GroupItem {...defaultProps} isRoot articleChildren={sampleArticles} />,
      );
      expect(screen.queryByText("Drop articles here")).not.toBeInTheDocument();
    });
  });

  describe("named group mode", () => {
    it("renders the group title", () => {
      render(<GroupItem {...defaultProps} />);
      expect(screen.getByText("Test Group")).toBeInTheDocument();
    });

    it("renders the slug with leading slash", () => {
      render(<GroupItem {...defaultProps} slug="my-group" />);
      expect(screen.getByText("/my-group")).toBeInTheDocument();
    });

    it("renders a drag handle icon", () => {
      const { container } = render(<GroupItem {...defaultProps} />);
      expect(
        container.querySelector('[data-icon="drag-handle"]'),
      ).toBeInTheDocument();
    });

    it("renders a trash icon when not deleting", () => {
      const { container } = render(<GroupItem {...defaultProps} />);
      expect(
        container.querySelector('[data-icon="trash"]'),
      ).toBeInTheDocument();
    });

    it("renders article children", () => {
      render(<GroupItem {...defaultProps} articleChildren={sampleArticles} />);
      expect(screen.getByText("Article One")).toBeInTheDocument();
      expect(screen.getByText("Article Two")).toBeInTheDocument();
    });

    it("shows drop zone when no articles", () => {
      render(<GroupItem {...defaultProps} articleChildren={[]} />);
      expect(screen.getByText("Drop articles here")).toBeInTheDocument();
    });

    it("hides drop zone when articles are present", () => {
      render(<GroupItem {...defaultProps} articleChildren={sampleArticles} />);
      expect(screen.queryByText("Drop articles here")).not.toBeInTheDocument();
    });
  });

  describe("empty group message states", () => {
    it("shows the drag-and-drop hint when another group on the site has articles", () => {
      render(
        <GroupItem
          {...defaultProps}
          articleChildren={[]}
          siteHasAnyArticles
          hasUnassignedArticles={false}
        />,
      );
      expect(screen.getByText("Drop articles here")).toBeInTheDocument();
      expect(
        screen.queryByText(/Write New Article|Article List/),
      ).not.toBeInTheDocument();
    });

    it("points at the Article List when the site has no articles but loose ones exist", () => {
      render(
        <GroupItem
          {...defaultProps}
          articleChildren={[]}
          siteHasAnyArticles={false}
          hasUnassignedArticles
        />,
      );
      expect(screen.queryByText("Drop articles here")).not.toBeInTheDocument();
      expect(
        screen.getByText("Assign an article to this group from the"),
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Article List" });
      expect(link).toHaveAttribute("href", "/article/list");
    });

    it("points at Write New Article when the account has no articles at all", () => {
      render(
        <GroupItem
          {...defaultProps}
          articleChildren={[]}
          siteHasAnyArticles={false}
          hasUnassignedArticles={false}
        />,
      );
      expect(screen.queryByText("Drop articles here")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Assign an article to this group from the"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("Your published articles will appear here."),
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Write New Article" });
      expect(link).toHaveAttribute("href", "/article/create");
    });

    it("shows the drag-and-drop hint over the fallback messages when a group has articles elsewhere on the site, even if loose articles also exist", () => {
      render(
        <GroupItem
          {...defaultProps}
          articleChildren={[]}
          siteHasAnyArticles
          hasUnassignedArticles
        />,
      );
      expect(screen.getByText("Drop articles here")).toBeInTheDocument();
    });

    it("does not show any empty-state message when the group has articles", () => {
      render(
        <GroupItem
          {...defaultProps}
          articleChildren={sampleArticles}
          siteHasAnyArticles={false}
          hasUnassignedArticles={false}
        />,
      );
      expect(screen.queryByText("Drop articles here")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Your published articles will appear here."),
      ).not.toBeInTheDocument();
    });
  });

  describe("delete button state", () => {
    it("is enabled when group has no articles and is not deleting", () => {
      render(<GroupItem {...defaultProps} articleChildren={[]} />);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    it("is disabled when group has articles", () => {
      render(<GroupItem {...defaultProps} articleChildren={sampleArticles} />);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is disabled when isDeleting is true", () => {
      render(<GroupItem {...defaultProps} isDeleting />);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("shows spinner instead of trash icon when isDeleting", () => {
      const { container } = render(<GroupItem {...defaultProps} isDeleting />);
      expect(screen.getByTestId("spinner")).toBeInTheDocument();
      expect(
        container.querySelector('[data-icon="trash"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("hidden form inputs", () => {
    it("has deleteGroup intent", () => {
      render(<GroupItem {...defaultProps} />);
      expect(document.querySelector('input[name="_intent"]')).toHaveValue(
        "deleteGroup",
      );
    });

    it("has rkey set to the slug", () => {
      render(<GroupItem {...defaultProps} slug="my-slug" />);
      expect(document.querySelector('input[name="rkey"]')).toHaveValue(
        "my-slug",
      );
    });

    it("includes cid input when cid is provided", () => {
      render(<GroupItem {...defaultProps} cid="test-cid" />);
      expect(document.querySelector('input[name="cid"]')).toHaveValue(
        "test-cid",
      );
    });

    it("omits cid input when cid is not provided", () => {
      render(<GroupItem {...defaultProps} />);
      expect(
        document.querySelector('input[name="cid"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("delete modal", () => {
    it("does not render modal when closed", () => {
      render(<GroupItem {...defaultProps} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens modal when delete button is clicked", () => {
      render(<GroupItem {...defaultProps} />);
      fireEvent.click(screen.getByRole("button"));
      expect(useModalMock.open).toHaveBeenCalled();
    });

    it("shows correct title and message for the group", () => {
      useModalMock.isOpen = true;
      render(<GroupItem {...defaultProps} title="My Group" />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Delete Group");
      expect(dialog).toHaveTextContent(
        'Are you sure you want to delete the group "My Group"?',
      );
    });

    it("closes modal when Cancel is clicked", () => {
      useModalMock.isOpen = true;
      render(<GroupItem {...defaultProps} />);
      const cancelButton = within(screen.getByRole("dialog")).getByRole(
        "button",
        { name: /cancel/i },
      );
      fireEvent.click(cancelButton);
      expect(useModalMock.close).toHaveBeenCalled();
    });

    it("calls onDeleteConfirm with slug when confirmed and callback is provided", () => {
      useModalMock.isOpen = true;
      const onDeleteConfirm = vi.fn();
      render(
        <GroupItem
          {...defaultProps}
          slug="my-slug"
          onDeleteConfirm={onDeleteConfirm}
        />,
      );
      const confirmButton = within(screen.getByRole("dialog")).getByRole(
        "button",
        { name: /delete/i },
      );
      fireEvent.click(confirmButton);
      expect(useModalMock.close).toHaveBeenCalled();
      expect(onDeleteConfirm).toHaveBeenCalledWith("my-slug");
    });

    it("submits the form when confirmed and no callback is provided", () => {
      useModalMock.isOpen = true;
      const submitSpy = vi
        .spyOn(HTMLFormElement.prototype, "submit")
        .mockImplementation(() => {});
      render(<GroupItem {...defaultProps} />);
      const confirmButton = within(screen.getByRole("dialog")).getByRole(
        "button",
        { name: /delete/i },
      );
      fireEvent.click(confirmButton);
      expect(useModalMock.close).toHaveBeenCalled();
      expect(submitSpy).toHaveBeenCalled();
      submitSpy.mockRestore();
    });
  });

  describe("drag and drop", () => {
    it("applies reduced opacity when dragging", async () => {
      const { useSortable } = await import("@dnd-kit/sortable");
      vi.mocked(useSortable).mockReturnValueOnce({
        attributes: {} as any,
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: "transform 250ms ease",
        isDragging: true,
      } as any);

      const { container } = render(<GroupItem {...defaultProps} />);
      expect(container.querySelector("li")?.style.opacity).toBe("0.4");
    });

    it("does not apply opacity when not dragging", () => {
      const { container } = render(<GroupItem {...defaultProps} />);
      expect(container.querySelector("li")?.style.opacity).toBe("");
    });
  });

  // Found live 2026-07-17: a Contributor's read-only view of someone else's
  // site (site-list.tsx) needs every site-management action hidden.
  describe("readOnly", () => {
    it("does not render the drag handle", () => {
      const { container } = render(<GroupItem {...defaultProps} readOnly />);
      expect(container.querySelector(".handleContainer")).not.toBeInTheDocument();
    });

    it("disables the sortable via useSortable's disabled option", async () => {
      const { useSortable } = await import("@dnd-kit/sortable");
      render(<GroupItem {...defaultProps} readOnly />);
      expect(useSortable).toHaveBeenCalledWith({
        id: "g:test-group",
        disabled: true,
      });
    });

    it("hides the Delete Group button", () => {
      render(<GroupItem {...defaultProps} articleChildren={[]} readOnly />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("passes readOnly through to each ArticleItem", () => {
      render(
        <GroupItem {...defaultProps} articleChildren={sampleArticles} readOnly />,
      );
      const items = screen.getAllByTestId("article-item");
      expect(items).toHaveLength(2);
      items.forEach((item) => expect(item).toHaveAttribute("data-readonly", "true"));
    });

    it("does not disable the sortable or hide the Delete Group button by default", () => {
      render(<GroupItem {...defaultProps} articleChildren={[]} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("passes currentUserDid through to each ArticleItem", () => {
      render(
        <GroupItem
          {...defaultProps}
          articleChildren={sampleArticles}
          readOnly
          currentUserDid="did:plc:viewer"
        />,
      );
      const items = screen.getAllByTestId("article-item");
      expect(items).toHaveLength(2);
      items.forEach((item) =>
        expect(item).toHaveAttribute("data-current-user-did", "did:plc:viewer"),
      );
    });
  });
});

describe("GroupItemPreview", () => {
  it("renders as a list item", () => {
    const { container } = render(
      <GroupItemPreview title="Preview Group" slug="preview-group" />,
    );
    expect(container.querySelector("li")).toBeInTheDocument();
  });

  it("renders the title", () => {
    render(<GroupItemPreview title="Preview Group" slug="preview-group" />);
    expect(screen.getByText("Preview Group")).toBeInTheDocument();
  });

  it("renders the slug", () => {
    render(<GroupItemPreview title="Preview Group" slug="preview-group" />);
    expect(screen.getByText("preview-group")).toBeInTheDocument();
  });

  it("renders uri when provided", () => {
    render(
      <GroupItemPreview
        title="Preview Group"
        slug="preview-group"
        uri="at://did/site.standard.publication/test"
      />,
    );
    expect(
      screen.getByText("at://did/site.standard.publication/test"),
    ).toBeInTheDocument();
  });

  it("does not render uri section when uri is not provided", () => {
    const { container } = render(
      <GroupItemPreview title="Preview Group" slug="preview-group" />,
    );
    expect(container.querySelector(".uriContainer")).not.toBeInTheDocument();
  });

  it("does not render any buttons", () => {
    render(<GroupItemPreview title="Preview Group" slug="preview-group" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
