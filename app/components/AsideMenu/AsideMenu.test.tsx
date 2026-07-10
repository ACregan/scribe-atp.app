import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import AsideMenu from "./AsideMenu";

vi.mock("../Tooltip/Tooltip", () => ({
  default: ({
    children,
    anchorName,
    anchorPosition,
    anchorContent,
  }: {
    children: React.ReactNode;
    anchorName: string;
    anchorPosition: string;
    anchorContent: React.ReactNode;
  }) => (
    <div
      data-testid={`tooltip-${anchorName}`}
      data-anchor-position={anchorPosition}
    >
      {children}
      <div data-testid={`tooltip-content-${anchorName}`}>{anchorContent}</div>
    </div>
  ),
  TooltipBubble: ({
    children,
    pointerLocation,
  }: {
    children: React.ReactNode;
    pointerLocation: string;
  }) => <div data-testid={`tooltip-bubble-${pointerLocation}`}>{children}</div>,
}));

vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name, fill }: { name: string; fill?: string }) => (
    <svg data-testid={`icon-${name}`} fill={fill} />
  ),
  SvgImageList: {
    Home: "home",
    Website: "website",
    Folder: "folder",
    Documents: "documents",
    Document: "document",
    Image: "image",
    BarChart: "barchart",
    Exit: "exit",
    ChevronDown: "chevrondown",
  },
}));

vi.mock("../Button/Button", () => ({
  Button: ({
    children,
    type,
    variant,
    className,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    type?: "submit" | "button";
    variant?: string;
    className?: string;
    "aria-label"?: string;
  }) => (
    <button
      type={type}
      data-variant={variant}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
}));

const renderMenu = (
  expanded = false,
  onToggle = vi.fn(),
  hasSites = true,
  hasArticles = true,
) => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <AsideMenu
            expanded={expanded}
            onToggle={onToggle}
            hasSites={hasSites}
            hasArticles={hasArticles}
          />
        ),
      },
      { path: "/sites", element: null },
      { path: "/groups", element: null },
      { path: "/article/list", element: null },
      { path: "/article/create", element: null },
      { path: "/images", element: null },
      { path: "/insights", element: null },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
};

describe("AsideMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render the aside element", () => {
      renderMenu();
      expect(screen.getByRole("complementary")).toBeInTheDocument();
    });

    it("should render SVG icons for each menu item", () => {
      renderMenu();
      expect(screen.getByTestId("icon-home")).toBeInTheDocument();
      expect(screen.getByTestId("icon-website")).toBeInTheDocument();
      expect(screen.getByTestId("icon-folder")).toBeInTheDocument();
      expect(screen.getByTestId("icon-documents")).toBeInTheDocument();
      expect(screen.getByTestId("icon-document")).toBeInTheDocument();
      expect(screen.getByTestId("icon-image")).toBeInTheDocument();
      expect(screen.getByTestId("icon-exit")).toBeInTheDocument();
    });

    it("should render exactly two buttons: toggle and logout", () => {
      renderMenu();
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(2);
    });

    it("each button should contain an SVG icon", () => {
      renderMenu();
      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button.querySelector("svg")).toBeInTheDocument();
      });
    });
  });

  describe("Collapsed mode (expanded=false)", () => {
    it("should render tooltips for each nav item", () => {
      renderMenu();
      expect(screen.getByTestId("tooltip-home")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-site-management")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-group-list")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-article-list")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-create-article")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-image-library")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-insights")).toBeInTheDocument();
    });

    it("should render tooltip bubbles with left pointer for all items", () => {
      renderMenu();
      // 7 nav tooltips + 1 logout tooltip = 8 bubbles
      const bubbles = screen.getAllByTestId("tooltip-bubble-left");
      expect(bubbles).toHaveLength(8);
    });

    it("should give each nav link an aria-label", () => {
      renderMenu();
      expect(
        screen.getByRole("link", { name: "Dashboard" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sites" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Groups" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Articles" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Create New Article" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Image Library" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Insights" }),
      ).toBeInTheDocument();
    });

    it("toggle button should have aria-label 'Expand navigation'", () => {
      renderMenu();
      expect(
        screen.getByRole("button", { name: "Expand navigation" }),
      ).toBeInTheDocument();
    });
  });

  describe("Expanded mode (expanded=true)", () => {
    it("should render visible label text for each menu item", () => {
      renderMenu(true);
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Sites")).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
      expect(screen.getByText("Articles")).toBeInTheDocument();
      expect(screen.getByText("Create New Article")).toBeInTheDocument();
      expect(screen.getByText("Image Library")).toBeInTheDocument();
      expect(screen.getByText("Insights")).toBeInTheDocument();
    });

    it("should not render nav item tooltips in expanded mode", () => {
      renderMenu(true);
      expect(screen.queryByTestId("tooltip-home")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("tooltip-site-management"),
      ).not.toBeInTheDocument();
    });

    it("toggle button should have aria-label 'Collapse navigation'", () => {
      renderMenu(true);
      expect(
        screen.getByRole("button", { name: "Collapse navigation" }),
      ).toBeInTheDocument();
    });
  });

  describe("Toggle behaviour", () => {
    it("should call onToggle when toggle button is clicked", async () => {
      const onToggle = vi.fn();
      renderMenu(false, onToggle);
      await userEvent.click(
        screen.getByRole("button", { name: "Expand navigation" }),
      );
      expect(onToggle).toHaveBeenCalledOnce();
    });
  });

  describe("Navigation links", () => {
    it("should render seven nav links with correct hrefs", () => {
      renderMenu();
      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(7);
      const hrefs = links.map((l) => l.getAttribute("href"));
      expect(hrefs).toContain("/");
      expect(hrefs).toContain("/sites");
      expect(hrefs).toContain("/groups");
      expect(hrefs).toContain("/article/list");
      expect(hrefs).toContain("/article/create");
      expect(hrefs).toContain("/images");
      expect(hrefs).toContain("/insights");
    });

    it("should have links in correct order", () => {
      renderMenu();
      const links = screen.getAllByRole("link");
      expect(links[0]).toHaveAttribute("href", "/");
      expect(links[1]).toHaveAttribute("href", "/sites");
      expect(links[2]).toHaveAttribute("href", "/groups");
      expect(links[3]).toHaveAttribute("href", "/article/list");
      expect(links[4]).toHaveAttribute("href", "/article/create");
      expect(links[5]).toHaveAttribute("href", "/images");
      expect(links[6]).toHaveAttribute("href", "/insights");
    });
  });

  describe("Layout containers", () => {
    it("should render menu links in the top container", () => {
      renderMenu();
      const aside = screen.getByRole("complementary");
      const topContainer = aside.querySelectorAll("div")[0];
      expect(topContainer.querySelectorAll("a")).toHaveLength(7);
    });

    it("should render logout form in the bottom container", () => {
      renderMenu();
      const aside = screen.getByRole("complementary");
      const bottomContainer = Array.from(aside.querySelectorAll("div")).find(
        (el) => el.querySelector("form"),
      );
      expect(bottomContainer).toBeInTheDocument();
    });
  });

  describe("Logout", () => {
    it("should render logout form with POST method and /logout action", () => {
      renderMenu();
      const logoutButton = screen.getByRole("button", { name: "Logout" });
      const form = logoutButton.closest("form");
      expect(form).toHaveAttribute("method", "post");
      expect(form).toHaveAttribute("action", "/logout");
    });

    it("should render logout button as submit with danger variant", () => {
      renderMenu();
      const logoutButton = screen.getByRole("button", { name: "Logout" });
      expect(logoutButton).toHaveAttribute("type", "submit");
      expect(logoutButton).toHaveAttribute("data-variant", "danger");
    });

    it("should render logout button with exit icon", () => {
      renderMenu();
      const logoutButton = screen.getByRole("button", { name: "Logout" });
      expect(logoutButton.querySelector("svg")).toHaveAttribute(
        "data-testid",
        "icon-exit",
      );
    });

    it("should always show logout tooltip regardless of expanded state", () => {
      renderMenu(true);
      expect(screen.getByTestId("tooltip-logout-button")).toBeInTheDocument();
    });
  });

  describe("Disabled state — no sites", () => {
    it("should not render Groups or Insights as links when hasSites is false", () => {
      renderMenu(false, vi.fn(), false, true);
      expect(
        screen.queryByRole("link", { name: "Groups" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Insights" }),
      ).not.toBeInTheDocument();
    });

    it("should mark Groups and Insights aria-disabled with a reason", () => {
      renderMenu(false, vi.fn(), false, true);
      expect(
        screen.getByLabelText("Groups — Add a Site to enable"),
      ).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.getByLabelText("Insights — Add a Site to enable"),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("should still render Articles as an enabled link when hasSites is false but hasArticles is true", () => {
      renderMenu(false, vi.fn(), false, true);
      expect(
        screen.getByRole("link", { name: "Articles" }),
      ).toBeInTheDocument();
    });
  });

  describe("Disabled state — no articles", () => {
    it("should not render Articles as a link when hasArticles is false", () => {
      renderMenu(false, vi.fn(), true, false);
      expect(
        screen.queryByRole("link", { name: "Articles" }),
      ).not.toBeInTheDocument();
    });

    it("should mark Articles aria-disabled with a reason", () => {
      renderMenu(false, vi.fn(), true, false);
      expect(
        screen.getByLabelText("Articles — Create an article to enable"),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("should still render Groups and Insights as enabled links when hasArticles is false but hasSites is true", () => {
      renderMenu(false, vi.fn(), true, false);
      expect(screen.getByRole("link", { name: "Groups" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Insights" }),
      ).toBeInTheDocument();
    });
  });
});
