import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, TrendingUp, TrendingDown, Star, ShoppingCart } from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct, pnlClass, fmtVolume } from "@/lib/format";
import { Card, LoadingState, ErrorState, MarketDataBadge, Badge, Button } from "@/components/ui";
import { TradeTicket } from "@/components/TradeTicket";
import { PriceFlash } from "@/components/PriceFlash";
import type { StockQuote } from "@/types";

const ALL_SECTORS = "All Sectors";

export function StocksPage() {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState(ALL_SECTORS);
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const qc = useQueryClient();

  const stocksQ = useQuery({
    queryKey: ["stocks"],
    queryFn: () => api.stocks.list(),
  });

  const watchlistQ = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api.watchlist.list(),
  });

  const summaryQ = useQuery({
    queryKey: ["portfolio", "summary"],
    queryFn: () => api.portfolio.summary(),
  });

  const holdingsQ = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.holdings(),
  });

  const toggleWatchlistMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const isStarred = (watchlistQ.data?.data ?? []).some((w) => w.symbol === symbol);
      if (isStarred) {
        await api.watchlist.remove(symbol);
      } else {
        await api.watchlist.add(symbol);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const stocks = stocksQ.data?.data ?? [];
  const starredSet = new Set((watchlistQ.data?.data ?? []).map((w) => w.symbol));
  const holdingsMap = new Map((holdingsQ.data?.data ?? []).map((h) => [h.symbol, h.qty]));
  const availableCash = summaryQ.data?.data.cash ?? 0;

  const sectors = [ALL_SECTORS, ...Array.from(new Set(stocks.map((s) => s.sector))).sort()];

  const filtered = stocks.filter((s) => {
    const matchQ =
      !query ||
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.name.toLowerCase().includes(query.toLowerCase());
    const matchSector = sector === ALL_SECTORS || s.sector === sector;
    return matchQ && matchSector;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Market Directory</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            50 National Stock Exchange (NSE) Equities &bull; Real-time pricing
          </p>
        </div>
        <MarketDataBadge isSample={stocksQ.data?.isSample ?? true} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ticker (e.g. RELIANCE, TCS) or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {stocksQ.isLoading && <LoadingState message="Fetching live market quotes…" />}
      {stocksQ.isError && <ErrorState message="Failed to fetch stock prices" />}

      {!stocksQ.isLoading && !stocksQ.isError && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Company</th>
                  <th className="px-4 py-3 hidden md:table-cell">Sector</th>
                  <th className="px-4 py-3 text-right">LTP (₹)</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Day High / Low</th>
                  <th className="px-4 py-3 text-right hidden xl:table-cell">Volume</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((s) => {
                  const isStarred = starredSet.has(s.symbol);
                  return (
                    <tr
                      key={s.symbol}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => toggleWatchlistMutation.mutate(s.symbol)}
                          className="text-slate-300 hover:text-amber-400 dark:text-slate-600 transition-colors"
                          title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
                        >
                          <Star
                            className={`w-4 h-4 ${
                              isStarred
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300 dark:text-slate-600"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to="/stocks/$symbol"
                          params={{ symbol: s.symbol }}
                          className="font-mono font-bold hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {s.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 hidden sm:table-cell max-w-[200px] truncate">
                        {s.name}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge>{s.sector}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <PriceFlash value={s.price} formatter={fmtCurrency} />
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${pnlClass(s.changePct)}`}
                      >
                        <span className="flex items-center justify-end gap-0.5">
                          {s.changePct >= 0 ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {fmtPct(s.changePct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs hidden lg:table-cell font-mono">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {fmtCurrency(s.high)}
                        </span>
                        {" / "}
                        <span className="text-rose-600 dark:text-rose-400">
                          {fmtCurrency(s.low)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs hidden xl:table-cell font-mono">
                        {fmtVolume(s.volume)}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button
                          variant="primary"
                          className="py-1 px-3 text-xs font-semibold"
                          onClick={() => setSelectedStock(s)}
                        >
                          Trade
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center text-slate-400 py-10 text-sm">No stocks matched.</p>
            )}
          </div>
        </Card>
      )}

      {selectedStock && (
        <TradeTicket
          quote={selectedStock}
          availableCash={availableCash}
          availableQty={holdingsMap.get(selectedStock.symbol) ?? 0}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  );
}
