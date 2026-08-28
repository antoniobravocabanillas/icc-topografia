import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user") || "";
  const tokenValue = url.searchParams.get("token") || "";
  const destination = new URL("/cuenta", url.origin);
  const token = await prisma.verificationToken.findFirst({ where: { token: tokenValue, identifier: { startsWith: `email-change:${userId}:` }, expires: { gt: new Date() } } });
  if (!token) {
    destination.searchParams.set("emailChange", "invalid");
    return NextResponse.redirect(destination);
  }
  const newEmail = token.identifier.split(":").slice(2).join(":");
  if (!newEmail || await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) {
    destination.searchParams.set("emailChange", "unavailable");
    return NextResponse.redirect(destination);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { email: newEmail, emailVerified: new Date() } }),
    prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: `email-change:${userId}:` } } })
  ]);
  destination.searchParams.set("emailChange", "success");
  return NextResponse.redirect(destination);
}
