import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProfile } from "@scribe-atp/core";
import { fetchBskyProfile, fetchBskyProfiles } from "./blueskyProfile.server";

vi.mock("@scribe-atp/core", () => ({
  fetchProfile: vi.fn(),
}));

function makeProfile(did: string, avatar?: string) {
  return { did, handle: `${did}.bsky.social`, avatar };
}

beforeEach(() => {
  vi.mocked(fetchProfile).mockReset();
});

describe("fetchBskyProfile", () => {
  it("returns the resolved profile", async () => {
    const profile = makeProfile("did:plc:writer1", "https://avatar.example/1");
    vi.mocked(fetchProfile).mockResolvedValue(profile);

    const result = await fetchBskyProfile("writer1.bsky.social");

    expect(fetchProfile).toHaveBeenCalledWith(
      "writer1.bsky.social",
      undefined,
    );
    expect(result).toEqual(profile);
  });

  it("returns null instead of throwing when the account can't be resolved", async () => {
    vi.mocked(fetchProfile).mockRejectedValue(new Error("account not found"));

    const result = await fetchBskyProfile("deleted.bsky.social");

    expect(result).toBeNull();
  });

  it("forwards the abort signal", async () => {
    vi.mocked(fetchProfile).mockResolvedValue(makeProfile("did:plc:writer1"));
    const controller = new AbortController();

    await fetchBskyProfile("writer1.bsky.social", controller.signal);

    expect(fetchProfile).toHaveBeenCalledWith(
      "writer1.bsky.social",
      controller.signal,
    );
  });
});

describe("fetchBskyProfiles", () => {
  it("returns an empty array without calling fetchProfile when given no dids", async () => {
    const result = await fetchBskyProfiles([]);

    expect(fetchProfile).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("resolves each did independently and returns did/avatar pairs", async () => {
    vi.mocked(fetchProfile).mockImplementation(async (did) => {
      if (did === "did:plc:writer1")
        return makeProfile("did:plc:writer1", "https://avatar.example/1");
      if (did === "did:plc:writer2")
        return makeProfile("did:plc:writer2", "https://avatar.example/2");
      throw new Error(`Unexpected fetchProfile call: ${did}`);
    });

    const result = await fetchBskyProfiles([
      "did:plc:writer1",
      "did:plc:writer2",
    ]);

    expect(result).toEqual([
      {
        did: "did:plc:writer1",
        handle: "did:plc:writer1.bsky.social",
        displayName: undefined,
        avatar: "https://avatar.example/1",
      },
      {
        did: "did:plc:writer2",
        handle: "did:plc:writer2.bsky.social",
        displayName: undefined,
        avatar: "https://avatar.example/2",
      },
    ]);
  });

  it("drops DIDs whose lookup fails instead of failing the whole batch", async () => {
    vi.mocked(fetchProfile).mockImplementation(async (did) => {
      if (did === "did:plc:writer1") return makeProfile("did:plc:writer1");
      throw new Error("account not found");
    });

    const result = await fetchBskyProfiles([
      "did:plc:writer1",
      "did:plc:deleted",
    ]);

    expect(result).toEqual([
      {
        did: "did:plc:writer1",
        handle: "did:plc:writer1.bsky.social",
        displayName: undefined,
        avatar: undefined,
      },
    ]);
  });
});
