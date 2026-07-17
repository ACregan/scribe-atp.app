import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SiteListItem from "./SiteListItem";
import type { SiteCard } from "~/components/types";

vi.mock("react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("~/components/Button/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("~/components/Tooltip/Tooltip", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipBubble: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("~/components/SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => <svg data-testid="svg-icon" data-icon={name} />,
  SvgImageList: { Gear: "Gear", Trash: "Trash" },
}));

const baseSite: SiteCard = {
  rkey: "my-blog",
  cid: "bafy123",
  title: "My Blog",
  url: "myblog.com",
  urlPrefix: "posts",
  groupCount: 0,
  articleCount: 0,
};

describe("SiteListItem", () => {
  it("renders the site title", () => {
    render(<SiteListItem site={baseSite} />);
    expect(screen.getByText("My Blog")).toBeInTheDocument();
  });

  it("renders group and article count pills when > 0", () => {
    render(<SiteListItem site={{ ...baseSite, groupCount: 2, articleCount: 5 }} />);
    expect(screen.getByText("2 GROUPS")).toBeInTheDocument();
    expect(screen.getByText("5 ARTICLES")).toBeInTheDocument();
  });

  // Phase 4 (discovery UX polish) — "requires attention" badge.
  it("renders a pending-submission badge when pendingSubmissionCount > 0", () => {
    render(<SiteListItem site={{ ...baseSite, pendingSubmissionCount: 4 }} />);
    expect(screen.getByText("4 PENDING SUBMISSIONS")).toBeInTheDocument();
  });

  it("uses singular wording for exactly one pending submission", () => {
    render(<SiteListItem site={{ ...baseSite, pendingSubmissionCount: 1 }} />);
    expect(screen.getByText("1 PENDING SUBMISSION")).toBeInTheDocument();
  });

  it("renders no pending-submission badge when the count is 0 or omitted", () => {
    render(<SiteListItem site={baseSite} />);
    expect(screen.queryByText(/PENDING SUBMISSION/)).not.toBeInTheDocument();
  });

  // Found live 2026-07-17 — Contributors had no link to a site they
  // contribute to; entries for those sites are now shown alongside the
  // caller's own, with owner-only actions hidden.
  describe("isContributor", () => {
    const contributorSite: SiteCard = { ...baseSite, isContributor: true };

    it("renders a Contributor pill", () => {
      render(<SiteListItem site={contributorSite} />);
      expect(screen.getByText("Contributor")).toBeInTheDocument();
    });

    it("renders no Contributor pill for the caller's own sites", () => {
      render(<SiteListItem site={baseSite} />);
      expect(screen.queryByText("Contributor")).not.toBeInTheDocument();
    });

    it("hides the Configure link", () => {
      const { container } = render(<SiteListItem site={contributorSite} />);
      expect(
        container.querySelector('a[href="/site/my-blog/configure"]'),
      ).not.toBeInTheDocument();
    });

    it("hides the Delete button even when onDelete is passed", () => {
      const onDelete = vi.fn();
      render(<SiteListItem site={contributorSite} onDelete={onDelete} />);
      const trashIcons = screen
        .queryAllByTestId("svg-icon")
        .filter((el) => el.getAttribute("data-icon") === "Trash");
      expect(trashIcons).toHaveLength(0);
    });

    it("still renders the Manage Articles button/link", () => {
      render(<SiteListItem site={contributorSite} />);
      const manageLink = screen.getByRole("link", { name: /manage articles/i });
      expect(manageLink).toHaveAttribute("href", "/article/list/my-blog");
    });
  });
});
