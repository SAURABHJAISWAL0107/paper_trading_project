// ============================================================
// YahooMarketDataProvider — Resilient Live NSE Market Data
// Powered by Yahoo Finance v8 Mobile/Chart Endpoint (No-crumb required)
// ============================================================

import YahooFinance from "yahoo-finance2";
import type { MarketDataProvider, StockQuote, OHLCVBar } from "./MarketDataProvider.js";
import { STOCKS } from "./stockUniverse.js";
import { SampleDataProvider } from "./SampleDataProvider.js";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
        headers: { "User-Agent": USER_AGENT },
      },
    });
    this.fallback = new SampleDataProvider();
    console.log("🟢 [LIVE DATA] YahooMarketDataProvider initialized (Direct v8 NSE Feed).");
  }

  private toYahooSymbol(symbol: string): string {
    const clean = symbol.trim().toUpperCase();
    return clean.endsWith(".NS") || clean.endsWith(".BO") ? clean : `${clean}.NS`;
  }

  private async fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
        },
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
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
      // Open circuit breaker for 45s cooldown
      this.circuitOpenUntil = Date.now() + 45_000;
      this.feedStatus = "ERROR";
      console.warn(
        `[YahooMarketDataProvider] ⚠️ Circuit breaker opened for 45s (${this.failureCount} consecutive failures): ${this.lastError}`
      );
    } else {
      this.feedStatus = "ERROR";
      console.error(
        `[YahooMarketDataProvider] Feed query failed (${this.failureCount}/3): ${this.lastError}`
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
    } else if (this.lastSuccessfulSync && Date.now() - this.lastSuccessfulSync < 90_000) {
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

  /**
   * Primary fetch using the unauthenticated v8 chart API.
   * Completely bypasses cookie/crumb requirements and datacenter IP blocks.
   */
  private async fetchDirectQuote(cleanSym: string): Promise<StockQuote> {
    const yfSym = this.toYahooSymbol(cleanSym);
    const host = Math.random() < 0.5 ? "query1.finance.yahoo.com" : "query2.finance.yahoo.com";
    const url = `https://${host}/v8/finance/chart/${yfSym}?interval=1d&range=1d`;

    const res = await this.fetchWithTimeout(url, 6000);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${host}`);
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.meta || typeof result.meta.regularMarketPrice !== "number") {
      throw new Error(`Incomplete chart payload for ${yfSym}`);
    }

    const meta = result.meta;
    const price = parseFloat(meta.regularMarketPrice.toFixed(2));
    const prevClose = parseFloat((meta.chartPreviousClose ?? meta.previousClose ?? price).toFixed(2));
    const change = parseFloat((price - prevClose).toFixed(2));
    const changePct = prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0;
    const stockMeta = this.stockMeta.get(cleanSym);

    return {
      symbol: cleanSym,
      name: (meta.shortName || meta.longName || stockMeta?.name || cleanSym).replace(/\bLTD\b/i, "Ltd"),
      sector: stockMeta?.sector || "Equities",
      price,
      change,
      changePct,
      open: parseFloat((meta.regularMarketOpen ?? meta.regularMarketDayLow ?? price).toFixed(2)),
      high: parseFloat((meta.regularMarketDayHigh ?? price).toFixed(2)),
      low: parseFloat((meta.regularMarketDayLow ?? price).toFixed(2)),
      prevClose,
      volume: meta.regularMarketVolume ?? 0,
      yearHigh: meta.fiftyTwoWeekHigh ? parseFloat(meta.fiftyTwoWeekHigh.toFixed(2)) : undefined,
      yearLow: meta.fiftyTwoWeekLow ? parseFloat(meta.fiftyTwoWeekLow.toFixed(2)) : undefined,
      isSample: false,
    };
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    const cleanSym = symbol.toUpperCase().replace(/\.(NS|BO)$/, "");
    const cached = this.quoteCache.get(cleanSym);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // If circuit breaker is open, use fallback immediately without hammering
    if (now < this.circuitOpenUntil) {
      const fb = await this.fallback.getQuote(cleanSym);
      return fb ? { ...fb, isSample: true } : null;
    }

    try {
      const quote = await this.fetchDirectQuote(cleanSym);
      this.recordSuccess();
      // Cache for 30 seconds
      this.quoteCache.set(cleanSym, { data: quote, expiresAt: now + 30_000 });
      return quote;
    } catch (err) {
      // Secondary attempt with library if direct fetch had a hiccup
      try {
        const yfSym = this.toYahooSymbol(cleanSym);
        const res = await this.yf.quote(yfSym);
        if (res && res.regularMarketPrice) {
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
          this.quoteCache.set(cleanSym, { data: quote, expiresAt: now + 30_000 });
          return quote;
        }
      } catch {
        // secondary failed
      }

      this.recordFailure(err);
      const fb = await this.fallback.getQuote(cleanSym);
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

    if (now < this.circuitOpenUntil) {
      const fallbacks = await this.fallback.getQuotes(missing);
      for (const fb of fallbacks) {
        results.push({ ...fb, isSample: true });
      }
      return results;
    }

    // Fetch missing in parallel chunks of 10
    const chunkSize = 10;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const settled = await Promise.allSettled(chunk.map((sym) => this.fetchDirectQuote(sym)));

      let anySuccess = false;
      for (let j = 0; j < chunk.length; j++) {
        const item = settled[j];
        const cleanSym = chunk[j];
        if (item.status === "fulfilled") {
          anySuccess = true;
          this.quoteCache.set(cleanSym, { data: item.value, expiresAt: now + 30_000 });
          results.push(item.value);
        } else {
          const fb = await this.fallback.getQuote(cleanSym);
          if (fb) results.push({ ...fb, isSample: true });
        }
      }

      if (anySuccess) {
        this.recordSuccess();
      } else {
        this.recordFailure(new Error(`Batch of ${chunk.length} stocks failed`));
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
      const host = "query1.finance.yahoo.com";
      const url = `https://${host}/v8/finance/chart/${yfSym}?interval=1d&range=6mo`;

      const res = await this.fetchWithTimeout(url, 8000);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const timestamps: number[] = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0];

      if (!timestamps.length || !quote) {
        throw new Error("No chart quote data");
      }

      const bars: OHLCVBar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const close = quote.close[i];
        const open = quote.open[i];
        if (close == null || open == null) continue;

        const d = new Date(timestamps[i] * 1000);
        bars.push({
          date: d.toISOString().split("T")[0],
          open: parseFloat(Number(open).toFixed(2)),
          high: parseFloat(Number(quote.high[i] ?? close).toFixed(2)),
          low: parseFloat(Number(quote.low[i] ?? close).toFixed(2)),
          close: parseFloat(Number(close).toFixed(2)),
          volume: Number(quote.volume[i] ?? 0),
        });
      }

      const sliced = bars.slice(-days);
      if (sliced.length === 0) throw new Error("Parsed 0 valid bars");

      this.recordSuccess();
      this.ohlcvCache.set(cacheKey, { data: sliced, expiresAt: now + 300_000 });
      return sliced;
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
      const host = "query1.finance.yahoo.com";
      const url = `https://${host}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
      const res = await this.fetchWithTimeout(url, 4000);
      if (res.ok) {
        const json = await res.json();
        if (json?.quotes) {
          return json.quotes
            .filter((item: any) => item.symbol && (item.symbol.endsWith(".NS") || item.symbol.endsWith(".BO")))
            .map((item: any) => ({
              symbol: item.symbol.replace(/\.(NS|BO)$/, ""),
              name: item.shortname || item.longname || item.symbol,
              sector: item.sector || "Equities",
            }));
        }
      }
    } catch {
      // ignore
    }

    return [];
  }
}
