import { Router, Request, Response, NextFunction } from "express";
import db from "../db/database.js";

export const adminRouter = Router();

const DEFAULT_ADMIN_KEY = process.env.ADMIN_KEY || "admin123";

// Middleware to verify admin key
function verifyAdminKey(req: Request, res: Response, next: NextFunction) {
  const providedKey =
    (req.headers["x-admin-key"] as string) || (req.query.key as string);

  if (!providedKey || providedKey !== DEFAULT_ADMIN_KEY) {
    res.status(401).json({
      error: "Unauthorized: Invalid or missing Admin Secret Key.",
      hint: "Default key is 'admin123' or configure ADMIN_KEY env variable.",
    });
    return;
  }
  next();
}

adminRouter.use(verifyAdminKey);

// GET /api/admin/users — list all users with wallet & activity metrics
adminRouter.get("/users", (_req: Request, res: Response) => {
  try {
    const users = db
      .prepare(
        `SELECT 
          u.id, 
          u.username, 
          u.email, 
          u.name, 
          u.is_guest, 
          u.created_at,
          COALESCE(w.cash, 10000000) as cash,
          (SELECT COUNT(*) FROM holdings h WHERE h.user_id = u.id AND h.qty > 0) as open_positions_count,
          (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as total_orders_count
        FROM users u
        LEFT JOIN wallet w ON w.user_id = u.id
        ORDER BY u.id DESC`
      )
      .all() as any[];

    const totalUsers = users.length;
    const cloudUsers = users.filter((u) => !u.is_guest).length;
    const guestUsers = users.filter((u) => u.is_guest).length;
    const totalCash = users.reduce((acc, u) => acc + (Number(u.cash) || 0), 0);
    const totalTrades = users.reduce((acc, u) => acc + (Number(u.total_orders_count) || 0), 0);

    res.json({
      success: true,
      data: {
        users,
        summary: {
          totalUsers,
          cloudUsers,
          guestUsers,
          totalCash,
          totalTrades,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch admin users data: " + err.message });
  }
});

// GET /api/admin/users/:userId — inspect a specific user's holdings and orders
adminRouter.get("/users/:userId", (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  try {
    const user = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.name, u.is_guest, u.created_at, COALESCE(w.cash, 10000000) as cash 
         FROM users u 
         LEFT JOIN wallet w ON w.user_id = u.id 
         WHERE u.id = ?`
      )
      .get(userId) as any;

    if (!user) {
      res.status(404).json({ error: `User with ID ${userId} not found` });
      return;
    }

    const holdings = db
      .prepare(
        `SELECT symbol, product_type, qty, avg_price, margin_used, updated_at 
         FROM holdings 
         WHERE user_id = ? AND qty > 0 
         ORDER BY symbol ASC`
      )
      .all(userId);

    const orders = db
      .prepare(
        `SELECT id, symbol, side, order_type, product_type, status, qty, price, total_value, created_at, executed_at 
         FROM orders 
         WHERE user_id = ? 
         ORDER BY id DESC LIMIT 50`
      )
      .all(userId);

    res.json({
      success: true,
      data: {
        user,
        holdings,
        orders,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to inspect user: " + err.message });
  }
});
