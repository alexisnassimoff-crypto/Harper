import type { MetadataRoute } from "next";
import { getSlugs } from "@/lib/catalogo";

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getSlugs();
  const ahora = new Date();

  const fijas = [
    { url: SITIO, priority: 1 },
    { url: `${SITIO}/anteojos`, priority: 0.9 },
    { url: `${SITIO}/estuches`, priority: 0.9 },
    { url: `${SITIO}/legales/terminos`, priority: 0.2 },
    { url: `${SITIO}/legales/privacidad`, priority: 0.2 },
    { url: `${SITIO}/legales/devoluciones`, priority: 0.3 },
    { url: `${SITIO}/legales/arrepentimiento`, priority: 0.3 },
  ];

  return [
    ...fijas.map((f) => ({ ...f, lastModified: ahora })),
    ...slugs.map((slug) => ({
      url: `${SITIO}/producto/${slug}`,
      lastModified: ahora,
      priority: 0.8,
    })),
  ];
}
