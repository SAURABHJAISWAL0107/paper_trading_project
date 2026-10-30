import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Shield,
  Target,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { Button, MarketDataBadge } from "@/components/ui";
import type { StockQuote } from "@/types";

interface TradeTicketProps {
  quote: StockQuote;
  availableCash: number;
  availableQty?: number; // for selling
  defaultProductType?: ProductType;
  onClose: () => void;
}

type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";
type ProductType = "CNC" | "MIS"; // Delivery vs Intraday

export function TradeTicket({
  quote,
  availableCash,
  availableQty = 0,
  defaultProductType = "CNC",
  onClose,
}: TradeTicketProps) {
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [productType, setProductType] = useState<ProductType>(defaultProductType);
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState(quote.price);

  // Stop-Loss and Target states
  const [enableSL, setEnableSL] = useState(false);
  const [stopLoss, setStopLoss] = useState(() =>
    parseFloat((quote.price * 0.98).toFixed(2))
  );

  const [enableTarget, setEnableTarget] = useState(false);
  const [targetPrice, setTargetPrice] = useState(() =>
    parseFloat((quote.price * 1.04).toFixed(2))
  );

  const [orderResult, setOrderResult] = useState<{ isPending?: boolean } | null>(null);
  const qc = useQueryClient();

  const effectivePrice = orderType === "MARKET" ? quote.price : limitPrice;
  const totalExposure = qty * effectivePrice;
  const marginRequired =
    productType === "MIS"
      ? parseFloat((totalExposure / 5).toFixed(2))
      : totalExposure;

  const canBuy = side === "BUY" && marginRequired <= availableCash && qty > 0;
  const canSell = side === "SELL" && qty > 0 && qty <= availableQty;
  const canSubmit = side === "BUY" ? canBuy : canSell;

  // Risk / Reward calculations
  const riskPerShare = enableSL && stopLoss < effectivePrice ? effectivePrice - stopLoss : 0;
  const totalRisk = riskPerShare * qty;
  const riskPct = effectivePrice > 0 ? (riskPerShare / effectivePrice) * 100 : 0;

  const rewardPerShare = enableTarget && targetPrice > effectivePrice ? targetPrice - effectivePrice : 0;
  const totalReward = rewardPerShare * qty;
  const rewardPct = effectivePrice > 0 ? (rewardPerShare / effectivePrice) * 100 : 0;

  const rrr = riskPerShare > 0 && rewardPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(1) : null;

  const mutation = useMutation({
    mutationFn: () =>
      api.orders.create({
        symbol: quote.symbol,
        side,
        orderType,
        productType,
        qty,
        price: effectivePrice,
        stopLoss: side === "BUY" && enableSL ? stopLoss : undefined,
        targetPrice: side === "BUY" && enableTarget ? targetPrice : undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["triggers"] });
      setOrderResult({ isPending: res.data.isPending });
      setTimeout(() => {
        onClose();
      }, 1500);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Top Header */}
        <div
          className={`p-4 text-white flex items-center justify-between transition-colors ${
            side === "BUY" ? "bg-blue-600" : "bg-red-600"
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{quote.symbol}</h2>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded font-medium">
                NSE &bull; EQ
              </span>
            </div>
            <p className="text-xs text-white/80 truncate max-w-[280px]">{quote.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {orderResult !== null ? (
          <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2
              className={`w-16 h-16 animate-bounce ${
                orderResult.isPending ? "text-amber-500" : "text-emerald-500"
              }`}
            />
            <h3 className="text-xl font-bold">
              {orderResult.isPending ? "Limit Order Queued!" : "Order Executed!"}
            </h3>
            <p className="text-sm text-slate-500">
              {side} {qty} &times; {quote.symbol} @ {fmtCurrency(effectivePrice)} ({productType}
              {productType === "MIS" ? " • 5x Margin" : ""})
            </p>
            {orderResult.isPending && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900">
                ⏳ Open order placed. Will fill automatically when market reaches {fmtCurrency(effectivePrice)}.
              </p>
            )}
            {enableSL && (
              <p className="text-xs text-rose-500 font-medium">
                🛡️ Stop-Loss set at {fmtCurrency(stopLoss)}
              </p>
            )}
            {enableTarget && (
              <p className="text-xs text-emerald-500 font-medium">
                🎯 Target set at {fmtCurrency(targetPrice)}
              </p>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Live LTP display */}
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold font-mono">{fmtCurrency(quote.price)}</span>
                <span
                  className={`text-xs font-semibold ml-2 ${
                    quote.change >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {quote.change >= 0 ? "+" : ""}
                  {fmtCurrency(quote.change)} ({quote.changePct >= 0 ? "+" : ""}
                  {quote.changePct}%)
                </span>
              </div>
              <MarketDataBadge isSample={quote.isSample} />
            </div>

            {/* BUY / SELL Switch */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setSide("BUY")}
                className={`py-2 text-sm font-bold rounded-lg transition-all ${
                  side === "BUY"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setSide("SELL")}
                className={`py-2 text-sm font-bold rounded-lg transition-all ${
                  side === "SELL"
                    ? "bg-red-600 text-white shadow"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                SELL
              </button>
            </div>

            {/* Product & Order Type Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Product
                </label>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setProductType("CNC")}
                    className={`flex-1 py-1.5 font-semibold ${
                      productType === "CNC"
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        : "text-slate-500"
                    }`}
                  >
                    CNC (Delivery)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductType("MIS")}
                    className={`flex-1 py-1.5 font-semibold ${
                      productType === "MIS"
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        : "text-slate-500"
                    }`}
                  >
                    MIS (Intraday)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Order Type
                </label>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setOrderType("MARKET")}
                    className={`flex-1 py-1.5 font-semibold ${
                      orderType === "MARKET"
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        : "text-slate-500"
                    }`}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType("LIMIT")}
                    className={`flex-1 py-1.5 font-semibold ${
                      orderType === "LIMIT"
                        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        : "text-slate-500"
                    }`}
                  >
                    Limit
                  </button>
                </div>
              </div>
            </div>

            {/* Qty & Price Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Quantity
                </label>
                <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 font-bold"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={side === "SELL" ? availableQty : undefined}
                    value={qty}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v > 0) setQty(v);
                    }}
                    className="w-full text-center py-1.5 bg-transparent font-mono text-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setQty((q) => (side === "SELL" ? Math.min(availableQty, q + 1) : q + 1))
                    }
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  {orderType === "LIMIT" ? "Limit Price" : "Execution Price"}
                </label>
                <input
                  type="number"
                  step="0.05"
                  disabled={orderType === "MARKET"}
                  value={orderType === "MARKET" ? quote.price : limitPrice}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) setLimitPrice(v);
                  }}
                  className={`w-full py-1.5 px-3 rounded-lg border font-mono text-sm text-right focus:outline-none ${
                    orderType === "MARKET"
                      ? "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500"
                      : "border-blue-500 bg-transparent"
                  }`}
                />
              </div>
            </div>

            {/* Stop-Loss & Target Section (Only on BUY orders) */}
            {side === "BUY" && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-500" />
                    Auto-Exit Bracket Orders
                  </span>
                  {rrr && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px] bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                      R:R = 1 : {rrr}
                    </span>
                  )}
                </div>

                {/* Stop Loss Input */}
                <div>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableSL}
                        onChange={(e) => setEnableSL(e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        Stop-Loss (SL)
                      </span>
                    </label>
                    {enableSL && (
                      <span className="font-mono text-rose-600 text-[11px]">
                        Max Risk: -{fmtCurrency(totalRisk)} (-{riskPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  {enableSL && (
                    <input
                      type="number"
                      step="0.05"
                      placeholder="Stop Loss Price"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
                      className="w-full py-1 px-2.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  )}
                </div>

                {/* Target Price Input */}
                <div>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableTarget}
                        onChange={(e) => setEnableTarget(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        Target / Take-Profit (TP)
                      </span>
                    </label>
                    {enableTarget && (
                      <span className="font-mono text-emerald-600 text-[11px]">
                        Target Profit: +{fmtCurrency(totalReward)} (+{rewardPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  {enableTarget && (
                    <input
                      type="number"
                      step="0.05"
                      placeholder="Target Price"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
                      className="w-full py-1 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-800 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Calculations & Position summary */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 flex items-center gap-1.5">
                  Margin Required
                  {productType === "MIS" && (
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
                      5x Leverage
                    </span>
                  )}
                </span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                  {fmtCurrency(marginRequired)}
                </span>
              </div>
              {productType === "MIS" && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Total Exposure</span>
                  <span className="font-mono font-medium">{fmtCurrency(totalExposure)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>Available Cash</span>
                <span className="font-mono font-medium">{fmtCurrency(availableCash)}</span>
              </div>
              {side === "SELL" && (
                <div className="flex justify-between text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-1">
                  <span>Current Holdings ({productType})</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {availableQty} shares
                  </span>
                </div>
              )}
            </div>

            {/* Error alerts */}
            {mutation.isError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900">
                {(mutation.error as Error).message}
              </p>
            )}

            {side === "BUY" && marginRequired > availableCash && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                Insufficient funds. Need {fmtCurrency(marginRequired - availableCash)} more.
              </p>
            )}
            {side === "SELL" && qty > availableQty && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                You only hold {availableQty} {productType} share{availableQty !== 1 ? "s" : ""}.
              </p>
            )}

            {/* Submit Button */}
            <Button
              variant={side === "BUY" ? "primary" : "danger"}
              className="w-full py-3 text-sm font-bold tracking-wide"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? "Placing Order…"
                : orderType === "LIMIT"
                ? `QUEUE ${side} LIMIT ORDER @ ${fmtCurrency(limitPrice)}`
                : `${side} ${qty} ${qty !== 1 ? "SHARES" : "SHARE"} &bull; ${fmtCurrency(marginRequired)}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
