// ============================================================
// MarketDataProvider interface — swap implementations freely
// ============================================================

export interface StockQuote {
  symbol: string;
  name: string;
  sector: string;
  price: number;       // current price (LTP)
  change: number;      // absolute change from prev close
  changePct: number;   // percentage change
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  yearHigh?: number;
  yearLow?: number;
  isSample: boolean;   // false when connected to live Yahoo Finance
}

export interface OHLCVBar {
  date: string;   // ISO date string YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataProvider {
  readonly providerName: string;

  /** Fetch quote for a single symbol */
  getQuote(symbol: string): Promise<StockQuote | null>;

  /** Fetch quotes for multiple symbols */
  getQuotes(symbols: string[]): Promise<StockQuote[]>;

  /** Fetch OHLCV bars (daily) for a symbol, last N days */
  getOHLCV(symbol: string, days: number): Promise<OHLCVBar[]>;

  /** Search stocks by query string */
  search(query: string): Promise<Array<{ symbol: string; name: string; sector: string }>>;
}
