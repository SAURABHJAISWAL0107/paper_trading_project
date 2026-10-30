// ── GET  /api/wallet          — balance + recent transactions
// ── (wallet is mutated via orders route only)

import { Router, Request, Response } from "express";
import db from "../db/database.js";

export const walletRouter = Router();

walletRouter.get("/", (req: Request, res: Response) => {
  const userId = req.userId || 1;
  const wallet = db.prepare("SELECT cash, updated_at FROM wallet WHERE user_id = ?").get(userId) as
    | { cash: number; updated_at: string }
    | undefined;

  const transactions = db
    .prepare(
      "SELECT id, type, amount, description, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50"
    )
    .all(userId) as Array<{
      id: number;
      type: string;
      amount: number;
      description: string;
      created_at: string;
    }>;

  res.json({ data: { wallet: wallet ?? { cash: 10_000_000, updated_at: new Date().toISOString() }, transactions } });
});
