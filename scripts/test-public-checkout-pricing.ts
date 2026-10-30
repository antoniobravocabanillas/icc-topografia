import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import {
  calculatePublicCheckoutPrice,
  MAX_PUBLIC_CHECKOUT_ITEMS,
  MAX_PUBLIC_CHECKOUT_QUANTITY,
  MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY,
  PublicCheckoutPricingError,
} from "@/lib/server/public-checkout-pricing";

const priced = calculatePublicCheckoutPrice([
  { productId: "p-1", quantity: 2, price: new Prisma.Decimal("19.90"), currency: "pen", requiresQuote: false },
  { productId: "p-2", quantity: 3, price: new Prisma.Decimal("0.10"), currency: "PEN", requiresQuote: false },
]);

assert.equal(priced.currency, "PEN");
assert.equal(priced.total.toFixed(2), "40.10", "The server must calculate exact decimal totals from catalog prices.");
assert.deepEqual(priced.items.map((item) => item.subtotal.toFixed(2)), ["39.80", "0.30"]);

function expectPricingError(
  code: PublicCheckoutPricingError["code"],
  input: Parameters<typeof calculatePublicCheckoutPrice>[0],
) {
  assert.throws(
    () => calculatePublicCheckoutPrice(input),
    (error: unknown) => error instanceof PublicCheckoutPricingError && error.code === code,
  );
}

expectPricingError("QUOTE_REQUIRED", [
  { productId: "quote", quantity: 1, price: new Prisma.Decimal("100"), currency: "PEN", requiresQuote: true },
]);
expectPricingError("INVALID_PRICE", [
  { productId: "free", quantity: 1, price: new Prisma.Decimal(0), currency: "PEN", requiresQuote: false },
]);
expectPricingError("INVALID_QUANTITY", [
  { productId: "unsafe", quantity: MAX_PUBLIC_CHECKOUT_QUANTITY + 1, price: new Prisma.Decimal("1"), currency: "PEN", requiresQuote: false },
]);
expectPricingError("INVALID_CART", []);
expectPricingError("INVALID_CART", Array.from({ length: MAX_PUBLIC_CHECKOUT_ITEMS + 1 }, (_, index) => ({
  productId: `p-${index}`,
  quantity: 1,
  price: new Prisma.Decimal("1"),
  currency: "PEN",
  requiresQuote: false,
})));
expectPricingError("DUPLICATE_PRODUCT", [
  { productId: "duplicate", quantity: 1, price: new Prisma.Decimal("1"), currency: "PEN", requiresQuote: false },
  { productId: "duplicate", quantity: 2, price: new Prisma.Decimal("1"), currency: "PEN", requiresQuote: false },
]);
expectPricingError("INVALID_QUANTITY", [
  { productId: "aggregate-a", quantity: Math.floor(MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY / 2) + 1, price: new Prisma.Decimal("1"), currency: "PEN", requiresQuote: false },
  { productId: "aggregate-b", quantity: Math.floor(MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY / 2) + 1, price: new Prisma.Decimal("1"), currency: "PEN", requiresQuote: false },
]);
expectPricingError("MIXED_CURRENCY", [
  { productId: "pen", quantity: 1, price: new Prisma.Decimal("1"), currency: "PEN", requiresQuote: false },
  { productId: "usd", quantity: 1, price: new Prisma.Decimal("1"), currency: "USD", requiresQuote: false },
]);

const checkoutRoute = readFileSync(
  resolve(process.cwd(), "app/api/public/workspaces/[workspaceSlug]/checkout/route.ts"),
  "utf8",
);
assert.doesNotMatch(checkoutRoute, /payload\.totals/, "The route must never trust a browser-provided total.");
assert.match(checkoutRoute, /calculatePublicCheckoutPrice\(priceInputs\)/, "The route must use canonical server pricing.");
assert.match(checkoutRoute, /\.max\(MAX_PUBLIC_CHECKOUT_ITEMS\)/, "The route must cap cart rows before querying products.");
assert.match(checkoutRoute, /MAX_PUBLIC_CHECKOUT_TOTAL_QUANTITY/, "The route must cap aggregate quantity before querying products.");
assert.match(checkoutRoute, /readBoundedJson\(request, MAX_PUBLIC_CHECKOUT_BODY_BYTES\)/, "The route must bound actual request bytes before parsing the cart.");
assert.doesNotMatch(checkoutRoute, /parseJson\(request|request\.json\(\)/, "The public checkout must not materialize unbounded JSON.");

console.log("Public checkout server pricing: OK (bounded unique cart, exact decimals, quote-only rejection and single currency).");
