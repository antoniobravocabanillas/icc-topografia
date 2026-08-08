import { fail, ok } from "@/lib/server/api";
import { getSubdivisionOptions } from "@/lib/locations";

export function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") || "";
  if (!country) return fail("Pais requerido.", 422);
  return ok(getSubdivisionOptions(country));
}
