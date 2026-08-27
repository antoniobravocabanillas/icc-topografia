import { allCountries } from "country-region-data";

export type LocationOption = {
  value: string;
  label: string;
};

function byLabel(left: LocationOption, right: LocationOption) {
  return left.label.localeCompare(right.label, "es");
}

const limaMetropolitanaDistricts = [
  "Ancón", "Ate", "Barranco", "Breña", "Carabayllo", "Chaclacayo", "Chorrillos", "Cieneguilla", "Comas",
  "El Agustino", "Independencia", "Jesús María", "La Molina", "La Victoria", "Lima", "Lince", "Los Olivos",
  "Lurigancho-Chosica", "Lurín", "Magdalena del Mar", "Miraflores", "Pachacámac", "Pucusana", "Pueblo Libre",
  "Puente Piedra", "Punta Hermosa", "Punta Negra", "Rímac", "San Bartolo", "San Borja", "San Isidro",
  "San Juan de Lurigancho", "San Juan de Miraflores", "San Luis", "San Martín de Porres", "San Miguel",
  "Santa Anita", "Santa María del Mar", "Santa Rosa", "Santiago de Surco", "Surquillo", "Villa El Salvador",
  "Villa María del Triunfo"
];

const peruCitiesBySubdivision: Record<string, string[]> = {
  AMA: ["Chachapoyas", "Bagua", "Utcubamba"],
  ANC: ["Huaraz", "Chimbote", "Caraz"],
  APU: ["Abancay", "Andahuaylas"],
  ARE: ["Arequipa", "Camana", "Mollendo"],
  AYA: ["Ayacucho", "Huanta"],
  CAJ: ["Cajamarca", "Jaen", "Cutervo"],
  CAL: ["Callao", "Bellavista", "Ventanilla"],
  CUS: ["Cusco", "Sicuani", "Quillabamba"],
  HUV: ["Huancavelica", "Tayacaja"],
  HUC: ["Huanuco", "Tingo Maria"],
  ICA: ["Ica", "Chincha Alta", "Pisco", "Nazca"],
  JUN: ["Huancayo", "Jauja", "Tarma", "La Merced"],
  LAL: ["Trujillo", "Chepen", "Pacasmayo"],
  LAM: ["Chiclayo", "Lambayeque", "Ferreñafe"],
  // Algunos catálogos ISO presentan Lima Metropolitana (LMA) y el departamento
  // de Lima (LIM) por separado. Incluimos los 43 distritos metropolitanos en
  // ambos para que el usuario no pierda su ubicación por esa diferencia externa.
  LIM: [...limaMetropolitanaDistricts, "Barranca", "Cajatambo", "Canta", "Chancay", "Chosica", "Huacho", "Huaral", "Huarochirí", "Huaura", "Lunahuaná", "Mala", "Matucana", "Oyón", "San Vicente de Cañete", "Yauyos"],
  LMA: limaMetropolitanaDistricts,
  LOR: ["Iquitos", "Yurimaguas", "Nauta"],
  MDD: ["Puerto Maldonado"],
  MOQ: ["Moquegua", "Ilo"],
  PAS: ["Cerro de Pasco", "Oxapampa"],
  PIU: ["Piura", "Sullana", "Talara", "Paita"],
  PUN: ["Puno", "Juliaca"],
  SAM: ["Moyobamba", "Tarapoto"],
  TAC: ["Tacna"],
  TUM: ["Tumbes", "Zarumilla"],
  UCA: ["Pucallpa", "Atalaya"],
};

function findCountry(countryCode: string) {
  return allCountries.find((country) => country[1] === countryCode.toUpperCase());
}

export function getCountryOptions(): LocationOption[] {
  return allCountries
    .map((country) => ({
      value: country[1],
      label: country[0],
    }))
    .sort(byLabel);
}

export function getSubdivisionOptions(countryCode: string): LocationOption[] {
  if (!countryCode) return [];
  return (findCountry(countryCode)?.[2] || [])
    .map((region) => ({
      value: region[1],
      label: region[0],
    }))
    .sort(byLabel);
}

export function getCityOptions(countryCode: string, subdivisionCode?: string): LocationOption[] {
  if (countryCode.toUpperCase() !== "PE") return [];
  if (subdivisionCode) {
    return (peruCitiesBySubdivision[subdivisionCode] || []).map((city) => ({ value: city, label: city })).sort(byLabel);
  }
  return Array.from(new Set(Object.values(peruCitiesBySubdivision).flat()))
    .map((city) => ({ value: city, label: city }))
    .sort(byLabel);
}

export function getCountryName(countryCode?: string | null) {
  if (!countryCode) return "";
  return findCountry(countryCode)?.[0] || countryCode;
}

export function getSubdivisionName(countryCode?: string | null, subdivisionCode?: string | null) {
  if (!countryCode || !subdivisionCode) return "";
  return (findCountry(countryCode)?.[2] || []).find((region) => region[1] === subdivisionCode)?.[0] || subdivisionCode;
}
