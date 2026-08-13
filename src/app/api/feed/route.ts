// GET /api/feed — Server-Sent Events stream of the (simulated) live purchase feed.
// On connect: one "backlog" event with the last 20 events (JSON array, newest first),
// then a "purchase" event per new feed event. Comment heartbeat every 25 s.

import { ensureFeedReady, getRecentEvents, subscribe } from "@/lib/feed";
import type { FeedEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
// Tell the browser how fast to reconnect. Without this the UA default applies
// (3 s Chromium / 5 s Gecko), which the client's offline grace must otherwise
// guess at — a mismatch makes every routine reconnect look like an outage.
const RETRY_MS = 1_000;

export async function GET(request: Request) {
  // Make sure the generator is running and the buffer is seeded before we
  // snapshot the backlog, so the first paint is never empty.
  await ensureFeedReady();

  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Consumer went away mid-write — tear everything down.
          cleanup();
        }
      };

      const unsubscribe = subscribe((e: FeedEvent) => {
        send(`event: purchase\ndata: ${JSON.stringify(e)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        send(`: heartbeat\n\n`);
      }, HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // stream already closed or errored — nothing to do
        }
      };

      request.signal.addEventListener("abort", cleanup);

      // Reconnect interval first, then the backlog, then live events
      // (all synchronous here, so no gap/dup).
      send(`retry: ${RETRY_MS}\n\n`);
      send(`event: backlog\ndata: ${JSON.stringify(getRecentEvents(20))}\n\n`);

      if (request.signal.aborted) cleanup();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
