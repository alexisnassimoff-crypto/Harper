import type { MetadataRoute } from "next";

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nada de esto aporta a la búsqueda y puede exponer datos de un pedido.
      disallow: ["/api/", "/checkout", "/carrito", "/gracias"],
    },
    sitemap: `${SITIO}/sitemap.xml`,
  };
}
