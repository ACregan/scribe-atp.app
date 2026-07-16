import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import {
  syncSiteChatGroup,
  removeSiteChatMember,
  lookupSiteChatConvo,
  getSiteChatMessages,
  sendSiteChatMessage,
} from "./siteChat.server";
import { siteChatConvos } from "~/services/db.server";

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/services/db.server", () => ({
  siteChatConvos: { get: vi.fn(), create: vi.fn() },
}));

const PROXY_HEADERS = { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } };
const SITE_URI = "at://did:plc:owner/site.standard.publication/my-site";

function makeAgent(
  overrides: {
    createGroup?: ReturnType<typeof vi.fn>;
    addMembers?: ReturnType<typeof vi.fn>;
    removeMembers?: ReturnType<typeof vi.fn>;
    getConvo?: ReturnType<typeof vi.fn>;
    acceptConvo?: ReturnType<typeof vi.fn>;
    getMessages?: ReturnType<typeof vi.fn>;
    sendMessage?: ReturnType<typeof vi.fn>;
  } = {},
): Agent {
  return {
    api: {
      chat: {
        bsky: {
          group: {
            createGroup: overrides.createGroup ?? vi.fn(),
            addMembers: overrides.addMembers ?? vi.fn(),
            removeMembers: overrides.removeMembers ?? vi.fn(),
          },
          convo: {
            getConvo: overrides.getConvo ?? vi.fn(),
            acceptConvo: overrides.acceptConvo ?? vi.fn(),
            getMessages: overrides.getMessages ?? vi.fn(),
            sendMessage: overrides.sendMessage ?? vi.fn(),
          },
        },
      },
    },
  } as unknown as Agent;
}

beforeEach(() => {
  vi.mocked(siteChatConvos.get).mockReset();
  vi.mocked(siteChatConvos.create).mockReset();
});

describe("syncSiteChatGroup", () => {
  it("does nothing when there are no newly accepted DIDs", async () => {
    const createGroup = vi.fn();
    const addMembers = vi.fn();
    const agent = makeAgent({ createGroup, addMembers });

    await syncSiteChatGroup(agent, SITE_URI, "My Site", []);

    expect(createGroup).not.toHaveBeenCalled();
    expect(addMembers).not.toHaveBeenCalled();
    expect(siteChatConvos.get).not.toHaveBeenCalled();
  });

  it("creates the group and persists the convoId when none exists yet", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue(undefined);
    const createGroup = vi.fn().mockResolvedValue({ data: { convo: { id: "convo-1" } } });
    const addMembers = vi.fn();
    const agent = makeAgent({ createGroup, addMembers });

    await syncSiteChatGroup(agent, SITE_URI, "My Site", ["did:plc:contributor"]);

    expect(createGroup).toHaveBeenCalledWith(
      { members: ["did:plc:contributor"], name: "My Site" },
      PROXY_HEADERS,
    );
    expect(addMembers).not.toHaveBeenCalled();
    expect(siteChatConvos.create).toHaveBeenCalledWith(
      SITE_URI,
      "convo-1",
      expect.any(String),
    );
  });

  it("adds members to the existing group instead of creating a new one", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue("convo-1");
    const createGroup = vi.fn();
    const addMembers = vi.fn().mockResolvedValue({ data: { convo: {} } });
    const agent = makeAgent({ createGroup, addMembers });

    await syncSiteChatGroup(agent, SITE_URI, "My Site", ["did:plc:contributor-2"]);

    expect(createGroup).not.toHaveBeenCalled();
    expect(addMembers).toHaveBeenCalledWith(
      { convoId: "convo-1", members: ["did:plc:contributor-2"] },
      PROXY_HEADERS,
    );
    expect(siteChatConvos.create).not.toHaveBeenCalled();
  });

  it("swallows failures — never throws", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue(undefined);
    const createGroup = vi.fn().mockRejectedValue(new Error("MemberLimitReached"));
    const agent = makeAgent({ createGroup });

    await expect(
      syncSiteChatGroup(agent, SITE_URI, "My Site", ["did:plc:contributor"]),
    ).resolves.toBeUndefined();
  });
});

describe("removeSiteChatMember", () => {
  it("does nothing when no group has been created for this site", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue(undefined);
    const removeMembers = vi.fn();
    const agent = makeAgent({ removeMembers });

    await removeSiteChatMember(agent, SITE_URI, "did:plc:contributor");

    expect(removeMembers).not.toHaveBeenCalled();
  });

  it("removes the member from the existing group", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue("convo-1");
    const removeMembers = vi.fn().mockResolvedValue({ data: { convo: {} } });
    const agent = makeAgent({ removeMembers });

    await removeSiteChatMember(agent, SITE_URI, "did:plc:contributor");

    expect(removeMembers).toHaveBeenCalledWith(
      { convoId: "convo-1", members: ["did:plc:contributor"] },
      PROXY_HEADERS,
    );
  });

  it("swallows failures — never throws", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue("convo-1");
    const removeMembers = vi.fn().mockRejectedValue(new Error("InsufficientRole"));
    const agent = makeAgent({ removeMembers });

    await expect(
      removeSiteChatMember(agent, SITE_URI, "did:plc:contributor"),
    ).resolves.toBeUndefined();
  });
});

describe("lookupSiteChatConvo", () => {
  it("returns notCreatedYet when no group has been created for this site", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue(undefined);
    const agent = makeAgent();

    const result = await lookupSiteChatConvo(agent, SITE_URI);

    expect(result).toEqual({ ok: false, errorType: "notCreatedYet" });
  });

  it("returns the convoId without accepting when already accepted", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue("convo-1");
    const getConvo = vi
      .fn()
      .mockResolvedValue({ data: { convo: { status: "accepted" } } });
    const acceptConvo = vi.fn();
    const agent = makeAgent({ getConvo, acceptConvo });

    const result = await lookupSiteChatConvo(agent, SITE_URI);

    expect(result).toEqual({ ok: true, convoId: "convo-1" });
    expect(getConvo).toHaveBeenCalledWith({ convoId: "convo-1" }, PROXY_HEADERS);
    expect(acceptConvo).not.toHaveBeenCalled();
  });

  it("transparently accepts the group membership when still in request status", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue("convo-1");
    const getConvo = vi
      .fn()
      .mockResolvedValue({ data: { convo: { status: "request" } } });
    const acceptConvo = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ getConvo, acceptConvo });

    const result = await lookupSiteChatConvo(agent, SITE_URI);

    expect(result).toEqual({ ok: true, convoId: "convo-1" });
    expect(acceptConvo).toHaveBeenCalledWith({ convoId: "convo-1" }, PROXY_HEADERS);
  });

  it("returns errorType unknown when the lookup fails", async () => {
    vi.mocked(siteChatConvos.get).mockReturnValue("convo-1");
    const getConvo = vi.fn().mockRejectedValue(new Error("InvalidConvo"));
    const agent = makeAgent({ getConvo });

    const result = await lookupSiteChatConvo(agent, SITE_URI);

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
      PROXY_HEADERS,
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
      PROXY_HEADERS,
    );
  });

  it("returns ok:false rather than throwing when sending fails", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("ConvoLocked"));
    const agent = makeAgent({ sendMessage });

    const result = await sendSiteChatMessage(agent, "convo-1", "hello");

    expect(result).toEqual({ ok: false, error: "Failed to send message" });
  });
});
