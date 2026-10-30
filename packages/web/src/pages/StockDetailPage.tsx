import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "@tanstack/react-router";
import { ArrowLeft, ShoppingCart, Star, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct, fmtVolume, pnlClass } from "@/lib/format";
import { Card, LoadingState, ErrorState, MarketDataBadge, Badge, Button } from "@/components/ui";
import { TradeTicket } from "@/components/TradeTicket";
import { TradingViewChart } from "@/components/TradingViewChart";
import { PriceFlash } from "@/components/PriceFlash";

export function StockDetailPage() {
  const { symbol } = useParams({ from: "/stocks/$symbol" });
  const [ticketOpen, setTicketOpen] = useState(false);
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["stock", symbol],
    queryFn: () => api.stocks.detail(symbol),
  });

  const summaryQ = useQuery({
    queryKey: ["portfolio", "summary"],
    queryFn: () => api.portfolio.summary(),
  });

  const holdingsQ = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.holdings(),
  });

  const watchlistQ = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api.watchlist.list(),
  });

  const toggleWatchlistMutation = useMutation({
    mutationFn: async () => {
      const isStarred = (watchlistQ.data?.data ?? []).some((w) => w.symbol === symbol);
      if (isStarred) {
        await api.watchlist.remove(symbol);
      } else {
        await api.watchlist.add(symbol);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  if (detailQ.isLoading) return <LoadingState message={`Loading ${symbol} market data…`} />;
  if (detailQ.isError) return <ErrorState message={`Could not load ${symbol}`} />;

  const { quote, ohlcv } = detailQ.data!.data;
  const cash = summaryQ.data?.data.cash ?? 0;
  const holding = holdingsQ.data?.data.find((h) => h.symbol === symbol);
  const availableQty = holding?.qty ?? 0;
  const isStarred = (watchlistQ.data?.data ?? []).some((w) => w.symbol === symbol);

  return (
    <div className="space-y-5">
      {/* Back navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/stocks"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> All Stocks
        </Link>
        <button
          onClick={() => toggleWatchlistMutation.mutate()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
        >
          <Star
            className={`w-4 h-4 ${
              isStarred ? "fill-amber-400 text-amber-400" : "text-slate-400"
            }`}
          />
          {isStarred ? "Watchlisted" : "Add to Watchlist"}
        </button>
      </div>

      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <h1 className="text-3xl font-extrabold font-mono tracking-tight">{quote.symbol}</h1>
            <Badge>{quote.sector}</Badge>
            <MarketDataBadge isSample={quote.isSample} />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">{quote.name}</p>

          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-4xl font-extrabold font-mono tracking-tight">
              <PriceFlash value={quote.price} formatter={fmtCurrency} />
            </span>
            <span
              className={`text-lg font-bold flex items-center gap-1 ${pnlClass(quote.changePct)}`}
            >
              {quote.change >= 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              {quote.change >= 0 ? "+" : ""}
              {fmtCurrency(quote.change)} ({fmtPct(quote.changePct)})
            </span>
          </div>
        </div>

        <Button
          onClick={() => setTicketOpen(true)}
          className="sm:self-start py-2.5 px-6 text-base font-bold shadow-md"
        >
          <ShoppingCart className="w-4 h-4" /> Buy / Sell
        </Button>
      </div>

      {/* Market Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
        {[
          ["Open", fmtCurrency(quote.open)],
          ["Prev Close", fmtCurrency(quote.prevClose)],
          ["Day High", fmtCurrency(quote.high)],
          ["Day Low", fmtCurrency(quote.low)],
          ["Volume", fmtVolume(quote.volume)],
          [
            "52W H / L",
            quote.yearHigh
              ? `${fmtCurrency(quote.yearHigh)} / ${fmtCurrency(quote.yearLow ?? 0)}`
              : "—",
          ],
        ].map(([label, val]) => (
          <Card key={label} className="p-3">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="font-mono font-bold text-slate-900 dark:text-slate-100">{val}</p>
          </Card>
        ))}
      </div>

      {/* Professional TradingView Candlestick Chart */}
      <Card className="p-5">
        <div className="mb-3">
          <h2 className="font-bold text-base tracking-tight flex items-center gap-2">
            <span>TradingView Pro Candlestick Chart</span>
            <span className="text-xs font-normal text-slate-400">(Interactive)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Real Japanese Candlesticks with Multi-Timeframes (1W to 1Y), Volume histogram, EMA 20, SMA 50/200, Bollinger Bands, RSI 14 oscillator, and Fullscreen mode.
          </p>
        </div>

        <TradingViewChart data={ohlcv} height={420} currentPrice={quote.price} />
      </Card>

      {/* Position Status Card */}
      {holding && (
        <Card className="p-5 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Your Open Position in {quote.symbol}
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              Holding Active
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Quantity</p>
              <p className="font-bold font-mono text-base">{holding.qty} shares</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Avg. Buy Price</p>
              <p className="font-mono font-bold">{fmtCurrency(holding.avgPrice)}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Current Value</p>
              <p className="font-mono font-bold">{fmtCurrency(holding.currentValue)}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Unrealised P&L</p>
              <p className={`font-mono font-bold text-base ${pnlClass(holding.pnl)}`}>
                {holding.pnl >= 0 ? "+" : ""}
                {fmtCurrency(holding.pnl)} ({fmtPct(holding.pnlPct)})
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Trade Ticket Modal */}
      {ticketOpen && (
        <TradeTicket
          quote={quote}
          availableCash={cash}
          availableQty={availableQty}
          onClose={() => setTicketOpen(false)}
        />
      )}
    </div>
  );
}
