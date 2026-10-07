import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { recoverProfessionalDocumentCleanups, recoverProfessionalDocumentCleanup } from "@/lib/server/professional-document-cleanup";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET;
  const presented = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || secret.length < 32 || presented.length !== expected.length || !timingSafeEqual(presented, expected))
    return NextResponse.json({error:"UNAUTHORIZED"},{status:401,headers:{"Cache-Control":"no-store"}});
  if (request.headers.get("content-type")?.startsWith("application/json")) {
    if (Number(request.headers.get("content-length") || 0) > 1024) return NextResponse.json({error:"BODY_TOO_LARGE"},{status:413});
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1024) { await reader.cancel(); return NextResponse.json({error:"BODY_TOO_LARGE"},{status:413}); }
        chunks.push(part.value);
      }
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    let auditId: string;
    try {
      const value = JSON.parse(raw) as Record<string,unknown>;
      if (Object.keys(value).length !== 1 || typeof value.auditId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.auditId))
        return NextResponse.json({error:"INVALID_REQUEST"},{status:422});
      auditId = value.auditId;
    } catch { return NextResponse.json({error:"INVALID_REQUEST"},{status:422}); }
    return NextResponse.json({result:await recoverProfessionalDocumentCleanup(auditId)},{headers:{"Cache-Control":"no-store"}});
  }
  return NextResponse.json(await recoverProfessionalDocumentCleanups(),{headers:{"Cache-Control":"no-store"}});
}
