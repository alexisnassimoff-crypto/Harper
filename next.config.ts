import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    "/anteojos/opengraph-image": ["./public/productos/**/*.jpg", "./app/_og/fuentes/*.ttf"],
    "/estuches/opengraph-image": ["./public/productos/**/*.jpg", "./app/_og/fuentes/*.ttf"],
    "/panos/opengraph-image": ["./public/productos/**/*.jpg", "./app/_og/fuentes/*.ttf"],
  },
};

export default nextConfig;
