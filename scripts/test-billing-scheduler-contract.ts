import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BillingError,
  billingMode,
  configuredBillingMode,
} from "../lib/terraqo/billing/provider";

const originalMode = process.env.CULQI_MODE;

try {
  delete process.env.CULQI_MODE;
  assert.equal(configuredBillingMode(), null);
  assert.throws(
    () => billingMode(),
    error => error instanceof BillingError && error.code === "BILLING_NOT_CONFIGURED",
  );

  process.env.CULQI_MODE = "test";
  assert.equal(configuredBillingMode(), "test");
  assert.equal(billingMode(), "test");

  process.env.CULQI_MODE = "live";
  assert.equal(configuredBillingMode(), "live");

  process.env.CULQI_MODE = "sandbox";
  assert.equal(configuredBillingMode(), null);
} finally {
  if (originalMode === undefined) delete process.env.CULQI_MODE;
  else process.env.CULQI_MODE = originalMode;
}

const route = readFileSync(
  resolve(process.cwd(), "app/api/internal/billing-reconcile/route.ts"),
  "utf8",
);
const modeGuard = route.indexOf("const mode = configuredBillingMode()");
const disabledResponse = route.indexOf('status: "disabled"');
const databaseQuery = route.indexOf("prisma.terraqoBillingAccount.findMany");

assert.ok(modeGuard >= 0, "The scheduler route must resolve the optional billing mode.");
assert.ok(disabledResponse > modeGuard, "Disabled billing must produce an explicit safe response.");
assert.ok(databaseQuery > disabledResponse, "Disabled billing must return before querying PostgreSQL.");

console.log("Billing scheduler contract: OK (disabled provider skips before database access; configured modes stay strict).");
