import type { Metadata } from "next";
import GrillaProductos from "@/components/GrillaProductos";
import { getProductos } from "@/lib/catalogo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Anteojos",
  description: "Todos los modelos de anteojos Harper.",
};

export default async function Anteojos() {
  const productos = await getProductos("Anteojos");

  return (
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "2.5rem" }}>
        Anteojos
      </h1>
      <GrillaProductos productos={productos} />
    </section>
  );
}
