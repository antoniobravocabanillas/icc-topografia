import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { processCvImportJob } from "../../lib/server/cv-import-extraction";

const payloadSchema = z.object({ importId: z.string().min(10).max(80) }).strict();

function authorized(request: Request) {
  const expected = process.env.CV_IMPORT_DISPATCH_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

const cvImportBackground = async (request: Request) => {
  if (request.method !== "POST" || !authorized(request)) return;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return;
  // The worker claim is atomic, so Netlify retries or duplicate dispatches cannot process a CV twice.
  await processCvImportJob(parsed.data.importId);
};

export default cvImportBackground;

export const config = { background: true, method: "POST", memory: "2gb" };
