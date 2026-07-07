import { describe, it, expect, vi, afterEach } from "vitest";
import type { Response } from "express";
import { registerSSE, emitEvent, closeSSE } from "./sse.js";

function makeRes() {
  const writes: string[] = [];
  const listeners: Record<string, () => void> = {};
  return {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => writes.push(chunk)),
    end: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    writes,
    triggerClose: () => listeners.close?.(),
  } as unknown as Response & { writes: string[]; triggerClose: () => void };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("emitEvent / registerSSE ordering", () => {
  it("delivers an event immediately when the SSE connection is already open", () => {
    vi.useFakeTimers();
    const res = makeRes();
    registerSSE("upload-1", res as unknown as Response);

    emitEvent("upload-1", "variant", { name: "thumb" });

    expect(res.writes.some((w) => w.includes('event: variant') && w.includes('"name":"thumb"'))).toBe(true);
    closeSSE("upload-1");
  });

  it("buffers an event that arrives before the SSE connection opens, then flushes it on connect", () => {
    vi.useFakeTimers();
    // No registerSSE call yet — this event has nowhere to go.
    emitEvent("upload-2", "variant", { name: "thumb" });

    const res = makeRes();
    registerSSE("upload-2", res as unknown as Response);

    expect(res.writes.some((w) => w.includes('event: variant') && w.includes('"name":"thumb"'))).toBe(true);
    closeSSE("upload-2");
  });

  it("closeSSE ends the response and stops the heartbeat interval", () => {
    vi.useFakeTimers();
    const res = makeRes();
    registerSSE("upload-3", res as unknown as Response);

    closeSSE("upload-3");

    expect(res.end).toHaveBeenCalled();
    // No heartbeat should fire after close — advancing time must not throw
    // or write to the now-ended response.
    const writesBefore = res.writes.length;
    vi.advanceTimersByTime(60_000);
    expect(res.writes.length).toBe(writesBefore);
  });

  it("cleans up when the response emits its own 'close' event (client disconnect)", () => {
    vi.useFakeTimers();
    const res = makeRes();
    registerSSE("upload-4", res as unknown as Response);

    res.triggerClose();

    // Emitting after a client-side disconnect should buffer again, not
    // throw or write to the dead response.
    const writesBefore = res.writes.length;
    emitEvent("upload-4", "complete", {});
    expect(res.writes.length).toBe(writesBefore);
    closeSSE("upload-4");
  });

  it("sends periodic heartbeats while the connection is open", () => {
    vi.useFakeTimers();
    const res = makeRes();
    registerSSE("upload-5", res as unknown as Response);

    vi.advanceTimersByTime(30_000);
    expect(res.writes.some((w) => w.includes(":heartbeat"))).toBe(true);
    closeSSE("upload-5");
  });
});
