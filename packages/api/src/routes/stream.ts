import { Router, Request, Response } from "express";
import type { TickEngine } from "../market/tickEngine.js";

export function streamRouter(tickEngine: TickEngine): Router {
  const router = Router();

  // GET /api/market/stream — Real-time Server-Sent Events (SSE)
  router.get("/", (req: Request, res: Response) => {
    // Standard SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Subscribe to real-time micro-ticks
    const unsubscribe = tickEngine.subscribe(res);

    // Heartbeat every 15s to keep connections alive
    const pingTimer = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(pingTimer);
        unsubscribe();
      }
    }, 15_000);

    req.on("close", () => {
      clearInterval(pingTimer);
      unsubscribe();
    });
  });

  return router;
}

