import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { Card, StatCard, LoadingState, ErrorState, SampleBadge, EmptyState } from "@/components/ui";

export function WalletPage() {
  const walletQ = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(),
  });

  const data = walletQ.data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-0.5">Wallet</h1>
        <p className="text-sm text-slate-500 flex items-center gap-1.5">
          <SampleBadge /> Virtual wallet — no real money.
        </p>
      </div>

      {walletQ.isLoading && <LoadingState message="Loading wallet…" />}
      {walletQ.isError   && <ErrorState message="Failed to load wallet" />}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Available Cash"
              value={fmtCurrency(data.wallet.cash)}
              sub={`Updated ${fmtDate(data.wallet.updated_at)}`}
              valueClass="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              label="Total Transactions"
              value={String(data.transactions.length)}
              valueClass="text-slate-700 dark:text-slate-300"
            />
          </div>

          <Card>
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold">Transaction Log</h2>
              <p className="text-xs text-slate-400 mt-0.5">Last 50 transactions</p>
            </div>

            {data.transactions.length === 0 && (
              <EmptyState message="No transactions yet." icon="💳" />
            )}

            {data.transactions.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.transactions.map((t) => (
                  <div key={t.id} className="flex items-center px-5 py-3 gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      t.type === "CREDIT"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>
                      {t.type}
                    </span>
                    <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{t.description}</span>
                    <span className={`font-mono font-semibold text-sm ${
                      t.type === "CREDIT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}>
                      {t.type === "CREDIT" ? "+" : "−"}
                      {fmtCurrency(t.amount)}
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:block w-36 text-right">{fmtDate(t.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
