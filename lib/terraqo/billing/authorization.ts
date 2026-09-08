import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BillingError } from "./provider";

export async function billingUser(){
  const session=await auth();
  if(!session?.user?.id)throw new BillingError("AUTH_REQUIRED",401);
  const user=await prisma.user.findUnique({where:{id:session.user.id},select:{id:true,email:true,name:true,role:true,emailVerified:true}});
  if(!user)throw new BillingError("AUTH_REQUIRED",401);
  return user;
}
export async function requirePlatformBillingAdmin(){
  const user=await billingUser();
  // Fresh platform role, not a selected company workspace or tenant ADMIN role.
  if(user.role!=="SUPER_ADMIN")throw new BillingError("PLATFORM_ADMIN_REQUIRED",403);
  return user;
}
export function assertBillingOrigin(request:Request){
  const origin=request.headers.get("origin");
  const expected=new URL(request.url).origin;
  const local=process.env.NODE_ENV!=="production"&&origin&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  if(!origin||(!local&&origin!==expected))throw new BillingError("INVALID_ORIGIN",403);
  if(request.headers.get("sec-fetch-site")==="cross-site")throw new BillingError("INVALID_ORIGIN",403);
}
export { authorizeBillingOwner } from "./owner";
