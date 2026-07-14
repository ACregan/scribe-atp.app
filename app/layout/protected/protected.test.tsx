import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./protected";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

describe("protected layout ErrorBoundary", () => {
  it("bug fix: renders in place, not replacing the whole app shell (core.tsx keeps rendering as this route's ancestor)", () => {
    render(<ErrorBoundary error={new Error("boom")} params={{}} />);
    // A link back to the dashboard confirms this renders real navigable
    // content, not the bare root.tsx fallback that used to catch every
    // error under this layout.
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "/");
  });

  it("shows a 404-specific message for a thrown 404 Response", () => {
    // isRouteErrorResponse duck-types on {status, statusText, internal,
    // data} — the shape React Router's own error handling attaches to a
    // thrown Response, not a plain Response instance.
    render(
      <ErrorBoundary
        error={{
          status: 404,
          statusText: "Not Found",
          internal: false,
          data: "Not Found",
        }}
        params={{}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /not found/i }),
    ).toBeInTheDocument();
  });

  it("shows a generic message for a non-404 error", () => {
    render(<ErrorBoundary error={new Error("boom")} params={{}} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
