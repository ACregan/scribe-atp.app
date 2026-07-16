import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSiteChat } from "./useSiteChat";

type FetcherMock = {
  state: "idle" | "loading" | "submitting";
  data: unknown;
  load: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
};

const fetcherMocks = vi.hoisted(() => ({
  "site-chat-resolve": {
    state: "idle" as const,
    data: undefined as unknown,
    load: vi.fn(),
    submit: vi.fn(),
  },
  "site-chat-poll": {
    state: "idle" as const,
    data: undefined as unknown,
    load: vi.fn(),
    submit: vi.fn(),
  },
  "site-chat-send": {
    state: "idle" as const,
    data: undefined as unknown,
    load: vi.fn(),
    submit: vi.fn(),
  },
}));

vi.mock("react-router", () => ({
  useFetcher: ({ key }: { key: keyof typeof fetcherMocks }) => fetcherMocks[key],
}));

function resetFetcherMock(mock: FetcherMock) {
  mock.state = "idle";
  mock.data = undefined;
  mock.load.mockClear();
  mock.submit.mockClear();
}

beforeEach(() => {
  resetFetcherMock(fetcherMocks["site-chat-resolve"]);
  resetFetcherMock(fetcherMocks["site-chat-poll"]);
  resetFetcherMock(fetcherMocks["site-chat-send"]);
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// The currently-logged-in viewer, distinct from the "other" DID(s) in the
// roster — most tests view as the Owner, chatting with one Contributor.
const VIEWER_DID = "did:plc:owner";
const OTHER_DID = "did:plc:contributor";

describe("useSiteChat", () => {
  // Found live 2026-07-17: getConvoForMembers resolves a 1-1 conversation
  // between the caller and whoever's in `members` — the caller must never
  // be included in that list themselves (same convention the existing
  // invite-DM code already uses). Passing the full roster including self
  // meant two browsers' member lists never matched, so messages sent from
  // one side never reached where the other side was polling.
  describe("excludes the current viewer from the resolved members list", () => {
    it("resolves using only the other member DIDs, not the viewer's own", () => {
      renderHook(() => useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]));

      expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledWith(
        "/article/site-chat/my-site?members=did%3Aplc%3Acontributor",
      );
    });

    it("joins multiple other members, still excluding the viewer", () => {
      const thirdDid = "did:plc:contributor-2";
      renderHook(() =>
        useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID, thirdDid]),
      );

      const [url] = fetcherMocks["site-chat-resolve"].load.mock.calls[0];
      const membersParam = new URL(url, "http://localhost").searchParams.get("members");
      expect(membersParam?.split(",")).toEqual([OTHER_DID, thirdDid]);
    });

    it("does not resolve when the viewer is the only member (nobody else to chat with)", () => {
      renderHook(() => useSiteChat("my-site", VIEWER_DID, [VIEWER_DID]));
      expect(fetcherMocks["site-chat-resolve"].load).not.toHaveBeenCalled();
    });
  });

  it("does not resolve when there are no members yet", () => {
    renderHook(() => useSiteChat("my-site", VIEWER_DID, []));
    expect(fetcherMocks["site-chat-resolve"].load).not.toHaveBeenCalled();
  });

  it("re-resolves when the other-member DID set changes, but not on an unrelated re-render", () => {
    const { rerender } = renderHook(
      ({ members }) => useSiteChat("my-site", VIEWER_DID, members),
      { initialProps: { members: [VIEWER_DID, OTHER_DID] } },
    );
    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledTimes(1);

    rerender({ members: [VIEWER_DID, OTHER_DID] });
    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledTimes(1);

    rerender({ members: [VIEWER_DID, OTHER_DID, "did:plc:contributor-2"] });
    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledTimes(2);
  });

  it("sets convoId once resolve succeeds and starts polling", () => {
    const { result, rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );

    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    expect(result.current.convoId).toBe("convo-1");
    expect(fetcherMocks["site-chat-poll"].load).toHaveBeenCalledWith(
      "/article/site-chat/my-site?convoId=convo-1",
    );
  });

  it("sets resolveErrorType when resolve fails, without setting convoId", () => {
    const { result, rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );

    fetcherMocks["site-chat-resolve"].data = { ok: false, errorType: "blocked" };
    rerender();

    expect(result.current.resolveErrorType).toBe("blocked");
    expect(result.current.convoId).toBeNull();
  });

  it("polls again after 10s while the document stays visible", () => {
    const { rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();
    fetcherMocks["site-chat-poll"].load.mockClear();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(fetcherMocks["site-chat-poll"].load).toHaveBeenCalledTimes(1);
  });

  it("pauses polling when the tab is hidden and resumes with an immediate poll on refocus", () => {
    const { rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();
    fetcherMocks["site-chat-poll"].load.mockClear();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fetcherMocks["site-chat-poll"].load).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(fetcherMocks["site-chat-poll"].load).toHaveBeenCalledTimes(1);
  });

  it("appends only new messages from a poll, deduped by id, sorted by sentAt", () => {
    const { result, rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    fetcherMocks["site-chat-poll"].data = {
      ok: true,
      messages: [
        { id: "m1", text: "first", senderDid: VIEWER_DID, sentAt: "2026-07-16T00:00:00.000Z" },
      ],
      profiles: [{ did: VIEWER_DID, handle: "owner.bsky.social" }],
    };
    rerender();
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);

    fetcherMocks["site-chat-poll"].data = {
      ok: true,
      messages: [
        { id: "m1", text: "first", senderDid: VIEWER_DID, sentAt: "2026-07-16T00:00:00.000Z" },
        { id: "m2", text: "second", senderDid: OTHER_DID, sentAt: "2026-07-16T00:01:00.000Z" },
      ],
      profiles: [],
    };
    rerender();
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("sendMessage submits convoId and text to the site-chat action", () => {
    const { result, rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    act(() => {
      result.current.sendMessage("hello");
    });

    expect(fetcherMocks["site-chat-send"].submit).toHaveBeenCalledWith(
      expect.any(FormData),
      { method: "post", action: "/article/site-chat/my-site" },
    );
    const submittedFormData = fetcherMocks["site-chat-send"].submit.mock.calls[0][0] as FormData;
    expect(submittedFormData.get("convoId")).toBe("convo-1");
    expect(submittedFormData.get("text")).toBe("hello");
  });

  it("does not submit when there is no resolved convoId yet", () => {
    const { result } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );

    act(() => {
      result.current.sendMessage("hello");
    });

    expect(fetcherMocks["site-chat-send"].submit).not.toHaveBeenCalled();
  });

  it("appends the sent message on success and clears sendError", () => {
    const { result, rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    fetcherMocks["site-chat-send"].data = {
      ok: true,
      message: { id: "m1", text: "hello", senderDid: VIEWER_DID, sentAt: "2026-07-16T00:00:00.000Z" },
    };
    rerender();

    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);
    expect(result.current.sendError).toBeNull();
  });

  it("sets sendError on a failed send, without touching messages", () => {
    const { result, rerender } = renderHook(() =>
      useSiteChat("my-site", VIEWER_DID, [VIEWER_DID, OTHER_DID]),
    );
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    fetcherMocks["site-chat-send"].data = { ok: false, error: "Failed to send message" };
    rerender();

    expect(result.current.sendError).toBe("Failed to send message");
    expect(result.current.messages).toEqual([]);
  });
});
