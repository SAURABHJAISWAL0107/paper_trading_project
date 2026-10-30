import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Users,
  Wallet,
  Activity,
  KeyRound,
  Search,
  ExternalLink,
  X,
  UserCheck,
  UserX,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency } from "@/lib/format";
import { Card, Button, Badge } from "@/components/ui";

const STORAGE_ADMIN_KEY = "pt_admin_key";

export function AdminPage() {
  const [adminKey, setAdminKey] = useState<string>(() => {
    return (typeof window !== "undefined" && sessionStorage.getItem(STORAGE_ADMIN_KEY)) || "";
  });
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "CLOUD" | "GUEST">("ALL");

  // Selected user for inspection drawer
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const usersQ = useQuery({
    queryKey: ["admin", "users", adminKey],
    queryFn: () => api.admin.getUsers(adminKey),
    enabled: Boolean(adminKey),
    retry: false,
  });

  const userDetailQ = useQuery({
    queryKey: ["admin", "user", selectedUserId, adminKey],
    queryFn: () => api.admin.getUserDetail(selectedUserId!, adminKey),
    enabled: Boolean(selectedUserId && adminKey),
  });

  function handleKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput.trim()) {
      setKeyError("Please enter your admin key");
      return;
    }
    setKeyError(null);
    const trimmed = keyInput.trim();
    sessionStorage.setItem(STORAGE_ADMIN_KEY, trimmed);
    setAdminKey(trimmed);
  }

  function handleLogoutAdmin() {
    sessionStorage.removeItem(STORAGE_ADMIN_KEY);
    setAdminKey("");
    setKeyInput("");
  }

  // If no admin key or unauthorized
  if (!adminKey || usersQ.isError) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 shadow-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Admin Control Portal
              </h1>
              <p className="text-xs text-slate-500">Access registered users and platform data</p>
            </div>
          </div>

          {(keyError || usersQ.isError) && (
            <div className="mb-4 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 p-3 rounded-lg">
              {usersQ.isError ? "Invalid Admin Secret Key. Access Denied." : keyError}
            </div>
          )}

          <form onSubmit={handleKeySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Admin Secret Key
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Enter secret key (Default: admin123)"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Default key is <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">admin123</code>.
                You can change this anytime using the <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ADMIN_KEY</code> environment variable on Render.
              </p>
            </div>

            <Button type="submit" variant="primary" className="w-full py-2 text-sm font-bold">
              Unlock Admin Portal
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const { users = [], summary } = usersQ.data?.data || {};

  // Filtered users list
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      u.username.toLowerCase().includes(q) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q));

    if (!matchQuery) return false;
    if (filterType === "CLOUD") return !u.is_guest;
    if (filterType === "GUEST") return Boolean(u.is_guest);
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-extrabold tracking-tight">Admin User Portal</h1>
            <Badge variant="blue">Master Admin</Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time directory of all registered traders, guest sessions, and portfolio metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => usersQ.refetch()}
            disabled={usersQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${usersQ.isFetching ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleLogoutAdmin}
            className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 text-xs font-semibold hover:bg-rose-100 transition-colors"
          >
            Lock Portal
          </button>
        </div>
      </div>

      {/* ── KPI Metrics Cards ───────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Registered Users</p>
              <h3 className="text-2xl font-bold font-mono mt-0.5">{summary.totalUsers}</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{summary.cloudUsers} Cloud</span>
                {" • "}
                <span>{summary.guestUsers} Guests</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Permanent Cloud Accounts</p>
              <h3 className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                {summary.cloudUsers}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">Cross-device synced traders</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Platform Capital</p>
              <h3 className="text-2xl font-bold font-mono mt-0.5">{fmtCurrency(summary.totalCash)}</h3>
              <p className="text-[11px] text-slate-400 mt-1">Across all user paper wallets</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Executed Trades</p>
              <h3 className="text-2xl font-bold font-mono mt-0.5">{summary.totalTrades}</h3>
              <p className="text-[11px] text-slate-400 mt-1">Orders placed across platform</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </Card>
        </div>
      )}

      {/* ── Search & Filter Controls ────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username, full name, or email…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold self-start sm:self-auto">
          <button
            onClick={() => setFilterType("ALL")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              filterType === "ALL"
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            All ({users.length})
          </button>
          <button
            onClick={() => setFilterType("CLOUD")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              filterType === "CLOUD"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Cloud Accounts ({summary?.cloudUsers ?? 0})
          </button>
          <button
            onClick={() => setFilterType("GUEST")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              filterType === "GUEST"
                ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Guest Sessions ({summary?.guestUsers ?? 0})
          </button>
        </div>
      </div>

      {/* ── Users Data Table ─────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Account Type</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4 text-right">Cash Balance</th>
                <th className="py-3 px-4 text-center">Positions</th>
                <th className="py-3 px-4 text-center">Trades</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No users matching your search criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 uppercase">
                          {user.username.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                            {user.username}
                          </div>
                          {user.name && (
                            <div className="text-[11px] text-slate-400">{user.name}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {user.is_guest ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <UserX className="w-3 h-3" /> Guest
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <UserCheck className="w-3 h-3" /> Cloud
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">
                      {user.email || "—"}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {fmtCurrency(user.cash)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {user.open_positions_count}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {user.total_orders_count}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(user.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedUserId(user.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 transition-colors"
                      >
                        <span>Inspect</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── User Activity Inspector Drawer ───────────────────── */}
      {selectedUserId && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>User Details & Activity Log</span>
                  <Badge variant="blue">ID #{selectedUserId}</Badge>
                </h2>
                <p className="text-xs text-slate-400">Portfolio breakdown & recent order history</p>
              </div>
              <button
                onClick={() => setSelectedUserId(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {userDetailQ.isLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading user portfolio…</div>
              ) : userDetailQ.data?.data ? (
                <>
                  {/* User Profile Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Username:</span>
                      <strong className="text-sm font-mono text-slate-900 dark:text-slate-100">
                        {userDetailQ.data.data.user.username}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Wallet Balance:</span>
                      <strong className="text-sm font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {fmtCurrency(userDetailQ.data.data.user.cash)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Email Address:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {userDetailQ.data.data.user.email || "None"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Account Status:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {userDetailQ.data.data.user.is_guest ? "Guest Mode" : "Permanent Cloud Account"}
                      </span>
                    </div>
                  </div>

                  {/* Active Holdings Table */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Active Holdings ({userDetailQ.data.data.holdings.length})
                    </h3>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 font-bold text-slate-400">
                          <tr>
                            <th className="p-2.5">Stock</th>
                            <th className="p-2.5">Type</th>
                            <th className="p-2.5 text-right">Shares</th>
                            <th className="p-2.5 text-right">Avg Price</th>
                            <th className="p-2.5 text-right">Total Invested</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {userDetailQ.data.data.holdings.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-400">
                                No active holdings in portfolio.
                              </td>
                            </tr>
                          ) : (
                            userDetailQ.data.data.holdings.map((h: any) => (
                              <tr key={h.symbol}>
                                <td className="p-2.5 font-bold font-mono">{h.symbol}</td>
                                <td className="p-2.5 text-[11px] text-slate-400">{h.product_type}</td>
                                <td className="p-2.5 text-right font-mono">{h.qty}</td>
                                <td className="p-2.5 text-right font-mono">{fmtCurrency(h.avg_price)}</td>
                                <td className="p-2.5 text-right font-mono font-bold">
                                  {fmtCurrency(h.qty * h.avg_price)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Orders Log */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      Recent Trade Orders ({userDetailQ.data.data.orders.length})
                    </h3>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 font-bold text-slate-400">
                          <tr>
                            <th className="p-2.5">Side</th>
                            <th className="p-2.5">Stock</th>
                            <th className="p-2.5 text-right">Qty</th>
                            <th className="p-2.5 text-right">Price</th>
                            <th className="p-2.5 text-center">Status</th>
                            <th className="p-2.5 text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {userDetailQ.data.data.orders.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-400">
                                No trades placed yet.
                              </td>
                            </tr>
                          ) : (
                            userDetailQ.data.data.orders.map((o: any) => (
                              <tr key={o.id}>
                                <td className="p-2.5">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      o.side === "BUY"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                                        : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                                    }`}
                                  >
                                    {o.side}
                                  </span>
                                </td>
                                <td className="p-2.5 font-bold font-mono">{o.symbol}</td>
                                <td className="p-2.5 text-right font-mono">{o.qty}</td>
                                <td className="p-2.5 text-right font-mono">{fmtCurrency(o.price)}</td>
                                <td className="p-2.5 text-center">
                                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                    {o.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right text-slate-400 text-[11px]">
                                  {new Date(o.created_at).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
