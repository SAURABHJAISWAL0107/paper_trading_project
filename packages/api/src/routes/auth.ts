import { Router, Request, Response } from "express";
import db, { transaction } from "../db/database.js";
import { hashPassword, verifyPassword, generateToken } from "../auth/authUtils.js";

export const authRouter = Router();

// GET /api/auth/me — get current user profile & wallet
authRouter.get("/me", (req: Request, res: Response) => {
  const userId = req.userId || 1;
  const user = db
    .prepare("SELECT id, username, email, name, is_guest, created_at FROM users WHERE id = ?")
    .get(userId) as any;

  const wallet = db
    .prepare("SELECT cash FROM wallet WHERE user_id = ?")
    .get(userId) as { cash: number } | undefined;

  if (!user) {
    res.status(404).json({ error: "User profile not found" });
    return;
  }

  res.json({
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name || user.username,
        isGuest: Boolean(user.is_guest),
        createdAt: user.created_at,
      },
      cash: wallet?.cash ?? 10_000_000,
    },
  });
});

// POST /api/auth/guest — create an instant guest session
authRouter.post("/guest", (_req: Request, res: Response) => {
  try {
    const result = transaction(() => {
      const guestSuffix = Math.floor(1000 + Math.random() * 9000);
      const username = `trader_${guestSuffix}`;
      const name = `Guest Trader #${guestSuffix}`;

      const userInsert = db
        .prepare(`
          INSERT INTO users (username, name, is_guest)
          VALUES (?, ?, 1)
        `)
        .run(username, name);

      const userId = Number(userInsert.lastInsertRowid);

      // Create isolated ₹1 Crore wallet
      db.prepare(`
        INSERT INTO wallet (user_id, cash)
        VALUES (?, 10000000)
      `).run(userId);

      db.prepare(`
        INSERT INTO wallet_transactions (user_id, type, amount, description)
        VALUES (?, 'CREDIT', 10000000, 'Initial virtual balance')
      `).run(userId);

      // Generate session token
      const token = generateToken();
      db.prepare(`
        INSERT INTO sessions (token, user_id)
        VALUES (?, ?)
      `).run(token, userId);

      return {
        user: {
          id: userId,
          username,
          email: null,
          name,
          isGuest: true,
        },
        token,
      };
    });

    res.status(201).json({ data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create guest session";
    res.status(500).json({ error: msg });
  }
});

// POST /api/auth/register — upgrade guest or create new account
authRouter.post("/register", (req: Request, res: Response) => {
  const { username, email, password, name, guestToken } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;

  try {
    const result = transaction(() => {
      // Check duplicate username / email
      const existingUser = db
        .prepare("SELECT id FROM users WHERE username = ? AND is_guest = 0")
        .get(cleanUser);
      if (existingUser) {
        throw new Error("Username is already taken");
      }
      if (cleanEmail) {
        const existingEmail = db
          .prepare("SELECT id FROM users WHERE email = ? AND is_guest = 0")
          .get(cleanEmail);
        if (existingEmail) {
          throw new Error("Email is already registered");
        }
      }

      const { hash, salt } = hashPassword(password);
      let userId: number;
      let isUpgrade = false;

      // Check if upgrading an existing guest session
      if (guestToken) {
        const guestSession = db
          .prepare(`
            SELECT s.user_id, u.is_guest
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND u.is_guest = 1
          `)
          .get(guestToken) as any;

        if (guestSession) {
          userId = guestSession.user_id;
          isUpgrade = true;

          db.prepare(`
            UPDATE users
            SET username = ?, email = ?, password_hash = ?, salt = ?, name = ?, is_guest = 0
            WHERE id = ?
          `).run(cleanUser, cleanEmail, hash, salt, name || cleanUser, userId);
        }
      }

      if (!isUpgrade) {
        // Create new account from scratch
        const insert = db
          .prepare(`
            INSERT INTO users (username, email, password_hash, salt, name, is_guest)
            VALUES (?, ?, ?, ?, ?, 0)
          `)
          .run(cleanUser, cleanEmail, hash, salt, name || cleanUser);

        userId = Number(insert.lastInsertRowid);

        // Seed wallet
        db.prepare(`
          INSERT INTO wallet (user_id, cash)
          VALUES (?, 10000000)
        `).run(userId);

        db.prepare(`
          INSERT INTO wallet_transactions (user_id, type, amount, description)
          VALUES (?, 'CREDIT', 10000000, 'Initial virtual balance')
        `).run(userId);
      }

      // Generate session token
      const token = generateToken();
      db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId!);

      return {
        user: {
          id: userId!,
          username: cleanUser,
          email: cleanEmail,
          name: name || cleanUser,
          isGuest: false,
        },
        token,
      };
    });

    res.status(201).json({ data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    res.status(400).json({ error: msg });
  }
});

// POST /api/auth/login — sign in with username/email & password
authRouter.post("/login", (req: Request, res: Response) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    res.status(400).json({ error: "Username/Email and password are required" });
    return;
  }

  const cleanLogin = String(usernameOrEmail).trim().toLowerCase();

  try {
    const user = db
      .prepare(`
        SELECT id, username, email, password_hash, salt, name, is_guest
        FROM users
        WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND is_guest = 0
      `)
      .get(cleanLogin, cleanLogin) as any;

    if (!user || !user.password_hash || !user.salt) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = generateToken();
    db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, user.id);

    res.json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name || user.username,
          isGuest: false,
        },
        token,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Login failed";
    res.status(500).json({ error: msg });
  }
});

// POST /api/auth/forgot-password — generate 6-digit recovery code
authRouter.post("/forgot-password", (req: Request, res: Response) => {
  const { usernameOrEmail } = req.body;
  if (!usernameOrEmail) {
    res.status(400).json({ error: "Username or Email is required" });
    return;
  }

  const cleanLogin = String(usernameOrEmail).trim().toLowerCase();
  const user = db
    .prepare(`
      SELECT id, username, email FROM users
      WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND is_guest = 0
    `)
    .get(cleanLogin, cleanLogin) as any;

  if (!user) {
    res.status(404).json({ error: "No account found with that username or email" });
    return;
  }

  try {
    // Generate secure 6-digit OTP code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

    // Invalidate existing codes
    db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?").run(user.id);

    db.prepare(`
      INSERT INTO password_resets (user_id, reset_code, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, resetCode, expiresAt);

    res.json({
      success: true,
      message: "Password reset code generated successfully",
      // Returned for instant display/pre-fill when SMTP is not configured
      code: resetCode,
      username: user.username,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to create reset code" });
  }
});

// POST /api/auth/reset-password — verify OTP and update password
authRouter.post("/reset-password", (req: Request, res: Response) => {
  const { usernameOrEmail, resetCode, newPassword } = req.body;

  if (!usernameOrEmail || !resetCode || !newPassword) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const cleanLogin = String(usernameOrEmail).trim().toLowerCase();

  try {
    const result = transaction(() => {
      const user = db
        .prepare(`
          SELECT id, username, email, name FROM users
          WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND is_guest = 0
        `)
        .get(cleanLogin, cleanLogin) as any;

      if (!user) {
        throw new Error("User account not found");
      }

      const resetRow = db
        .prepare(`
          SELECT id, expires_at FROM password_resets
          WHERE user_id = ? AND reset_code = ? AND used = 0
          ORDER BY id DESC LIMIT 1
        `)
        .get(user.id, String(resetCode).trim()) as any;

      if (!resetRow) {
        throw new Error("Invalid reset code");
      }

      if (new Date(resetRow.expires_at).getTime() < Date.now()) {
        throw new Error("Reset code has expired. Please request a new one.");
      }

      // Mark reset code as used
      db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(resetRow.id);

      // Hash and update password
      const { hash, salt } = hashPassword(newPassword);
      db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(hash, salt, user.id);

      // Generate a fresh session token
      const token = generateToken();
      db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, user.id);

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name || user.username,
          isGuest: false,
        },
        token,
      };
    });

    res.json({
      success: true,
      message: "Password reset successful! You are now logged in.",
      data: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Password reset failed";
    res.status(400).json({ error: msg });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  res.json({ success: true });
});

