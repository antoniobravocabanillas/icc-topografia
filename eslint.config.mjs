import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".netlify/**",
      ".playwright-cli/**",
      "node_modules/**",
      "output/**",
      "tmp/**",
      "next-env.d.ts"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // ImageResponse renders a PNG, not a browser page with next/image.
    files: ["app/cv/**/opengraph-image.tsx"],
    rules: { "@next/next/no-img-element": "off" }
  }
];

export default eslintConfig;
