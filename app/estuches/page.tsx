import type { Metadata } from "next";
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

  return (
    <section className="contenedor seccion seccion--pagina">
      <div className="seccion__cabecera">
        <h1 className="titulo">Estuches</h1>
      </div>
      <GrillaProductos productos={productos} precargar={4} />
    </section>
  );
}
