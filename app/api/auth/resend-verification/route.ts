import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { createEmailVerificationLinkToken, sendEmailVerificationLink } from "@/lib/server/email-verification";

const resendSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const DUMMY_PASSWORD_HASH = "$2b$12$fzVJrm7vRhIidHgTuitWNuM/b1UFLIkmWX/bT.mL17ld0OuxcZRby";

export async function POST(request: Request) {
  try {
    const { email, password } = await parseJson(request, resendSchema);
    const user = await prisma.user.findUnique({ where: { email }, select: { email: true, emailVerified: true, name: true, passwordHash: true } });

    // The current password proves account control before verification state is disclosed.
    const validPassword = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user?.passwordHash || !validPassword) {
      return fail("No pudimos validar la cuenta para reenviar el correo.", 401);
    }
    if (user.emailVerified) return ok({ delivered: true, status: "already_verified" });

    const verification = await prisma.$transaction((tx) => createEmailVerificationLinkToken(tx, email));
    const delivery = await sendEmailVerificationLink(email, verification.code, user.name);
    return ok({ delivered: delivery.delivered, status: "resent" });
  } catch (error) {
    const response = handleApiError(error);
    if (response.status >= 500) return fail("El servicio de correo no está disponible temporalmente.", 503);
    return response;
  }
}
