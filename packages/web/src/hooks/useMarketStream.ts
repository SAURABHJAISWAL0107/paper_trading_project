import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StockQuote, Holding, PortfolioSummary } from "@/types";

export function useMarketStream() {
  const qc = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!isMounted) return;

      const es = new EventSource("/api/market/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        if (isMounted) setIsConnected(true);
      };

      // Full snapshot on first connection
      es.addEventListener("snapshot", (e) => {
        try {
          const snapshot: StockQuote[] = JSON.parse(e.data);
          qc.setQueryData(["stocks"], (old: any) => {
            return {
              data: snapshot,
              isSample: snapshot[0]?.isSample ?? true,
            };
          });
        } catch {
          // ignore parsing error
        }
      });

      // Micro-ticks broadcast
      es.addEventListener("tick", (e) => {
        try {
          const ticks: StockQuote[] = JSON.parse(e.data);
          if (!Array.isArray(ticks) || ticks.length === 0) return;

          const tickMap = new Map(ticks.map((t) => [t.symbol, t]));

          // 1. Update Market Stocks List
          qc.setQueryData(["stocks"], (old: any) => {
            if (!old?.data) return old;
            return {
              ...old,
              data: old.data.map((s: StockQuote) => tickMap.get(s.symbol) ?? s),
            };
          });

          // 2. Update Watchlist
          qc.setQueryData(["watchlist"], (old: any) => {
            if (!old?.data) return old;
            return {
              ...old,
              data: old.data.map((s: StockQuote) => tickMap.get(s.symbol) ?? s),
            };
          });

          // 3. Update single Stock Detail views
          for (const tick of ticks) {
            qc.setQueryData(["stock", tick.symbol], (old: any) => {
              if (!old?.data?.quote) return old;
              return {
                ...old,
                data: {
                  ...old.data,
                  quote: tick,
                },
              };
            });
          }

          // 4. Update Portfolio Holdings & Summary
          let holdingsChanged = false;
          qc.setQueryData(["portfolio"], (old: any) => {
            if (!old?.data) return old;
            const updatedHoldings = old.data.map((h: Holding) => {
              const t = tickMap.get(h.symbol);
              if (!t) return h;
              holdingsChanged = true;
              const isMIS = h.productType === "MIS";
              const invested = parseFloat(
                (isMIS ? (h.qty * h.avgPrice) / 5 : h.qty * h.avgPrice).toFixed(2)
              );
              const pnl = parseFloat(((t.price - h.avgPrice) * h.qty).toFixed(2));
              const pnlPct = invested > 0 ? parseFloat(((pnl / invested) * 100).toFixed(2)) : 0;
              const currentValue = parseFloat((invested + pnl).toFixed(2));
              return {
                ...h,
                currentPrice: t.price,
                currentValue,
                invested,
                pnl,
                pnlPct,
                change: t.change,
                changePct: t.changePct,
              };
            });
            return holdingsChanged ? { ...old, data: updatedHoldings } : old;
          });

          if (holdingsChanged) {
            qc.setQueryData(["portfolio", "summary"], (old: any) => {
              if (!old?.data) return old;
              const holdingsData = qc.getQueryData<any>(["portfolio"]);
              if (!holdingsData?.data) return old;

              let totalInvested = 0;
              let totalCurrentValue = 0;

              for (const h of holdingsData.data) {
                totalInvested += h.qty * h.avgPrice;
                totalCurrentValue += h.currentValue;
              }

              const unrealisedPnl = parseFloat((totalCurrentValue - totalInvested).toFixed(2));
              const unrealisedPnlPct =
                totalInvested > 0 ? parseFloat(((unrealisedPnl / totalInvested) * 100).toFixed(2)) : 0;

              return {
                ...old,
                data: {
                  ...old.data,
                  totalInvested: parseFloat(totalInvested.toFixed(2)),
                  totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
                  unrealisedPnl,
                  unrealisedPnlPct,
                },
              };
            });
          }
        } catch {
          // ignore parsing error
        }
      });

      es.onerror = () => {
        if (isMounted) setIsConnected(false);
        es.close();
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [qc]);

  return { isConnected };
}
