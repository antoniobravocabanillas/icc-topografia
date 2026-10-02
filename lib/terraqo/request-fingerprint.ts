import { createHmac } from "node:crypto";

export type AttendanceRequestFingerprint = {
  networkFingerprint: string | null;
  userAgentFingerprint: string | null;
};

function fingerprint(value: string | null, namespace: string) {
  const secret = process.env.ATTENDANCE_FINGERPRINT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || !value) return null;
  return createHmac("sha256", secret).update(`${namespace}:${value}`).digest("hex");
}

function clientIp(request: Request) {
  // Netlify injects x-nf-client-connection-ip. x-forwarded-for is a fallback
  // and only its first normalized value is used; the raw address is never stored.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return request.headers.get("x-nf-client-connection-ip")?.trim() || forwarded;
}

export function attendanceRequestFingerprint(request: Request): AttendanceRequestFingerprint {
  const userAgent = request.headers.get("user-agent")?.trim().slice(0, 512) || null;
  return {
    networkFingerprint: fingerprint(clientIp(request), "attendance-network"),
    userAgentFingerprint: fingerprint(userAgent, "attendance-user-agent"),
  };
}
