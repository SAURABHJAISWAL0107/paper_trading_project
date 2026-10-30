import React, { useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  BarChart2,
  Briefcase,
  ClipboardList,
  Wallet,
  TrendingUp,
  Menu,
  X,
  Moon,
  Sun,
  Activity,
  Star,
  RefreshCw,
  LogIn,
  LogOut,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { useMarketStream } from "@/hooks/useMarketStream";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";

const NAV = [
  { to: "/",          label: "Dashboard",  Icon: LayoutDashboard },
  { to: "/stocks",    label: "Market",     Icon: BarChart2       },
  { to: "/portfolio", label: "Portfolio",  Icon: Briefcase       },
  { to: "/orders",    label: "Orders",     Icon: ClipboardList   },
  { to: "/wallet",    label: "Wallet",     Icon: Wallet          },
];

function isNSEMarketOpen(): boolean {
  // Convert current time to IST (UTC+5:30)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const day = ist.getDay(); // 0 is Sunday, 6 is Saturday
  if (day === 0 || day === 6) return false;

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 9:15 AM = 555 minutes, 3:30 PM = 930 minutes
  return totalMinutes >= 555 && totalMinutes <= 930;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(isNSEMarketOpen);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const loc = useLocation();
  const qc = useQueryClient();
  const { isConnected: isStreaming } = useMarketStream();
  const { user, isGuest, openAuthModal, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Check market status every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setMarketOpen(isNSEMarketOpen()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const providerQ = useQuery({
    queryKey: ["provider"],
    queryFn: () => api.provider.get(),
  });

  const toggleProviderMutation = useMutation({
    mutationFn: (next: "yahoo" | "sample") => api.provider.set(next),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }

  const isLive = providerQ.data?.provider === "yahoo";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
      {/* ── Top nav ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          
          {/* Left: Logo & Status indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm shadow-blue-500/20">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg tracking-tight hidden sm:inline">PaperTrader</span>
            </Link>

            {/* Clean, Non-Wrapping Unified Status Badge */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 whitespace-nowrap">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${marketOpen ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
                <span className="text-slate-600 dark:text-slate-300">NSE {marketOpen ? "Open" : "Closed"}</span>
              </span>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Live Ticks</span>
              </span>
            </div>
          </div>

          {/* Center: Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ to, label, Icon }) => {
              const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                    ${active
                      ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Actions, Provider Toggle & User Account */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Compact Live vs Sample Switcher */}
            <button
              onClick={() => toggleProviderMutation.mutate(isLive ? "sample" : "yahoo")}
              title="Click to switch market feed: Live Yahoo Finance vs Sample Simulated"
              disabled={toggleProviderMutation.isPending}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border whitespace-nowrap ${
                isLive
                  ? "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/60"
                  : "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700/60"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isLive ? "Live NSE" : "Sample Data"}</span>
            </button>

            {/* User Profile / Guest Sync button */}
            {isGuest ? (
              <button
                onClick={openAuthModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sync / Sign In</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                  <span className="max-w-[120px] truncate hidden sm:inline">{user?.name || user?.username}</span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 text-xs z-50 animate-in fade-in">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{user?.name}</p>
                      <p className="text-slate-400 font-mono truncate">{user?.email || `@${user?.username}`}</p>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        openAuthModal();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-blue-500" />
                      <span>Switch Account</span>
                    </button>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-rose-600 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => qc.invalidateQueries()}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              title="Refresh live prices"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={toggleDark}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="md:hidden border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-col gap-1 bg-white dark:bg-slate-900">
            {NAV.map(({ to, label, Icon }) => {
              const active = loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${active
                      ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                      : "text-slate-600 dark:text-slate-400"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {/* ── Main content ───────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 text-center text-xs text-slate-400">
        PaperTrader &bull; Real-time simulated trading platform &bull; Virtual Funds ₹1,00,00,000 (1 Cr) &bull; No financial risk.
      </footer>

      {/* Global Auth Modal */}
      <AuthModal />
    </div>
  );
}
