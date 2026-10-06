import assert from "node:assert/strict";
import {calculateQuoteAmounts} from "../lib/server/quote-amounts";
const input = {currency: "PEN" as const, items: [{description: "Servicio", quantity: 3, unitPrice: "0.10", discount: "0.01"}], tax: "0.05"};
const result = calculateQuoteAmounts(input);
assert.equal(result.subtotal.toFixed(2), "0.30"); assert.equal(result.discount.toFixed(2), "0.01");
assert.equal(result.items[0].subtotal.toFixed(2), "0.29"); assert.equal(result.total.toFixed(2), "0.34");
for (const value of ["-1", "NaN", "Infinity", "1e5", "1.001", "01", "1,00", "1000000000.00"])
  assert.throws(() => calculateQuoteAmounts({...input, items: [{...input.items[0], unitPrice: value}]}));
assert.throws(() => calculateQuoteAmounts({...input, items: [{...input.items[0], quantity: 1.5}]}));
assert.throws(() => calculateQuoteAmounts({...input, items: [{...input.items[0], discount: "0.31"}]}));
assert.throws(() => calculateQuoteAmounts({...input, items: Array.from({length: 51}, () => input.items[0])}));
assert.throws(() => calculateQuoteAmounts({...input, items: [{description: "Servicio", quantity: 10000, unitPrice: "999999999.99"}]}));
const exact = calculateQuoteAmounts({currency: "USD", items: [{description: "A", quantity: 1, unitPrice: "0.10"}, {description: "B", quantity: 1, unitPrice: "0.20"}]});
assert.equal(exact.total.toFixed(2), "0.30");
console.log("PASS quote arithmetic: exact decimal sums/multiplication, explicit currency, discounts, integer quantity and bounded totals; ambiguous/non-finite/rounded inputs rejected.");
