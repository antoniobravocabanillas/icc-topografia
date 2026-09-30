import { z } from "zod";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { requireUser } from "@/lib/server/authz";

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

type NominatimAddress = Partial<
  Record<
    | "neighbourhood"
    | "suburb"
    | "city_district"
    | "village"
    | "town"
    | "city"
    | "municipality"
    | "county"
    | "state"
    | "country",
    string
  >
>;

function publicPlaceLabel(address: NominatimAddress) {
  const locality =
    address.neighbourhood ||
    address.suburb ||
    address.city_district ||
    address.village ||
    address.town ||
    address.city ||
    address.municipality ||
    address.county;
  const region = address.city && address.city !== locality ? address.city : address.state;
  return [...new Set([locality, region, address.country].filter(Boolean))]
    .slice(0, 3)
    .join(", ");
}

export async function GET(request: Request) {
  const { response } = await requireUser();
  if (response) return response;

  try {
    const url = new URL(request.url);
    const input = querySchema.parse({
      latitude: url.searchParams.get("latitude"),
      longitude: url.searchParams.get("longitude"),
    });

    // Aprox. 110 m: suficiente para contextualizar sin enviar precisión innecesaria.
    const latitude = input.latitude.toFixed(3);
    const longitude = input.longitude.toFixed(3);
    const endpoint = new URL("https://nominatim.openstreetmap.org/reverse");
    endpoint.searchParams.set("format", "jsonv2");
    endpoint.searchParams.set("lat", latitude);
    endpoint.searchParams.set("lon", longitude);
    endpoint.searchParams.set("zoom", "13");
    endpoint.searchParams.set("addressdetails", "1");
    endpoint.searchParams.set("layer", "address");
    endpoint.searchParams.set("accept-language", "es");

    const geocodingResponse = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Terraqo/1.0 (https://terraqoglobal.com; hola@vrilla.solutions)",
      },
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(7000),
    });
    if (!geocodingResponse.ok) {
      return fail("No pudimos identificar el nombre del lugar.", 502);
    }

    const payload = (await geocodingResponse.json()) as {
      address?: NominatimAddress;
    };
    const label = publicPlaceLabel(payload.address || {});
    if (!label) return fail("No encontramos un lugar público para esta ubicación.", 404);

    return ok({
      label,
      attribution: "© OpenStreetMap contributors",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
