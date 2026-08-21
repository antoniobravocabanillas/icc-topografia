import { NextResponse } from "next/server";
import { createExecutiveCvPdf } from "@/lib/terraqo/cv-pdf";
import { publicCvProfileInclude } from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";

type CvPdfRouteProps = {
  params: Promise<{ username: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: CvPdfRouteProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: publicCvProfileInclude
  });

  if (!profile) {
    return NextResponse.json({ error: "CV no encontrado" }, { status: 404 });
  }

  const pdf = await createExecutiveCvPdf(profile, request.url);
  const fileUsername = profile.username || username;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="terraqo-cv-${fileUsername}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
