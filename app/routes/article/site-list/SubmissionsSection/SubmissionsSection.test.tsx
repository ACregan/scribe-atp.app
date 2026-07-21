import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubmissionsSection } from "./SubmissionsSection";
import type { SubmissionListEntry } from "../siteTree";

vi.mock("react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const submission: SubmissionListEntry = {
  contributorDid: "did:plc:alice",
  rkey: "abc123",
  documentTitle: "A Great Article",
  submittedAt: "2026-01-01T00:00:00.000Z",
  contributorHandle: "alice.bsky.social",
  contributorDisplayName: "Alice",
};

describe("SubmissionsSection", () => {
  it("renders nothing when there are no submissions", () => {
    const { container } = render(<SubmissionsSection submissions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the document title, submitter, and a Review link per submission", () => {
    render(<SubmissionsSection submissions={[submission]} />);

    expect(screen.getByText("A Great Article")).toBeInTheDocument();
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();

    const reviewLink = screen.getByRole("link", { name: "Review" });
    expect(reviewLink).toHaveAttribute(
      "href",
      "/article/review/did:plc:alice/abc123",
    );
  });

  it("falls back to the contributor's handle when no displayName is present", () => {
    const { contributorDisplayName: _displayName, ...withoutDisplayName } = submission;
    render(<SubmissionsSection submissions={[withoutDisplayName]} />);
    expect(screen.getByText(/by alice.bsky.social/)).toBeInTheDocument();
  });

  it("renders the contributor's avatar when present", () => {
    const { container } = render(
      <SubmissionsSection
        submissions={[
          { ...submission, contributorAvatar: "https://example.com/alice.jpg" },
        ]}
      />,
    );
    // alt="" (decorative — the name is already shown as text) excludes the
    // image from the accessibility tree, so query the DOM directly rather
    // than by role.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/alice.jpg",
    );
  });

  it("renders no avatar image when contributorAvatar is absent", () => {
    const { container } = render(<SubmissionsSection submissions={[submission]} />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders one row per submission", () => {
    const second: SubmissionListEntry = {
      ...submission,
      rkey: "def456",
      documentTitle: "Another Article",
    };
    render(<SubmissionsSection submissions={[submission, second]} />);

    expect(screen.getByText("A Great Article")).toBeInTheDocument();
    expect(screen.getByText("Another Article")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Review" })).toHaveLength(2);
  });
});
