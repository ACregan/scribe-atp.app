import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AsideMenu from "./AsideMenu";

// Mock Tooltip component
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

// Mock SvgIcon component
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
    Tiles: "tiles",
    Exit: "exit",
  },
}));

// Mock Button component
vi.mock("../Button/Button", () => ({
  Button: ({
    children,
    type,
    variant,
    className,
  }: {
    children: React.ReactNode;
    type?: "submit" | "button";
    variant?: string;
    className?: string;
  }) => (
    <button type={type} data-variant={variant} className={className}>
      {children}
    </button>
  ),
}));

const renderWithRouter = (ui: React.ReactElement) => {
  const router = createMemoryRouter(
    [
      { path: "/", element: ui },
      { path: "/sites", element: null },
      { path: "/groups", element: null },
      { path: "/article/list", element: null },
      { path: "/article/create", element: null },
      { path: "/images", element: null },
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
      renderWithRouter(<AsideMenu />);
      const aside = screen.getByRole("complementary");
      expect(aside).toBeInTheDocument();
    });

    it("should render all six menu items", () => {
      renderWithRouter(<AsideMenu />);

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Sites")).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
      expect(screen.getByText("Articles")).toBeInTheDocument();
      expect(screen.getByText("Create New Article")).toBeInTheDocument();
      expect(screen.getByText("Image Library")).toBeInTheDocument();
    });

    it("should render the logout button", () => {
      renderWithRouter(<AsideMenu />);
      expect(screen.getByText("Logout")).toBeInTheDocument();
    });

    it("should render SVG icons for each menu item", () => {
      renderWithRouter(<AsideMenu />);

      expect(screen.getByTestId("icon-home")).toBeInTheDocument();
      expect(screen.getByTestId("icon-website")).toBeInTheDocument();
      expect(screen.getByTestId("icon-folder")).toBeInTheDocument();
      expect(screen.getByTestId("icon-documents")).toBeInTheDocument();
      expect(screen.getByTestId("icon-document")).toBeInTheDocument();
      expect(screen.getByTestId("icon-tiles")).toBeInTheDocument();
      expect(screen.getByTestId("icon-exit")).toBeInTheDocument();
    });

    it("should render tooltips for each menu item", () => {
      renderWithRouter(<AsideMenu />);

      expect(screen.getByTestId("tooltip-home")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-site-management")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-group-list")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-article-list")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-create-article")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-image-library")).toBeInTheDocument();
      expect(screen.getByTestId("tooltip-logout-button")).toBeInTheDocument();
    });

    it("should render tooltip bubbles with correct pointer location", () => {
      renderWithRouter(<AsideMenu />);

      const tooltipBubbles = screen.getAllByTestId("tooltip-bubble-left");
      expect(tooltipBubbles).toHaveLength(7); // 6 menu items + logout
    });
  });

  describe("Menu Item Structure", () => {
    it("should render menu items as NavLink components", () => {
      renderWithRouter(<AsideMenu />);

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(6);

      const hrefs = links.map((link) => link.getAttribute("href"));
      expect(hrefs).toContain("/");
      expect(hrefs).toContain("/sites");
      expect(hrefs).toContain("/groups");
      expect(hrefs).toContain("/article/list");
      expect(hrefs).toContain("/article/create");
      expect(hrefs).toContain("/images");
    });

    it("should render buttons inside each menu item link", () => {
      renderWithRouter(<AsideMenu />);

      const links = screen.getAllByRole("link");
      links.forEach((link) => {
        const button = link.querySelector("button");
        expect(button).toBeInTheDocument();
      });
    });

    it("should render SVG icons inside each button", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      // 6 menu buttons + 1 logout button
      expect(buttons).toHaveLength(7);

      buttons.forEach((button) => {
        const svg = button.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe("Layout and Containers", () => {
    it("should have separate containers for top and bottom buttons", () => {
      renderWithRouter(<AsideMenu />);

      const aside = screen.getByRole("complementary");
      const containers = aside.querySelectorAll("div");

      expect(containers.length).toBeGreaterThanOrEqual(2);
    });

    it("should render menu items in the top container", () => {
      renderWithRouter(<AsideMenu />);

      const aside = screen.getByRole("complementary");
      const containers = aside.querySelectorAll("div");

      const topContainer = containers[0];
      const links = topContainer.querySelectorAll("a");
      expect(links).toHaveLength(6);
    });

    it("should render logout form in the bottom container", () => {
      renderWithRouter(<AsideMenu />);

      const aside = screen.getByRole("complementary");
      const containers = aside.querySelectorAll("div");

      const bottomContainer = Array.from(containers).find((container) =>
        container.querySelector("form"),
      );
      expect(bottomContainer).toBeInTheDocument();
    });
  });

  describe("Logout Functionality", () => {
    it("should render a form for logout", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];
      const form = logoutButton.closest("form");
      expect(form).toBeInTheDocument();
    });

    it("should render logout form with POST method", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];
      const form = logoutButton.closest("form");
      expect(form).toHaveAttribute("method", "post");
    });

    it("should render logout form with correct action", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];
      const form = logoutButton.closest("form");
      expect(form).toHaveAttribute("action", "/logout");
    });

    it("should render logout button as submit type", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];

      const form = logoutButton.closest("form");
      expect(form).toBeInTheDocument();
      expect(logoutButton).toHaveAttribute("type", "submit");
    });

    it("should render logout button with danger variant", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];

      expect(logoutButton).toHaveAttribute("data-variant", "danger");
    });

    it("should render logout button with exit icon", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];
      const svg = logoutButton.querySelector("svg");

      expect(svg).toHaveAttribute("data-testid", "icon-exit");
    });

    it("should render logout button with white fill on icon", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      const logoutButton = buttons[buttons.length - 1];
      const svg = logoutButton.querySelector("svg");

      expect(svg).toHaveAttribute("fill", "white");
    });
  });

  describe("Tooltip Configuration", () => {
    it("should render tooltips with right anchor position", () => {
      renderWithRouter(<AsideMenu />);

      const tooltips = screen.getAllByTestId(/tooltip-(?!content|bubble)/);
      tooltips.forEach((tooltip) => {
        expect(tooltip).toHaveAttribute("data-anchor-position", "right");
      });
    });

    it("should render tooltip content with strong labels", () => {
      renderWithRouter(<AsideMenu />);

      const tooltipContents = screen.getAllByTestId(/tooltip-content-/);

      tooltipContents.forEach((content) => {
        const strong = content.querySelector("strong");
        expect(strong).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("should render buttons that are focusable", () => {
      renderWithRouter(<AsideMenu />);

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(7);

      buttons.forEach((button) => {
        expect(button).toBeVisible();
      });
    });
  });

  describe("Menu Configuration", () => {
    it("should have exactly 6 menu items", () => {
      renderWithRouter(<AsideMenu />);

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(6);
    });

    it("should have menu items in correct order", () => {
      renderWithRouter(<AsideMenu />);

      const links = screen.getAllByRole("link");
      expect(links[0]).toHaveAttribute("href", "/");
      expect(links[1]).toHaveAttribute("href", "/sites");
      expect(links[2]).toHaveAttribute("href", "/groups");
      expect(links[3]).toHaveAttribute("href", "/article/list");
      expect(links[4]).toHaveAttribute("href", "/article/create");
      expect(links[5]).toHaveAttribute("href", "/images");
    });

    it("should have correct labels for each menu item", () => {
      renderWithRouter(<AsideMenu />);

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Sites")).toBeInTheDocument();
      expect(screen.getByText("Groups")).toBeInTheDocument();
      expect(screen.getByText("Articles")).toBeInTheDocument();
      expect(screen.getByText("Create New Article")).toBeInTheDocument();
      expect(screen.getByText("Image Library")).toBeInTheDocument();
    });

    it("should have correct icons for each menu item", () => {
      renderWithRouter(<AsideMenu />);

      expect(screen.getByTestId("icon-home")).toBeInTheDocument();
      expect(screen.getByTestId("icon-website")).toBeInTheDocument();
      expect(screen.getByTestId("icon-folder")).toBeInTheDocument();
      expect(screen.getByTestId("icon-documents")).toBeInTheDocument();
      expect(screen.getByTestId("icon-document")).toBeInTheDocument();
      expect(screen.getByTestId("icon-tiles")).toBeInTheDocument();
    });
  });
});
