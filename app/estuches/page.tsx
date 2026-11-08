import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CabeceraColeccion from "@/components/CabeceraColeccion";
import GrillaProductos from "@/components/GrillaProductos";
import { getProductos } from "@/lib/catalogo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Estuches",
  description:
    "Estuches rígidos de ecocuero premium con paño de microfibra. Modelos R100, O300 y M500.",
  alternates: { canonical: "/estuches" },
  openGraph: {
    title: "Estuches · Harper",
    description:
      "Estuches rígidos de ecocuero premium con paño de microfibra. Modelos R100, O300 y M500.",
    type: "website",
  },
};

export default async function Estuches() {
  const productos = await getProductos("Estuches");
  // Desde el 03/11/2026 los estuches y los paños se venden solo en Mercado Libre.
  if (productos.length === 0) notFound();

  return (
    <section className="contenedor seccion seccion--pagina">
      <CabeceraColeccion titulo="Estuches" cantidad={productos.length} />
      <GrillaProductos productos={productos} precargar={4} />
    </section>
  );
}
