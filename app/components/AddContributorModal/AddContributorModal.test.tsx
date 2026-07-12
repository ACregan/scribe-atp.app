import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddContributorModal } from "./AddContributorModal";

const fetcherMock = vi.hoisted(() => ({
  state: "idle" as "idle" | "loading" | "submitting",
  data: undefined as unknown,
  load: vi.fn(),
}));

vi.mock("react-router", () => ({
  useFetcher: () => fetcherMock,
}));

function setFetcherData(data: unknown, state: "idle" | "loading" = "idle") {
  fetcherMock.data = data;
  fetcherMock.state = state;
}

// The fetcher mock's `load` doesn't actually populate `data` (that's set via
// setFetcherData above, ahead of time) — this just triggers the component's
// own `hasLookedUp` gate, matching a real "type a handle, click Look up" flow.
function lookUp(handle = "alice.bsky.app") {
  fireEvent.change(screen.getByLabelText("Bluesky handle"), {
    target: { value: handle },
  });
  fireEvent.click(screen.getByRole("button", { name: /look up/i }));
}

const noop = () => {};

beforeEach(() => {
  fetcherMock.state = "idle";
  fetcherMock.data = undefined;
  fetcherMock.load.mockClear();
});

describe("AddContributorModal", () => {
  it("disables Look up until a handle is typed", () => {
    render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Look up" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Bluesky handle"), {
      target: { value: "alice.bsky.app" },
    });
    expect(screen.getByRole("button", { name: "Look up" })).not.toBeDisabled();
  });

  it("calls the fetcher with the encoded handle on Look up", () => {
    render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    lookUp("alice bsky.app");
    expect(fetcherMock.load).toHaveBeenCalledWith(
      "/article/resolve-contributor?handle=alice%20bsky.app",
    );
  });

  it("shows the resolved profile, including avatar, once the fetcher resolves", () => {
    setFetcherData({
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
      avatar: "https://cdn.bsky.app/avatar.jpg",
    });
    const { container } = render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    lookUp();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("@alice.bsky.app")).toBeInTheDocument();
    // Decorative avatar (alt="") is intentionally presentational, so it
    // isn't queryable via getByRole("img") — see ImagePickerModal's
    // documented convention for empty-alt decorative images.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.bsky.app/avatar.jpg",
    );
  });

  it("shows an error message when the fetcher returns an error", () => {
    setFetcherData({ error: "Bluesky account not found" });
    render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    lookUp();
    expect(screen.getByText("Bluesky account not found")).toBeInTheDocument();
  });

  it("clears a stale error from a previous session when the modal is reopened", () => {
    setFetcherData({ error: "Bluesky account not found" });
    const { rerender } = render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    lookUp();
    expect(screen.getByText("Bluesky account not found")).toBeInTheDocument();

    // Modal never unmounts its content (only toggles the dialog's `open`
    // attribute) — so close/reopen via isOpen is a genuine close/reopen of
    // the same component instance, with the fetcher still holding the
    // failed lookup's data from the prior session.
    rerender(
      <AddContributorModal
        isOpen={false}
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    rerender(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    expect(
      screen.queryByText("Bluesky account not found"),
    ).not.toBeInTheDocument();
  });

  it("shows a warning and disables Add when the resolved profile is already a contributor", () => {
    setFetcherData({
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
    });
    render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={["did:plc:abc"]}
      />,
    );
    lookUp();
    expect(
      screen.getByText("This person is already a contributor on this article."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Contributor" }),
    ).toBeDisabled();
  });

  it("reveals a custom role input and keeps Add disabled until it's filled in", () => {
    setFetcherData({
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
    });
    render(
      <AddContributorModal
        isOpen
        onClose={noop}
        onAdd={noop}
        existingDids={[]}
      />,
    );
    lookUp();
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "__custom__" },
    });
    expect(
      screen.getByRole("button", { name: "Add Contributor" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Custom role"), {
      target: { value: "Fact Checker" },
    });
    expect(
      screen.getByRole("button", { name: "Add Contributor" }),
    ).not.toBeDisabled();
  });

  it("calls onAdd with the contributor and avatar, then onClose", () => {
    setFetcherData({
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
      avatar: "https://cdn.bsky.app/avatar.jpg",
    });
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(
      <AddContributorModal
        isOpen
        onClose={onClose}
        onAdd={onAdd}
        existingDids={[]}
      />,
    );
    lookUp();
    fireEvent.click(screen.getByRole("button", { name: "Add Contributor" }));
    expect(onAdd).toHaveBeenCalledWith(
      { did: "did:plc:abc", displayName: "Alice", role: "Editor" },
      "https://cdn.bsky.app/avatar.jpg",
    );
    expect(onClose).toHaveBeenCalled();
  });
});
