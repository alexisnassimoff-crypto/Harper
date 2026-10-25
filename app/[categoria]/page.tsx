import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GrillaProductos from "@/components/GrillaProductos";
import MensajesConfianza from "@/components/MensajesConfianza";
import { getProductos } from "@/lib/catalogo";
import { CATEGORIAS, categoriaPorSlug } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";
import { verificarCuotasPara } from "@/lib/cuotas-servidor";

export const revalidate = 60;

/**
 * La página de una categoría prevista que todavía no tiene página propia
 * (Anteojos de sol, Clip-On, Anteojos de receta). Anteojos, Estuches y Paños
 * tienen las suyas y ganan sobre esta ruta.
 *
 * Mientras la categoría no tenga productos publicados, la página no existe
 * (404): nada de "próximamente", fechas ni beneficios sin confirmar. Cuando se
 * cargan productos en Airtable, aparece sola (y en el menú, el pie y el
 * sitemap).
 */
const CON_PAGINA_PROPIA = new Set(["anteojos", "estuches", "panos"]);

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIAS.filter((c) => !CON_PAGINA_PROPIA.has(c.slug)).map((c) => ({ categoria: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ categoria: string }> }): Promise<Metadata> {
  const { categoria } = await params;
  const info = categoriaPorSlug(categoria);
  if (!info) return {};
  const descripcion = `${info.nombre} Harper, con sus colores y precios. Comprá online y pagá con Mercado Pago.`;
  return {
    title: info.nombre,
    description: descripcion,
    alternates: { canonical: `/${info.slug}` },
    openGraph: { title: `${info.nombre} · Harper`, description: descripcion, type: "website" },
  };
}

export default async function PaginaCategoria({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const info = categoriaPorSlug(categoria);
  if (!info || CON_PAGINA_PROPIA.has(info.slug)) notFound();

  const [productos, config] = await Promise.all([getProductos(info.nombre), getConfig()]);
  if (productos.length === 0) notFound();
  // Cuotas solo si Mercado Pago las confirma para el precio más bajo del listado.
  const cuotas = await verificarCuotasPara(productos.map((p) => p.precio));

  return (
    <section className="contenedor seccion seccion--pagina">
      <div className="seccion__cabecera">
        <h1 className="titulo">{info.nombre}</h1>
      </div>
      <GrillaProductos productos={productos} precargar={4} />
      <MensajesConfianza mensajes={mensajesDeConfianza(config, cuotas)} variante="tira" />
    </section>
  );
}
