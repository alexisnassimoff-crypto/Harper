import type { MetadataRoute } from "next";
import { getProductos, getSlugs } from "@/lib/catalogo";
import { categoriasConProductos } from "@/lib/categorias";

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, productos] = await Promise.all([getSlugs(), getProductos()]);
  const ahora = new Date();

  // Solo las categorías con productos publicados: una prevista sin productos
  // no tiene página.
  const categorias = categoriasConProductos(productos).map((c) => ({
    url: `${SITIO}/${c.slug}`,
    priority: c.tipo === "anteojos" ? 0.9 : 0.8,
  }));

  const fijas = [
    { url: SITIO, priority: 1 },
    ...categorias,
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
