// ============================================================
// End-to-End Integration Test Suite for Paper Trader
// ============================================================

import express from "express";
import http from "http";
import { SampleDataProvider } from "./market/SampleDataProvider.js";
import { stocksRouter } from "./routes/stocks.js";
import { walletRouter } from "./routes/wallet.js";
import { ordersRouter } from "./routes/orders.js";
import { portfolioRouter } from "./routes/portfolio.js";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import db from "./db/database.js";

// Clean DB for clean test run
db.exec("DELETE FROM orders;");
db.exec("DELETE FROM holdings;");
db.exec("DELETE FROM wallet_transactions;");
db.exec("DELETE FROM sessions;");
db.exec("DELETE FROM users WHERE id > 1;");
db.prepare("UPDATE wallet SET cash = 10000000 WHERE user_id = 1").run();
db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (1, ?, ?, ?)").run(
  "CREDIT", 10000000, "Initial virtual balance"
);

const app = express();
app.use(express.json());
app.use(authMiddleware);

const market = new SampleDataProvider();
app.use("/api/auth", authRouter);
app.use("/api/stocks", stocksRouter(() => market));
app.use("/api/wallet", walletRouter);
app.use("/api/orders", ordersRouter(() => market));
app.use("/api/portfolio", portfolioRouter(() => market));

async function runTests() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
  const baseUrl = "http://localhost:4001/api";

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  async function req(path: string, options?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...((options?.headers as any) || {}),
      },
    });
    const json = await res.json();
    return { status: res.status, ok: res.ok, json };
  }

  console.log("\n🧪 Running Paper Trader Test Suite...\n");

  try {
    // ── Test 1: Initial Wallet State ──────────────────────────
    console.log("▶ [Test 1] Initial Wallet State");
    const walletRes = await req("/wallet");
    assert(walletRes.ok, "GET /api/wallet succeeds");
    assert(walletRes.json.data.wallet.cash === 10000000, "Initial cash is exactly 1 Crore", `got: ${walletRes.json.data.wallet.cash}`);
    assert(walletRes.json.data.transactions.length === 1, "Exactly 1 transaction in initial ledger");

    // ── Test 2: Stock Universe & Quotes ───────────────────────
    console.log("\n▶ [Test 2] Stock Universe & Quotes");
    const stocksRes = await req("/stocks");
    assert(stocksRes.ok, "GET /api/stocks succeeds");
    assert(stocksRes.json.data.length === 50, "Contains exactly 50 stocks in universe", `got: ${stocksRes.json.data.length}`);

    const searchRes = await req("/stocks/search?q=Tata");
    assert(searchRes.ok, "Search /api/stocks/search?q=Tata succeeds");
    assert(searchRes.json.data.length >= 3, "Finds at least 3 Tata stocks (TCS, TATAMOTORS, TATASTEEL, TATACONSUM)");

    const detailRes = await req("/stocks/RELIANCE");
    assert(detailRes.ok, "GET /api/stocks/RELIANCE succeeds");
    const relQuote = detailRes.json.data.quote;
    assert(relQuote.symbol === "RELIANCE", "Quote symbol is RELIANCE");
    assert(relQuote.isSample === true, "Quote is tagged as isSample: true");
    assert(relQuote.price > 0, `Quote has valid price (> 0): ₹${relQuote.price}`);
    assert(detailRes.json.data.ohlcv.length > 50, "OHLCV historical bars returned (> 50 bars)");

    // ── Test 3: Trade Ticket Validation ───────────────────────
    console.log("\n▶ [Test 3] Trade Ticket Validation");
    const badSide = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "INVALID", qty: 5, price: 1000 }),
    });
    assert(badSide.status === 400, "Rejects invalid side with status 400");

    const zeroQty = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "BUY", qty: 0, price: 1000 }),
    });
    assert(zeroQty.status === 400, "Rejects 0 qty with status 400");

    const oversell = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "SELL", qty: 10, price: 1000 }),
    });
    assert(oversell.status === 400, "Rejects SELL when user has 0 shares");
    assert(oversell.json.error.includes("Insufficient shares"), "Error message specifies insufficient shares");

    const overspend = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "BUY", qty: 10000000, price: 1000 }),
    });
    assert(overspend.status === 400, "Rejects BUY when total exceeds wallet balance");
    assert(overspend.json.error.includes("Insufficient funds"), "Error message specifies insufficient funds");

    // ── Test 4: Paper Trade Execution (BUY) ───────────────────
    console.log("\n▶ [Test 4] Paper Trade Execution (BUY 10 shares)");
    const buyPrice = relQuote.price;
    const buyRes1 = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "BUY", qty: 10, price: buyPrice }),
    });
    assert(buyRes1.status === 201, "BUY order executed with status 201");
    const expectedCash1 = parseFloat((10000000 - 10 * buyPrice).toFixed(2));
    assert(
      Math.abs(buyRes1.json.data.wallet.cash - expectedCash1) < 0.01,
      `Wallet cash correctly debited to ₹${expectedCash1}`,
      `got: ${buyRes1.json.data.wallet.cash}`
    );

    // Verify holding exists
    const pfRes1 = await req("/portfolio");
    assert(pfRes1.ok, "GET /api/portfolio succeeds");
    const relHolding1 = pfRes1.json.data.find((h: any) => h.symbol === "RELIANCE");
    assert(relHolding1 != null, "RELIANCE exists in portfolio");
    assert(relHolding1.qty === 10, "Holding qty is exactly 10");
    assert(relHolding1.avgPrice === buyPrice, `Holding avgPrice matches purchase price ₹${buyPrice}`);

    // ── Test 5: Weighted Average Price on Repeat BUY ──────────
    console.log("\n▶ [Test 5] Weighted Average Price on Additional BUY (5 shares)");
    const buyPrice2 = buyPrice + 100; // simulate higher price
    const buyRes2 = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "BUY", qty: 5, price: buyPrice2 }),
    });
    assert(buyRes2.status === 201, "Second BUY order executed with status 201");

    const pfRes2 = await req("/portfolio");
    const relHolding2 = pfRes2.json.data.find((h: any) => h.symbol === "RELIANCE");
    const expectedAvgPrice = parseFloat(((10 * buyPrice + 5 * buyPrice2) / 15).toFixed(4));
    assert(relHolding2.qty === 15, "Holding qty increased to 15");
    assert(
      Math.abs(relHolding2.avgPrice - expectedAvgPrice) < 0.05,
      `Holding avgPrice correctly calculated to ₹${expectedAvgPrice}`,
      `got: ${relHolding2.avgPrice}`
    );

    // ── Test 6: Partial SELL with Realized P&L ─────────────────
    console.log("\n▶ [Test 6] Partial SELL (5 shares) & Realized P&L Calculation");
    const sellPrice = buyPrice + 200; // profit per share
    const sellRes1 = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "SELL", qty: 5, price: sellPrice }),
    });
    assert(sellRes1.status === 201, "Partial SELL executed with status 201");
    const expectedRealisedPnl = parseFloat(((sellPrice - relHolding2.avgPrice) * 5).toFixed(2));
    assert(
      Math.abs(sellRes1.json.data.order.realised_pnl - expectedRealisedPnl) < 0.1,
      `Realised P&L recorded as ₹${expectedRealisedPnl}`,
      `got: ${sellRes1.json.data.order.realised_pnl}`
    );

    const pfRes3 = await req("/portfolio");
    const relHolding3 = pfRes3.json.data.find((h: any) => h.symbol === "RELIANCE");
    assert(relHolding3.qty === 10, "Holding qty reduced from 15 to 10");

    // ── Test 7: Full Position Liquidation ─────────────────────
    console.log("\n▶ [Test 7] Full Position Liquidation (sell remaining 10 shares)");
    const sellRes2 = await req("/orders", {
      method: "POST",
      body: JSON.stringify({ symbol: "RELIANCE", side: "SELL", qty: 10, price: sellPrice }),
    });
    assert(sellRes2.status === 201, "Final SELL executed with status 201");

    const pfRes4 = await req("/portfolio");
    const relHolding4 = pfRes4.json.data.find((h: any) => h.symbol === "RELIANCE");
    assert(relHolding4 == null, "RELIANCE is completely removed from portfolio after selling all shares");

    // ── Test 8: Portfolio Summary & Audit Trail ───────────────
    console.log("\n▶ [Test 8] Portfolio Summary & Audit Trail");
    const summaryRes = await req("/portfolio/summary");
    assert(summaryRes.ok, "GET /api/portfolio/summary succeeds");
    assert(summaryRes.json.data.totalInvested === 0, "Total invested is ₹0 when no positions are held");
    assert(summaryRes.json.data.realisedPnl > 0, `Total realised P&L is positive: ₹${summaryRes.json.data.realisedPnl}`);

    const ordersRes = await req("/orders");
    assert(ordersRes.ok, "GET /api/orders succeeds");
    assert(ordersRes.json.data.length === 4, "Orders table recorded all 4 trades (2 BUYs, 2 SELLs)");

    const finalWallet = await req("/wallet");
    assert(finalWallet.ok, "GET /api/wallet succeeds");
    assert(finalWallet.json.data.transactions.length === 5, "Wallet ledger has 5 entries (1 initial + 4 trade entries)");

    // ── Test 9: 5x Intraday Leverage (MIS) ──────────────────
    console.log("\n▶ [Test 9] 5x Intraday Margin (MIS)");
    const walletBeforeMIS = await req("/wallet");
    const cashBeforeMIS = walletBeforeMIS.json.data.wallet.cash;
    const misStockPrice = 1000;
    const misQty = 10; // Total value = 10 * 1000 = 10,000. With 5x leverage, margin required = 2,000.

    const misBuyRes = await req("/orders", {
      method: "POST",
      body: JSON.stringify({
        symbol: "INFY",
        side: "BUY",
        orderType: "MARKET",
        productType: "MIS",
        qty: misQty,
        price: misStockPrice,
      }),
    });
    assert(misBuyRes.status === 201, "MIS BUY order executed with status 201");
    const walletAfterMIS = await req("/wallet");
    const cashDebited = parseFloat((cashBeforeMIS - walletAfterMIS.json.data.wallet.cash).toFixed(2));
    assert(cashDebited === 2000, `Only 20% margin (₹2000) debited for ₹10,000 position: ₹${cashDebited}`);

    const pfMIS = await req("/portfolio");
    const infyHolding = pfMIS.json.data.find((h: any) => h.symbol === "INFY");
    assert(infyHolding != null, "INFY holding present in portfolio");
    assert(infyHolding.productType === "MIS", "Holding tagged with productType: MIS");
    assert(infyHolding.leverage === 5, "Holding tagged with 5x leverage");

    // ── Test 10: Pending Limit Orders & Cancellation ─────────
    console.log("\n▶ [Test 10] Pending Limit Orders & Margin Refund");
    const quoteTCS = await req("/stocks/TCS");
    const tcsLTP = quoteTCS.json.data.quote.price;
    const buyLimitPrice = parseFloat((tcsLTP * 0.90).toFixed(2)); // 10% below market price

    const limitBuyRes = await req("/orders", {
      method: "POST",
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        orderType: "LIMIT",
        productType: "CNC",
        qty: 5,
        price: buyLimitPrice,
      }),
    });
    assert(limitBuyRes.status === 201, "Limit order submitted with status 201");
    assert(limitBuyRes.json.data.isPending === true, "Limit order is tagged as isPending: true");
    const pendingOrderId = limitBuyRes.json.data.order.id;
    assert(limitBuyRes.json.data.order.status === "PENDING", "Order status in DB is PENDING");

    const ordersPendingRes = await req("/orders?status=PENDING");
    assert(ordersPendingRes.ok, "GET /api/orders?status=PENDING succeeds");
    assert(
      ordersPendingRes.json.data.some((o: any) => o.id === pendingOrderId),
      `Order #${pendingOrderId} listed in pending orders filter`
    );

    // Cancel the pending order and verify margin is refunded
    const cancelRes = await req(`/orders/${pendingOrderId}`, { method: "DELETE" });
    assert(cancelRes.status === 200, "DELETE /api/orders/:id succeeds with 200");
    assert(cancelRes.json.success === true, "Cancel response has success: true");

    const ordersAfterCancel = await req("/orders");
    const cancelledOrder = ordersAfterCancel.json.data.find((o: any) => o.id === pendingOrderId);
    assert(cancelledOrder.status === "CANCELLED", "Order status successfully updated to CANCELLED");

    // ── Test 11: Authentication & Cross-Device Account Sync ──
    console.log("\n▶ [Test 11] Authentication & Multi-Device Sync");
    // 1. Create a guest session (Device A)
    const guestRes = await req("/auth/guest", { method: "POST" });
    assert(guestRes.status === 201, "POST /api/auth/guest creates guest profile");
    const guestToken = guestRes.json.data.token;
    const guestUser = guestRes.json.data.user;
    assert(guestUser.isGuest === true, "Guest user is flagged as isGuest: true");

    // 2. Guest places a trade on Device A
    const guestBuyRes = await req("/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${guestToken}` },
      body: JSON.stringify({
        symbol: "TCS",
        side: "BUY",
        orderType: "MARKET",
        productType: "CNC",
        qty: 2,
        price: 3500,
      }),
    });
    assert(guestBuyRes.status === 201, "Guest can place trade with isolated wallet");

    // 3. Guest upgrades to permanent account
    const regRes = await req("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: "vikram_trader",
        email: "vikram@example.com",
        password: "secretpassword123",
        name: "Vikram Malhotra",
        guestToken,
      }),
    });
    assert(regRes.status === 201, "POST /api/auth/register upgrades guest account");
    assert(regRes.json.data.user.username === "vikram_trader", "Username successfully assigned");
    assert(regRes.json.data.user.isGuest === false, "User is now a permanent cloud account");

    // 4. User opens app on Device B and logs in
    const loginRes = await req("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        usernameOrEmail: "vikram_trader",
        password: "secretpassword123",
      }),
    });
    assert(loginRes.status === 200, "POST /api/auth/login succeeds on Device B");
    const deviceBToken = loginRes.json.data.token;

    // 5. Verify Device B accesses the exact same portfolio & holdings from Device A
    const deviceBPf = await req("/portfolio", {
      headers: { Authorization: `Bearer ${deviceBToken}` },
    });
    assert(deviceBPf.ok, "GET /api/portfolio on Device B succeeds");
    const tcsHolding = deviceBPf.json.data.find((h: any) => h.symbol === "TCS");
    assert(tcsHolding != null, "Device B loads TCS holding created on Device A");
    assert(tcsHolding.qty === 2, "Holding quantity matches (2 shares)");

    console.log(`\n===========================================`);
    console.log(`🏁 Results: ${passed} passed, ${failed} failed`);
    console.log(`===========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
