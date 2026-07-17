import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContributorsSection } from "./ContributorsSection";
import type { RosterEntry } from "../siteTree";

const alice: RosterEntry = {
  did: "did:plc:alice",
  addedAt: "2026-01-01T00:00:00.000Z",
  status: "accepted",
  handle: "alice.bsky.social",
  displayName: "Alice",
  avatar: "https://example.com/alice.png",
};

const bob: RosterEntry = {
  did: "did:plc:bob",
  addedAt: "2026-01-02T00:00:00.000Z",
  status: "invited",
  handle: "bob.bsky.social",
};

describe("ContributorsSection", () => {
  it("shows an empty-state message when there are no contributors", () => {
    render(
      <ContributorsSection
        contributors={[]}
        onRemove={vi.fn()}
        removingDid={null}
        isOwner
      />,
    );
    expect(screen.getByText(/No contributors yet/)).toBeInTheDocument();
  });

  it("renders each contributor's display name, handle, and status pill", () => {
    render(
      <ContributorsSection
        contributors={[alice, bob]}
        onRemove={vi.fn()}
        removingDid={null}
        isOwner
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("@alice.bsky.social")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();

    // Bob has no displayName — falls back to handle as the primary label.
    expect(screen.getByText("bob.bsky.social")).toBeInTheDocument();
    expect(screen.getByText("@bob.bsky.social")).toBeInTheDocument();
    expect(screen.getByText("invited")).toBeInTheDocument();
  });

  it("renders an avatar image only when one is present", () => {
    // Decorative (alt="") — not exposed via role "img", so query the DOM
    // directly rather than through the accessibility tree.
    const { container } = render(
      <ContributorsSection
        contributors={[alice, bob]}
        onRemove={vi.fn()}
        removingDid={null}
        isOwner
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("shows a Remove button per contributor when isOwner, and calls onRemove with their did", () => {
    const onRemove = vi.fn();
    render(
      <ContributorsSection
        contributors={[alice]}
        onRemove={onRemove}
        removingDid={null}
        isOwner
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("did:plc:alice");
  });

  it("hides Remove buttons entirely for a read-only (non-owner) viewer", () => {
    render(
      <ContributorsSection
        contributors={[alice]}
        onRemove={vi.fn()}
        removingDid={null}
        isOwner={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows a disabled, spinner-style label on the entry currently being removed", () => {
    render(
      <ContributorsSection
        contributors={[alice, bob]}
        onRemove={vi.fn()}
        removingDid="did:plc:alice"
        isOwner
      />,
    );
    const removingButton = screen.getByRole("button", { name: "Removing…" });
    expect(removingButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).not.toBeDisabled();
  });
});
