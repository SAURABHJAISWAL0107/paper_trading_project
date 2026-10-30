import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Star,
  StarOff,
  Zap,
  ShoppingBag,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct, pnlClass, fmtDate } from "@/lib/format";
import { Card, StatCard, LoadingState, ErrorState, MarketDataBadge, Button } from "@/components/ui";
import { TradeTicket } from "@/components/TradeTicket";
import { PriceFlash } from "@/components/PriceFlash";
import type { StockQuote } from "@/types";

export function DashboardPage() {
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const qc = useQueryClient();

  const summaryQ = useQuery({
    queryKey: ["portfolio", "summary"],
    queryFn: () => api.portfolio.summary(),
  });

  const ordersQ = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
  });

  const stocksQ = useQuery({
    queryKey: ["stocks"],
    queryFn: () => api.stocks.list(),
  });

  const watchlistQ = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api.watchlist.list(),
  });

  const holdingsQ = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.holdings(),
  });

  const removeWatchlistMutation = useMutation({
    mutationFn: (symbol: string) => api.watchlist.remove(symbol),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  if (summaryQ.isLoading) return <LoadingState message="Loading trading terminal…" />;
  if (summaryQ.isError) return <ErrorState message="Failed to load portfolio data" />;

  const s = summaryQ.data!.data;
  const networth = s.cash + s.totalCurrentValue;
  const recentOrders = (ordersQ.data?.data ?? []).slice(0, 5);
  const stocks = stocksQ.data?.data ?? [];
  const watchlist = watchlistQ.data?.data ?? [];
  const holdingsMap = new Map((holdingsQ.data?.data ?? []).map((h) => [h.symbol, h.qty]));

  const topGainers = [...stocks].sort((a, b) => b.changePct - a.changePct).slice(0, 4);
  const topLosers = [...stocks].sort((a, b) => a.changePct - b.changePct).slice(0, 4);

  const cashPct = networth > 0 ? (s.cash / networth) * 100 : 100;
  const investedPct = networth > 0 ? (s.totalCurrentValue / networth) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time simulated market trading &bull; Live portfolio valuation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MarketDataBadge isSample={summaryQ.data?.data.isSample ?? true} />
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Live Streaming
          </span>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Net Worth"
          value={fmtCurrency(networth)}
          sub={
            <div className="flex items-center gap-2 text-slate-500">
              <span>Cash: {cashPct.toFixed(0)}%</span>
              <span>&bull;</span>
              <span>Equity: {investedPct.toFixed(0)}%</span>
            </div>
          }
          valueClass="text-slate-900 dark:text-slate-100"
        />
        <StatCard
          label="Available Funds"
          value={fmtCurrency(s.cash)}
          sub="Ready for trading"
          valueClass="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Unrealised P&L"
          value={
            <span className={pnlClass(s.unrealisedPnl)}>
              {s.unrealisedPnl >= 0 ? "+" : ""}
              {fmtCurrency(s.unrealisedPnl)}
            </span>
          }
          sub={
            <span className={pnlClass(s.unrealisedPnlPct)}>
              {fmtPct(s.unrealisedPnlPct)} return
            </span>
          }
        />
        <StatCard
          label="Realised P&L"
          value={
            <span className={pnlClass(s.realisedPnl)}>
              {s.realisedPnl >= 0 ? "+" : ""}
              {fmtCurrency(s.realisedPnl)}
            </span>
          }
          sub="Booked profits/losses"
        />
      </div>

      {/* Portfolio Asset Allocation Bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-xs font-semibold mb-2 text-slate-600 dark:text-slate-400">
          <span>PORTFOLIO ALLOCATION</span>
          <span>
            Invested: {fmtCurrency(s.totalCurrentValue)} | Cash: {fmtCurrency(s.cash)}
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex">
          <div
            style={{ width: `${investedPct}%` }}
            className="bg-blue-600 h-full transition-all duration-500"
            title={`Invested: ${investedPct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${cashPct}%` }}
            className="bg-emerald-500 h-full transition-all duration-500"
            title={`Available Cash: ${cashPct.toFixed(1)}%`}
          />
        </div>
      </Card>

      {/* Watchlist Section */}
      {watchlist.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <h2 className="font-bold text-sm tracking-tight">Your Watchlist</h2>
              <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full font-mono">
                {watchlist.length}
              </span>
            </div>
            <Link
              to="/stocks"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Add stocks +
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:gap-2 p-3">
            {watchlist.map((item) => (
              <div
                key={item.symbol}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/stocks/$symbol"
                      params={{ symbol: item.symbol }}
                      className="font-mono font-bold text-sm hover:underline"
                    >
                      {item.symbol}
                    </Link>
                    <button
                      onClick={() => removeWatchlistMutation.mutate(item.symbol)}
                      className="text-slate-400 hover:text-amber-500"
                      title="Remove from watchlist"
                    >
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 truncate max-w-[140px]">{item.name}</p>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="font-mono font-bold text-sm">
                      <PriceFlash value={item.price} formatter={fmtCurrency} />
                    </p>
                    <p className={`text-xs font-semibold ${pnlClass(item.changePct)}`}>
                      {item.changePct >= 0 ? "+" : ""}
                      {fmtPct(item.changePct)}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    className="py-1 px-2.5 text-xs font-bold"
                    onClick={() => setSelectedStock(item)}
                  >
                    Trade
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Market Movers & Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Gainers & Losers */}
        <Card>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="font-bold text-sm">Market Movers (NSE)</h2>
            </div>
            <Link
              to="/stocks"
              className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline font-semibold"
            >
              All 50 stocks <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Top Gainers
              </p>
              <div className="grid grid-cols-2 gap-2">
                {topGainers.map((g) => (
                  <div
                    key={g.symbol}
                    onClick={() => setSelectedStock(g)}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-xs">{g.symbol}</span>
                      <span className="text-xs font-bold text-emerald-600">
                        +{fmtPct(g.changePct)}
                      </span>
                    </div>
                    <p className="font-mono text-sm font-semibold mt-1">{fmtCurrency(g.price)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Top Losers
              </p>
              <div className="grid grid-cols-2 gap-2">
                {topLosers.map((l) => (
                  <div
                    key={l.symbol}
                    onClick={() => setSelectedStock(l)}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-xs">{l.symbol}</span>
                      <span className="text-xs font-bold text-rose-600">
                        {fmtPct(l.changePct)}
                      </span>
                    </div>
                    <p className="font-mono text-sm font-semibold mt-1">{fmtCurrency(l.price)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Recent Trades */}
        <Card>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-bold text-sm">Recent Trades</h2>
            <Link
              to="/orders"
              className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline font-semibold"
            >
              Order book <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No trades placed yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Pick any stock and execute your first paper trade!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center px-5 py-3 gap-3">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      o.side === "BUY"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {o.side}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold text-sm">{o.symbol}</p>
                    <p className="text-xs text-slate-400">
                      {o.qty} shares &bull;{" "}
                      {o.order_type === "STOP_LOSS"
                        ? "🛡️ SL EXIT"
                        : o.order_type === "TARGET"
                        ? "🎯 TARGET HIT"
                        : o.order_type || "MARKET"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-sm">{fmtCurrency(o.price)}</p>
                    {o.realised_pnl != null && (
                      <p className={`text-xs font-semibold ${pnlClass(o.realised_pnl)}`}>
                        {o.realised_pnl >= 0 ? "+" : ""}
                        {fmtCurrency(o.realised_pnl)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Trade Modal */}
      {selectedStock && (
        <TradeTicket
          quote={selectedStock}
          availableCash={s.cash}
          availableQty={holdingsMap.get(selectedStock.symbol) ?? 0}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  );
}
