import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/admin", "/portal", "/api/", "/cuenta", "/registro"],
      allow: ["/", "/api/og"]
    },
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
