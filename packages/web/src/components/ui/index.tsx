// ── Reusable UI primitives ───────────────────────────────────

import React from "react";

// ── Card ─────────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────
type BadgeVariant = "default" | "green" | "red" | "yellow" | "blue" | "sample" | "live";
const badgeClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
  green:   "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold",
  red:     "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 font-semibold",
  yellow:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  blue:    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  sample:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold tracking-wide",
  live:    "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50 font-semibold tracking-wide",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${badgeClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

// ── MarketDataBadge ──────────────────────────────────────────
export function SampleBadge() {
  return <Badge variant="sample">⚠ SAMPLE DATA</Badge>;
}

export function MarketDataBadge({
  isSample,
  status,
}: {
  isSample?: boolean;
  status?: "LIVE" | "SAMPLE" | "ERROR";
}) {
  const currentStatus: "LIVE" | "SAMPLE" | "ERROR" =
    status ?? (isSample === false ? "LIVE" : "SAMPLE");

  if (currentStatus === "LIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-300 dark:border-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        LIVE NSE
      </span>
    );
  }

  if (currentStatus === "ERROR") {
    return (
      <span
        title="Live market data feed failed. Simulation fallback is active."
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-semibold border border-rose-300 dark:border-rose-800"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        ✕ FEED ERROR (SAMPLE)
      </span>
    );
  }

  return <Badge variant="sample">⚠ SAMPLE DATA</Badge>;
}

// ── Button ───────────────────────────────────────────────────
type ButtonVariant = "primary" | "danger" | "ghost" | "outline" | "secondary";
const btnClasses: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm",
  danger:  "bg-red-600 hover:bg-red-700 text-white shadow-sm",
  ghost:   "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300",
  outline: "border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300",
  secondary: "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${btnClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ── Spinner ──────────────────────────────────────────────────
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 w-5 h-5 ${className}`}
    />
  );
}

// ── LoadingState ─────────────────────────────────────────────
export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <Spinner className="w-8 h-8" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────
export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      {icon && <div className="text-5xl opacity-40 mb-1">{icon}</div>}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ── ErrorState ───────────────────────────────────────────────
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-red-500">
      <span className="text-sm">⚠ {message}</span>
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  valueClass = "",
  badge,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        {badge}
      </div>
      <p className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      {sub && <div className="text-xs mt-1.5 font-medium">{sub}</div>}
    </Card>
  );
}
