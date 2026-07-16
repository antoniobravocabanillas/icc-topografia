import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Terraqo | El trabajo habla por ti",
    template: "%s | Terraqo"
  },
  description: "Software modular, red profesional, marketplace y CV vivo para conectar empresas, proyectos y talento con evidencia real."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
