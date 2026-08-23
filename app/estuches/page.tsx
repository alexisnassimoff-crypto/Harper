import type { Metadata } from "next";
import GrillaProductos from "@/components/GrillaProductos";
import { getProductos } from "@/lib/catalogo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Estuches",
  description: "Todos los modelos de estuches Harper.",
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
