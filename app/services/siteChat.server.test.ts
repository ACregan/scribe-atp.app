import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { ChatBskyConvoGetConvoForMembers } from "@atproto/api";
import {
  resolveSiteChatConvo,
  getSiteChatMessages,
  sendSiteChatMessage,
} from "./siteChat.server";

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeAgent(
  overrides: {
    getConvoForMembers?: ReturnType<typeof vi.fn>;
    getMessages?: ReturnType<typeof vi.fn>;
    sendMessage?: ReturnType<typeof vi.fn>;
  } = {},
): Agent {
  return {
    api: {
      chat: {
        bsky: {
          convo: {
            getConvoForMembers: overrides.getConvoForMembers ?? vi.fn(),
            getMessages: overrides.getMessages ?? vi.fn(),
            sendMessage: overrides.sendMessage ?? vi.fn(),
          },
        },
      },
    },
  } as unknown as Agent;
}

function knownErr(ErrorClass: new (src: never) => Error) {
  return new ErrorClass({
    status: 400,
    error: "Known",
    message: "known error",
  } as never);
}

describe("resolveSiteChatConvo", () => {
  it("returns the convo id on success", async () => {
    const getConvoForMembers = vi
      .fn()
      .mockResolvedValue({ data: { convo: { id: "convo-1" } } });
    const agent = makeAgent({ getConvoForMembers });

    const result = await resolveSiteChatConvo(agent, ["did:plc:a", "did:plc:b"]);

    expect(result).toEqual({ ok: true, convoId: "convo-1" });
    expect(getConvoForMembers).toHaveBeenCalledWith(
      { members: ["did:plc:a", "did:plc:b"] },
      { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } },
    );
  });

  it.each([
    [ChatBskyConvoGetConvoForMembers.BlockedActorError, "blocked"],
    [ChatBskyConvoGetConvoForMembers.MessagesDisabledError, "messagesDisabled"],
    [ChatBskyConvoGetConvoForMembers.NotFollowedBySenderError, "notFollowed"],
    [ChatBskyConvoGetConvoForMembers.AccountSuspendedError, "accountSuspended"],
  ] as const)("maps %s to errorType %s", async (ErrorClass, expectedType) => {
    const getConvoForMembers = vi.fn().mockRejectedValue(knownErr(ErrorClass));
    const agent = makeAgent({ getConvoForMembers });

    const result = await resolveSiteChatConvo(agent, ["did:plc:a"]);

    expect(result).toEqual({ ok: false, errorType: expectedType });
  });

  it("maps an unrecognised error to errorType unknown", async () => {
    const getConvoForMembers = vi.fn().mockRejectedValue(new Error("network down"));
    const agent = makeAgent({ getConvoForMembers });

    const result = await resolveSiteChatConvo(agent, ["did:plc:a"]);

    expect(result).toEqual({ ok: false, errorType: "unknown" });
  });
});

describe("getSiteChatMessages", () => {
  it("maps messageView entries and returns relatedProfiles as profiles", async () => {
    const getMessages = vi.fn().mockResolvedValue({
      data: {
        messages: [
          {
            $type: "chat.bsky.convo.defs#messageView",
            id: "msg-1",
            text: "hello",
            sender: { did: "did:plc:owner" },
            sentAt: "2026-07-16T00:00:00.000Z",
          },
        ],
        relatedProfiles: [
          { did: "did:plc:owner", handle: "owner.bsky.social", displayName: "Owner" },
        ],
      },
    });
    const agent = makeAgent({ getMessages });

    const result = await getSiteChatMessages(agent, "convo-1");

    expect(result).toEqual({
      ok: true,
      messages: [
        {
          id: "msg-1",
          text: "hello",
          senderDid: "did:plc:owner",
          sentAt: "2026-07-16T00:00:00.000Z",
        },
      ],
      profiles: [
        { did: "did:plc:owner", handle: "owner.bsky.social", displayName: "Owner", avatar: undefined },
      ],
    });
    expect(getMessages).toHaveBeenCalledWith(
      { convoId: "convo-1", limit: 50 },
      { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } },
    );
  });

  it("drops deleted and system messages, keeping only messageView entries", async () => {
    const getMessages = vi.fn().mockResolvedValue({
      data: {
        messages: [
          { $type: "chat.bsky.convo.defs#deletedMessageView", id: "msg-deleted" },
          { $type: "chat.bsky.convo.defs#systemMessageView", id: "msg-system" },
          {
            $type: "chat.bsky.convo.defs#messageView",
            id: "msg-1",
            text: "hi",
            sender: { did: "did:plc:owner" },
            sentAt: "2026-07-16T00:00:00.000Z",
          },
        ],
        relatedProfiles: [],
      },
    });
    const agent = makeAgent({ getMessages });

    const result = await getSiteChatMessages(agent, "convo-1");

    expect(result).toEqual({
      ok: true,
      messages: [
        { id: "msg-1", text: "hi", senderDid: "did:plc:owner", sentAt: "2026-07-16T00:00:00.000Z" },
      ],
      profiles: [],
    });
  });

  it("defaults profiles to an empty array when relatedProfiles is absent", async () => {
    const getMessages = vi.fn().mockResolvedValue({ data: { messages: [] } });
    const agent = makeAgent({ getMessages });

    const result = await getSiteChatMessages(agent, "convo-1");

    expect(result).toEqual({ ok: true, messages: [], profiles: [] });
  });

  it("returns ok:false rather than throwing when the fetch fails", async () => {
    const getMessages = vi.fn().mockRejectedValue(new Error("network down"));
    const agent = makeAgent({ getMessages });

    const result = await getSiteChatMessages(agent, "convo-1");

    expect(result).toEqual({ ok: false, error: "Failed to load messages" });
  });
});

describe("sendSiteChatMessage", () => {
  it("sends the message and returns the created MessageView, mapped", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      data: {
        id: "msg-2",
        text: "hello back",
        sender: { did: "did:plc:contributor" },
        sentAt: "2026-07-16T00:01:00.000Z",
      },
    });
    const agent = makeAgent({ sendMessage });

    const result = await sendSiteChatMessage(agent, "convo-1", "hello back");

    expect(result).toEqual({
      ok: true,
      message: {
        id: "msg-2",
        text: "hello back",
        senderDid: "did:plc:contributor",
        sentAt: "2026-07-16T00:01:00.000Z",
      },
    });
    expect(sendMessage).toHaveBeenCalledWith(
      {
        convoId: "convo-1",
        message: { $type: "chat.bsky.convo.defs#messageInput", text: "hello back" },
      },
      { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } },
    );
  });

  it("returns ok:false rather than throwing when sending fails", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("ConvoLocked"));
    const agent = makeAgent({ sendMessage });

    const result = await sendSiteChatMessage(agent, "convo-1", "hello");

    expect(result).toEqual({ ok: false, error: "Failed to send message" });
  });
});
