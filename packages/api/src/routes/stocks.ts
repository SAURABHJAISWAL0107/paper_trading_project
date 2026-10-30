// ── GET /api/stocks        — list all stocks
// ── GET /api/stocks/search?q= — search
// ── GET /api/stocks/:symbol   — single stock detail + OHLCV

import { Router, Request, Response } from "express";
import type { MarketDataProvider } from "../market/MarketDataProvider.js";
import { STOCKS } from "../market/stockUniverse.js";

export function stocksRouter(getMarket: () => MarketDataProvider): Router {
  const router = Router();

  // GET /api/stocks
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const market = getMarket();
      const symbols = STOCKS.map((s) => s.symbol);
      const quotes = await market.getQuotes(symbols);
      res.json({ data: quotes, isSample: quotes[0]?.isSample ?? true });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stock list" });
    }
  });

  // GET /api/stocks/search?q=<query>
  router.get("/search", async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ data: [] });
      return;
    }
    try {
      const results = await getMarket().search(q);
      res.json({ data: results });
    } catch (err) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  // GET /api/stocks/:symbol
  router.get("/:symbol", async (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
      const market = getMarket();
      const [quote, ohlcv] = await Promise.all([
        market.getQuote(symbol),
        market.getOHLCV(symbol, 90),
      ]);
      if (!quote) {
        res.status(404).json({ error: `Symbol '${symbol}' not found` });
        return;
      }
      res.json({ data: { quote, ohlcv }, isSample: quote.isSample });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stock detail" });
    }
  });

  return router;
}
