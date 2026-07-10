import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, it, expect } from "vitest";
import { SiteWelcome } from "./SiteWelcome";
import styles from "./SiteWelcome.module.css";

const renderWelcome = (
  userName: string | null = "norobots.blog",
  hasArticles = false,
) => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <SiteWelcome userName={userName} hasArticles={hasArticles} />
        ),
      },
      { path: "/article/create", element: null },
      { path: "/sites/new", element: null },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
};

describe("SiteWelcome", () => {
  it("renders the heading", () => {
    renderWelcome();
    expect(screen.getByText("Welcome to Scribe CMS.")).toBeInTheDocument();
  });

  it("greets the user by name when provided", () => {
    renderWelcome("norobots.blog");
    expect(screen.getByText("norobots.blog")).toBeInTheDocument();
  });

  it("omits the name when userName is null", () => {
    renderWelcome(null);
    expect(screen.getByText(/^Hello,$/)).toBeInTheDocument();
  });

  it("has a primary CTA linking to article creation, labeled 'first' when no articles exist", () => {
    renderWelcome("norobots.blog", false);
    const link = screen.getByRole("link", {
      name: "Write your first article",
    });
    expect(link).toHaveAttribute("href", "/article/create");
  });

  it("labels the primary CTA 'next' when articles already exist", () => {
    renderWelcome("norobots.blog", true);
    expect(
      screen.getByRole("link", { name: "Write your next article" }),
    ).toBeInTheDocument();
  });

  it("has a secondary link to configure a site", () => {
    renderWelcome();
    const link = screen.getByRole("link", { name: "Configure your Site" });
    expect(link).toHaveAttribute("href", "/sites/new");
  });

  it("only renders exactly one button (the primary CTA)", () => {
    renderWelcome();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("stretches to full width when articles already exist (2-column layout)", () => {
    const { container } = renderWelcome("norobots.blog", true);
    expect(container.querySelector(`.${styles.welcome}`)).toHaveClass(
      styles.fullWidth,
    );
  });

  it("stays at the constrained, centered width on the blank-slate layout", () => {
    const { container } = renderWelcome("norobots.blog", false);
    expect(container.querySelector(`.${styles.welcome}`)).not.toHaveClass(
      styles.fullWidth,
    );
  });
});
