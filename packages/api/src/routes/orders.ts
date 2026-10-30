// ── POST   /api/orders          — execute or queue trade (BUY or SELL with CNC / MIS 5x leverage & LIMIT orders)
// ── GET    /api/orders          — order history (supports ?status=PENDING | EXECUTED)
// ── DELETE /api/orders/:id      — cancel pending limit order (with blocked margin refund)

import { Router, Request, Response } from "express";
import db, { transaction } from "../db/database.js";
import type { MarketDataProvider, StockQuote } from "../market/MarketDataProvider.js";

export interface OrderBody {
  symbol: string;
  side: "BUY" | "SELL";
  orderType?: "MARKET" | "LIMIT";
  productType?: "CNC" | "MIS"; // Delivery (1x) vs Intraday (5x leverage)
  qty: number;
  price: number; // Execution price for MARKET, or target price for LIMIT
  stopLoss?: number;
  targetPrice?: number;
}

export function checkPendingOrders(quotes: StockQuote[]): void {
  const pending = db
    .prepare("SELECT * FROM orders WHERE status = 'PENDING'")
    .all() as any[];

  if (pending.length === 0 || quotes.length === 0) return;

  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  for (const order of pending) {
    const q = quoteMap.get(order.symbol);
    if (!q || q.price <= 0) continue;

    const limitTarget = order.limit_price ?? order.price;
    let shouldFill = false;
    let fillPrice = limitTarget;

    if (order.side === "BUY" && q.price <= limitTarget) {
      shouldFill = true;
      fillPrice = q.price; // execute at current better market price
    } else if (order.side === "SELL" && q.price >= limitTarget) {
      shouldFill = true;
      fillPrice = q.price; // execute at current higher market price
    }

    if (shouldFill) {
      try {
        transaction(() => {
          const userId = order.user_id || 1;
          const marginFactor = order.product_type === "MIS" ? 5 : 1;
          const totalValue = parseFloat((order.qty * fillPrice).toFixed(2));
          const actualMargin = parseFloat((totalValue / marginFactor).toFixed(2));

          if (order.side === "BUY") {
            // Price improvement refund (if filled lower than limit price)
            const refund = Math.max(0, parseFloat((order.margin_used - actualMargin).toFixed(2)));
            if (refund > 0) {
              db.prepare(
                "UPDATE wallet SET cash = cash + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?"
              ).run(refund, userId);
              db.prepare(
                "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
              ).run(userId, "CREDIT", refund, `Price improvement refund on BUY LIMIT #${order.id} (${order.symbol})`);
            }

            const holding = db
              .prepare("SELECT * FROM holdings WHERE user_id = ? AND symbol = ? AND product_type = ?")
              .get(userId, order.symbol, order.product_type) as any;

            if (holding && holding.qty > 0) {
              const newQty = holding.qty + order.qty;
              const newAvg = parseFloat(
                ((holding.qty * holding.avg_price + order.qty * fillPrice) / newQty).toFixed(4)
              );
              const newMargin = parseFloat((holding.margin_used + actualMargin).toFixed(2));
              db.prepare(
                "UPDATE holdings SET qty = ?, avg_price = ?, margin_used = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND symbol = ? AND product_type = ?"
              ).run(newQty, newAvg, newMargin, userId, order.symbol, order.product_type);
            } else {
              db.prepare(
                "INSERT INTO holdings (user_id, symbol, product_type, qty, avg_price, margin_used) VALUES (?, ?, ?, ?, ?, ?)"
              ).run(userId, order.symbol, order.product_type, order.qty, fillPrice, actualMargin);
            }

            db.prepare(
              "UPDATE orders SET status = 'EXECUTED', price = ?, total_value = ?, margin_used = ?, executed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
            ).run(fillPrice, totalValue, actualMargin, order.id);

            console.log(`🔔 [LIMIT FILL] BUY ${order.qty} × ${order.symbol} @ ₹${fillPrice} (${order.product_type}) for user #${userId}`);
          } else {
            // SELL
            const holding = db
              .prepare("SELECT * FROM holdings WHERE user_id = ? AND symbol = ? AND product_type = ?")
              .get(userId, order.symbol, order.product_type) as any;

            if (!holding || holding.qty < order.qty) {
              db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(order.id);
              return;
            }

            const realisedPnl = parseFloat(((fillPrice - holding.avg_price) * order.qty).toFixed(2));
            let cashCredit = 0;

            if (order.product_type === "MIS") {
              const marginReleased = parseFloat((holding.margin_used * (order.qty / holding.qty)).toFixed(2));
              cashCredit = parseFloat((marginReleased + realisedPnl).toFixed(2));
            } else {
              cashCredit = totalValue;
            }

            db.prepare(
              "UPDATE wallet SET cash = cash + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?"
            ).run(cashCredit, userId);

            db.prepare(
              "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
            ).run(userId, "CREDIT", cashCredit, `LIMIT SELL ${order.qty} × ${order.symbol} @ ₹${fillPrice} (${order.product_type})`);

            const remainingQty = holding.qty - order.qty;
            if (remainingQty === 0) {
              db.prepare("DELETE FROM holdings WHERE user_id = ? AND symbol = ? AND product_type = ?").run(userId, order.symbol, order.product_type);
            } else {
              const remainingMargin = parseFloat((holding.margin_used * (remainingQty / holding.qty)).toFixed(2));
              db.prepare(
                "UPDATE holdings SET qty = ?, margin_used = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND symbol = ? AND product_type = ?"
              ).run(remainingQty, remainingMargin, userId, order.symbol, order.product_type);
            }

            db.prepare(
              "UPDATE orders SET status = 'EXECUTED', price = ?, total_value = ?, realised_pnl = ?, executed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
            ).run(fillPrice, totalValue, realisedPnl, order.id);

            console.log(`🔔 [LIMIT FILL] SELL ${order.qty} × ${order.symbol} @ ₹${fillPrice} (P&L: ₹${realisedPnl}) for user #${userId}`);
          }
        });
      } catch (err) {
        console.error(`Failed to process limit order #${order.id}:`, err);
      }
    }
  }
}

export function ordersRouter(getMarket: () => MarketDataProvider): Router {
  const router = Router();

  // GET /api/orders — order history & open limit orders
  router.get("/", (req: Request, res: Response) => {
    const userId = req.userId || 1;
    const status = req.query.status as string | undefined;
    let query = `
      SELECT id, symbol, side, order_type, product_type, status, qty, price, limit_price, total_value, margin_used, realised_pnl, created_at, executed_at
      FROM orders
      WHERE user_id = ?
    `;
    const params: any[] = [userId];
    if (status) {
      query += " AND status = ? ";
      params.push(status);
    }
    query += " ORDER BY id DESC LIMIT 200";

    const orders = db.prepare(query).all(...params);
    res.json({ data: orders });
  });

  // DELETE /api/orders/:id — cancel a pending limit order with refund
  router.delete("/:id", (req: Request, res: Response) => {
    const userId = req.userId || 1;
    const id = Number(req.params.id);
    try {
      transaction(() => {
        const order = db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").get(id, userId) as any;
        if (!order) {
          res.status(404).json({ error: "Order not found" });
          return;
        }
        if (order.status !== "PENDING") {
          res.status(400).json({ error: `Cannot cancel order with status ${order.status}` });
          return;
        }

        // If BUY order, refund blocked margin
        if (order.side === "BUY" && order.margin_used > 0) {
          db.prepare(
            "UPDATE wallet SET cash = cash + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?"
          ).run(order.margin_used, userId);

          db.prepare(
            "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
          ).run(userId, "CREDIT", order.margin_used, `Refund blocked margin on cancelled BUY LIMIT #${order.id} (${order.symbol})`);
        }

        db.prepare(
          "UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND user_id = ?"
        ).run(id, userId);

        res.json({ success: true, message: `Order #${id} cancelled`, id });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel order";
      res.status(500).json({ error: msg });
    }
  });

  // POST /api/orders — execute or queue trade
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.userId || 1;
    const {
      symbol,
      side,
      qty,
      price,
      orderType = "MARKET",
      productType = "CNC",
      stopLoss,
      targetPrice,
    } = req.body as OrderBody;

    // Validation
    if (!symbol || !side || !qty || !price) {
      res.status(400).json({ error: "symbol, side, qty, and price are required" });
      return;
    }
    if (side !== "BUY" && side !== "SELL") {
      res.status(400).json({ error: "side must be BUY or SELL" });
      return;
    }
    if (orderType !== "MARKET" && orderType !== "LIMIT") {
      res.status(400).json({ error: "orderType must be MARKET or LIMIT" });
      return;
    }
    if (productType !== "CNC" && productType !== "MIS") {
      res.status(400).json({ error: "productType must be CNC or MIS" });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      res.status(400).json({ error: "qty must be a positive integer" });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: "price must be a positive number" });
      return;
    }

    const SYM = symbol.toUpperCase();
    const marginFactor = productType === "MIS" ? 5 : 1; // 5x Leverage for MIS
    const totalValue = parseFloat((qty * price).toFixed(2));
    const marginRequired = parseFloat((totalValue / marginFactor).toFixed(2));

    try {
      const currentQuote = await getMarket().getQuote(SYM);
      const currentPrice = currentQuote?.price ?? price;

      // Determine if limit order can fill immediately or should be queued
      let isPending = false;
      if (orderType === "LIMIT") {
        if (side === "BUY" && price < currentPrice) {
          isPending = true;
        } else if (side === "SELL" && price > currentPrice) {
          isPending = true;
        }
      }

      const executeTrade = () =>
        transaction(() => {
          let wallet = db
            .prepare("SELECT cash FROM wallet WHERE user_id = ?")
            .get(userId) as { cash: number } | undefined;

          if (!wallet) {
            db.prepare("INSERT INTO wallet (user_id, cash) VALUES (?, 10000000)").run(userId);
            wallet = { cash: 10000000 };
          }

          const holding = db
            .prepare("SELECT * FROM holdings WHERE user_id = ? AND symbol = ? AND product_type = ?")
            .get(userId, SYM, productType) as { qty: number; avg_price: number; margin_used: number } | undefined;

          // ── BUY ORDER ──────────────────────────────────────
          if (side === "BUY") {
            if (wallet.cash < marginRequired) {
              throw new Error(
                `Insufficient funds. Available: ₹${wallet.cash.toFixed(2)}, Required: ₹${marginRequired.toFixed(2)}`
              );
            }

            // Deduct required margin (blocked for pending, spent for immediate)
            db.prepare(
              "UPDATE wallet SET cash = cash - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?"
            ).run(marginRequired, userId);

            if (isPending) {
              // Queue as PENDING LIMIT ORDER
              db.prepare(
                "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
              ).run(userId, "DEBIT", marginRequired, `Margin Blocked for BUY LIMIT ${qty} × ${SYM} @ ₹${price} (${productType})`);

              db.prepare(`
                INSERT INTO orders (user_id, symbol, side, order_type, product_type, status, qty, price, limit_price, total_value, margin_used)
                VALUES (?, ?, 'BUY', 'LIMIT', ?, 'PENDING', ?, ?, ?, ?, ?)
              `).run(userId, SYM, productType, qty, price, price, totalValue, marginRequired);
            } else {
              // Fill Immediately
              db.prepare(
                "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
              ).run(userId, "DEBIT", marginRequired, `BUY ${qty} × ${SYM} @ ₹${price} (${productType}${productType === "MIS" ? " 5x" : ""})`);

              if (holding && holding.qty > 0) {
                const newQty = holding.qty + qty;
                const newAvg = parseFloat(
                  ((holding.qty * holding.avg_price + qty * price) / newQty).toFixed(4)
                );
                const newMargin = parseFloat(((holding.margin_used || 0) + marginRequired).toFixed(2));
                db.prepare(
                  "UPDATE holdings SET qty = ?, avg_price = ?, margin_used = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND symbol = ? AND product_type = ?"
                ).run(newQty, newAvg, newMargin, userId, SYM, productType);
              } else {
                db.prepare(
                  "INSERT INTO holdings (user_id, symbol, product_type, qty, avg_price, margin_used) VALUES (?, ?, ?, ?, ?, ?)"
                ).run(userId, SYM, productType, qty, price, marginRequired);
              }

              db.prepare(`
                INSERT INTO orders (user_id, symbol, side, order_type, product_type, status, qty, price, limit_price, total_value, margin_used, executed_at)
                VALUES (?, ?, 'BUY', ?, ?, 'EXECUTED', ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              `).run(userId, SYM, orderType, productType, qty, price, price, totalValue, marginRequired);

              // Auto-triggers for SL/TP
              if (stopLoss && Number.isFinite(stopLoss) && stopLoss > 0) {
                db.prepare(
                  "INSERT INTO auto_triggers (user_id, symbol, side, qty, trigger_type, trigger_price) VALUES (?, ?, 'SELL', ?, 'STOP_LOSS', ?)"
                ).run(userId, SYM, qty, stopLoss);
              }
              if (targetPrice && Number.isFinite(targetPrice) && targetPrice > 0) {
                db.prepare(
                  "INSERT INTO auto_triggers (user_id, symbol, side, qty, trigger_type, trigger_price) VALUES (?, ?, 'SELL', ?, 'TARGET', ?)"
                ).run(userId, SYM, qty, targetPrice);
              }
            }
          } else {
            // ── SELL ORDER ─────────────────────────────────────
            const pendingSellRow = db
              .prepare("SELECT COALESCE(SUM(qty), 0) as locked FROM orders WHERE user_id = ? AND symbol = ? AND product_type = ? AND side = 'SELL' AND status = 'PENDING'")
              .get(userId, SYM, productType) as { locked: number };

            const availableShares = (holding?.qty ?? 0) - pendingSellRow.locked;
            if (availableShares < qty) {
              throw new Error(
                `Insufficient shares. Holdings: ${holding?.qty ?? 0} (${pendingSellRow.locked} locked in open orders), Requested: ${qty}`
              );
            }

            if (isPending) {
              // Queue as PENDING LIMIT ORDER
              db.prepare(`
                INSERT INTO orders (user_id, symbol, side, order_type, product_type, status, qty, price, limit_price, total_value)
                VALUES (?, ?, 'SELL', 'LIMIT', ?, 'PENDING', ?, ?, ?, ?)
              `).run(userId, SYM, productType, qty, price, price, totalValue);
            } else {
              // Fill Immediately
              const realisedPnl = parseFloat(((price - holding!.avg_price) * qty).toFixed(2));
              let cashCredit = 0;

              if (productType === "MIS") {
                const marginReleased = parseFloat((holding!.margin_used * (qty / holding!.qty)).toFixed(2));
                cashCredit = parseFloat((marginReleased + realisedPnl).toFixed(2));
              } else {
                cashCredit = totalValue;
              }

              db.prepare(
                "UPDATE wallet SET cash = cash + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?"
              ).run(cashCredit, userId);

              db.prepare(
                "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)"
              ).run(userId, "CREDIT", cashCredit, `SELL ${qty} × ${SYM} @ ₹${price} (${productType})`);

              const remainingQty = holding!.qty - qty;
              if (remainingQty === 0) {
                db.prepare("DELETE FROM holdings WHERE user_id = ? AND symbol = ? AND product_type = ?").run(userId, SYM, productType);
                db.prepare("UPDATE auto_triggers SET status = 'CANCELLED' WHERE user_id = ? AND symbol = ? AND status = 'ACTIVE'").run(userId, SYM);
              } else {
                const remainingMargin = parseFloat((holding!.margin_used * (remainingQty / holding!.qty)).toFixed(2));
                db.prepare(
                  "UPDATE holdings SET qty = ?, margin_used = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND symbol = ? AND product_type = ?"
                ).run(remainingQty, remainingMargin, userId, SYM, productType);
                db.prepare(
                  "UPDATE auto_triggers SET qty = ? WHERE user_id = ? AND symbol = ? AND status = 'ACTIVE' AND qty > ?"
                ).run(remainingQty, userId, SYM, remainingQty);
              }

              db.prepare(`
                INSERT INTO orders (user_id, symbol, side, order_type, product_type, status, qty, price, limit_price, total_value, realised_pnl, executed_at)
                VALUES (?, ?, 'SELL', ?, ?, 'EXECUTED', ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              `).run(userId, SYM, orderType, productType, qty, price, price, totalValue, realisedPnl);
            }
          }

          const updatedWallet = db
            .prepare("SELECT cash FROM wallet WHERE user_id = ?")
            .get(userId) as { cash: number };
          const lastOrder = db
            .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1")
            .get(userId);

          return { wallet: updatedWallet, order: lastOrder, isPending };
        });

      const result = executeTrade();
      res.status(201).json({ data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Trade execution failed";
      res.status(400).json({ error: message });
    }
  });

  return router;
}
