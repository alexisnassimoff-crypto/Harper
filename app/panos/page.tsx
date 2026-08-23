import type { Metadata } from "next";
import GrillaProductos from "@/components/GrillaProductos";
import { getProductos } from "@/lib/catalogo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Paños",
  description:
    "Paños de microfibra Harper para limpieza de cristales. No rayan ni dejan pelusa.",
};

export default async function Panos() {
  const productos = await getProductos("Paños");

  return (
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "0.75rem" }}>
        Paños
      </h1>
      <p className="apagado" style={{ marginBottom: "2.5rem", maxWidth: "34rem" }}>
        Microfibra que no raya ni deja pelusa. Aptos para cristales con
        tratamiento antirreflejo, blue cut y polarizados. Entrega por Correo
        Argentino a todo el país.
      </p>
      <GrillaProductos productos={productos} />
    </section>
  );
}
