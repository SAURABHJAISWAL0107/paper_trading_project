// ── GET /api/portfolio         — holdings with current price + P&L + productType (CNC/MIS)
// ── GET /api/portfolio/summary — wallet + total invested + total P&L

import { Router, Request, Response } from "express";
import db from "../db/database.js";
import type { MarketDataProvider } from "../market/MarketDataProvider.js";

export function portfolioRouter(getMarket: () => MarketDataProvider): Router {
  const router = Router();

  // GET /api/portfolio/summary
  router.get("/summary", async (req: Request, res: Response) => {
    try {
      const userId = req.userId || 1;
      const market = getMarket();
      const wallet = db
        .prepare("SELECT cash FROM wallet WHERE user_id = ?")
        .get(userId) as { cash: number } | undefined;

      const holdings = db
        .prepare("SELECT symbol, product_type, qty, avg_price, margin_used FROM holdings WHERE user_id = ? AND qty > 0")
        .all(userId) as Array<{ symbol: string; product_type: string; qty: number; avg_price: number; margin_used: number }>;

      const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
      const quotes = symbols.length > 0 ? await market.getQuotes(symbols) : [];
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

      let totalInvested = 0;
      let totalCurrentValue = 0;
      let totalUnrealisedPnl = 0;

      for (const h of holdings) {
        const q = quoteMap.get(h.symbol);
        const currentPrice = q?.price ?? h.avg_price;
        const isMIS = h.product_type === "MIS";
        const margin = isMIS
          ? (h.margin_used > 0 ? h.margin_used : (h.qty * h.avg_price) / 5)
          : h.qty * h.avg_price;
        const pnl = (currentPrice - h.avg_price) * h.qty;

        totalInvested += margin;
        totalCurrentValue += margin + pnl; // value of the position in wallet terms
        totalUnrealisedPnl += pnl;
      }

      const unrealisedPnl = parseFloat(totalUnrealisedPnl.toFixed(2));
      const unrealisedPnlPct =
        totalInvested > 0
          ? parseFloat(((unrealisedPnl / totalInvested) * 100).toFixed(2))
          : 0;

      const realisedPnlRow = db
        .prepare("SELECT COALESCE(SUM(realised_pnl), 0) as total FROM orders WHERE user_id = ? AND side = 'SELL'")
        .get(userId) as { total: number };

      res.json({
        data: {
          cash: wallet?.cash ?? 10_000_000,
          totalInvested: parseFloat(totalInvested.toFixed(2)),
          totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
          unrealisedPnl,
          unrealisedPnlPct,
          realisedPnl: parseFloat(realisedPnlRow.total.toFixed(2)),
          isSample: quotes[0]?.isSample ?? true,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch portfolio summary" });
    }
  });

  // GET /api/portfolio — holdings detail
  router.get("/", async (req: Request, res: Response) => {
    try {
      const userId = req.userId || 1;
      const market = getMarket();
      const holdings = db
        .prepare("SELECT symbol, product_type, qty, avg_price, margin_used, updated_at FROM holdings WHERE user_id = ? AND qty > 0")
        .all(userId) as Array<{ symbol: string; product_type: string; qty: number; avg_price: number; margin_used: number; updated_at: string }>;

      const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
      const quotes = symbols.length > 0 ? await market.getQuotes(symbols) : [];
      const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

      const enriched = holdings.map((h) => {
        const q = quoteMap.get(h.symbol);
        const currentPrice = q?.price ?? h.avg_price;
        const isMIS = h.product_type === "MIS";
        const invested = parseFloat(
          (isMIS ? (h.margin_used > 0 ? h.margin_used : (h.qty * h.avg_price) / 5) : h.qty * h.avg_price).toFixed(2)
        );
        const pnl = parseFloat(((currentPrice - h.avg_price) * h.qty).toFixed(2));
        const pnlPct = invested > 0 ? parseFloat(((pnl / invested) * 100).toFixed(2)) : 0;
        const currentValue = parseFloat((invested + pnl).toFixed(2));

        return {
          symbol: h.symbol,
          name: q?.name ?? h.symbol,
          sector: q?.sector ?? "—",
          productType: h.product_type ?? "CNC",
          leverage: isMIS ? 5 : 1,
          qty: h.qty,
          avgPrice: parseFloat(h.avg_price.toFixed(2)),
          currentPrice,
          currentValue,
          invested,
          pnl,
          pnlPct,
          change: q?.change ?? 0,
          changePct: q?.changePct ?? 0,
          updatedAt: h.updated_at,
          isSample: q?.isSample ?? true,
        };
      });

      res.json({ data: enriched, isSample: quotes[0]?.isSample ?? true });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch holdings" });
    }
  });

  return router;
}
