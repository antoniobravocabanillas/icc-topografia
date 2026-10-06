import {Prisma} from "@prisma/client";
export function commercialMoney(amount: Prisma.Decimal, currency: string | null | undefined): string {
  return `${currency === "PEN" || currency === "USD" ? currency : "Moneda pendiente"} ${amount.toFixed(2)}`;
}
/** Never combine currencies or convert exact ledger values through binary floats. */
export function commercialMoneyTotals(rows: Array<{amount: Prisma.Decimal; currency: string | null | undefined}>): string {
  const totals = new Map<string, Prisma.Decimal>();
  let unqualified = 0;
  for (const row of rows) {
    if (row.currency !== "PEN" && row.currency !== "USD") {unqualified++; continue;}
    const currency = row.currency;
    totals.set(currency, (totals.get(currency) || new Prisma.Decimal(0)).add(row.amount));
  }
  const qualified = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => `${currency} ${total.toFixed(2)}`).join(" · ");
  return [qualified, unqualified ? `Moneda pendiente: ${unqualified} registros` : ""].filter(Boolean).join(" · ") || "Sin importes";
}
