import { ok } from "@/lib/server/api";
import { getCountryOptions } from "@/lib/locations";

export function GET() {
  return ok(getCountryOptions());
}
