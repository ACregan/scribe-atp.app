import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./site-chat";
import { requireAtpAgent } from "~/services/auth.server";
import {
  resolveSiteChatConvo,
  getSiteChatMessages,
  sendSiteChatMessage,
} from "~/services/siteChat.server";

// Dispatch-only, characterization-style tests — siteChat.server.ts's own
// functions have full behavioral coverage in siteChat.server.test.ts. What's
// tested here: which mode the loader picks (resolve vs poll) based on which
// query param is present, and the action's validation/dispatch.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/siteChat.server", () => ({
  resolveSiteChatConvo: vi.fn(),
  getSiteChatMessages: vi.fn(),
  sendSiteChatMessage: vi.fn(),
}));

const AGENT_SENTINEL = {} as Agent;

function makeRequest(url: string, entries?: Record<string, string>): Request {
  if (!entries) return new Request(url);
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request(url, { method: "POST", body: formData });
}

function callLoader(url: string) {
  return loader({ request: makeRequest(url) } as unknown as Parameters<
    typeof loader
  >[0]);
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest("http://localhost/article/site-chat/my-site", entries),
  } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset().mockResolvedValue({
    agent: AGENT_SENTINEL,
    did: "did:plc:owner",
    handle: "owner.bsky.social",
  });
  vi.mocked(resolveSiteChatConvo).mockReset();
  vi.mocked(getSiteChatMessages).mockReset();
  vi.mocked(sendSiteChatMessage).mockReset();
});

describe("loader", () => {
  it("resolve mode: calls resolveSiteChatConvo with the members param split on commas, when no convoId is given", async () => {
    vi.mocked(resolveSiteChatConvo).mockResolvedValue({ ok: true, convoId: "convo-1" });

    const result = await callLoader(
      "http://localhost/article/site-chat/my-site?members=did:plc:owner,did:plc:contributor",
    );

    expect(resolveSiteChatConvo).toHaveBeenCalledWith(AGENT_SENTINEL, [
      "did:plc:owner",
      "did:plc:contributor",
    ]);
    expect(getSiteChatMessages).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, convoId: "convo-1" });
  });

  it("resolve mode: returns errorType unknown without calling resolveSiteChatConvo when members is empty", async () => {
    const result = await callLoader("http://localhost/article/site-chat/my-site");

    expect(resolveSiteChatConvo).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, errorType: "unknown" });
  });

  it("poll mode: calls getSiteChatMessages with the convoId, ignoring any members param", async () => {
    vi.mocked(getSiteChatMessages).mockResolvedValue({
      ok: true,
      messages: [],
      profiles: [],
    });

    const result = await callLoader(
      "http://localhost/article/site-chat/my-site?convoId=convo-1&members=did:plc:owner",
    );

    expect(getSiteChatMessages).toHaveBeenCalledWith(AGENT_SENTINEL, "convo-1");
    expect(resolveSiteChatConvo).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, messages: [], profiles: [] });
  });
});

describe("action", () => {
  it("rejects when convoId is missing", async () => {
    const result = await callAction({ text: "hello" });
    expect(result).toEqual({ ok: false, error: "A message is required." });
    expect(sendSiteChatMessage).not.toHaveBeenCalled();
  });

  it("rejects when text is missing or blank", async () => {
    const result = await callAction({ convoId: "convo-1", text: "   " });
    expect(result).toEqual({ ok: false, error: "A message is required." });
    expect(sendSiteChatMessage).not.toHaveBeenCalled();
  });

  it("dispatches to sendSiteChatMessage with the trimmed text", async () => {
    vi.mocked(sendSiteChatMessage).mockResolvedValue({
      ok: true,
      message: {
        id: "msg-1",
        text: "hello",
        senderDid: "did:plc:owner",
        sentAt: "2026-07-16T00:00:00.000Z",
      },
    });

    const result = await callAction({ convoId: "convo-1", text: "  hello  " });

    expect(sendSiteChatMessage).toHaveBeenCalledWith(AGENT_SENTINEL, "convo-1", "hello");
    expect(result).toEqual({
      ok: true,
      message: {
        id: "msg-1",
        text: "hello",
        senderDid: "did:plc:owner",
        sentAt: "2026-07-16T00:00:00.000Z",
      },
    });
  });
});
