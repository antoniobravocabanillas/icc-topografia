import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailChangeVerificationLink } from "@/lib/server/email-verification";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
  const newEmail = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
  if (!user) return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  if (user.email.toLowerCase() === newEmail) return NextResponse.json({ error: "Ese ya es tu correo actual." }, { status: 409 });
  if (await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) return NextResponse.json({ error: "Ese correo ya pertenece a otra cuenta." }, { status: 409 });
  const identifier = `email-change:${session.user.id}:${newEmail}`;
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: `email-change:${session.user.id}:` } } }),
    prisma.verificationToken.create({ data: { identifier, token, expires: new Date(Date.now() + 30 * 60 * 1000) } })
  ]);
  const url = new URL("/api/auth/confirm-email-change", new URL(request.url).origin);
  url.searchParams.set("user", session.user.id);
  url.searchParams.set("token", token);
  const delivery = await sendEmailChangeVerificationLink(newEmail, url.toString(), user.name);
  if (!delivery.delivered) return NextResponse.json({ error: "No pudimos enviar la confirmación al nuevo correo." }, { status: 502 });
  return NextResponse.json({ data: { delivered: true } });
}
