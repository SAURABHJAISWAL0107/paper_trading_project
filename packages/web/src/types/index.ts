// ── Shared TypeScript types ──────────────────────────────────

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  isGuest: boolean;
  createdAt?: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  yearHigh?: number;
  yearLow?: number;
  isSample: boolean;
}

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Holding {
  symbol: string;
  name: string;
  sector: string;
  productType: "CNC" | "MIS";
  leverage: number;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  invested: number;
  pnl: number;
  pnlPct: number;
  change: number;
  changePct: number;
  updatedAt: string;
  isSample: boolean;
}

export interface PortfolioSummary {
  cash: number;
  totalInvested: number;
  totalCurrentValue: number;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  realisedPnl: number;
  isSample: boolean;
}

export interface Order {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT" | "STOP_LOSS" | "TARGET";
  product_type: "CNC" | "MIS";
  status: "EXECUTED" | "PENDING" | "CANCELLED";
  qty: number;
  price: number;
  limit_price?: number;
  total_value: number;
  margin_used?: number;
  realised_pnl: number | null;
  created_at: string;
  executed_at?: string;
}

export interface AutoTrigger {
  id: number;
  symbol: string;
  side: "SELL";
  qty: number;
  trigger_type: "STOP_LOSS" | "TARGET";
  trigger_price: number;
  status: "ACTIVE" | "TRIGGERED" | "CANCELLED";
  created_at: string;
  triggered_at: string | null;
}

export interface WalletTransaction {
  id: number;
  type: "CREDIT" | "DEBIT";
  amount: number;
  description: string;
  created_at: string;
}

export interface WalletData {
  wallet: { cash: number; updated_at: string };
  transactions: WalletTransaction[];
}

export interface MarketProviderStatus {
  provider: "yahoo" | "sample";
  status: "LIVE" | "SAMPLE" | "ERROR";
  isSample: boolean;
  error?: string | null;
  available: string[];
}
