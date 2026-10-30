import type { Metadata } from "next";
import { getProductos } from "@/lib/catalogo";
import { esMembresia } from "@/lib/categorias";
import { Ficha, metadataFicha } from "../ficha";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string; color: string }> };

/** Una página estática por color: el SKU en minúsculas. */
export async function generateStaticParams() {
  try {
    const productos = await getProductos();
    // La membresía no tiene ficha (tiene /socios).
    return productos
      .filter((p) => !esMembresia(p.categoria))
      .flatMap((p) => p.variantes.map((v) => ({ slug: p.slug, color: v.sku.toLowerCase() })));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, color } = await params;
  return metadataFicha(slug, decodeURIComponent(color));
}

export default async function PaginaColor({ params }: Params) {
  const { slug, color } = await params;
  return <Ficha slug={slug} color={decodeURIComponent(color)} />;
}
