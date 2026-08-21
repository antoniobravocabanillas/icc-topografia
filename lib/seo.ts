import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/utils";

type SeoInput = {
  title: string;
  description: string;
  path?: string;
};

export function createMetadata({ title, description, path = "" }: SeoInput): Metadata {
  const fullTitle = /\bTerraqo$/i.test(title.trim()) ? title.trim() : `${title.trim()} | Terraqo`;
  const url = absoluteUrl(path);

  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: "Terraqo",
      locale: "es_PE",
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description
    }
  };
}
