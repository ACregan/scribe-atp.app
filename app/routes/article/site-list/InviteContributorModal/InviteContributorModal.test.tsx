import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InviteContributorModal } from "./InviteContributorModal";

// InviteContributorModal calls useFetcher() twice with no `key` — resolve
// first, then invite — in that fixed order on every render (Rules of
// Hooks). This mock alternates by call parity rather than "first call ever"
// so it stays correct across re-renders, not just the initial mount.
const resolveFetcherMock = vi.hoisted(() => ({
  state: "idle" as "idle" | "loading" | "submitting",
  data: undefined as unknown,
  load: vi.fn(),
}));
const inviteFetcherMock = vi.hoisted(() => ({
  state: "idle" as "idle" | "loading" | "submitting",
  data: undefined as { ok?: boolean; error?: string } | undefined,
  submit: vi.fn(),
}));
let callParity = 0;

vi.mock("react-router", () => ({
  useFetcher: () => {
    const mock = callParity % 2 === 0 ? resolveFetcherMock : inviteFetcherMock;
    callParity++;
    return mock;
  },
}));

function lookUp(handle = "alice.bsky.app") {
  fireEvent.change(screen.getByLabelText("Bluesky handle"), {
    target: { value: handle },
  });
  fireEvent.click(screen.getByRole("button", { name: /look up/i }));
}

const noop = () => {};

beforeEach(() => {
  callParity = 0;
  resolveFetcherMock.state = "idle";
  resolveFetcherMock.data = undefined;
  resolveFetcherMock.load.mockClear();
  inviteFetcherMock.state = "idle";
  inviteFetcherMock.data = undefined;
  inviteFetcherMock.submit.mockClear();
});

describe("InviteContributorModal", () => {
  it("disables Look up until a handle is typed", () => {
    render(<InviteContributorModal isOpen onClose={noop} existingDids={[]} />);
    expect(screen.getByRole("button", { name: "Look up" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Bluesky handle"), {
      target: { value: "alice.bsky.app" },
    });
    expect(screen.getByRole("button", { name: "Look up" })).not.toBeDisabled();
  });

  it("calls the resolve fetcher with the encoded handle on Look up", () => {
    render(<InviteContributorModal isOpen onClose={noop} existingDids={[]} />);
    lookUp("alice bsky.app");
    expect(resolveFetcherMock.load).toHaveBeenCalledWith(
      "/article/resolve-contributor?handle=alice%20bsky.app",
    );
  });

  it("shows the resolved profile, including avatar, once the fetcher resolves", () => {
    resolveFetcherMock.data = {
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
      avatar: "https://cdn.bsky.app/avatar.jpg",
    };
    const { container } = render(
      <InviteContributorModal isOpen onClose={noop} existingDids={[]} />,
    );
    lookUp();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("@alice.bsky.app")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.bsky.app/avatar.jpg",
    );
  });

  it("shows an error message when the resolve fetcher returns an error", () => {
    resolveFetcherMock.data = { error: "Bluesky account not found" };
    render(<InviteContributorModal isOpen onClose={noop} existingDids={[]} />);
    lookUp();
    expect(screen.getByText("Bluesky account not found")).toBeInTheDocument();
  });

  it("shows a warning and disables Send Invite when already on the roster", () => {
    resolveFetcherMock.data = {
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
    };
    render(
      <InviteContributorModal
        isOpen
        onClose={noop}
        existingDids={["did:plc:abc"]}
      />,
    );
    lookUp();
    expect(
      screen.getByText("This person is already on the roster for this site."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Invite" })).toBeDisabled();
  });

  it("submits inviteContributor with the resolved did on Send Invite", () => {
    resolveFetcherMock.data = {
      did: "did:plc:abc",
      handle: "alice.bsky.app",
      displayName: "Alice",
    };
    render(<InviteContributorModal isOpen onClose={noop} existingDids={[]} />);
    lookUp();
    fireEvent.click(screen.getByRole("button", { name: "Send Invite" }));

    expect(inviteFetcherMock.submit).toHaveBeenCalledWith(
      expect.any(FormData),
      { method: "post" },
    );
    const submitted = inviteFetcherMock.submit.mock.calls[0][0] as FormData;
    expect(submitted.get("_intent")).toBe("inviteContributor");
    expect(submitted.get("contributorDid")).toBe("did:plc:abc");
  });

  it("resets the handle input and lookup state whenever the modal (re)opens", () => {
    const { rerender } = render(
      <InviteContributorModal isOpen={false} onClose={noop} existingDids={[]} />,
    );
    rerender(<InviteContributorModal isOpen onClose={noop} existingDids={[]} />);
    expect(screen.getByLabelText("Bluesky handle")).toHaveValue("");
  });
});
