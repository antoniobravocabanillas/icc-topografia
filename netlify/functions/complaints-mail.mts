import {
  resolveBillingReconcileSecret,
  resolveScheduledJobTargets,
} from "../../lib/terraqo/scheduled-job-targets";

async function complaintsMail() {
 const secret=resolveBillingReconcileSecret();
 if(!secret)return new Response("Not configured",{status:503});
 let target:string;
 try{target=resolveScheduledJobTargets().complaintsMailApi;}catch{return new Response("Not configured",{status:503});}
 const response=await fetch(target,{method:"POST",headers:{authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(55000)});
 return new Response(response.ok?"Processed":"Retry required",{status:response.ok?200:502});
}

export default complaintsMail;
export const config={schedule:"*/5 * * * *"};
