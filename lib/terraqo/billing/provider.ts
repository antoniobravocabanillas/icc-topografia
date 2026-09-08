import "server-only";
import type { BillingMode } from "./catalog";

export class BillingError extends Error {
  constructor(public code: string, public status = 400, public uncertain = false) { super(code); }
}
export function billingMode(): BillingMode {
  const mode = process.env.CULQI_MODE;
  if (mode !== "test" && mode !== "live") throw new BillingError("BILLING_NOT_CONFIGURED",503);
  return mode;
}
export function providerCredentials() {
  const mode=billingMode();
  const publicKey=process.env.CULQI_PUBLIC_KEY;
  const secretKey=process.env.CULQI_SECRET_KEY;
  if(!publicKey?.startsWith(`pk_${mode}_`)||!secretKey?.startsWith(`sk_${mode}_`))throw new BillingError("BILLING_NOT_CONFIGURED",503);
  if(mode==="live"&&process.env.BILLING_LIVE_ENABLED!=="true")throw new BillingError("LIVE_BILLING_DISABLED",503);
  return {mode,publicKey,secretKey};
}
export type ProviderResponse = {status:number; data:Record<string,unknown>};
export async function culqi(path:string,method:"GET"|"POST"|"PATCH"|"DELETE"="GET",body?:unknown):Promise<ProviderResponse>{
  if(!/^\/(customers|cards|charges|refunds|tokens|events|recurrent\/plans|recurrent\/subscriptions)(\/|\?|$)/.test(path))throw new BillingError("INVALID_PROVIDER_RESOURCE");
  const {secretKey}=providerCredentials();
  let response:Response;
  try{
    response=await fetch(`https://api.culqi.com/v2${path}`,{method,headers:{Authorization:`Bearer ${secretKey}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
  }catch{throw new BillingError("PROVIDER_UNCERTAIN",503,method!=="GET");}
  const data=await response.json().catch(()=>null) as Record<string,unknown>|null;
  if(!data)throw new BillingError("PROVIDER_INVALID_RESPONSE",502,method!=="GET");
  if(!response.ok){
    // Never expose or persist full provider payloads: they may contain PII.
    const code=response.status===401||response.status===403?"PROVIDER_ACCESS_DENIED":response.status>=500?"PROVIDER_UNCERTAIN":"PROVIDER_REJECTED";
    throw new BillingError(code,response.status>=500?503:400,response.status>=500&&method!=="GET");
  }
  return {status:response.status,data};
}
export function providerId(value:unknown,prefix:string,mode:BillingMode):string {
  if(typeof value!=="string"||!new RegExp(`^${prefix}_${mode}_[A-Za-z0-9]+$`).test(value))throw new BillingError("PROVIDER_INVALID_ID",502,true);
  return value;
}
