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
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "2.5rem" }}>
        Estuches
      </h1>
      <GrillaProductos productos={productos} />
    </section>
  );
}
