import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SiteTile } from "./SiteTile";
import type { SiteData } from "./SiteTile";

vi.mock("react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("~/components/Button/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    className,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    className?: string;
    type?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      className={className}
      type={type as "button" | "submit" | "reset" | undefined}
    >
      {children}
    </button>
  ),
}));

vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => (
    <svg data-testid="svg-icon" data-icon={name} />
  ),
  SvgImageList: { Gear: "Gear", Trash: "Trash" },
}));

const baseSite: SiteData = {
  rkey: "my-blog",
  cid: "bafy123",
  title: "My Blog",
  url: "myblog.com",
  urlPrefix: "posts",
};

describe("SiteTile", () => {
  const onDelete = vi.fn();

  beforeEach(() => {
    onDelete.mockClear();
  });

  it("renders as a list item", () => {
    const { container } = render(<SiteTile site={baseSite} onDelete={onDelete} />);
    expect(container.querySelector("li")).toBeInTheDocument();
  });

  it("renders the site title", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    expect(screen.getByText("My Blog")).toBeInTheDocument();
  });

  it("renders the composed url (url + urlPrefix)", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    expect(screen.getByText("myblog.com/posts")).toBeInTheDocument();
  });

  it("renders just the url when urlPrefix is empty", () => {
    render(<SiteTile site={{ ...baseSite, urlPrefix: "" }} onDelete={onDelete} />);
    expect(screen.getByText("myblog.com")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(
      <SiteTile
        site={{ ...baseSite, description: "A great blog about things" }}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText("A great blog about things")).toBeInTheDocument();
  });

  it("renders no description when omitted", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    expect(screen.queryByText("A great blog about things")).not.toBeInTheDocument();
  });

  it("renders a logo image when logoImageUrl is provided", () => {
    render(
      <SiteTile
        site={{ ...baseSite, logoImageUrl: "https://example.com/logo.png" }}
        onDelete={onDelete}
      />,
    );
    const logo = screen.getByRole("img", { name: /my blog logo/i });
    expect(logo).toHaveAttribute("src", "https://example.com/logo.png");
  });

  it("renders no logo when logoImageUrl is omitted", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("Manage button links to /article/list/:rkey", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    const manageLink = screen.getByRole("link", { name: /manage/i });
    expect(manageLink).toHaveAttribute("href", "/article/list/my-blog");
  });

  it("Configure button links to /site/:rkey/configure", () => {
    const { container } = render(<SiteTile site={baseSite} onDelete={onDelete} />);
    // The configure link wraps an icon-only button so has no accessible text name.
    const configureLink = container.querySelector('a[href="/site/my-blog/configure"]');
    expect(configureLink).toBeInTheDocument();
  });

  it("calls onDelete with the site data when Delete is clicked", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    // Delete button is the one without a wrapping link
    const buttons = screen.getAllByRole("button");
    const deleteButton = buttons.find(
      (b) => b.getAttribute("data-variant") === "danger",
    )!;
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledWith(baseSite);
  });

  it("disables the Delete button when isDeleting is true", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} isDeleting />);
    const buttons = screen.getAllByRole("button");
    const deleteButton = buttons.find(
      (b) => b.getAttribute("data-variant") === "danger",
    )!;
    expect(deleteButton).toBeDisabled();
  });

  it("does not disable the Delete button by default", () => {
    render(<SiteTile site={baseSite} onDelete={onDelete} />);
    const buttons = screen.getAllByRole("button");
    const deleteButton = buttons.find(
      (b) => b.getAttribute("data-variant") === "danger",
    )!;
    expect(deleteButton).not.toBeDisabled();
  });
});
