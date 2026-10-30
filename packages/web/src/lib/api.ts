// ── API client helpers ───────────────────────────────────────

import type {
  StockQuote,
  OHLCVBar,
  Holding,
  PortfolioSummary,
  Order,
  AutoTrigger,
  WalletData,
  MarketProviderStatus,
  AuthUser,
} from "@/types";

const BASE = "/api";
export const TOKEN_KEY = "pt_session_token";

export function getSessionToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setSessionToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken() {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "API error");
  return json;
}

export const api = {
  auth: {
    me: () => apiFetch<{ data: { user: AuthUser; cash: number } }>("/auth/me"),
    guest: () =>
      apiFetch<{ data: { user: AuthUser; token: string } }>("/auth/guest", {
        method: "POST",
      }),
    register: (body: {
      username: string;
      email?: string;
      password: string;
      name?: string;
      guestToken?: string;
    }) =>
      apiFetch<{ data: { user: AuthUser; token: string } }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: { usernameOrEmail: string; password: string }) =>
      apiFetch<{ data: { user: AuthUser; token: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    logout: () =>
      apiFetch<{ success: boolean }>("/auth/logout", {
        method: "POST",
      }),
    forgotPassword: (usernameOrEmail: string) =>
      apiFetch<{ success: boolean; message: string; code?: string; username?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ usernameOrEmail }),
      }),
    resetPassword: (body: { usernameOrEmail: string; resetCode: string; newPassword: string }) =>
      apiFetch<{ success: boolean; message: string; data: { user: AuthUser; token: string } }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  stocks: {
    list: () => apiFetch<{ data: StockQuote[]; isSample: boolean }>("/stocks"),
    search: (q: string) =>
      apiFetch<{ data: Array<{ symbol: string; name: string; sector: string }> }>(
        `/stocks/search?q=${encodeURIComponent(q)}`
      ),
    detail: (symbol: string) =>
      apiFetch<{ data: { quote: StockQuote; ohlcv: OHLCVBar[] }; isSample: boolean }>(
        `/stocks/${symbol}`
      ),
  },
  portfolio: {
    summary: () => apiFetch<{ data: PortfolioSummary }>("/portfolio/summary"),
    holdings: () => apiFetch<{ data: Holding[]; isSample: boolean }>("/portfolio"),
  },
  orders: {
    list: (status?: string) =>
      apiFetch<{ data: Order[] }>(`/orders${status ? `?status=${status}` : ""}`),
    create: (body: {
      symbol: string;
      side: "BUY" | "SELL";
      qty: number;
      price: number;
      orderType?: "MARKET" | "LIMIT";
      productType?: "CNC" | "MIS";
      stopLoss?: number;
      targetPrice?: number;
    }) =>
      apiFetch<{ data: { wallet: { cash: number }; order: Order; isPending?: boolean } }>("/orders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    cancel: (id: number) =>
      apiFetch<{ success: boolean; id: number }>(`/orders/${id}`, {
        method: "DELETE",
      }),
  },
  triggers: {
    list: (symbol?: string) =>
      apiFetch<{ data: AutoTrigger[] }>(`/triggers${symbol ? `?symbol=${symbol}` : ""}`),
    create: (body: {
      symbol: string;
      trigger_type: "STOP_LOSS" | "TARGET";
      trigger_price: number;
      qty?: number;
    }) =>
      apiFetch<{ data: AutoTrigger }>("/triggers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    cancel: (id: number) =>
      apiFetch<{ success: boolean; id: number }>(`/triggers/${id}`, {
        method: "DELETE",
      }),
  },
  wallet: {
    get: () => apiFetch<{ data: WalletData }>("/wallet"),
  },
  watchlist: {
    list: () => apiFetch<{ data: StockQuote[] }>("/watchlist"),
    add: (symbol: string) =>
      apiFetch<{ success: boolean; symbol: string }>(`/watchlist/${symbol}`, {
        method: "POST",
      }),
    remove: (symbol: string) =>
      apiFetch<{ success: boolean; symbol: string }>(`/watchlist/${symbol}`, {
        method: "DELETE",
      }),
  },
  provider: {
    get: () => apiFetch<MarketProviderStatus>("/market-provider"),
    set: (provider: "yahoo" | "sample") =>
      apiFetch<MarketProviderStatus>("/market-provider", {
        method: "POST",
        body: JSON.stringify({ provider }),
      }),
  },
};
