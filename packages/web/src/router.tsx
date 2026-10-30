import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { DashboardPage }   from "@/pages/DashboardPage";
import { StocksPage }      from "@/pages/StocksPage";
import { StockDetailPage } from "@/pages/StockDetailPage";
import { PortfolioPage }   from "@/pages/PortfolioPage";
import { OrdersPage }      from "@/pages/OrdersPage";
import { WalletPage }      from "@/pages/WalletPage";
import { AdminPage }       from "@/pages/AdminPage";

// Root route wraps everything in <Layout>
const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const stocksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stocks",
  component: StocksPage,
});

const stockDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stocks/$symbol",
  component: StockDetailPage,
});

const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portfolio",
  component: PortfolioPage,
});

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  component: OrdersPage,
});

const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wallet",
  component: WalletPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  stocksRoute,
  stockDetailRoute,
  portfolioRoute,
  ordersRoute,
  walletRoute,
  adminRoute,
]);

export const router = createRouter({ routeTree });

// Register router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
