import type { Metadata } from "next";
import { getSlugs } from "@/lib/catalogo";
import { Ficha, metadataFicha } from "./ficha";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    const slugs = await getSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    // Sin Airtable configurado el build igual tiene que pasar:
    // las páginas se generan on-demand.
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return metadataFicha(slug);
}

export default async function PaginaProducto({ params }: Params) {
  const { slug } = await params;
  return <Ficha slug={slug} />;
}
