import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ArticleItem, { ArticleItemPreview } from "./ArticleItem";

// Mock useSortable from @dnd-kit/sortable
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: "transform 250ms ease",
    isDragging: false,
  })),
}));

// Mock CSS from @dnd-kit/utilities
vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: vi.fn((transform) => transform || "none"),
    },
  },
}));

// Mock React Router — Form uses forwardRef so deleteFormRef is populated
vi.mock("react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Form: React.forwardRef<HTMLFormElement, React.ComponentPropsWithRef<"form">>(
    ({ children, method, onSubmit, className, style }, ref) => (
      <form
        ref={ref}
        method={method}
        onSubmit={onSubmit}
        className={className}
        style={style}
      >
        {children}
      </form>
    ),
  ),
}));

// Mock useModal with a mutable reference
const useModalMock = {
  isOpen: false,
  open: vi.fn(),
  close: vi.fn(),
};

vi.mock("../Modal/useModal", () => ({
  useModal: () => useModalMock,
}));

// Mock Modal component
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

// Mock IconBadge so it doesn't render a second SvgIcon
vi.mock("../IconBadge/IconBadge", () => ({
  IconBadge: () => <div data-testid="icon-badge" />,
}));

vi.mock("../OverflowMenu/OverflowMenu", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SvgIcon
vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => (
    <svg data-testid="svg-icon" data-icon={name} />
  ),
  SvgImageList: {
    DragHandle: "drag-handle",
  },
}));

// Mock Button component
vi.mock("../Button/Button", () => ({
  Button: ({
    children,
    type,
    variant,
    onClick,
  }: {
    children: React.ReactNode;
    type?: "button" | "submit" | "reset";
    variant?: "primary" | "secondary" | "danger";
    onClick?: () => void;
  }) => (
    <button type={type} data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe("ArticleItem", () => {
  const defaultProps = {
    id: "test-id",
    uri: "at://did:plc:test/app.bsky.feed.post/testrkey",
    title: "Test Article Title",
    createdAt: "2024-01-15T10:30:00.000Z",
    cid: "bafyreoexamplecid",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useModalMock.isOpen = false;
  });

  describe("rendering", () => {
    it("should render as a list item", () => {
      render(<ArticleItem {...defaultProps} />);
      const listItem = screen.getByRole("listitem");
      expect(listItem).toBeInTheDocument();
    });

    it("should display the article title", () => {
      render(<ArticleItem {...defaultProps} />);
      expect(screen.getByText("Test Article Title")).toBeInTheDocument();
    });

    it("should display the formatted date", () => {
      render(<ArticleItem {...defaultProps} />);
      const expectedDate = new Date(
        defaultProps.createdAt,
      ).toLocaleDateString();
      expect(screen.getByText(expectedDate)).toBeInTheDocument();
    });

    it("should render the drag handle icon", () => {
      render(<ArticleItem {...defaultProps} />);
      const icon = screen.getByTestId("svg-icon");
      expect(icon).toHaveAttribute("data-icon", "drag-handle");
    });

    it("should not render date when createdAt is not provided", () => {
      render(<ArticleItem {...defaultProps} createdAt="" />);
      const listItem = screen.getByRole("listitem");
      const dateElements = listItem.querySelectorAll("span");
      expect(dateElements).toHaveLength(0);
    });
  });

  describe("buttons", () => {
    it("should render View button linking to view page", () => {
      render(<ArticleItem {...defaultProps} />);
      const viewLink = screen.getByRole("link", { name: /view/i });
      expect(viewLink).toBeInTheDocument();
      expect(viewLink).toHaveAttribute(
        "href",
        `/article/view/${defaultProps.uri.split("/").pop()}`,
      );
    });

    it("should render Edit button linking to edit page", () => {
      render(<ArticleItem {...defaultProps} />);
      const editLink = screen.getByRole("link", { name: /edit/i });
      expect(editLink).toBeInTheDocument();
      expect(editLink).toHaveAttribute(
        "href",
        `/article/edit/${defaultProps.uri.split("/").pop()}`,
      );
    });

    it("should render Delete button in pds mode", () => {
      render(<ArticleItem {...defaultProps} mode="pds" />);
      expect(
        screen.getByRole("button", { name: /delete/i }),
      ).toBeInTheDocument();
    });

    it("should render Remove button in site mode", () => {
      render(<ArticleItem {...defaultProps} mode="site" />);
      expect(
        screen.getByRole("button", { name: /remove/i }),
      ).toBeInTheDocument();
    });
  });

  describe("delete functionality (pds mode)", () => {
    it("should include hidden inputs for delete intent in pds mode", () => {
      render(<ArticleItem {...defaultProps} mode="pds" />);
      const listItem = screen.getByRole("listitem");
      const scopedForm = listItem.querySelector("form");
      expect(scopedForm).toBeInTheDocument();
      const intentInput = scopedForm?.querySelector('input[name="_intent"]');
      const rkeyInput = scopedForm?.querySelector('input[name="rkey"]');
      const cidInput = scopedForm?.querySelector('input[name="cid"]');

      expect(intentInput).toHaveValue("deleteArticle");
      expect(rkeyInput).toHaveValue(defaultProps.uri.split("/").pop());
      expect(cidInput).toHaveValue(defaultProps.cid);
    });

    it("should open modal when Delete button is clicked", () => {
      render(<ArticleItem {...defaultProps} mode="pds" />);
      const deleteButton = screen.getByRole("button", { name: /delete/i });
      fireEvent.click(deleteButton);

      expect(useModalMock.open).toHaveBeenCalled();
    });

    it("should submit the form when confirm delete is clicked", () => {
      useModalMock.isOpen = true;
      const submitSpy = vi
        .spyOn(HTMLFormElement.prototype, "submit")
        .mockImplementation(() => {});

      render(<ArticleItem {...defaultProps} mode="pds" />);
      // Click the confirm Delete button inside the modal
      const modal = screen.getByRole("dialog");
      const confirmButton = within(modal).getByRole("button", {
        name: /delete/i,
      });
      fireEvent.click(confirmButton);

      expect(useModalMock.close).toHaveBeenCalled();
      expect(submitSpy).toHaveBeenCalled();
      submitSpy.mockRestore();
    });
  });

  describe("remove functionality (site mode)", () => {
    it("should include hidden inputs for remove intent in site mode", () => {
      render(<ArticleItem {...defaultProps} mode="site" />);
      const listItem = screen.getByRole("listitem");
      const scopedForm = listItem.querySelector("form");
      expect(scopedForm).toBeInTheDocument();
      const intentInput = scopedForm?.querySelector('input[name="_intent"]');
      const uriInput = scopedForm?.querySelector('input[name="uri"]');

      expect(intentInput).toHaveValue("removeArticle");
      expect(uriInput).toHaveValue(defaultProps.uri);
    });

    it("should show Remove in modal title in site mode", () => {
      useModalMock.isOpen = true;

      render(<ArticleItem {...defaultProps} mode="site" />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Remove from Site");
      expect(dialog).toHaveTextContent(
        `Remove "${defaultProps.title}" from this site?`,
      );
    });
  });

  describe("modal", () => {
    it("should not render modal when not open", () => {
      render(<ArticleItem {...defaultProps} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should show delete confirmation message in pds mode", () => {
      useModalMock.isOpen = true;

      render(<ArticleItem {...defaultProps} mode="pds" />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Delete Article");
      expect(dialog).toHaveTextContent(
        `Are you sure you want to delete "${defaultProps.title}"?`,
      );
    });

    it("should have Cancel and Delete buttons in modal", () => {
      useModalMock.isOpen = true;

      render(<ArticleItem {...defaultProps} mode="pds" />);
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
      // There are two Delete buttons - one in the list item and one in the modal
      const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
      expect(deleteButtons).toHaveLength(2);
    });
  });

  describe("drag and drop", () => {
    it("should render drag handle with icon", () => {
      const { container } = render(<ArticleItem {...defaultProps} />);
      const svgIcon = container.querySelector('[data-testid="svg-icon"]');
      expect(svgIcon).toBeInTheDocument();
      expect(svgIcon).toHaveAttribute("data-icon", "drag-handle");
    });

    it("should have reduced opacity when dragging", async () => {
      const { useSortable } = await import("@dnd-kit/sortable");
      vi.mocked(useSortable).mockReturnValue({
        attributes: {
          role: "button",
          tabIndex: 0,
          "aria-disabled": false,
          "aria-pressed": false,
          "aria-roledescription": "sortable",
          "aria-describedby": "",
        } as any,
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: "transform 250ms ease",
        isDragging: true,
      } as any);

      const { container } = render(<ArticleItem {...defaultProps} />);
      const listItem = container.querySelector("li");
      expect(listItem?.style.opacity).toBe("0.4");
    });
  });

  describe("ArticleItemPreview", () => {
    it("should render preview without buttons", () => {
      render(
        <ArticleItemPreview
          title="Preview Title"
          uri="at://preview/uri"
          createdAt="2024-01-15T10:30:00.000Z"
        />,
      );

      expect(screen.getByText("Preview Title")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("should render preview as a list item", () => {
      const { container } = render(
        <ArticleItemPreview
          title="Preview Title"
          uri="at://preview/uri"
          createdAt="2024-01-15T10:30:00.000Z"
        />,
      );

      expect(container.querySelector("li")).toBeInTheDocument();
    });
  });
});
