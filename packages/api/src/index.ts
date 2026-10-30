// ============================================================
// Paper Trader — API & Production Server Entry Point
// ============================================================

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

// Initialise DB first (seeds wallet and tables if needed)
import "./db/database.js";

import type { MarketDataProvider } from "./market/MarketDataProvider.js";
import { SampleDataProvider } from "./market/SampleDataProvider.js";
import { YahooMarketDataProvider } from "./market/YahooMarketDataProvider.js";
import { TickEngine, isNSEMarketOpen } from "./market/tickEngine.js";
import { checkTriggers } from "./market/triggerEngine.js";
import { stocksRouter } from "./routes/stocks.js";
import { walletRouter } from "./routes/wallet.js";
import { ordersRouter } from "./routes/orders.js";
import { portfolioRouter } from "./routes/portfolio.js";
import { watchlistRouter } from "./routes/watchlist.js";
import { triggersRouter } from "./routes/triggers.js";
import { streamRouter } from "./routes/stream.js";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";

const PORT = Number(process.env.PORT ?? 4000);
const app = express();

// ── Middleware ───────────────────────────────────────────────
// Support development (port 5173), custom production domain, or same-origin
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json());
app.use(authMiddleware);

// ── Market data providers ────────────────────────────────────
const sampleProvider = new SampleDataProvider();
const yahooProvider = new YahooMarketDataProvider();

// Default to live Yahoo Finance provider (with graceful sample fallback)
let activeProvider: MarketDataProvider = yahooProvider;

function getUnderlyingMarket(): MarketDataProvider {
  return activeProvider;
}

// TickEngine provides sub-second micro-tick streaming and in-memory fast caching
const tickEngine = new TickEngine(getUnderlyingMarket);
tickEngine.init();

function getMarket(): MarketDataProvider {
  return tickEngine;
}

// ── Provider switch endpoint ─────────────────────────────────
app.get("/api/market-provider", (_req, res) => {
  let status: "LIVE" | "SAMPLE" | "ERROR" = "SAMPLE";
  let isSample = true;
  let lastError: string | null = null;

  if (activeProvider === yahooProvider) {
    const yStatus = yahooProvider.getStatus();
    status = yStatus.status;
    isSample = yStatus.isSample;
    lastError = yStatus.lastError;
  } else {
    status = "SAMPLE";
    isSample = true;
  }

  res.json({
    provider: activeProvider.providerName,
    status,
    isSample,
    isMarketOpen: isNSEMarketOpen(),
    error: lastError,
    available: ["yahoo", "sample"],
  });
});

app.post("/api/market-provider", async (req, res) => {
  const { provider } = req.body;
  if (provider === "yahoo") {
    activeProvider = yahooProvider;
    console.log("Switched market provider to: LIVE (Yahoo Finance NSE)");
    const yStatus = yahooProvider.getStatus();
    res.json({
      provider: activeProvider.providerName,
      status: yStatus.status,
      isSample: yStatus.isSample,
      error: yStatus.lastError,
    });
  } else if (provider === "sample") {
    activeProvider = sampleProvider;
    console.log("Switched market provider to: SAMPLE (Offline Simulated)");
    res.json({
      provider: activeProvider.providerName,
      status: "SAMPLE",
      isSample: true,
      error: null,
    });
  } else {
    res.status(400).json({ error: "Invalid provider. Choose 'yahoo' or 'sample'." });
    return;
  }
});

// ── API Routes ───────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/market/stream", streamRouter(tickEngine));
app.use("/api/stocks", stocksRouter(getMarket));
app.use("/api/wallet", walletRouter);
app.use("/api/orders", ordersRouter(getMarket));
app.use("/api/portfolio", portfolioRouter(getMarket));
app.use("/api/watchlist", watchlistRouter(getMarket));
app.use("/api/triggers", triggersRouter);

// Health check
app.get("/api/health", (_req, res) => {
  const yStatus = activeProvider === yahooProvider ? yahooProvider.getStatus() : { status: "SAMPLE" };
  res.json({ status: "ok", provider: activeProvider.providerName, feedStatus: yStatus.status });
});

// ── Production Static File Serving ───────────────────────────
// When built, Express serves the React SPA directly from packages/web/dist
const WEB_DIST = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(WEB_DIST, "index.html"));
  });
}

// ── Auto-Exit Background Engine (Every 6 seconds) ───────────
setInterval(() => {
  checkTriggers(getMarket()).catch(() => {
    // silently continue
  });
}, 6_000);

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Paper Trader running on http://localhost:${PORT}`);
  console.log(`   🟢 Market data default: LIVE (Yahoo Finance NSE India)`);
  console.log(`   🛡️ Auto-Exit Engine active: checking Stop-Loss & Target triggers every 6s`);
  if (fs.existsSync(WEB_DIST)) {
    console.log(`   📦 Serving production web build from ${WEB_DIST}`);
  }
});
