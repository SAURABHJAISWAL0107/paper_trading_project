// ============================================================
// SampleDataProvider — clearly labelled SAMPLE prices
// Replace this class with a real data provider later.
// ============================================================

import type { MarketDataProvider, StockQuote, OHLCVBar } from "./MarketDataProvider.js";
import { STOCKS } from "./stockUniverse.js";

/** Deterministic pseudo-random based on symbol + day seed */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildQuote(stock: typeof STOCKS[0]): StockQuote {
  const daySeed = Math.floor(Date.now() / 86_400_000); // changes daily
  const rand = seededRandom(
    stock.symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + daySeed
  );
  const changePct = (rand - 0.5) * 6; // -3% to +3%
  const change = parseFloat(((stock.basePrice * changePct) / 100).toFixed(2));
  const price = parseFloat((stock.basePrice + change).toFixed(2));
  const open = parseFloat((stock.basePrice * (1 + (seededRandom(daySeed + 1) - 0.5) * 0.01)).toFixed(2));
  const high = parseFloat((Math.max(price, open) * (1 + seededRandom(daySeed + 2) * 0.015)).toFixed(2));
  const low = parseFloat((Math.min(price, open) * (1 - seededRandom(daySeed + 3) * 0.015)).toFixed(2));

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    price,
    change,
    changePct: parseFloat(changePct.toFixed(2)),
    open,
    high,
    low,
    prevClose: stock.basePrice,
    volume: Math.floor(seededRandom(daySeed + 4) * 5_000_000 + 100_000),
    isSample: true,
  };
}

export class SampleDataProvider implements MarketDataProvider {
  readonly providerName = "sample";
  private stockMap = new Map(STOCKS.map((s) => [s.symbol, s]));

  async getQuote(symbol: string): Promise<StockQuote | null> {
    const stock = this.stockMap.get(symbol.toUpperCase());
    if (!stock) return null;
    return buildQuote(stock);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    return symbols
      .map((s) => this.stockMap.get(s.toUpperCase()))
      .filter(Boolean)
      .map((s) => buildQuote(s!));
  }

  async getOHLCV(symbol: string, days = 90): Promise<OHLCVBar[]> {
    const stock = this.stockMap.get(symbol.toUpperCase());
    if (!stock) return [];

    const bars: OHLCVBar[] = [];
    let prevClose = stock.basePrice;
    const today = new Date();

    for (let i = days; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      // skip weekends
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      const seed =
        stock.symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + i;
      const changePct = (seededRandom(seed) - 0.48) * 4;
      const close = parseFloat((prevClose * (1 + changePct / 100)).toFixed(2));
      const open = parseFloat((prevClose * (1 + (seededRandom(seed + 100) - 0.5) * 0.01)).toFixed(2));
      const high = parseFloat((Math.max(close, open) * (1 + seededRandom(seed + 200) * 0.02)).toFixed(2));
      const low = parseFloat((Math.min(close, open) * (1 - seededRandom(seed + 300) * 0.02)).toFixed(2));

      bars.push({
        date: d.toISOString().split("T")[0],
        open,
        high,
        low,
        close,
        volume: Math.floor(seededRandom(seed + 400) * 5_000_000 + 100_000),
      });
      prevClose = close;
    }
    return bars;
  }

  async search(query: string): Promise<Array<{ symbol: string; name: string; sector: string }>> {
    const q = query.toLowerCase();
    return STOCKS.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    ).map(({ symbol, name, sector }) => ({ symbol, name, sector }));
  }
}
