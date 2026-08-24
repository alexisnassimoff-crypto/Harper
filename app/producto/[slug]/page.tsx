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
      // Sin `images` a propósito: si el segmento las declara, Next descarta el
      // archivo `opengraph-image.tsx` de al lado. Y las fotos del catálogo son
      // WebP con transparencia, que es lo que rompía la miniatura.
    },
  };
}

export default async function PaginaProducto({ params }: Params) {
  const { slug } = await params;
  const producto = await getProducto(slug);

  if (!producto) notFound();

  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

  // Google pide URLs absolutas, y sobre fondo blanco: de ahí el .jpg hermano en
  // vez del .webp con transparencia. Misma conversión que usa el mail de compra.
  const fotos = producto.variantes
    .flatMap((v) => v.fotos)
    .slice(0, 6)
    .map((f) => `${sitio}${f.replace(/\.webp$/i, ".jpg")}`);

  const enUnMes = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const seccion =
    producto.categoria === "Anteojos"
      ? "anteojos"
      : producto.categoria === "Estuches"
        ? "estuches"
        : "panos";

  // Datos estructurados: habilitan el resultado enriquecido con precio en Google.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: producto.nombre,
      description: producto.descripcion || undefined,
      image: fotos,
      sku: producto.variantes[0]?.sku,
      brand: { "@type": "Brand", name: "Harper" },
      offers: {
        "@type": "Offer",
        price: producto.precio,
        priceCurrency: "ARS",
        itemCondition: "https://schema.org/NewCondition",
        priceValidUntil: enUnMes,
        availability: producto.agotado
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
        url: `${sitio}/producto/${producto.slug}`,
        seller: { "@id": `${sitio}#organizacion` },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: sitio },
        {
          "@type": "ListItem",
          position: 2,
          name: producto.categoria,
          item: `${sitio}/${seccion}`,
        },
        { "@type": "ListItem", position: 3, name: producto.nombre },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // El escape de "<" evita que un "</script>" en una descripción de
        // Airtable corte el bloque y rompa la página.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <FichaProducto producto={producto} />
    </>
  );
}
