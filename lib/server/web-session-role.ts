import {prisma} from "@/lib/prisma";
/** Authorization uses the current account role, never a stale role in a signed session. */
export async function currentWebSessionRole(userId: string | undefined) {
  if (!userId) return null;
  const user=await prisma.user.findUnique({where:{id:userId},select:{role:true}});
  return user?.role ?? null;
}
