import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";
import { createEmailVerificationLinkToken, sendEmailVerificationLink } from "@/lib/server/email-verification";

const resendSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase())
});

export async function POST(request: Request) {
  try {
    const { email } = await parseJson(request, resendSchema);
    const user = await prisma.user.findUnique({ where: { email }, select: { email: true, emailVerified: true } });

    // A generic success prevents using this endpoint to enumerate registered emails.
    if (!user || user.emailVerified) return ok({ delivered: true });

    const verification = await prisma.$transaction((tx) => createEmailVerificationLinkToken(tx, email));
    const delivery = await sendEmailVerificationLink(email, verification.code);
    return ok({ delivered: delivery.delivered });
  } catch (error) {
    const response = handleApiError(error);
    if (response.status >= 500) return fail("El servicio de correo no está disponible temporalmente.", 503);
    return response;
  }
}
