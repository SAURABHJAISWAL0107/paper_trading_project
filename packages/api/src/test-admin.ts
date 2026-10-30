// ============================================================
// Test Suite: Admin Portal & User Directory
// ============================================================

import http from "http";
import express from "express";
import { adminRouter } from "./routes/admin.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runAdminTests() {
  console.log("\n🧪 Running Admin Portal Test Suite...\n");

  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}/api/admin`;

  try {
    // 1. Unauthorized when no key provided
    const unauthRes = await fetch(`${base}/users`);
    assert(unauthRes.status === 401, "Rejects request with 401 when missing admin key");

    // 2. Unauthorized when wrong key provided
    const wrongKeyRes = await fetch(`${base}/users`, {
      headers: { "x-admin-key": "wrong_secret_123" },
    });
    assert(wrongKeyRes.status === 401, "Rejects request with 401 when invalid admin key");

    // 3. Authorized with default key
    const authRes = await fetch(`${base}/users`, {
      headers: { "x-admin-key": "admin123" },
    });
    assert(authRes.status === 200, "Accepts request with 200 when valid admin key is passed");
    const json = await authRes.json();
    assert(json.success === true, "Response reports success: true");
    assert(Array.isArray(json.data.users), "Returns users array");
    assert(json.data.users.length > 0, `Users array has at least 1 user (${json.data.users.length})`);
    assert(typeof json.data.users[0].username === "string", "User object contains valid username string");
    assert(typeof json.data.summary.totalUsers === "number", "Summary reports totalUsers count");
    assert(typeof json.data.summary.totalCash === "number", "Summary reports totalCash");

    // 4. Inspect specific user details
    const firstUserId = json.data.users[0].id;
    const detailRes = await fetch(`${base}/users/${firstUserId}`, {
      headers: { "x-admin-key": "admin123" },
    });
    assert(detailRes.status === 200, "GET /api/admin/users/:userId succeeds with 200");
    const detailJson = await detailRes.json();
    assert(detailJson.data.user.id === firstUserId, "Returns correct user profile");
    assert(Array.isArray(detailJson.data.holdings), "Returns user holdings array");
    assert(Array.isArray(detailJson.data.orders), "Returns user orders array");

    console.log(`\n🏁 Admin Tests Result: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
  } finally {
    server.close();
  }
}

runAdminTests().catch((err) => {
  console.error("Admin test runner failed:", err);
  process.exit(1);
});
