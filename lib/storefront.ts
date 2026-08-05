import { formatCurrency } from "@/lib/utils";

export type StorefrontProduct = {
  id?: string;
  slug: string;
  sku?: string | null;
  name: string;
  brand: string;
  model?: string | null;
  summary?: string | null;
  description?: string | null;
  price?: number | null;
  rentalPrice?: number | null;
  stock?: number;
  currency?: string;
  requiresQuote?: boolean;
  availability?: string | null;
  badge?: string | null;
  images?: string[];
  mainImage?: string | null;
  manualUrl?: string | null;
  technicalSheet?: string | null;
  specifications?: unknown;
  category?: { name: string; slug?: string | null };
};

type SpecRecord = Record<string, unknown>;

function asRecord(value: unknown): SpecRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SpecRecord) : {};
}

function readText(record: SpecRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function readNumber(record: SpecRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

function readArray(record: SpecRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === "string" && value.trim()) return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function getProductImages(product: StorefrontProduct) {
  const images = [product.mainImage, ...(product.images || [])].filter(Boolean) as string[];
  return Array.from(new Set(images));
}

export function formatStorePrice(value?: number | null, currency = "PEN") {
  if (!value) return "Cotizar";
  return formatCurrency(value, currency);
}

export function getStorefrontMeta(product: StorefrontProduct) {
  const specs = asRecord(product.specifications);
  const image = getProductImages(product)[0] || "/images/logo.png";
  const price = product.price || null;
  const discount = readText(specs, ["discount", "descuento"], product.badge || "");
  const listPrice = readNumber(specs, ["listPrice", "precioLista", "oldPrice", "precioAnterior"]);

  return {
    image,
    shippingLabel: readText(specs, ["shippingLabel", "envio"], "Envio gratis a todo el Peru"),
    discountLabel: discount && discount.includes("%") ? discount : discount ? `-${discount}` : "",
    rating: readText(specs, ["rating", "calificacion"], "4.8"),
    reviews: readText(specs, ["reviews", "opiniones"], "24"),
    sku: product.sku || readText(specs, ["sku"], "SKU pendiente"),
    stockLabel: product.stock && product.stock > 0 ? "En stock" : product.availability || "Bajo cotizacion",
    listPrice: listPrice && price && listPrice > price ? listPrice : null,
    precision: readText(specs, ["precision", "precisionAngular"], "1\""),
    range: readText(specs, ["range", "alcance", "alcancePrisma"], "5,000 m"),
    warranty: readText(specs, ["warranty", "garantia"], "12 meses"),
    protection: readText(specs, ["protection", "proteccion"], "IP55"),
    connectivity: readText(specs, ["connectivity", "conectividad"], "Bluetooth"),
    includes: readArray(specs, ["includes", "incluye"]),
    downloads: readArray(specs, ["downloads", "descargas"]),
    specs
  };
}
