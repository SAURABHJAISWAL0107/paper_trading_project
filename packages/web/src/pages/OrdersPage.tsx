import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtCurrency, fmtDate, pnlClass } from "@/lib/format";
import { Card, LoadingState, ErrorState, EmptyState, Badge, Button } from "@/components/ui";
import { Clock, CheckCircle2, XCircle, Zap, Shield, Target } from "lucide-react";
import type { Order } from "@/types";

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState<"EXECUTED" | "PENDING">("EXECUTED");
  const qc = useQueryClient();

  const ordersQ = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.orders.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  const allOrders = ordersQ.data?.data ?? [];
  const pendingOrders = allOrders.filter((o) => o.status === "PENDING");
  const executedOrders = allOrders.filter((o) => o.status !== "PENDING");
  const displayOrders = activeTab === "PENDING" ? pendingOrders : executedOrders;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-0.5">Order Book & Trade History</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time ledger of executed paper trades, limit orders, and auto-bracket exits.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveTab("EXECUTED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "EXECUTED"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Executed ({executedOrders.length})
          </button>
          <button
            onClick={() => setActiveTab("PENDING")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "PENDING"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Open Orders ({pendingOrders.length})
            {pendingOrders.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {ordersQ.isLoading && <LoadingState message="Loading order history…" />}
      {ordersQ.isError && <ErrorState message="Failed to load trade history" />}

      {!ordersQ.isLoading && displayOrders.length === 0 && (
        <EmptyState
          message={
            activeTab === "PENDING"
              ? "No pending limit orders waiting in the queue."
              : "No executed trades in your ledger yet."
          }
          icon={activeTab === "PENDING" ? "⏳" : "🧾"}
        />
      )}

      {displayOrders.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Side</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-right">
                    {activeTab === "PENDING" ? "Limit Price" : "Execution Price"}
                  </th>
                  <th className="px-4 py-3 text-right">
                    {activeTab === "PENDING" ? "Margin Blocked" : "Order Value"}
                  </th>
                  {activeTab === "EXECUTED" && (
                    <th className="px-4 py-3 text-right">Realised P&L</th>
                  )}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Time</th>
                  {activeTab === "PENDING" && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {displayOrders.map((o) => (
                  <tr
                    key={o.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">#{o.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          o.side === "BUY"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {o.side}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.order_type === "STOP_LOSS" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900">
                          <Shield className="w-3 h-3" /> STOP-LOSS
                        </span>
                      ) : o.order_type === "TARGET" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900">
                          <Target className="w-3 h-3" /> TARGET
                        </span>
                      ) : o.order_type === "LIMIT" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                          <Clock className="w-3 h-3" /> LIMIT
                        </span>
                      ) : (
                        <Badge>MARKET</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.product_type === "MIS" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                          <Zap className="w-3 h-3 text-amber-500" /> MIS 5x
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-semibold">CNC</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">{o.symbol}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{o.qty}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {fmtCurrency(o.limit_price ?? o.price)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {fmtCurrency(o.status === "PENDING" && o.margin_used ? o.margin_used : o.total_value)}
                    </td>
                    {activeTab === "EXECUTED" && (
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          o.realised_pnl == null ? "text-slate-300" : pnlClass(o.realised_pnl)
                        }`}
                      >
                        {o.realised_pnl == null
                          ? "—"
                          : `${o.realised_pnl >= 0 ? "+" : ""}${fmtCurrency(o.realised_pnl)}`}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {o.status === "PENDING" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 animate-pulse">
                          ⏳ OPEN
                        </span>
                      ) : o.status === "CANCELLED" ? (
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          CANCELLED
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                          EXECUTED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell font-mono">
                      {fmtDate(o.created_at)}
                    </td>
                    {activeTab === "PENDING" && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="danger"
                          className="py-1 px-2.5 text-xs font-semibold"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(o.id)}
                        >
                          Cancel
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
