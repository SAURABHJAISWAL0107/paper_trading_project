import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { OHLCVBar } from "@/types";
import { fmtCurrency, fmtVolume } from "@/lib/format";

interface TradingViewChartProps {
  data: OHLCVBar[];
  height?: number;
}

type ChartType = "candles" | "area";

function calculateSMA(data: { time: string; close: number }[], period: number) {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return result;
}

function calculateEMA(data: { time: string; close: number }[], period: number) {
  const result: { time: string; value: number }[] = [];
  if (data.length < period) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: parseFloat(ema.toFixed(2)) });

  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: parseFloat(ema.toFixed(2)) });
  }
  return result;
}

export function TradingViewChart({ data, height = 400 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [chartType, setChartType] = useState<ChartType>("candles");
  const [showEMA20, setShowEMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  // Hover legend state
  const [hoverData, setHoverData] = useState<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Deduplicate and sort by date ascending
  const cleanData = useMemo(() => {
    const map = new Map<string, OHLCVBar>();
    for (const b of data) {
      if (b.date && b.close > 0) {
        map.set(b.date, b);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || cleanData.length === 0) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.7)" },
        horzLines: { color: isDark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.7)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: isDark ? "#334155" : "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#e2e8f0",
      },
    });

    chartRef.current = chart;

    // 1. Price Series (Candles or Area)
    let mainSeries: ISeriesApi<any>;

    if (chartType === "candles") {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#f43f5e",
        borderVisible: false,
        wickUpColor: "#10b981",
        wickDownColor: "#f43f5e",
      });

      candleSeries.setData(
        cleanData.map((d) => ({
          time: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );
      mainSeries = candleSeries;
    } else {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: "rgba(37, 99, 235, 0.35)",
        bottomColor: "rgba(37, 99, 235, 0.0)",
        lineColor: "#2563eb",
        lineWidth: 2,
      });

      areaSeries.setData(
        cleanData.map((d) => ({
          time: d.date,
          value: d.close,
        }))
      );
      mainSeries = areaSeries;
    }

    // 2. Volume Series
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volumeScale",
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8, // 80% empty above volume bars
          bottom: 0,
        },
      });

      volumeSeries.setData(
        cleanData.map((d) => ({
          time: d.date,
          value: d.volume,
          color:
            d.close >= d.open
              ? "rgba(16, 185, 129, 0.35)"
              : "rgba(244, 63, 94, 0.35)",
        }))
      );
    }

    // 3. Technical Indicators
    const closePoints = cleanData.map((d) => ({ time: d.date, close: d.close }));

    if (showEMA20 && cleanData.length >= 20) {
      const emaSeries = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
        title: "EMA 20",
      });
      emaSeries.setData(calculateEMA(closePoints, 20));
    }

    if (showSMA50 && cleanData.length >= 50) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 2,
        title: "SMA 50",
      });
      smaSeries.setData(calculateSMA(closePoints, 50));
    }

    chart.timeScale().fitContent();

    // Crosshair hover listener
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !mainSeries) {
        setHoverData(null);
        return;
      }

      const match = cleanData.find((d) => d.date === param.time);
      if (match) {
        setHoverData({
          date: match.date,
          open: match.open,
          high: match.high,
          low: match.low,
          close: match.close,
          volume: match.volume,
        });
      }
    });

    // Resize handler
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [cleanData, chartType, showEMA20, showSMA50, showVolume, height]);

  // Default to the latest candle if not hovering
  const latest = cleanData[cleanData.length - 1];
  const display = hoverData || latest;

  return (
    <div className="space-y-3">
      {/* Chart Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-slate-800 pb-3">
        {/* Style: Candles vs Area */}
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden font-semibold">
          <button
            onClick={() => setChartType("candles")}
            className={`px-3 py-1.5 transition-colors ${
              chartType === "candles"
                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            🕯️ Candles
          </button>
          <button
            onClick={() => setChartType("area")}
            className={`px-3 py-1.5 transition-colors ${
              chartType === "area"
                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            📈 Area
          </button>
        </div>

        {/* Indicators Toggles */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-semibold mr-1">Indicators:</span>
          <button
            onClick={() => setShowEMA20((v) => !v)}
            className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition-all ${
              showEMA20
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                : "border-slate-200 dark:border-slate-700 text-slate-400"
            }`}
          >
            EMA 20
          </button>
          <button
            onClick={() => setShowSMA50((v) => !v)}
            className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition-all ${
              showSMA50
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                : "border-slate-200 dark:border-slate-700 text-slate-400"
            }`}
          >
            SMA 50
          </button>
          <button
            onClick={() => setShowVolume((v) => !v)}
            className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition-all ${
              showVolume
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                : "border-slate-200 dark:border-slate-700 text-slate-400"
            }`}
          >
            Volume
          </button>
        </div>
      </div>

      {/* Live Crosshair / Candle OHLC Legend */}
      {display && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <span className="text-slate-400">Date: <strong className="text-slate-800 dark:text-slate-200">{display.date}</strong></span>
          <span>O: <strong className="text-slate-800 dark:text-slate-200">{fmtCurrency(display.open)}</strong></span>
          <span>H: <strong className="text-emerald-600 dark:text-emerald-400">{fmtCurrency(display.high)}</strong></span>
          <span>L: <strong className="text-rose-600 dark:text-rose-400">{fmtCurrency(display.low)}</strong></span>
          <span>C: <strong className={display.close >= display.open ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{fmtCurrency(display.close)}</strong></span>
          <span className="text-slate-400">Vol: <strong className="text-slate-800 dark:text-slate-200">{fmtVolume(display.volume)}</strong></span>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={containerRef} className="w-full relative" style={{ height }} />
    </div>
  );
}
