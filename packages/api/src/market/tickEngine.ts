// ============================================================
// TickEngine — Real-Time Micro-Tick Simulation & Streaming
// ============================================================

import type { Response } from "express";
import type { MarketDataProvider, StockQuote, OHLCVBar } from "./MarketDataProvider.js";
import { STOCKS } from "./stockUniverse.js";
import db from "../db/database.js";
import { checkTriggersWithQuotes } from "./triggerEngine.js";
import { checkPendingOrders } from "../routes/orders.js";

/** Checks if the National Stock Exchange of India (NSE) is currently open */
export function isNSEMarketOpen(): boolean {
  // Convert current time to Indian Standard Time (IST = UTC+5:30)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const day = ist.getDay(); // 0 is Sunday, 6 is Saturday
  if (day === 0 || day === 6) return false;

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Trading session: 9:15 AM (555 mins) to 3:30 PM (930 mins)
  return totalMinutes >= 555 && totalMinutes <= 930;
}

export class TickEngine implements MarketDataProvider {
  readonly providerName = "live-stream";
  private quoteMap = new Map<string, StockQuote>();
  private subscribers = new Set<Response>();
  private tickTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private getUnderlyingProvider: () => MarketDataProvider;
  private isInitialized = false;

  constructor(getProvider: () => MarketDataProvider) {
    this.getUnderlyingProvider = getProvider;
    this.seedInitialQuotes();
  }

  private seedInitialQuotes() {
    for (const stock of STOCKS) {
      this.quoteMap.set(stock.symbol, {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        price: stock.basePrice,
        change: 0,
        changePct: 0,
        open: stock.basePrice,
        high: stock.basePrice,
        low: stock.basePrice,
        prevClose: stock.basePrice,
        volume: 1_250_000,
        isSample: true, // Seeded base prices are initially sample data
      });
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const provider = this.getUnderlyingProvider();
      const symbols = STOCKS.map((s) => s.symbol);
      const quotes = await provider.getQuotes(symbols);
      let liveCount = 0;
      for (const q of quotes) {
        if (q && q.price > 0) {
          this.quoteMap.set(q.symbol, { ...q });
          if (!q.isSample) liveCount++;
        }
      }
      this.isInitialized = true;
      if (liveCount > 0) {
        console.log(`⚡ [TickEngine] Initialized with ${liveCount}/${quotes.length} LIVE market quotes.`);
      } else {
        console.warn(`⚠️ [TickEngine] Initialized with SAMPLE data (${quotes.length} stocks). Live feed currently unavailable.`);
      }
    } catch (err) {
      console.warn("⚠️ [TickEngine] Initial sync failed, starting with seeded prices.", err);
    }

    this.startTickLoop();
    this.startPeriodicSync();
  }

  /** Starts the sub-second tick loop */
  private startTickLoop() {
    if (this.tickTimer) clearInterval(this.tickTimer);

    // Ticks every 800ms
    this.tickTimer = setInterval(() => {
      this.generateTick();
    }, 800);
  }

  /** Background sync with underlying provider every 45s (e.g. Yahoo / Sample) */
  private startPeriodicSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);

    this.syncTimer = setInterval(async () => {
      try {
        const provider = this.getUnderlyingProvider();
        const symbols = Array.from(this.quoteMap.keys());
        // Sync in small batches so we don't stall the event loop
        const batch = symbols.slice(0, 15);
        const quotes = await provider.getQuotes(batch);
        for (const q of quotes) {
          if (q && q.price > 0) {
            const existing = this.quoteMap.get(q.symbol);
            if (existing) {
              // Blend base metadata while preserving real-time tick bounds
              existing.open = q.open || existing.open;
              existing.prevClose = q.prevClose || existing.prevClose;
              existing.yearHigh = q.yearHigh || existing.yearHigh;
              existing.yearLow = q.yearLow || existing.yearLow;
              existing.isSample = q.isSample;
            }
          }
        }
      } catch {
        // Silently continue
      }
    }, 45_000);
  }

  /** Generates realistic Brownian motion micro-ticks and broadcasts them */
  private generateTick() {
    if (this.quoteMap.size === 0) return;

    // When connected to live Yahoo exchange data outside market hours, freeze prices!
    const provider = this.getUnderlyingProvider();
    if (provider.providerName === "yahoo" && !isNSEMarketOpen()) {
      return;
    }

    // Identify symbols in user portfolio or active triggers so they update more frequently
    let prioritySymbols = new Set<string>();
    try {
      const held = db.prepare("SELECT symbol FROM holdings WHERE qty > 0").all() as Array<{ symbol: string }>;
      for (const h of held) prioritySymbols.add(h.symbol);
      const triggers = db.prepare("SELECT symbol FROM auto_triggers WHERE status = 'ACTIVE'").all() as Array<{ symbol: string }>;
      for (const t of triggers) prioritySymbols.add(t.symbol);
      const pendingOrders = db.prepare("SELECT symbol FROM orders WHERE status = 'PENDING'").all() as Array<{ symbol: string }>;
      for (const p of pendingOrders) prioritySymbols.add(p.symbol);
    } catch {
      // ignore
    }

    const allSymbols = Array.from(this.quoteMap.keys());
    const updatedQuotes: StockQuote[] = [];

    // Always tick 1-2 priority stocks if available
    for (const sym of prioritySymbols) {
      if (Math.random() < 0.75) {
        const q = this.mutateStockQuote(sym);
        if (q) updatedQuotes.push(q);
      }
    }

    // Pick 3-6 random stocks from the entire universe
    const randomCount = Math.floor(Math.random() * 4) + 3;
    for (let i = 0; i < randomCount; i++) {
      const randSym = allSymbols[Math.floor(Math.random() * allSymbols.length)];
      if (!updatedQuotes.some((u) => u.symbol === randSym)) {
        const q = this.mutateStockQuote(randSym);
        if (q) updatedQuotes.push(q);
      }
    }

    if (updatedQuotes.length === 0) return;

    // Check triggers & pending limit orders on updated prices instantly
    checkTriggersWithQuotes(updatedQuotes).catch(() => {});
    try {
      checkPendingOrders(updatedQuotes);
    } catch {}

    // Broadcast to SSE clients
    this.broadcast("tick", updatedQuotes);
  }

  private mutateStockQuote(symbol: string): StockQuote | null {
    const q = this.quoteMap.get(symbol);
    if (!q) return null;

    // Realistic tick movement: -0.15% to +0.15% per tick with slight mean-reverting drift
    const drift = (Math.random() - 0.495) * 0.002;
    const priceChange = q.price * drift;
    const newPrice = Math.max(1, parseFloat((q.price + priceChange).toFixed(2)));

    q.price = newPrice;
    q.high = parseFloat(Math.max(q.high, newPrice).toFixed(2));
    q.low = parseFloat(Math.min(q.low, newPrice).toFixed(2));
    q.change = parseFloat((q.price - q.prevClose).toFixed(2));
    q.changePct = q.prevClose > 0 ? parseFloat(((q.change / q.prevClose) * 100).toFixed(2)) : 0;
    q.volume += Math.floor(Math.random() * 250) + 25;

    return { ...q };
  }

  // ── Client Subscription (SSE) ──────────────────────────────
  subscribe(res: Response): () => void {
    this.subscribers.add(res);

    // Send full snapshot on connect
    const snapshot = Array.from(this.quoteMap.values());
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

    const cleanup = () => {
      this.subscribers.delete(res);
    };

    res.on("close", cleanup);
    return cleanup;
  }

  broadcast(event: string, data: unknown) {
    if (this.subscribers.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.subscribers) {
      try {
        client.write(payload);
      } catch {
        this.subscribers.delete(client);
      }
    }
  }

  // ── MarketDataProvider Implementation ───────────────────────
  async getQuote(symbol: string): Promise<StockQuote | null> {
    const clean = symbol.toUpperCase().replace(/\.(NS|BO)$/, "");
    return this.quoteMap.get(clean) ?? this.getUnderlyingProvider().getQuote(symbol);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    const result: StockQuote[] = [];
    const missing: string[] = [];

    for (const sym of symbols) {
      const clean = sym.toUpperCase().replace(/\.(NS|BO)$/, "");
      const q = this.quoteMap.get(clean);
      if (q) {
        result.push(q);
      } else {
        missing.push(sym);
      }
    }

    if (missing.length > 0) {
      const fallbackQuotes = await this.getUnderlyingProvider().getQuotes(missing);
      for (const q of fallbackQuotes) {
        if (q) {
          this.quoteMap.set(q.symbol, q);
          result.push(q);
        }
      }
    }

    return result;
  }

  async getOHLCV(symbol: string, days = 90): Promise<OHLCVBar[]> {
    return this.getUnderlyingProvider().getOHLCV(symbol, days);
  }

  async search(query: string): Promise<Array<{ symbol: string; name: string; sector: string }>> {
    const q = query.toLowerCase().trim();
    return Array.from(this.quoteMap.values())
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector }));
  }

  getAllQuotes(): StockQuote[] {
    return Array.from(this.quoteMap.values());
  }

  getFeedStatus(): { status: "LIVE" | "SAMPLE" | "ERROR"; isSample: boolean } {
    const quotes = Array.from(this.quoteMap.values());
    if (quotes.length === 0) return { status: "SAMPLE", isSample: true };
    const liveQuotes = quotes.filter((q) => !q.isSample);
    if (liveQuotes.length > 0) {
      return { status: "LIVE", isSample: false };
    }
    return { status: "SAMPLE", isSample: true };
  }
}

