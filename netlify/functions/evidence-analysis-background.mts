import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { processEvidenceAnalysisJob } from "../../lib/terraqo/evidence-analysis";

const payloadSchema = z.object({ jobId: z.string().min(10).max(80) }).strict();

function authorized(request: Request) {
  const expected = process.env.EVIDENCE_ANALYSIS_DISPATCH_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

const evidenceAnalysisBackground = async (request: Request) => {
  if (request.method !== "POST" || !authorized(request)) return;
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return;
  await processEvidenceAnalysisJob(parsed.data.jobId);
};

export default evidenceAnalysisBackground;

// No custom memory: this remains compatible with Netlify Starter limits.
export const config = { background: true, method: "POST" };
