import { NextResponse } from "next/server";
import { createExecutiveCvPdf } from "@/lib/terraqo/cv-pdf";
import { publicCvProfileInclude, publishedCvProfileWhere } from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";

type CvPdfRouteProps = {
  params: Promise<{ username: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const missingCv = () => NextResponse.json({ error: "CV no encontrado" }, {
  status: 404,
  headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
});

export async function GET(request: Request, { params }: CvPdfRouteProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: publishedCvProfileWhere(username),
    include: publicCvProfileInclude
  });

  if (!profile) {
    return missingCv();
  }

  const pdf = await createExecutiveCvPdf(profile, request.url);
  // Rendering can outlast a withdrawal. Check publication/version again before
  // releasing the bytes; do not serve a CV generated from a revoked snapshot.
  const current = await prisma.terraqoProfessionalProfile.findFirst({
    where: { id: profile.id, liveCvEnabled: true, updatedAt: profile.updatedAt },
    select: { id: true }
  });
  if (!current) return missingCv();
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
