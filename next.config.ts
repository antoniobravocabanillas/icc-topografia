import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "50mb" }
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      },
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  },
  async redirects() {
    return [
      { source: "/nosotros", destination: "/#plataforma", permanent: false },
      { source: "/servicios/:path*", destination: "/#plataforma", permanent: false },
      { source: "/proyectos/:path*", destination: "/#red", permanent: false },
      { source: "/sectores", destination: "/#empresas", permanent: false },
      { source: "/tienda/:path*", destination: "/#plataforma", permanent: false },
      { source: "/blog/:path*", destination: "/#worklog", permanent: false },
      { source: "/contacto", destination: "/#demo", permanent: false },
      { source: "/cotizacion", destination: "/#demo", permanent: false },
      { source: "/faq", destination: "/", permanent: false },
      { source: "/checkout", destination: "/", permanent: false }
    ];
  }
};

export default nextConfig;
