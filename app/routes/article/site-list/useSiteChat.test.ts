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

const OWNER_DID = "did:plc:owner";

describe("useSiteChat", () => {
  // ADR 0026 — resolve no longer builds/filters a member list at all; the
  // group's actual membership is synced out-of-band by
  // reconcileContributorStatuses/removeContributor. This hook only needs
  // the site's own identity to look up its persisted conversation.
  it("resolves by looking up the site's persisted conversation via ownerDid", () => {
    renderHook(() => useSiteChat("my-site", OWNER_DID));

    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledWith(
      "/article/site-chat/my-site?ownerDid=did%3Aplc%3Aowner",
    );
  });

  it("re-resolves when siteSlug or ownerDid changes, but not on an unrelated re-render", () => {
    const { rerender } = renderHook(
      ({ siteSlug, ownerDid }) => useSiteChat(siteSlug, ownerDid),
      { initialProps: { siteSlug: "my-site", ownerDid: OWNER_DID } },
    );
    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledTimes(1);

    rerender({ siteSlug: "my-site", ownerDid: OWNER_DID });
    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledTimes(1);

    rerender({ siteSlug: "my-site", ownerDid: "did:plc:different-owner" });
    expect(fetcherMocks["site-chat-resolve"].load).toHaveBeenCalledTimes(2);
  });

  it("sets convoId once resolve succeeds and starts polling", () => {
    const { result, rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));

    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    expect(result.current.convoId).toBe("convo-1");
    expect(fetcherMocks["site-chat-poll"].load).toHaveBeenCalledWith(
      "/article/site-chat/my-site?convoId=convo-1",
    );
  });

  it("sets resolveErrorType when resolve fails, without setting convoId", () => {
    const { result, rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));

    fetcherMocks["site-chat-resolve"].data = { ok: false, errorType: "notCreatedYet" };
    rerender();

    expect(result.current.resolveErrorType).toBe("notCreatedYet");
    expect(result.current.convoId).toBeNull();
  });

  it("polls again after 10s while the document stays visible", () => {
    const { rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();
    fetcherMocks["site-chat-poll"].load.mockClear();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(fetcherMocks["site-chat-poll"].load).toHaveBeenCalledTimes(1);
  });

  it("pauses polling when the tab is hidden and resumes with an immediate poll on refocus", () => {
    const { rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));
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
    const { result, rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    fetcherMocks["site-chat-poll"].data = {
      ok: true,
      messages: [
        { id: "m1", text: "first", senderDid: OWNER_DID, sentAt: "2026-07-16T00:00:00.000Z" },
      ],
      profiles: [{ did: OWNER_DID, handle: "owner.bsky.social" }],
    };
    rerender();
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);

    fetcherMocks["site-chat-poll"].data = {
      ok: true,
      messages: [
        { id: "m1", text: "first", senderDid: OWNER_DID, sentAt: "2026-07-16T00:00:00.000Z" },
        { id: "m2", text: "second", senderDid: "did:plc:contributor", sentAt: "2026-07-16T00:01:00.000Z" },
      ],
      profiles: [],
    };
    rerender();
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("sendMessage submits convoId and text to the site-chat action", () => {
    const { result, rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));
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
    const { result } = renderHook(() => useSiteChat("my-site", OWNER_DID));

    act(() => {
      result.current.sendMessage("hello");
    });

    expect(fetcherMocks["site-chat-send"].submit).not.toHaveBeenCalled();
  });

  it("appends the sent message on success and clears sendError", () => {
    const { result, rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    fetcherMocks["site-chat-send"].data = {
      ok: true,
      message: { id: "m1", text: "hello", senderDid: OWNER_DID, sentAt: "2026-07-16T00:00:00.000Z" },
    };
    rerender();

    expect(result.current.messages.map((m) => m.id)).toEqual(["m1"]);
    expect(result.current.sendError).toBeNull();
  });

  it("sets sendError on a failed send, without touching messages", () => {
    const { result, rerender } = renderHook(() => useSiteChat("my-site", OWNER_DID));
    fetcherMocks["site-chat-resolve"].data = { ok: true, convoId: "convo-1" };
    rerender();

    fetcherMocks["site-chat-send"].data = { ok: false, error: "Failed to send message" };
    rerender();

    expect(result.current.sendError).toBe("Failed to send message");
    expect(result.current.messages).toEqual([]);
  });
});
