import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BillingConsole } from "@/components/terraqo/billing-console";
import { PrivacyNavigation } from "@/components/terraqo/privacy-navigation";
export const metadata={title:"Mi membresía | Terraqo",robots:{index:false,follow:false}};
export default async function MembershipPage({searchParams}:{searchParams:Promise<{plan?:string;cycle?:string}>}){
  const query=await searchParams;const session=await auth();
  if(!session?.user?.id){const callback=`/membresia?${new URLSearchParams({plan:query.plan||"personal-pro",cycle:query.cycle||"MONTHLY"})}`;redirect(`/cuenta?callbackUrl=${encodeURIComponent(callback)}`);}
  return <div className="space-y-6"><PrivacyNavigation active="plan" /><BillingConsole initialPlan={query.plan||"personal-pro"} initialCycle={query.cycle==="ANNUAL"?"ANNUAL":"MONTHLY"}/></div>;
}
