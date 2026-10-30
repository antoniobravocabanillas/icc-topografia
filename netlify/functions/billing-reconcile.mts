import { resolveScheduledJobTargets } from "../../lib/terraqo/scheduled-job-targets";

// Runs independently of browser activity. Never stores customer data in scheduler logs.
async function billingReconcile() {
  const secret=process.env.BILLING_RECONCILE_SECRET;
  if(!secret) return new Response("Billing reconciliation is not configured",{status:503});
  let target:string;
  try{target=resolveScheduledJobTargets().billingReconcileApi;}
  catch{return new Response("Billing reconciliation is not configured",{status:503});}
  const response=await fetch(target,{
    method:"POST",headers:{authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(55000),
  });
  return new Response(response.ok?"Reconciliation completed":"Reconciliation failed",{status:response.ok?200:502});
}

export default billingReconcile;
export const config={schedule:"*/5 * * * *"};
