import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "app",
  "cuenta",
  "cv",
  "portal",
  "soporte",
  "terraqo",
  "terraqoglobal",
  "www"
]);

export async function updateProfessionalUsernameAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const rawUsername = String(formData.get("username") || "").trim().toLowerCase();
  const username = rawUsername.replace(/^@+/, "");
  if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username)) {
    redirect("/portal?status=username-invalid");
  }

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const taken = await prisma.terraqoProfessionalProfile.findFirst({
    where: { username, NOT: { id: profile.id } },
    select: { id: true }
  });
  if (taken) redirect("/portal?status=username-taken");

  await prisma.terraqoProfessionalProfile.update({
    where: { id: profile.id },
    data: { username, liveCvEnabled: true }
  });

  revalidatePath("/portal");
  revalidatePath(`/cv/${username}`);
  redirect("/portal?success=username");
}
