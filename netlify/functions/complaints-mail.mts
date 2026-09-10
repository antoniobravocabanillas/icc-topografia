export default async()=>{
 const secret=process.env.BILLING_RECONCILE_SECRET;
 if(!secret)return new Response("Not configured",{status:503});
 const response=await fetch("https://terraqoglobal.com/api/internal/complaints-mail",{method:"POST",headers:{authorization:`Bearer ${secret}`},redirect:"error",signal:AbortSignal.timeout(55000)});
 return new Response(response.ok?"Processed":"Retry required",{status:response.ok?200:502});
};
export const config={schedule:"*/5 * * * *"};
