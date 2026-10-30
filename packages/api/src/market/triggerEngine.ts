// ============================================================
// Auto-Trigger Engine — Evaluates Stop-Loss and Target Exits
// ============================================================

import db, { transaction } from "../db/database.js";
import type { MarketDataProvider, StockQuote } from "./MarketDataProvider.js";

export interface AutoTrigger {
  id: number;
  user_id?: number;
  symbol: string;
  side: "SELL";
  qty: number;
  trigger_type: "STOP_LOSS" | "TARGET";
  trigger_price: number;
  status: "ACTIVE" | "TRIGGERED" | "CANCELLED";
  created_at: string;
  triggered_at: string | null;
}

export async function checkTriggersWithQuotes(quotes: StockQuote[]): Promise<void> {
  const activeTriggers = db
    .prepare("SELECT * FROM auto_triggers WHERE status = 'ACTIVE'")
    .all() as AutoTrigger[];

  if (activeTriggers.length === 0 || quotes.length === 0) return;

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  for (const trigger of activeTriggers) {
    const q = quoteMap.get(trigger.symbol);
    if (!q || q.price <= 0) continue;

    let shouldTrigger = false;
    let exitReason = "";

    if (trigger.trigger_type === "STOP_LOSS" && q.price <= trigger.trigger_price) {
      shouldTrigger = true;
      exitReason = `STOP-LOSS hit @ ₹${q.price} (Trigger: ₹${trigger.trigger_price})`;
    } else if (trigger.trigger_type === "TARGET" && q.price >= trigger.trigger_price) {
      shouldTrigger = true;
      exitReason = `TARGET achieved @ ₹${q.price} (Trigger: ₹${trigger.trigger_price})`;
    }

    if (shouldTrigger) {
      try {
        transaction(() => {
          const userId = trigger.user_id || 1;
          // Check available holding
          const holding = db
            .prepare("SELECT qty, avg_price FROM holdings WHERE user_id = ? AND symbol = ?")
            .get(userId, trigger.symbol) as { qty: number; avg_price: number } | undefined;

          if (!holding || holding.qty <= 0) {
            // No shares to sell, mark trigger as cancelled
            db.prepare(
              "UPDATE auto_triggers SET status = 'CANCELLED', triggered_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
            ).run(trigger.id);
            return;
          }

          const sellQty = Math.min(trigger.qty, holding.qty);
          const totalValue = parseFloat((sellQty * q.price).toFixed(2));
          const realisedPnl = parseFloat(((q.price - holding.avg_price) * sellQty).toFixed(2));

          // 1. Credit wallet
          db.prepare(
            "UPDATE wallet SET cash = cash + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?"
          ).run(totalValue, userId);

          // 2. Add transaction record
          db.prepare(
            "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
          ).run(userId, "CREDIT", totalValue, `AUTO-EXIT ${sellQty} × ${trigger.symbol} @ ₹${q.price} (${exitReason})`);

          // 3. Update or remove holding
          const remainingQty = holding.qty - sellQty;
          if (remainingQty === 0) {
            db.prepare("DELETE FROM holdings WHERE user_id = ? AND symbol = ?").run(userId, trigger.symbol);
            // Cancel other active triggers for this symbol (OCO logic)
            db.prepare(
              "UPDATE auto_triggers SET status = 'CANCELLED', triggered_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND symbol = ? AND status = 'ACTIVE' AND id != ?"
            ).run(userId, trigger.symbol, trigger.id);
          } else {
            db.prepare(
              "UPDATE holdings SET qty = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND symbol = ?"
            ).run(remainingQty, userId, trigger.symbol);
          }

          // 4. Record order with special order_type
          const orderType = trigger.trigger_type === "STOP_LOSS" ? "STOP_LOSS" : "TARGET";
          db.prepare(
            "INSERT INTO orders (user_id, symbol, side, order_type, qty, price, total_value, realised_pnl, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
          ).run(userId, trigger.symbol, "SELL", orderType, sellQty, q.price, totalValue, realisedPnl);

          // 5. Update trigger status
          db.prepare(
            "UPDATE auto_triggers SET status = 'TRIGGERED', triggered_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
          ).run(trigger.id);

          console.log(`🔔 [AUTO-TRIGGER] Executed ${orderType} for ${trigger.symbol} ${sellQty} shares @ ₹${q.price} (P&L: ₹${realisedPnl}) for user #${userId}`);
        });
      } catch (err) {
        console.error(`Failed to execute auto-trigger #${trigger.id}:`, err);
      }
    }
  }
}

export async function checkTriggers(market: MarketDataProvider): Promise<void> {
  const activeTriggers = db
    .prepare("SELECT symbol FROM auto_triggers WHERE status = 'ACTIVE'")
    .all() as Array<{ symbol: string }>;

  if (activeTriggers.length === 0) return;

  const symbols = Array.from(new Set(activeTriggers.map((t) => t.symbol)));
  const quotes = await market.getQuotes(symbols);
  await checkTriggersWithQuotes(quotes);
}
