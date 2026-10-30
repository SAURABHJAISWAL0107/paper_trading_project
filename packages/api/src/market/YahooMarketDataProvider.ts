// ============================================================
// YahooMarketDataProvider — Live NSE India market data via Yahoo Finance
// ============================================================

import YahooFinance from "yahoo-finance2";
import type { MarketDataProvider, StockQuote, OHLCVBar } from "./MarketDataProvider.js";
import { STOCKS } from "./stockUniverse.js";
import { SampleDataProvider } from "./SampleDataProvider.js";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly providerName = "yahoo";
  private yf: InstanceType<typeof YahooFinance>;
  private fallback: SampleDataProvider;
  private quoteCache = new Map<string, CacheEntry<StockQuote>>();
  private ohlcvCache = new Map<string, CacheEntry<OHLCVBar[]>>();
  private stockMeta = new Map(STOCKS.map((s) => [s.symbol, s]));

  // Circuit breaker & health tracking
  private failureCount = 0;
  private circuitOpenUntil = 0;
  private lastError: string | null = null;
  private lastSuccessfulSync: number | null = null;
  private feedStatus: "LIVE" | "SAMPLE" | "ERROR" = "LIVE";

  constructor() {
    this.yf = new YahooFinance({
      suppressNotices: ["yahooSurvey"],
      fetchOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      },
    });
    this.fallback = new SampleDataProvider();
    console.log("🟢 [LIVE DATA] YahooMarketDataProvider initialized (NSE India).");
  }

  private toYahooSymbol(symbol: string): string {
    const clean = symbol.trim().toUpperCase();
    return clean.endsWith(".NS") || clean.endsWith(".BO") ? clean : `${clean}.NS`;
  }

  private async withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private recordSuccess() {
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
    this.lastError = null;
    this.lastSuccessfulSync = Date.now();
    this.feedStatus = "LIVE";
  }

  private recordFailure(err: unknown) {
    this.failureCount++;
    this.lastError = err instanceof Error ? err.message : String(err);
    if (this.failureCount >= 3) {
      // Open circuit breaker for 60 seconds
      this.circuitOpenUntil = Date.now() + 60_000;
      this.feedStatus = "ERROR";
      console.warn(
        `[YahooMarketDataProvider] ⚠️ Circuit breaker opened for 60s (${this.failureCount} consecutive failures): ${this.lastError}`
      );
    } else {
      this.feedStatus = "ERROR";
      console.error(
        `[YahooMarketDataProvider] Quote failed (${this.failureCount}/3): ${this.lastError}`
      );
    }
  }

  getStatus(): {
    status: "LIVE" | "SAMPLE" | "ERROR";
    isSample: boolean;
    lastError: string | null;
    lastSuccessfulSync: number | null;
    circuitOpen: boolean;
  } {
    const isCircuitOpen = Date.now() < this.circuitOpenUntil;
    let status: "LIVE" | "SAMPLE" | "ERROR" = this.feedStatus;
    if (isCircuitOpen || this.failureCount >= 3) {
      status = "ERROR";
    } else if (this.lastSuccessfulSync && Date.now() - this.lastSuccessfulSync < 60_000) {
      status = "LIVE";
    } else if (!this.lastSuccessfulSync) {
      status = this.lastError ? "ERROR" : "SAMPLE";
    }
    return {
      status,
      isSample: status !== "LIVE",
      lastError: this.lastError,
      lastSuccessfulSync: this.lastSuccessfulSync,
      circuitOpen: isCircuitOpen,
    };
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    const cleanSym = symbol.toUpperCase().replace(/\.(NS|BO)$/, "");
    const cached = this.quoteCache.get(cleanSym);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // If circuit breaker is open, use fallback immediately without spamming Yahoo
    if (now < this.circuitOpenUntil) {
      const fb = await this.fallback.getQuote(cleanSym);
      return fb ? { ...fb, isSample: true } : null;
    }

    try {
      const yfSym = this.toYahooSymbol(cleanSym);
      const res = await this.withTimeout(this.yf.quote(yfSym), 8000);
      if (!res || !res.regularMarketPrice) {
        throw new Error(`Incomplete quote for ${yfSym}`);
      }

      const meta = this.stockMeta.get(cleanSym);
      const quote: StockQuote = {
        symbol: cleanSym,
        name: (res.shortName || res.longName || meta?.name || cleanSym).replace(/\bLTD\b/i, "Ltd"),
        sector: meta?.sector || "Equities",
        price: parseFloat(res.regularMarketPrice.toFixed(2)),
        change: parseFloat((res.regularMarketChange ?? 0).toFixed(2)),
        changePct: parseFloat((res.regularMarketChangePercent ?? 0).toFixed(2)),
        open: parseFloat((res.regularMarketOpen ?? res.regularMarketPrice).toFixed(2)),
        high: parseFloat((res.regularMarketDayHigh ?? res.regularMarketPrice).toFixed(2)),
        low: parseFloat((res.regularMarketDayLow ?? res.regularMarketPrice).toFixed(2)),
        prevClose: parseFloat((res.regularMarketPreviousClose ?? res.regularMarketPrice).toFixed(2)),
        volume: res.regularMarketVolume ?? 0,
        yearHigh: res.fiftyTwoWeekHigh ? parseFloat(res.fiftyTwoWeekHigh.toFixed(2)) : undefined,
        yearLow: res.fiftyTwoWeekLow ? parseFloat(res.fiftyTwoWeekLow.toFixed(2)) : undefined,
        isSample: false,
      };

      this.recordSuccess();
      // Cache for 20 seconds
      this.quoteCache.set(cleanSym, { data: quote, expiresAt: now + 20_000 });
      return quote;
    } catch (err) {
      this.recordFailure(err);
      const fb = await this.fallback.getQuote(cleanSym);
      // Fallback is strictly marked isSample: true
      return fb ? { ...fb, isSample: true } : null;
    }
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    const results: StockQuote[] = [];
    const missing: string[] = [];
    const now = Date.now();

    for (const s of symbols) {
      const clean = s.toUpperCase().replace(/\.(NS|BO)$/, "");
      const cached = this.quoteCache.get(clean);
      if (cached && cached.expiresAt > now) {
        results.push(cached.data);
      } else {
        missing.push(clean);
      }
    }

    if (missing.length === 0) return results;

    // If circuit breaker is open, immediately return fallback for missing items
    if (now < this.circuitOpenUntil) {
      const fallbacks = await this.fallback.getQuotes(missing);
      for (const fb of fallbacks) {
        results.push({ ...fb, isSample: true });
      }
      return results;
    }

    // Chunk missing symbols into batches of 25 (Yahoo accepts batch symbol arrays efficiently)
    const chunkSize = 25;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const yfSyms = chunk.map((s) => this.toYahooSymbol(s));

      try {
        const batchRes = await this.withTimeout(this.yf.quote(yfSyms), 10_000);
        this.recordSuccess();

        const quoteMap = new Map<string, any>();
        if (Array.isArray(batchRes)) {
          for (const item of batchRes) {
            if (item && item.symbol) {
              const clean = item.symbol.replace(/\.(NS|BO)$/, "");
              quoteMap.set(clean, item);
            }
          }
        }

        for (const clean of chunk) {
          const res = quoteMap.get(clean);
          if (res && res.regularMarketPrice) {
            const meta = this.stockMeta.get(clean);
            const quote: StockQuote = {
              symbol: clean,
              name: (res.shortName || res.longName || meta?.name || clean).replace(/\bLTD\b/i, "Ltd"),
              sector: meta?.sector || "Equities",
              price: parseFloat(res.regularMarketPrice.toFixed(2)),
              change: parseFloat((res.regularMarketChange ?? 0).toFixed(2)),
              changePct: parseFloat((res.regularMarketChangePercent ?? 0).toFixed(2)),
              open: parseFloat((res.regularMarketOpen ?? res.regularMarketPrice).toFixed(2)),
              high: parseFloat((res.regularMarketDayHigh ?? res.regularMarketPrice).toFixed(2)),
              low: parseFloat((res.regularMarketDayLow ?? res.regularMarketPrice).toFixed(2)),
              prevClose: parseFloat((res.regularMarketPreviousClose ?? res.regularMarketPrice).toFixed(2)),
              volume: res.regularMarketVolume ?? 0,
              yearHigh: res.fiftyTwoWeekHigh ? parseFloat(res.fiftyTwoWeekHigh.toFixed(2)) : undefined,
              yearLow: res.fiftyTwoWeekLow ? parseFloat(res.fiftyTwoWeekLow.toFixed(2)) : undefined,
              isSample: false,
            };
            this.quoteCache.set(clean, { data: quote, expiresAt: now + 20_000 });
            results.push(quote);
          } else {
            // Fallback for this single missing item
            const fb = await this.fallback.getQuote(clean);
            if (fb) results.push({ ...fb, isSample: true });
          }
        }
      } catch (err) {
        this.recordFailure(err);
        const fbChunk = await this.fallback.getQuotes(chunk);
        for (const fb of fbChunk) {
          results.push({ ...fb, isSample: true });
        }
      }
    }

    return results;
  }

  async getOHLCV(symbol: string, days = 90): Promise<OHLCVBar[]> {
    const cleanSym = symbol.toUpperCase().replace(/\.(NS|BO)$/, "");
    const cacheKey = `${cleanSym}-${days}`;
    const cached = this.ohlcvCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    if (now < this.circuitOpenUntil) {
      return this.fallback.getOHLCV(cleanSym, days);
    }

    try {
      const yfSym = this.toYahooSymbol(cleanSym);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Math.max(days + 20, 30));
      const period1 = startDate.toISOString().split("T")[0];

      const res = await this.withTimeout(this.yf.chart(yfSym, { period1, interval: "1d" }), 10_000);
      if (!res?.quotes || res.quotes.length === 0) {
        throw new Error("No chart quotes returned");
      }

      const bars: OHLCVBar[] = res.quotes
        .filter((q) => q.close != null && q.open != null && q.date != null)
        .map((q) => {
          const d = new Date(q.date);
          return {
            date: d.toISOString().split("T")[0],
            open: parseFloat(Number(q.open).toFixed(2)),
            high: parseFloat(Number(q.high ?? q.close).toFixed(2)),
            low: parseFloat(Number(q.low ?? q.close).toFixed(2)),
            close: parseFloat(Number(q.close).toFixed(2)),
            volume: Number(q.volume ?? 0),
          };
        })
        .slice(-days);

      if (bars.length === 0) throw new Error("Parsed 0 valid bars");

      this.recordSuccess();
      // Cache for 5 minutes
      this.ohlcvCache.set(cacheKey, { data: bars, expiresAt: now + 300_000 });
      return bars;
    } catch (err) {
      this.recordFailure(err);
      return this.fallback.getOHLCV(cleanSym, days);
    }
  }

  async search(query: string): Promise<Array<{ symbol: string; name: string; sector: string }>> {
    const q = query.toLowerCase();
    const localMatches = STOCKS.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    ).map(({ symbol, name, sector }) => ({ symbol, name, sector }));

    if (localMatches.length > 0) return localMatches;

    try {
      const searchRes = await this.withTimeout(this.yf.search(query), 5000);
      if (searchRes?.quotes) {
        return searchRes.quotes
          .filter((item: any) => item.symbol && (item.symbol.endsWith(".NS") || item.symbol.endsWith(".BO")))
          .map((item: any) => ({
            symbol: item.symbol.replace(/\.(NS|BO)$/, ""),
            name: item.shortname || item.longname || item.symbol,
            sector: item.sector || "Equities",
          }));
      }
    } catch {
      // ignore search error
    }

    return [];
  }
}
