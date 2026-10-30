// ============================================================
// Database initialisation — native SQLite via node:sqlite
// ============================================================

import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH || path.join(path.resolve(__dirname, "../../data"), "paper-trader.db");
const DB_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// Enable WAL for better performance
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// ── Schema ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT,
    salt          TEXT,
    name          TEXT,
    is_guest      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_code  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS wallet (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE,
    cash        REAL    NOT NULL DEFAULT 10000000,
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    type        TEXT    NOT NULL, -- 'CREDIT' | 'DEBIT'
    amount      REAL    NOT NULL,
    description TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL DEFAULT 1,
    symbol        TEXT    NOT NULL,
    product_type  TEXT    NOT NULL DEFAULT 'CNC', -- 'CNC' (Delivery) | 'MIS' (Intraday 5x)
    qty           INTEGER NOT NULL DEFAULT 0,
    avg_price     REAL    NOT NULL DEFAULT 0,
    margin_used   REAL    NOT NULL DEFAULT 0,
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(user_id, symbol, product_type)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL DEFAULT 1,
    symbol        TEXT    NOT NULL,
    side          TEXT    NOT NULL, -- 'BUY' | 'SELL'
    order_type    TEXT    NOT NULL DEFAULT 'MARKET', -- 'MARKET' | 'LIMIT'
    product_type  TEXT    NOT NULL DEFAULT 'CNC', -- 'CNC' | 'MIS'
    status        TEXT    NOT NULL DEFAULT 'EXECUTED', -- 'EXECUTED' | 'PENDING' | 'CANCELLED'
    qty           INTEGER NOT NULL,
    price         REAL    NOT NULL,
    limit_price   REAL,
    total_value   REAL    NOT NULL,
    margin_used   REAL    NOT NULL DEFAULT 0,
    realised_pnl  REAL,            -- null for BUY; calculated on SELL
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    executed_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    symbol      TEXT NOT NULL,
    user_id     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS auto_triggers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL DEFAULT 1,
    symbol        TEXT    NOT NULL,
    side          TEXT    NOT NULL DEFAULT 'SELL',
    qty           INTEGER NOT NULL,
    trigger_type  TEXT    NOT NULL, -- 'STOP_LOSS' | 'TARGET'
    trigger_price REAL    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'TRIGGERED' | 'CANCELLED'
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    triggered_at  TEXT
  );
`);

// Safe migrations for existing databases
try {
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet'").get() as any;
  if (tableSql?.sql && tableSql.sql.includes("CHECK")) {
    db.exec(`
      CREATE TABLE wallet_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL UNIQUE,
        cash        REAL    NOT NULL DEFAULT 10000000,
        updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT OR IGNORE INTO wallet_new (id, user_id, cash, updated_at)
        SELECT id, COALESCE(user_id, 1), cash, updated_at FROM wallet;
      DROP TABLE wallet;
      ALTER TABLE wallet_new RENAME TO wallet;
    `);
  }
} catch {}

try {
  const holdingsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='holdings'").get() as any;
  if (holdingsSql?.sql && !holdingsSql.sql.includes("user_id, symbol, product_type")) {
    db.exec(`
      CREATE TABLE holdings_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL DEFAULT 1,
        symbol        TEXT    NOT NULL,
        product_type  TEXT    NOT NULL DEFAULT 'CNC',
        qty           INTEGER NOT NULL DEFAULT 0,
        avg_price     REAL    NOT NULL DEFAULT 0,
        margin_used   REAL    NOT NULL DEFAULT 0,
        updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(user_id, symbol, product_type)
      );
      INSERT OR IGNORE INTO holdings_new (id, user_id, symbol, product_type, qty, avg_price, margin_used, updated_at)
        SELECT id, COALESCE(user_id, 1), symbol, COALESCE(product_type, 'CNC'), qty, avg_price, COALESCE(margin_used, 0), updated_at FROM holdings;
      DROP TABLE holdings;
      ALTER TABLE holdings_new RENAME TO holdings;
    `);
  }
} catch {}

try {
  const wlSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='watchlist'").get() as any;
  if (wlSql?.sql && !wlSql.sql.includes("PRIMARY KEY (user_id, symbol)")) {
    db.exec(`
      CREATE TABLE watchlist_new (
        symbol      TEXT NOT NULL,
        user_id     INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY (user_id, symbol)
      );
      INSERT OR IGNORE INTO watchlist_new (symbol, user_id, created_at)
        SELECT symbol, COALESCE(user_id, 1), created_at FROM watchlist;
      DROP TABLE watchlist;
      ALTER TABLE watchlist_new RENAME TO watchlist;
    `);
  }
} catch {}

try { db.exec("ALTER TABLE wallet ADD COLUMN user_id INTEGER;"); } catch {}
try { db.exec("ALTER TABLE wallet_transactions ADD COLUMN user_id INTEGER DEFAULT 1;"); } catch {}
try { db.exec("ALTER TABLE holdings ADD COLUMN user_id INTEGER DEFAULT 1;"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN user_id INTEGER DEFAULT 1;"); } catch {}
try { db.exec("ALTER TABLE auto_triggers ADD COLUMN user_id INTEGER DEFAULT 1;"); } catch {}
try { db.exec("ALTER TABLE watchlist ADD COLUMN user_id INTEGER DEFAULT 1;"); } catch {}

// Seed default user (id = 1)
const defaultUser = db.prepare("SELECT id FROM users WHERE id = 1").get();
if (!defaultUser) {
  db.prepare(`
    INSERT INTO users (id, username, email, name, is_guest)
    VALUES (1, 'default_trader', 'guest@papertrader.local', 'Default Trader', 1)
  `).run();
}

// Seed wallet for default user if empty
const defaultWallet = db.prepare("SELECT id FROM wallet WHERE user_id = 1").get();
if (!defaultWallet) {
  db.prepare("INSERT INTO wallet (user_id, cash) VALUES (1, 10000000)").run();
  db.prepare(
    "INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (1, ?, ?, ?)"
  ).run("CREDIT", 10000000, "Initial virtual balance");
  console.log("✅ Default wallet seeded with ₹1,00,00,000 (₹1 Crore)");
}

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export default db;
