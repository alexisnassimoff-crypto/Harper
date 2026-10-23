import type { Metadata } from "next";
import GrillaProductos from "@/components/GrillaProductos";
import { getProductos } from "@/lib/catalogo";

export const revalidate = 60;

// Lo que cada paño hace o no hace lo dice su descripción en Airtable; el texto
// fijo de la página no afirma nada que no se pueda verificar.
const DESCRIPCION =
  "Paños de microfibra Harper para la limpieza de cristales. Comprá online y pagá con Mercado Pago.";

export const metadata: Metadata = {
  title: "Paños",
  description: DESCRIPCION,
  alternates: { canonical: "/panos" },
  openGraph: {
    title: "Paños · Harper",
    description: DESCRIPCION,
    type: "website",
  },
};

export default async function Panos() {
  const productos = await getProductos("Paños");

  return (
    <section className="contenedor seccion seccion--pagina">
      <div className="seccion__cabecera">
        <h1 className="titulo">Paños</h1>
      </div>
      <GrillaProductos productos={productos} precargar={3} />
    </section>
  );
}
