/*
 * Posts the dummy conversations in src/dummy-conversations.js to the real
 * customer context service, so the panel has something to show.
 *
 *   npm run seed                      # into the first store in STORE_IDS
 *   npm run seed -- --store=my-store  # into another store
 *
 * Every exchange has a fixed messageId (wamid.SEED...), so running it again
 * stores nothing new — the service answers duplicate: true.
 */
const {
  CONTEXT_SERVICE_URL,
  CONTEXT_SERVICE_API_KEY,
  STORE_IDS
} = require("../src/config");
const dummy = require("../src/dummy-conversations");

const storeArg = process.argv.find((a) => a.startsWith("--store="));
const storeId = storeArg ? storeArg.split("=")[1] : STORE_IDS[0];

async function post(customerId, body) {
  const res = await fetch(
    `${CONTEXT_SERVICE_URL}/v1/stores/${encodeURIComponent(storeId)}/customers/${encodeURIComponent(customerId)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CONTEXT_SERVICE_API_KEY ? { "x-api-key": CONTEXT_SERVICE_API_KEY } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  if (!CONTEXT_SERVICE_URL) {
    throw new Error("Set CONTEXT_SERVICE_URL in .env first");
  }

  console.log(`Seeding ${CONTEXT_SERVICE_URL} store "${storeId}"`);
  const now = Date.now();
  let created = 0;
  let duplicates = 0;

  for (const customer of dummy) {
    for (const [i, e] of customer.exchanges.entries()) {
      const result = await post(customer.customerId, {
        message: e.message,
        response: e.response,
        messageId: `wamid.SEED${customer.customerId}${i}`,
        ...(customer.customerName ? { customerName: customer.customerName } : {}),
        timestamp: new Date(now - e.minutesAgo * 60 * 1000).toISOString(),
        metadata: e.metadata || {}
      });
      if (result.duplicate) duplicates++;
      else created++;
    }
    console.log(`  ${customer.customerId} ${customer.customerName || ""}`);
  }

  console.log(`Done: ${created} created, ${duplicates} already there.`);
}

main().catch((err) => {
  console.error(`Seed failed: ${err.message}`);
  process.exit(1);
});
