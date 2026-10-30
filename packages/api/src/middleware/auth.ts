import type { Request, Response, NextFunction } from "express";
import db from "../db/database.js";

export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  is_guest: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userId: number;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let userId = 1; // Default fallback to preserve backward compatibility

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const row = db
          .prepare(`
            SELECT u.id, u.username, u.email, u.name, u.is_guest
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
          `)
          .get(token) as any;

        if (row) {
          req.user = {
            id: row.id,
            username: row.username,
            email: row.email,
            name: row.name || row.username,
            is_guest: Boolean(row.is_guest),
          };
          userId = row.id;
        }
      } catch {
        // Fall back to default user
      }
    }
  }

  req.userId = userId;
  next();
}

