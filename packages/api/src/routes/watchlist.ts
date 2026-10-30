import { Router, Request, Response } from "express";
import db from "../db/database.js";
import type { MarketDataProvider } from "../market/MarketDataProvider.js";

export function watchlistRouter(getMarket: () => MarketDataProvider): Router {
  const router = Router();

  // GET /api/watchlist
  router.get("/", async (req: Request, res: Response) => {
    try {
      const userId = req.userId || 1;
      const rows = db
        .prepare("SELECT symbol FROM watchlist WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId) as Array<{ symbol: string }>;
      const symbols = rows.map((r) => r.symbol);
      const quotes = symbols.length > 0 ? await getMarket().getQuotes(symbols) : [];
      res.json({ data: quotes });
    } catch {
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  // POST /api/watchlist/:symbol
  router.post("/:symbol", (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase();
    const userId = req.userId || 1;
    try {
      db.prepare("INSERT OR IGNORE INTO watchlist (user_id, symbol) VALUES (?, ?)").run(userId, symbol);
      res.json({ success: true, symbol });
    } catch {
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  // DELETE /api/watchlist/:symbol
  router.delete("/:symbol", (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase();
    const userId = req.userId || 1;
    try {
      db.prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?").run(userId, symbol);
      res.json({ success: true, symbol });
    } catch {
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  });

  return router;
}
