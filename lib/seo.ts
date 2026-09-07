import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/utils";
import { publicSections } from "@/lib/terraqo/public-sections";

type SeoInput = {
  title: string;
  description: string;
  path?: string;
};

export function createMetadata({ title, description, path = "" }: SeoInput): Metadata {
  const fullTitle = /\bTerraqo$/i.test(title.trim()) ? title.trim() : `${title.trim()} | Terraqo`;
  const url = absoluteUrl(path);
  const image = absoluteUrl(`/api/og?path=${encodeURIComponent(publicSections[path || "/"] ? path || "/" : "/")}`);

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
      type: "website",
      images: [{url:image,width:1200,height:630,alt:fullTitle}]
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [image]
    }
  };
}
