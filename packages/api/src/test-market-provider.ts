// ============================================================
// Market Data Provider & Circuit Breaker Test Suite
// Verifies: Successful responses, failed requests, invalid data,
// fallback behavior, and circuit breaker rate-limit protection.
// ============================================================

import { YahooMarketDataProvider } from "./market/YahooMarketDataProvider.js";
import { SampleDataProvider } from "./market/SampleDataProvider.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n🧪 Running Market Data Provider Test Suite...\n");

  // ── Test 1: SampleDataProvider Truth-in-Labeling ───────────
  console.log("▶ [Test 1] SampleDataProvider Truth-in-Labeling");
  const sample = new SampleDataProvider();
  const sampleQuote = await sample.getQuote("TCS");
  assert(sampleQuote !== null, "Sample quote returned for TCS");
  assert(sampleQuote?.isSample === true, "Sample quote is strictly labeled isSample: true");
  assert(sampleQuote?.price! > 0, `Sample price is positive: ₹${sampleQuote?.price}`);
  const sampleQuotes = await sample.getQuotes(["TCS", "INFY", "RELIANCE"]);
  assert(sampleQuotes.length === 3, "Sample getQuotes returns all requested quotes");
  assert(sampleQuotes.every((q) => q.isSample === true), "All sample quotes have isSample: true");

  // ── Test 2: YahooMarketDataProvider Initialization & Headers ─
  console.log("\n▶ [Test 2] YahooMarketDataProvider Initialization & Status");
  const yahoo = new YahooMarketDataProvider();
  const initialStatus = yahoo.getStatus();
  assert(initialStatus !== null, "Status object is accessible");
  assert(typeof initialStatus.circuitOpen === "boolean", "circuitOpen state is tracked");

  // ── Test 3: Successful Market Data Fetch ───────────────────
  console.log("\n▶ [Test 3] Successful Live Market Data Fetch (or Clean Fallback)");
  const quote = await yahoo.getQuote("TCS");
  assert(quote !== null, "Quote returned for TCS");
  assert(quote?.symbol === "TCS", "Quote symbol is normalized to TCS");
  assert(quote?.price! > 0, `Quote has valid price: ₹${quote?.price}`);
  if (!quote?.isSample) {
    assert(quote?.name.length! > 0, `Live name returned: ${quote?.name}`);
    const status = yahoo.getStatus();
    assert(status.status === "LIVE", "Provider status reflects LIVE");
    assert(status.isSample === false, "Provider isSample reflects false for live data");
  } else {
    console.log("  ℹ️ Note: Live query was fallback (offline or network restricted).");
    assert(quote?.isSample === true, "Fallback quote strictly marked isSample: true");
  }

  // ── Test 4: Batch Quotes Query ────────────────────────────
  console.log("\n▶ [Test 4] Batch Quotes Query with Chunking");
  const batchSymbols = ["TCS", "INFY", "WIPRO"];
  const batchQuotes = await yahoo.getQuotes(batchSymbols);
  assert(batchQuotes.length === 3, `Batch returned all ${batchQuotes.length}/3 stocks`);
  assert(
    batchQuotes.every((q) => q.price > 0),
    "All batch quotes have valid positive prices"
  );
  // Verify that if any quote is sample, its isSample flag accurately reflects that
  for (const bq of batchQuotes) {
    assert(typeof bq.isSample === "boolean", `Quote ${bq.symbol} has explicit boolean isSample flag`);
  }

  // ── Test 5: Invalid Symbol & Controlled Error Handling ─────
  console.log("\n▶ [Test 5] Invalid Symbol & Controlled Error Handling");
  const invalidQuote = await yahoo.getQuote("INVALID_NONEXISTENT_XYZ_123");
  // Should either return null or gracefully handle without throwing unhandled exceptions
  assert(invalidQuote === null || invalidQuote.isSample === true, "Gracefully handled non-existent stock without crashing");

  // ── Test 6: Circuit Breaker Simulation ─────────────────────
  console.log("\n▶ [Test 6] Circuit Breaker & Rate Limit Protection");
  // Trigger failures by calling internal failure recorder or non-existent symbols
  const yfAny = yahoo as any;
  yfAny.recordFailure(new Error("Simulated 429 Too Many Requests"));
  yfAny.recordFailure(new Error("Simulated 429 Too Many Requests"));
  yfAny.recordFailure(new Error("Simulated 429 Too Many Requests"));

  const trippedStatus = yahoo.getStatus();
  assert(trippedStatus.status === "ERROR", "Status accurately reports ERROR after consecutive failures");
  assert(trippedStatus.circuitOpen === true, "Circuit breaker is OPEN after 3 failures");
  assert(trippedStatus.isSample === true, "isSample is true when circuit breaker is open");

  // Verify that when circuit breaker is open, requests for uncached symbols immediately return fallback with isSample: true
  const cbQuote = await yahoo.getQuote("TATAMOTORS");
  assert(cbQuote !== null, "Quote returned during circuit open");
  assert(cbQuote?.isSample === true, "Quote returned during circuit open is strictly marked isSample: true");

  console.log("\n===========================================");
  console.log(`🏁 Results: ${passed} passed, ${failed} failed`);
  console.log("===========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
