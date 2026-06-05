import type { Response } from "express";

const connections = new Map<string, Response>();
const pendingEvents = new Map<string, Array<{ event: string; data: unknown }>>();
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();

export function registerSSE(uploadId: string, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx response buffering
  });

  connections.set(uploadId, res);

  // Flush any events that arrived before the SSE connection opened
  const pending = pendingEvents.get(uploadId);
  if (pending) {
    for (const { event, data } of pending) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    pendingEvents.delete(uploadId);
  }

  const interval = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 30_000);
  heartbeats.set(uploadId, interval);

  res.on("close", () => cleanup(uploadId));
}

export function emitEvent(uploadId: string, event: string, data: unknown = {}): void {
  const res = connections.get(uploadId);
  if (res) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } else {
    // Buffer until the SSE connection opens (client opens SSE first but there's a
    // small window where the upload can arrive before the GET /progress response is flushed)
    const pending = pendingEvents.get(uploadId) ?? [];
    pending.push({ event, data });
    pendingEvents.set(uploadId, pending);
  }
}

export function closeSSE(uploadId: string): void {
  const res = connections.get(uploadId);
  if (res) res.end();
  cleanup(uploadId);
}

function cleanup(uploadId: string): void {
  connections.delete(uploadId);
  pendingEvents.delete(uploadId);
  const interval = heartbeats.get(uploadId);
  if (interval !== undefined) {
    clearInterval(interval);
    heartbeats.delete(uploadId);
  }
}
