import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Clock,
  Shield,
  Target,
  X,
  Trash2,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct, pnlClass } from "@/lib/format";
import { Card, StatCard, LoadingState, ErrorState, MarketDataBadge, Button, Badge } from "@/components/ui";
import { TradeTicket } from "@/components/TradeTicket";
import { PriceFlash } from "@/components/PriceFlash";
import type { Holding, AutoTrigger } from "@/types";

export function PortfolioPage() {
  const [tradeHolding, setTradeHolding] = useState<Holding | null>(null);
  const [editingTriggerHolding, setEditingTriggerHolding] = useState<Holding | null>(null);

  // Modal input state for setting SL / Target
  const [triggerType, setTriggerType] = useState<"STOP_LOSS" | "TARGET">("STOP_LOSS");
  const [triggerPrice, setTriggerPrice] = useState<number>(0);

  const qc = useQueryClient();

  const summaryQ = useQuery({
    queryKey: ["portfolio", "summary"],
    queryFn: () => api.portfolio.summary(),
  });

  const holdingsQ = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.holdings(),
  });

  const triggersQ = useQuery({
    queryKey: ["triggers"],
    queryFn: () => api.triggers.list(),
    refetchInterval: 5_000,
  });

  const cancelTriggerMutation = useMutation({
    mutationFn: (id: number) => api.triggers.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["triggers"] }),
  });

  const createTriggerMutation = useMutation({
    mutationFn: () =>
      api.triggers.create({
        symbol: editingTriggerHolding!.symbol,
        trigger_type: triggerType,
        trigger_price: triggerPrice,
        qty: editingTriggerHolding!.qty,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triggers"] });
      setEditingTriggerHolding(null);
    },
  });

  const s = summaryQ.data?.data;
  const holdings = holdingsQ.data?.data ?? [];
  const isSample = summaryQ.data?.data.isSample ?? true;
  const triggers = triggersQ.data?.data ?? [];

  // Group active triggers by symbol
  const activeTriggersBySym = new Map<string, { sl?: AutoTrigger; tp?: AutoTrigger }>();
  for (const t of triggers) {
    if (t.status === "ACTIVE") {
      const existing = activeTriggersBySym.get(t.symbol) || {};
      if (t.trigger_type === "STOP_LOSS") existing.sl = t;
      if (t.trigger_type === "TARGET") existing.tp = t;
      activeTriggersBySym.set(t.symbol, existing);
    }
  }

  function openTriggerModal(h: Holding, type: "STOP_LOSS" | "TARGET") {
    setEditingTriggerHolding(h);
    setTriggerType(type);
    if (type === "STOP_LOSS") {
      setTriggerPrice(parseFloat((h.currentPrice * 0.97).toFixed(2)));
    } else {
      setTriggerPrice(parseFloat((h.currentPrice * 1.05).toFixed(2)));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio & Open Positions</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time equity valuation &bull; Stop-Loss & Target auto-exits active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MarketDataBadge isSample={isSample} />
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Live Streaming
          </span>
        </div>
      </div>

      {summaryQ.isLoading && <LoadingState message="Calculating portfolio valuation…" />}
      {summaryQ.isError && <ErrorState message="Failed to load portfolio summary" />}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Cash Balance"
            value={fmtCurrency(s.cash)}
            sub="Available funds"
            valueClass="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            label="Invested Capital"
            value={fmtCurrency(s.totalInvested)}
            sub={`Current Value: ${fmtCurrency(s.totalCurrentValue)}`}
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
            sub="Closed trades"
          />
        </div>
      )}

      {holdingsQ.isLoading && !summaryQ.isLoading && (
        <LoadingState message="Loading open positions…" />
      )}

      {holdings.length === 0 && !holdingsQ.isLoading && (
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto text-2xl font-bold">
              📈
            </div>
            <h3 className="text-lg font-bold">Your Portfolio is Empty</h3>
            <p className="text-sm text-slate-500">
              You have ₹1,00,00,000 (1 Cr) in virtual funds ready. Browse the market and execute your first paper trade.
            </p>
            <div className="pt-2">
              <Link to="/stocks">
                <Button className="font-semibold">
                  Browse Stocks <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {holdings.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Company</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Avg Buy</th>
                  <th className="px-4 py-3 text-right">Current LTP</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                  <th className="px-4 py-3">Auto-Exits (SL / Target)</th>
                  <th className="px-4 py-3 text-right">Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {holdings.map((h) => {
                  const activeT = activeTriggersBySym.get(h.symbol);
                  return (
                    <tr
                      key={h.symbol}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to="/stocks/$symbol"
                            params={{ symbol: h.symbol }}
                            className="font-mono font-bold hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {h.symbol}
                          </Link>
                          {h.productType === "MIS" ? (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                              MIS 5x
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                              CNC
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell max-w-[150px] truncate">
                        {h.name}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{h.qty}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {fmtCurrency(h.avgPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <div>
                          <PriceFlash value={h.currentPrice} formatter={fmtCurrency} />
                        </div>
                        <div
                          className={`text-xs ${pnlClass(
                            h.changePct
                          )} flex items-center justify-end gap-0.5 font-semibold`}
                        >
                          {h.changePct >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {fmtPct(h.changePct)}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${pnlClass(h.pnl)}`}
                      >
                        <div>
                          {h.pnl >= 0 ? "+" : ""}
                          {fmtCurrency(h.pnl)}
                        </div>
                        <div className="text-xs font-semibold">{fmtPct(h.pnlPct)}</div>
                      </td>

                      {/* Auto-Exits column */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {activeT?.sl ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                              <Shield className="w-3 h-3" />
                              SL: {fmtCurrency(activeT.sl.trigger_price)}
                              <button
                                onClick={() => cancelTriggerMutation.mutate(activeT.sl!.id)}
                                className="hover:text-rose-900 ml-0.5"
                                title="Cancel Stop-Loss"
                              >
                                &times;
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => openTriggerModal(h, "STOP_LOSS")}
                              className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-dashed border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded transition-colors"
                            >
                              + SL
                            </button>
                          )}

                          {activeT?.tp ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                              <Target className="w-3 h-3" />
                              TP: {fmtCurrency(activeT.tp.trigger_price)}
                              <button
                                onClick={() => cancelTriggerMutation.mutate(activeT.tp!.id)}
                                className="hover:text-emerald-900 ml-0.5"
                                title="Cancel Target"
                              >
                                &times;
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => openTriggerModal(h, "TARGET")}
                              className="text-[11px] text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-dashed border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded transition-colors"
                            >
                              + Target
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="secondary"
                          className="py-1 px-3 text-xs font-bold"
                          onClick={() => setTradeHolding(h)}
                        >
                          Trade
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Trade Ticket Modal */}
      {tradeHolding && (
        <TradeTicket
          quote={{
            symbol: tradeHolding.symbol,
            name: tradeHolding.name,
            sector: tradeHolding.sector,
            price: tradeHolding.currentPrice,
            change: tradeHolding.change,
            changePct: tradeHolding.changePct,
            open: tradeHolding.currentPrice,
            high: tradeHolding.currentPrice,
            low: tradeHolding.currentPrice,
            prevClose: tradeHolding.avgPrice,
            volume: 0,
            isSample: tradeHolding.isSample,
          }}
          availableCash={s?.cash ?? 0}
          availableQty={tradeHolding.qty}
          defaultProductType={tradeHolding.productType}
          onClose={() => setTradeHolding(null)}
        />
      )}

      {/* Set SL/Target Modal */}
      {editingTriggerHolding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">
                  Set {triggerType === "STOP_LOSS" ? "🛡️ Stop-Loss" : "🎯 Target Price"}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {editingTriggerHolding.symbol} &bull; Current: {fmtCurrency(editingTriggerHolding.currentPrice)}
                </p>
              </div>
              <button
                onClick={() => setEditingTriggerHolding(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Trigger Exit Price
              </label>
              <input
                type="number"
                step="0.05"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(parseFloat(e.target.value) || 0)}
                className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent font-mono text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {triggerType === "STOP_LOSS"
                  ? "When price drops to or below this price, a market sell order will automatically trigger."
                  : "When price rises to or above this price, a market sell order will automatically trigger."}
              </p>
            </div>

            <Button
              variant={triggerType === "STOP_LOSS" ? "danger" : "primary"}
              className="w-full py-2.5 font-bold"
              disabled={createTriggerMutation.isPending || triggerPrice <= 0}
              onClick={() => createTriggerMutation.mutate()}
            >
              {createTriggerMutation.isPending
                ? "Setting Trigger…"
                : `Activate ${triggerType === "STOP_LOSS" ? "Stop-Loss" : "Target"}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
