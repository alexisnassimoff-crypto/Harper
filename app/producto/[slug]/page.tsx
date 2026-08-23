import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FichaProducto from "@/components/producto/FichaProducto";
import { getProducto, getSlugs } from "@/lib/catalogo";

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
  const producto = await getProducto(slug);

  if (!producto) return { title: "Producto no encontrado" };

  const descripcion =
    producto.descripcion || `${producto.nombre} — Harper. Envíos a todo el país.`;

  return {
    title: producto.nombre,
    description: descripcion,
    alternates: { canonical: `/producto/${producto.slug}` },
    openGraph: {
      title: `${producto.nombre} · Harper`,
      description: descripcion,
      type: "website",
      images: producto.fotoPrincipal ? [producto.fotoPrincipal] : undefined,
    },
  };
}

export default async function PaginaProducto({ params }: Params) {
  const { slug } = await params;
  const producto = await getProducto(slug);

  if (!producto) notFound();

  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

  // Datos estructurados: habilitan el resultado enriquecido con precio en Google.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: producto.nombre,
    description: producto.descripcion || undefined,
    image: producto.variantes.flatMap((v) => v.fotos).slice(0, 6),
    brand: { "@type": "Brand", name: "Harper" },
    offers: {
      "@type": "Offer",
      price: producto.precio,
      priceCurrency: "ARS",
      availability: producto.agotado
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      url: `${sitio}/producto/${producto.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FichaProducto producto={producto} />
    </>
  );
}
