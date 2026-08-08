import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError, ok, parseJson } from "@/lib/server/api";

const verifyEmailSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  code: z.string().trim().regex(/^\d{6}$/, "Codigo invalido"),
});

export async function POST(request: Request) {
  try {
    const payload = await parseJson(request, verifyEmailSchema);
    const identifier = `email:${payload.email}`;

    const token = await prisma.verificationToken.findFirst({
      where: {
        identifier,
        token: payload.code,
        expires: { gt: new Date() },
      },
    });

    if (!token) return fail("Codigo incorrecto o vencido.", 422);

    await prisma.$transaction([
      prisma.user.update({
        where: { email: payload.email },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.deleteMany({ where: { identifier } }),
    ]);

    return ok({ verified: true });
  } catch (error) {
    return handleApiError(error);
  }
}
