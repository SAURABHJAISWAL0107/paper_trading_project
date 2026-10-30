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
import { Maximize2, Minimize2, RotateCcw, TrendingUp } from "lucide-react";
import type { OHLCVBar } from "@/types";
import { fmtCurrency, fmtVolume, fmtPct } from "@/lib/format";

interface TradingViewChartProps {
  data: OHLCVBar[];
  height?: number;
  currentPrice?: number;
}

type ChartType = "candles" | "area";
type Timeframe = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

// ── Technical Indicator Math ─────────────────────────────────

function calculateSMA(data: { time: string; close: number }[], period: number) {
  const result: { time: string; value: number }[] = [];
  if (data.length < period) return result;
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

function calculateBollingerBands(
  data: { time: string; close: number }[],
  period = 20,
  stdDevMult = 2
) {
  const upper: { time: string; value: number }[] = [];
  const lower: { time: string; value: number }[] = [];
  if (data.length < period) return { upper, lower };

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    const mean = sum / period;

    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += Math.pow(data[i - j].close - mean, 2);
    }
    const stdDev = Math.sqrt(variance / period);

    const time = data[i].time;
    upper.push({ time, value: parseFloat((mean + stdDevMult * stdDev).toFixed(2)) });
    lower.push({ time, value: parseFloat((mean - stdDevMult * stdDev).toFixed(2)) });
  }
  return { upper, lower };
}

function calculateRSI(data: { time: string; close: number }[], period = 14) {
  const result: { time: string; value: number }[] = [];
  if (data.length <= period) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - 100 / (1 + rs);
  result.push({ time: data[period].time, value: parseFloat(rsi.toFixed(2)) });

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
    result.push({ time: data[i].time, value: parseFloat(rsi.toFixed(2)) });
  }
  return result;
}

export function TradingViewChart({
  data,
  height = 420,
  currentPrice,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [chartType, setChartType] = useState<ChartType>("candles");
  const [timeframe, setTimeframe] = useState<Timeframe>("3M");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Indicators toggle
  const [showEMA20, setShowEMA20] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showSMA200, setShowSMA200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(false);

  // Live HUD / Hover State
  const [hoverData, setHoverData] = useState<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    changePct?: number;
    ema20?: number;
    sma50?: number;
    sma200?: number;
    rsi?: number;
  } | null>(null);

  // Clean, deduplicate and sort data ascending
  const cleanData = useMemo(() => {
    const map = new Map<string, OHLCVBar>();
    for (const b of data) {
      if (b.date && b.close > 0) {
        map.set(b.date, b);
      }
    }
    const arr = Array.from(map.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // If currentPrice is provided and differs from the last candle close, update last candle live
    if (currentPrice && arr.length > 0) {
      const last = { ...arr[arr.length - 1] };
      last.close = currentPrice;
      last.high = Math.max(last.high, currentPrice);
      last.low = Math.min(last.low, currentPrice);
      arr[arr.length - 1] = last;
    }
    return arr;
  }, [data, currentPrice]);

  // Pre-calculated indicator series points
  const closePoints = useMemo(
    () => cleanData.map((d) => ({ time: d.date, close: d.close })),
    [cleanData]
  );
  const ema20Points = useMemo(() => calculateEMA(closePoints, 20), [closePoints]);
  const sma50Points = useMemo(() => calculateSMA(closePoints, 50), [closePoints]);
  const sma200Points = useMemo(() => calculateSMA(closePoints, 200), [closePoints]);
  const bbPoints = useMemo(() => calculateBollingerBands(closePoints, 20, 2), [closePoints]);
  const rsiPoints = useMemo(() => calculateRSI(closePoints, 14), [closePoints]);

  // Maps for fast HUD lookup
  const ema20Map = useMemo(() => new Map(ema20Points.map((p) => [p.time, p.value])), [ema20Points]);
  const sma50Map = useMemo(() => new Map(sma50Points.map((p) => [p.time, p.value])), [sma50Points]);
  const sma200Map = useMemo(() => new Map(sma200Points.map((p) => [p.time, p.value])), [sma200Points]);
  const rsiMap = useMemo(() => new Map(rsiPoints.map((p) => [p.time, p.value])), [rsiPoints]);

  // Main Chart & RSI Sync Effect
  useEffect(() => {
    if (!containerRef.current || cleanData.length === 0) return;

    const isDark = document.documentElement.classList.contains("dark");
    const gridColor = isDark ? "rgba(51, 65, 85, 0.35)" : "rgba(226, 232, 240, 0.7)";
    const textColor = isDark ? "#94a3b8" : "#64748b";
    const borderColor = isDark ? "#334155" : "#e2e8f0";

    const mainHeight = showRSI ? Math.max(260, height - 110) : height;

    // 1. Create Main Price Chart
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: mainHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor,
        scaleMargins: {
          top: 0.1,
          bottom: showVolume ? 0.25 : 0.1,
        },
      },
    });

    chartRef.current = chart;

    // 2. Add Main Series (Candles or Area)
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
        topColor: "rgba(37, 99, 235, 0.38)",
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

    // 3. Volume Series
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volumeScale",
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
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

    // 4. Overlays & Indicators
    if (showEMA20 && ema20Points.length > 0) {
      const emaSeries = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
        title: "EMA 20",
      });
      emaSeries.setData(ema20Points);
    }

    if (showSMA50 && sma50Points.length > 0) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 2,
        title: "SMA 50",
      });
      smaSeries.setData(sma50Points);
    }

    if (showSMA200 && sma200Points.length > 0) {
      const sma200Series = chart.addSeries(LineSeries, {
        color: "#a855f7",
        lineWidth: 2,
        title: "SMA 200",
      });
      sma200Series.setData(sma200Points);
    }

    if (showBollinger && bbPoints.upper.length > 0) {
      const upperSeries = chart.addSeries(LineSeries, {
        color: "rgba(6, 182, 212, 0.6)",
        lineWidth: 1,
        lineStyle: 2,
        title: "BB Upper",
      });
      upperSeries.setData(bbPoints.upper);

      const lowerSeries = chart.addSeries(LineSeries, {
        color: "rgba(6, 182, 212, 0.6)",
        lineWidth: 1,
        lineStyle: 2,
        title: "BB Lower",
      });
      lowerSeries.setData(bbPoints.lower);
    }

    // 5. RSI Sub-Chart (Synchronized)
    let rsiChart: IChartApi | null = null;
    if (showRSI && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        width: rsiContainerRef.current.clientWidth,
        height: 105,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor,
          fontSize: 10,
        },
        grid: {
          vertLines: { color: gridColor },
          horzLines: { color: gridColor },
        },
        timeScale: {
          borderColor,
          visible: false, // hide bottom dates since main chart has them
        },
        rightPriceScale: {
          borderColor,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
      });

      rsiChartRef.current = rsiChart;

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: "#8b5cf6",
        lineWidth: 2,
        title: "RSI 14",
      });
      rsiSeries.setData(rsiPoints);

      // Overbought (70) and Oversold (30) reference guide lines
      rsiSeries.createPriceLine({
        price: 70,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "70 Overbought",
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: "#10b981",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "30 Oversold",
      });

      // Synchronize timescale range between main and RSI chart
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && rsiChart) {
          rsiChart.timeScale().setVisibleLogicalRange(range);
        }
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) {
          chart.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    // 6. Timeframe Filter Setup
    applyTimeframe(timeframe, chart);

    // 7. Crosshair Tracking
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !mainSeries) {
        setHoverData(null);
        return;
      }

      const match = cleanData.find((d) => d.date === param.time);
      if (match) {
        const changePct =
          match.open > 0 ? ((match.close - match.open) / match.open) * 100 : 0;
        setHoverData({
          date: match.date,
          open: match.open,
          high: match.high,
          low: match.low,
          close: match.close,
          volume: match.volume,
          changePct,
          ema20: ema20Map.get(match.date),
          sma50: sma50Map.get(match.date),
          sma200: sma200Map.get(match.date),
          rsi: rsiMap.get(match.date),
        });
      }
    });

    // 8. Resize Observer
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
      if (rsiContainerRef.current && rsiChart) {
        rsiChart.applyOptions({ width: rsiContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      if (rsiChart) {
        rsiChart.remove();
        rsiChartRef.current = null;
      }
    };
  }, [
    cleanData,
    chartType,
    showEMA20,
    showSMA50,
    showSMA200,
    showBollinger,
    showVolume,
    showRSI,
    height,
    timeframe,
  ]);

  function applyTimeframe(tf: Timeframe, chartInstance?: IChartApi) {
    const c = chartInstance || chartRef.current;
    if (!c || cleanData.length === 0) return;

    const totalBars = cleanData.length;
    let barsToShow = totalBars;

    if (tf === "1W") barsToShow = 5;
    else if (tf === "1M") barsToShow = 22;
    else if (tf === "3M") barsToShow = 66;
    else if (tf === "6M") barsToShow = 132;
    else if (tf === "1Y") barsToShow = 252;
    else barsToShow = totalBars;

    if (barsToShow >= totalBars) {
      c.timeScale().fitContent();
    } else {
      const fromIndex = Math.max(0, totalBars - barsToShow);
      const from = cleanData[fromIndex].date;
      const to = cleanData[totalBars - 1].date;
      try {
        c.timeScale().setVisibleRange({ from, to });
      } catch {
        c.timeScale().fitContent();
      }
    }
  }

  function handleTimeframeChange(tf: Timeframe) {
    setTimeframe(tf);
    applyTimeframe(tf);
  }

  function handleResetView() {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.timeScale().fitContent();
    }
  }

  function toggleFullscreen() {
    setIsFullscreen((prev) => !prev);
  }

  const latest = cleanData[cleanData.length - 1];
  const display = hoverData || (latest ? {
    date: latest.date,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    close: latest.close,
    volume: latest.volume,
    changePct: latest.open > 0 ? ((latest.close - latest.open) / latest.open) * 100 : 0,
    ema20: ema20Map.get(latest.date),
    sma50: sma50Map.get(latest.date),
    sma200: sma200Map.get(latest.date),
    rsi: rsiMap.get(latest.date),
  } : null);

  return (
    <div
      ref={wrapperRef}
      className={`space-y-3 transition-all ${
        isFullscreen
          ? "fixed inset-0 z-50 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between overflow-hidden"
          : "relative"
      }`}
    >
      {/* ── Toolbar: Chart Style, Timeframes & Indicators ──── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-slate-800 pb-3">
        {/* Left: Style & Timeframes */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Candles vs Area */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden font-semibold">
            <button
              onClick={() => setChartType("candles")}
              className={`px-2.5 py-1.5 transition-colors flex items-center gap-1 ${
                chartType === "candles"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>🕯️</span>
              <span>Candles</span>
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`px-2.5 py-1.5 transition-colors flex items-center gap-1 ${
                chartType === "area"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>📈</span>
              <span>Area</span>
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-semibold">
            {(["1W", "1M", "3M", "6M", "1Y", "ALL"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                className={`px-2 py-1.5 transition-colors ${
                  timeframe === tf
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Technical Indicators & Fullscreen */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setShowEMA20((v) => !v)}
            title="Exponential Moving Average (20-day)"
            className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
              showEMA20
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
          >
            EMA 20
          </button>
          <button
            onClick={() => setShowSMA50((v) => !v)}
            title="Simple Moving Average (50-day)"
            className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
              showSMA50
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
          >
            SMA 50
          </button>
          <button
            onClick={() => setShowSMA200((v) => !v)}
            title="Simple Moving Average (200-day Golden/Death Cross)"
            className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
              showSMA200
                ? "border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-bold"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
          >
            SMA 200
          </button>
          <button
            onClick={() => setShowBollinger((v) => !v)}
            title="Bollinger Bands (20, 2)"
            className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
              showBollinger
                ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 font-bold"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
          >
            BB (20,2)
          </button>
          <button
            onClick={() => setShowVolume((v) => !v)}
            title="Volume Histogram"
            className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
              showVolume
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
          >
            Volume
          </button>
          <button
            onClick={() => setShowRSI((v) => !v)}
            title="Relative Strength Index (14)"
            className={`px-2 py-1 rounded-md border text-xs font-semibold transition-all ${
              showRSI
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
          >
            RSI 14
          </button>

          <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>

          {/* Reset Zoom */}
          <button
            onClick={handleResetView}
            title="Reset Zoom & Fit Content"
            className="p-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Pro View"}
            className="p-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Dynamic Pro HUD / Crosshair Bar ────────────────── */}
      {display && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            <span className="text-slate-400">
              Date: <strong className="text-slate-900 dark:text-slate-100">{display.date}</strong>
            </span>
            <span>
              O: <strong className="text-slate-800 dark:text-slate-200">{fmtCurrency(display.open)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-600 dark:text-emerald-400">{fmtCurrency(display.high)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-600 dark:text-rose-400">{fmtCurrency(display.low)}</strong>
            </span>
            <span>
              C:{" "}
              <strong
                className={
                  display.close >= display.open
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {fmtCurrency(display.close)}
              </strong>
            </span>
            {display.changePct != null && (
              <span
                className={`px-1.5 py-0.2 rounded font-bold ${
                  display.changePct >= 0
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
                }`}
              >
                {display.changePct >= 0 ? "+" : ""}
                {fmtPct(display.changePct)}
              </span>
            )}
            <span className="text-slate-400 hidden sm:inline">
              Vol: <strong className="text-slate-700 dark:text-slate-300">{fmtVolume(display.volume)}</strong>
            </span>
          </div>

          {/* Indicator Values at Cursor */}
          <div className="flex items-center gap-3 text-[11px]">
            {showEMA20 && display.ema20 != null && (
              <span className="text-blue-500 font-semibold">
                EMA20: ₹{display.ema20}
              </span>
            )}
            {showSMA50 && display.sma50 != null && (
              <span className="text-amber-500 font-semibold">
                SMA50: ₹{display.sma50}
              </span>
            )}
            {showSMA200 && display.sma200 != null && (
              <span className="text-purple-500 font-semibold">
                SMA200: ₹{display.sma200}
              </span>
            )}
            {showRSI && display.rsi != null && (
              <span className="text-indigo-500 font-bold">
                RSI: {display.rsi}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Main Candlestick Chart Canvas ───────────────────── */}
      <div
        ref={containerRef}
        className="w-full relative select-none"
        style={{ height: isFullscreen ? "70vh" : showRSI ? Math.max(260, height - 110) : height }}
      />

      {/* ── Synchronized RSI (14) Sub-Panel ──────────────────── */}
      {showRSI && (
        <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-0.5">
            <span className="flex items-center gap-1.5 text-indigo-500">
              <TrendingUp className="w-3.5 h-3.5" /> RSI (14) Oscillator
            </span>
            <span className="text-[10px] text-slate-400">
              Upper: 70 Overbought | Lower: 30 Oversold
            </span>
          </div>
          <div
            ref={rsiContainerRef}
            className="w-full relative select-none"
            style={{ height: 105 }}
          />
        </div>
      )}
    </div>
  );
}
