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

  constructor() {
    this.yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    this.fallback = new SampleDataProvider();
    console.log("🟢 [LIVE DATA] YahooMarketDataProvider initialized (NSE India).");
  }

  private toYahooSymbol(symbol: string): string {
    const clean = symbol.trim().toUpperCase();
    return clean.endsWith(".NS") || clean.endsWith(".BO") ? clean : `${clean}.NS`;
  }

  async getQuote(symbol: string): Promise<StockQuote | null> {
    const cleanSym = symbol.toUpperCase().replace(/\.(NS|BO)$/, "");
    const cached = this.quoteCache.get(cleanSym);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const yfSym = this.toYahooSymbol(cleanSym);
      const res = await this.yf.quote(yfSym);
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

      // Cache for 15 seconds
      this.quoteCache.set(cleanSym, { data: quote, expiresAt: now + 15_000 });
      return quote;
    } catch (err) {
      console.warn(`[YahooMarketDataProvider] Quote failed for ${cleanSym}, using sample fallback`);
      const fb = await this.fallback.getQuote(cleanSym);
      return fb;
    }
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    // Parallelize with chunking to prevent hitting rate limits
    const results: StockQuote[] = [];
    const chunkSize = 10;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const promises = chunk.map((s) => this.getQuote(s));
      const chunkResults = await Promise.all(promises);
      for (const q of chunkResults) {
        if (q) results.push(q);
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

    try {
      const yfSym = this.toYahooSymbol(cleanSym);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Math.max(days + 20, 30));
      const period1 = startDate.toISOString().split("T")[0];

      const res = await this.yf.chart(yfSym, { period1, interval: "1d" });
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

      // Cache for 5 minutes
      this.ohlcvCache.set(cacheKey, { data: bars, expiresAt: now + 300_000 });
      return bars;
    } catch (err) {
      console.warn(`[YahooMarketDataProvider] OHLCV failed for ${cleanSym}, using sample fallback`);
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

    // Optional: search via Yahoo Finance search API for additional symbols
    try {
      const searchRes = await this.yf.search(query);
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
