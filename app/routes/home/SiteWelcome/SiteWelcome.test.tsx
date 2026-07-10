import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, it, expect } from "vitest";
import { SiteWelcome } from "./SiteWelcome";

const renderWelcome = (userName: string | null = "norobots.blog") => {
  const router = createMemoryRouter(
    [
      { path: "/", element: <SiteWelcome userName={userName} /> },
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

  it("has a primary CTA linking to article creation", () => {
    renderWelcome();
    const link = screen.getByRole("link", {
      name: "Write your first article",
    });
    expect(link).toHaveAttribute("href", "/article/create");
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
});
