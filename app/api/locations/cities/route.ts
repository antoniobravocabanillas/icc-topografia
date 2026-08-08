import { fail, ok } from "@/lib/server/api";
import { getCityOptions } from "@/lib/locations";

export function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const country = searchParams.get("country") || "";
  const subdivision = searchParams.get("subdivision") || undefined;
  if (!country) return fail("Pais requerido.", 422);
  return ok(getCityOptions(country, subdivision));
}
