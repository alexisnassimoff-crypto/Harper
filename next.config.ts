import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Dúo (lib/duo.ts): el valor de HARPER_DUO_ACTIVO al armar el sitio
  // (.env.production, o el de Vercel si lo tiene) queda fijo en el código. La
  // página que lo anuncia y el carrito que lo cobra usan siempre el mismo,
  // sin depender de que la función de Vercel lea .env.production. No es un
  // secreto: es "1" o nada.
  env: {
    HARPER_DUO_ACTIVO: process.env.HARPER_DUO_ACTIVO ?? "",
  },

  images: {
    // Las fotos definitivas viven en Vercel Blob; las de Airtable son el
    // respaldo mientras el espejo todavía no corrió.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "v5.airtableusercontent.com" },
      { protocol: "https", hostname: "dl.airtable.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Las miniaturas para compartir leen del disco la tipografía y la foto del
  // producto. El rastreo automático no ve esas lecturas —son rutas armadas en
  // tiempo de ejecución— así que hay que declararlas o el archivo no viaja al
  // servidor y la tarjeta sale sin foto.
  outputFileTracingIncludes: {
    "/producto/[slug]/opengraph-image": [
      "./public/productos/**/*.jpg",
      "./app/_og/fuentes/*.ttf",
    ],
    "/producto/[slug]/[color]/opengraph-image": [
      "./public/productos/**/*.jpg",
      "./app/_og/fuentes/*.ttf",
    ],
    "/anteojos/opengraph-image": ["./public/productos/**/*.jpg", "./app/_og/fuentes/*.ttf"],
    "/estuches/opengraph-image": ["./public/productos/**/*.jpg", "./app/_og/fuentes/*.ttf"],
    "/panos/opengraph-image": ["./public/productos/**/*.jpg", "./app/_og/fuentes/*.ttf"],
  },

  // Socios Harper (la membresía paga) se reemplazó por Suscriptores Harper
  // (Ale, 03/11/2026): los enlaces viejos llevan a las páginas nuevas.
  async redirects() {
    return [
      { source: "/socios", destination: "/suscriptores", permanent: true },
      { source: "/socios/mi-cuenta", destination: "/suscriptores/mi-cuenta", permanent: true },
      { source: "/legales/socios", destination: "/legales/suscriptores", permanent: true },
    ];
  },
};

export default nextConfig;
