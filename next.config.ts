import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {"/api/quotes/[id]/pdf": ["./public/fonts/noto-sans/noto-sans.ttf"]},
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
  async headers() {
    return [{source:"/cotizaciones/:token",headers:[
      {key:"Referrer-Policy",value:"no-referrer"},
      {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},
      {key:"Cache-Control",value:"private, no-store"}
    ]}];
  },
  async redirects() {
    return [
      { source: "/nosotros", destination: "/plataforma", permanent: false },
      { source: "/servicios/:path*", destination: "/#plataforma", permanent: false },
      { source: "/proyectos/:path*", destination: "/#red", permanent: false },
      { source: "/sectores", destination: "/#empresas", permanent: false },
      { source: "/tienda/:path*", destination: "/#plataforma", permanent: false },
      { source: "/blog/:path*", destination: "/#worklog", permanent: false },
      { source: "/cotizacion", destination: "/contacto", permanent: false },
      { source: "/faq", destination: "/", permanent: false },
      { source: "/checkout", destination: "/", permanent: false }
    ];
  }
};

export default nextConfig;
