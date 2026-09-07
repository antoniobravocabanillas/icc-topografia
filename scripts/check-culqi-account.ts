import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const key = process.env.CULQI_SECRET_KEY;
  if (process.env.CULQI_MODE !== "test" || !key?.startsWith("sk_test_")) {
    throw new Error("Sandbox credentials are required for this diagnostic.");
  }
  // Read-only, fixed provider origin. Never print credentials or full API payloads.
  const response = await fetch("https://api.culqi.com/v2/recurrent/plans?limit=50", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  console.log(JSON.stringify({
    status: response.status,
    authorized: response.ok,
    plans: response.ok && Array.isArray(body.data)
      ? body.data.map((plan: { id?: string; amount?: number; currency?: string; status?: number }) => ({
        id: plan.id, amount: plan.amount, currency: plan.currency, status: plan.status,
      })) : [],
    responseType: typeof body.object === "string" ? body.object : undefined,
  }, null, 2));
  if (!response.ok) process.exitCode = 1;
}
main().catch(() => { console.error("Sandbox account inspection could not complete; no payment was attempted."); process.exitCode = 1; });
