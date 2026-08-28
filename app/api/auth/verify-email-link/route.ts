import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicRequestOrigin } from "@/lib/server/request-origin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const tokenValue = url.searchParams.get("token") || "";
  const destination = new URL("/cuenta", publicRequestOrigin(request));
  if (!email || !tokenValue) {
    destination.searchParams.set("verification", "invalid");
    return NextResponse.redirect(destination);
  }
  const token = await prisma.verificationToken.findFirst({
    where: { identifier: `email:${email}`, token: tokenValue, expires: { gt: new Date() } }
  });
  if (!token) {
    destination.searchParams.set("verification", "invalid");
    return NextResponse.redirect(destination);
  }
  await prisma.$transaction([
    prisma.user.update({ where: { email }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.deleteMany({ where: { identifier: `email:${email}` } })
  ]);
  destination.searchParams.set("verification", "success");
  destination.searchParams.set("email", email);
  return NextResponse.redirect(destination);
}
