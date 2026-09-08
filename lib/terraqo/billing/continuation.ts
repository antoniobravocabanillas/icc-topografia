import { BILLING_PLANS } from "./catalog";
export function billingContinuation(value:string|null|undefined):string|null{
  if(!value||value.length>400||!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return null;
  const url=new URL(value,"https://terraqoglobal.com");
  if(!["/membresia","/portal/membresia"].includes(url.pathname))return null;
  const plan=url.searchParams.get("plan")||"personal-pro";
  if(!BILLING_PLANS.some(p=>p.code===plan))return null;
  return `/portal/membresia?${new URLSearchParams({plan,cycle:url.searchParams.get("cycle")==="ANNUAL"?"ANNUAL":"MONTHLY"})}`;
}
