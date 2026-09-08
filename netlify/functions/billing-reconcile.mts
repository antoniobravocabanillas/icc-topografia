// Runs independently of browser activity. Never stores customer data in scheduler logs.
export default async () => {
  const secret=process.env.BILLING_RECONCILE_SECRET;
  if(!secret) return new Response("Billing reconciliation is not configured",{status:503});
  const response=await fetch("https://terraqoglobal.com/api/internal/billing-reconcile",{
    method:"POST",headers:{authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(55000),
  });
  return new Response(response.ok?"Reconciliation completed":"Reconciliation failed",{status:response.ok?200:502});
};
export const config={schedule:"*/5 * * * *"};
