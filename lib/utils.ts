import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function absoluteUrl(path = "") {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://terraqoglobal.com").replace(/\/$/, "");
  return `${baseUrl}${path}`;
}
