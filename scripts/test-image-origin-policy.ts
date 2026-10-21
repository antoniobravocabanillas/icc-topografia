import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const nextConfig = read("next.config.ts");

assert.doesNotMatch(
  nextConfig,
  /hostname:\s*["']\*\*["']/,
  "Next Image must not proxy arbitrary HTTPS hosts. Add an explicit trusted host or render user-managed URLs unoptimized.",
);
assert.match(
  nextConfig,
  /hostname:\s*["']images\.unsplash\.com["']/,
  "The explicit Unsplash origin used by curated static content must remain declared.",
);

const dynamicImageSurfaces = [
  "app/(site)/tienda/page.tsx",
  "app/(site)/sectores/page.tsx",
  "components/cart/checkout-client.tsx",
  "components/admin/products/product-image-uploader.tsx",
  "components/product-gallery.tsx",
  "components/product-card.tsx",
] as const;

for (const path of dynamicImageSurfaces) {
  const dynamicImages = read(path)
    .match(/<Image\b[\s\S]*?\/>/g)
    ?.filter((image) => /\bsrc=\{/.test(image)) ?? [];
  assert.ok(dynamicImages.length > 0, `${path} must keep at least one guarded dynamic image.`);
  for (const image of dynamicImages) {
    assert.match(
      image,
      /\bunoptimized\b/,
      `${path} must load every user-managed image URL directly instead of passing it through the Next Image proxy.`,
    );
  }
}

console.log("Image origin policy contract: OK (no wildcard proxy origin; dynamic catalog media bypasses optimization)." );
