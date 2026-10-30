// ── Auto-Triggers Route (Stop-Loss and Target Management) ────

import { Router, Request, Response } from "express";
import db from "../db/database.js";

export const triggersRouter = Router();

// GET /api/triggers
triggersRouter.get("/", (req: Request, res: Response) => {
  const userId = req.userId || 1;
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  try {
    let triggers;
    if (symbol) {
      triggers = db
        .prepare("SELECT * FROM auto_triggers WHERE user_id = ? AND symbol = ? ORDER BY id DESC")
        .all(userId, symbol);
    } else {
      triggers = db
        .prepare("SELECT * FROM auto_triggers WHERE user_id = ? ORDER BY id DESC LIMIT 100")
        .all(userId);
    }
    res.json({ data: triggers });
  } catch {
    res.status(500).json({ error: "Failed to fetch triggers" });
  }
});

// POST /api/triggers
triggersRouter.post("/", (req: Request, res: Response) => {
  const userId = req.userId || 1;
  const { symbol, trigger_type, trigger_price, qty } = req.body;

  if (!symbol || !trigger_type || !trigger_price) {
    res.status(400).json({ error: "symbol, trigger_type, and trigger_price are required" });
    return;
  }

  if (trigger_type !== "STOP_LOSS" && trigger_type !== "TARGET") {
    res.status(400).json({ error: "trigger_type must be STOP_LOSS or TARGET" });
    return;
  }

  const price = parseFloat(trigger_price);
  if (isNaN(price) || price <= 0) {
    res.status(400).json({ error: "trigger_price must be a positive number" });
    return;
  }

  const SYM = symbol.toUpperCase();
  const holding = db
    .prepare("SELECT SUM(qty) as total_qty FROM holdings WHERE user_id = ? AND symbol = ?")
    .get(userId, SYM) as { total_qty: number } | undefined;

  if (!holding || !holding.total_qty || holding.total_qty <= 0) {
    res.status(400).json({ error: `Cannot set trigger: You do not own shares of ${SYM}` });
    return;
  }

  const triggerQty = qty && Number.isInteger(qty) && qty > 0 ? Math.min(qty, holding.total_qty) : holding.total_qty;

  try {
    // Cancel any existing active trigger of the same type for this symbol for this user
    db.prepare(
      "UPDATE auto_triggers SET status = 'CANCELLED' WHERE user_id = ? AND symbol = ? AND trigger_type = ? AND status = 'ACTIVE'"
    ).run(userId, SYM, trigger_type);

    const result = db.prepare(
      "INSERT INTO auto_triggers (user_id, symbol, side, qty, trigger_type, trigger_price) VALUES (?, ?, 'SELL', ?, ?, ?)"
    ).run(userId, SYM, triggerQty, trigger_type, price);

    const created = db.prepare("SELECT * FROM auto_triggers WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ data: created });
  } catch (err) {
    res.status(500).json({ error: "Failed to create trigger" });
  }
});

// DELETE /api/triggers/:id
triggersRouter.delete("/:id", (req: Request, res: Response) => {
  const userId = req.userId || 1;
  const id = Number(req.params.id);
  try {
    const trigger = db.prepare("SELECT * FROM auto_triggers WHERE id = ? AND user_id = ?").get(id, userId) as any;
    if (!trigger) {
      res.status(404).json({ error: "Trigger not found" });
      return;
    }
    db.prepare("UPDATE auto_triggers SET status = 'CANCELLED' WHERE id = ? AND user_id = ?").run(id, userId);
    res.json({ success: true, id });
  } catch {
    res.status(500).json({ error: "Failed to cancel trigger" });
  }
});
