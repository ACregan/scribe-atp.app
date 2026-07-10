import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerSocialOrigin } from "./socialOrigin.server";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NOTIFY_SECRET = "test-secret";
  process.env.SOCIAL_SERVICE_URL = "https://social.example.test";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("registerSocialOrigin", () => {
  it("POSTs the origin and did to the social service with bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await registerSocialOrigin("norobots.blog", "did:plc:owner1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://social.example.test/origins",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          origin: "https://norobots.blog",
          did: "did:plc:owner1",
        }),
      }),
    );
  });

  it("does not call fetch when NOTIFY_SECRET is not configured", async () => {
    delete process.env.NOTIFY_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await registerSocialOrigin("norobots.blog", "did:plc:owner1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when the social service returns a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(
      registerSocialOrigin("norobots.blog", "did:plc:owner1"),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the fetch itself rejects (service unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      registerSocialOrigin("norobots.blog", "did:plc:owner1"),
    ).resolves.toBeUndefined();
  });
});
