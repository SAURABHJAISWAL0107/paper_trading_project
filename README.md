# PaperTrader 📈

A fast, responsive, and completely free paper-trading application inspired by modern trading dashboards (such as Frontpage), built for practice and learning.

---

## ⚙️ Key Constraints & Principles

- **Paper trading only:** Virtual balance seeded with **₹1,00,00,000 (₹1 Crore)**.
- **No real money or broker integration:** Zero risk, zero authentication friction.
- **Pluggable Market Data Architecture:** Implements a `MarketDataProvider` interface. The included `SampleDataProvider` uses deterministic sample algorithms for ~50 NSE stocks, with all sample data clearly labelled with badges throughout the UI. Swapping to a live provider later requires implementing only 4 methods.
- **Zero native build bottlenecks:** Powered by Node.js built-in `node:sqlite` for fast, zero-dependency persistent storage.

---

## 🛠️ Tech Stack

- **Frontend (`packages/web`):**
  - Vite + React 18 + TypeScript
  - TanStack Router & TanStack Query (React Query)
  - Tailwind CSS + Lucide Icons
  - Recharts for stock price history charts
- **Backend (`packages/api`):**
  - Node.js + Express + TypeScript
  - Built-in SQLite (`node:sqlite`)
  - Pluggable `MarketDataProvider` interface
- **Monorepo:** `pnpm` workspaces

---

## 🚀 How to Run

Open two terminal windows (or run with `pnpm dev`):

### 1. Start Backend API
```bash
cd packages/api
pnpm dev
# Or: node dist/index.js
```
Runs at: **http://localhost:4000**

### 2. Start Frontend UI
```bash
cd packages/web
pnpm dev
```
Runs at: **http://localhost:5173**

---

## 🚢 Production Deployment (Single-Command)

The application includes unified production serving: when built, the Express backend automatically serves the built React SPA from `packages/web/dist` on a single port!

### Quick Cloud Deploy (Render, Railway, Fly.io, or VPS)
1. **Build:**
   ```bash
   pnpm build
   ```
2. **Start:**
   ```bash
   pnpm start
   # Or: node packages/api/dist/index.js
   ```
3. Runs both the Frontend and Backend together on: **http://localhost:4000** (or your platform's `$PORT`).

### Docker Deployment
```bash
docker build -t paper-trader .
docker run -p 4000:4000 paper-trader
```

---

## 📱 Features Included

1. **Dashboard (`/`):**
   - Net Worth, Available Cash, Unrealised P&L, Realised P&L cards.
   - Recent trades list.
   - Top market movers.
2. **Stocks (`/stocks`):**
   - 50 popular NSE tickers across IT, Banking, FMCG, Auto, Pharma, Metals, etc.
   - Live search by ticker or name and filter by industry sector.
   - Sample price, day % change, and day high/low display.
3. **Stock Detail (`/stocks/:symbol`):**
   - Detailed price metrics (Open, Prev Close, Day High/Low).
   - Interactive SVG area charts with 1M / 3M range selection.
   - Your current position in the stock (shares held, avg price, unrealised P&L).
   - One-click Trade modal ticket.
4. **Trade Ticket Modal:**
   - BUY / SELL toggle.
   - Dynamic quantity selector and live total calculation.
   - Wallet validation (prevents buying more than cash available, prevents overselling shares).
   - Automatic weighted-average price tracking on repeat buys.
   - Realised P&L calculation on sells.
5. **Portfolio (`/portfolio`):**
   - Summary of holdings with invested amount, current value, and individual P&L.
   - Quick-trade action per holding.
6. **Trade History (`/orders`):**
   - Timestamped log of all buy and sell orders with realised P&L.
7. **Virtual Wallet (`/wallet`):**
   - Initial seed of ₹1,00,00,000 (₹1 Crore).
   - Detailed credit/debit transaction ledger.
