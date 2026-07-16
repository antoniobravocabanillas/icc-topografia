import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/cuenta", "/registro", "/privacidad", "/terminos"];
  return staticRoutes.map((route) => ({ url: absoluteUrl(route), lastModified: new Date() }));
}
