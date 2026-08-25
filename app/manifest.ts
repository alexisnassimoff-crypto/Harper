import type { MetadataRoute } from "next";

/**
 * Manifest de la aplicación web.
 *
 * Además de habilitar "agregar a la pantalla de inicio" en Android, es de donde
 * Google toma el ícono cuando arma el resultado de búsqueda. El `maskable` va
 * aparte porque Android recorta el ícono en círculo y come las esquinas.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Harper — Cases & Eyewear",
    short_name: "Harper",
    description:
      "Anteojos y estuches rígidos de ecocuero premium.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#004226",
    lang: "es-AR",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icono-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
