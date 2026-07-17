import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SiteChatPanel } from "./SiteChatPanel";
import styles from "./SiteChatPanel.module.css";

const useSiteChatMock = vi.hoisted(() => vi.fn());
vi.mock("../useSiteChat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../useSiteChat")>();
  return { ...actual, useSiteChat: useSiteChatMock };
});

const addToastMock = vi.hoisted(() => vi.fn());
vi.mock("~/components/Toast/ToastContext", () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

function baseHookState(overrides: Partial<ReturnType<typeof useSiteChatMock>> = {}) {
  return {
    convoId: null,
    resolveErrorType: null,
    messages: [],
    profiles: new Map(),
    sendError: null,
    isSending: false,
    sendMessage: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useSiteChatMock.mockReset();
  addToastMock.mockReset();
});

describe("SiteChatPanel", () => {
  it("shows a loading spinner before the conversation resolves", () => {
    useSiteChatMock.mockReturnValue(baseHookState());
    const { container } = render(
      <SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />,
    );
    expect(container.querySelector(`.${styles.loading}`)).toBeInTheDocument();
  });

  it("shows the mapped inline message when resolution fails, per error type", () => {
    useSiteChatMock.mockReturnValue(baseHookState({ resolveErrorType: "notCreatedYet" }));
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);
    expect(
      screen.getByText(/Chat will start once your first Contributor accepts/),
    ).toBeInTheDocument();
  });

  it("renders messages, showing the sender name only for other people's messages", () => {
    useSiteChatMock.mockReturnValue(
      baseHookState({
        convoId: "convo-1",
        messages: [
          { id: "m1", text: "hi from alice", senderDid: "did:plc:contributor", sentAt: "2026-07-16T00:00:00.000Z" },
          { id: "m2", text: "hi back", senderDid: "did:plc:owner", sentAt: "2026-07-16T00:01:00.000Z" },
        ],
        profiles: new Map([
          ["did:plc:contributor", { did: "did:plc:contributor", handle: "alice.bsky.social", displayName: "Alice" }],
        ]),
      }),
    );
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);

    expect(screen.getByText("hi from alice")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("hi back")).toBeInTheDocument();
  });

  it("falls back to the DID when no profile is known for a sender", () => {
    useSiteChatMock.mockReturnValue(
      baseHookState({
        convoId: "convo-1",
        messages: [
          { id: "m1", text: "hi", senderDid: "did:plc:stranger", sentAt: "2026-07-16T00:00:00.000Z" },
        ],
      }),
    );
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);
    expect(screen.getByText("did:plc:stranger")).toBeInTheDocument();
  });

  it("calls sendMessage with the typed text on Send click, then clears the input", () => {
    const sendMessage = vi.fn();
    useSiteChatMock.mockReturnValue(baseHookState({ convoId: "convo-1", sendMessage }));
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);

    const input = screen.getByPlaceholderText("Message…");
    fireEvent.change(input, { target: { value: "hello there" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledWith("hello there");
    expect(input).toHaveValue("");
  });

  it("calls sendMessage on Enter key, not on Shift+Enter", () => {
    const sendMessage = vi.fn();
    useSiteChatMock.mockReturnValue(baseHookState({ convoId: "convo-1", sendMessage }));
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);

    const input = screen.getByPlaceholderText("Message…");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(sendMessage).toHaveBeenCalledWith("hello");
  });

  it("does not send an empty or whitespace-only message", () => {
    const sendMessage = vi.fn();
    useSiteChatMock.mockReturnValue(baseHookState({ convoId: "convo-1", sendMessage }));
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);

    const input = screen.getByPlaceholderText("Message…");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("disables the composer while a send is in flight", () => {
    useSiteChatMock.mockReturnValue(baseHookState({ convoId: "convo-1", isSending: true }));
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);

    expect(screen.getByPlaceholderText("Message…")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows a non-expiring danger toast when sendError is set", () => {
    useSiteChatMock.mockReturnValue(
      baseHookState({ convoId: "convo-1", sendError: "Failed to send message" }),
    );
    render(<SiteChatPanel siteSlug="my-site" currentUserDid="did:plc:owner" ownerDid="did:plc:owner" />);

    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: "Message failed to send",
        content: "Failed to send message",
        variant: "danger",
        autoExpire: false,
      }),
    );
  });
});
