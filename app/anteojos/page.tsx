import type { Metadata } from "next";
import GrillaProductos from "@/components/GrillaProductos";
import MensajesConfianza from "@/components/MensajesConfianza";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";

export const revalidate = 60;

// Sin atributos ópticos en el texto fijo: lo que tenga cada modelo lo dice su
// ficha, cargado en Airtable. Acá solo lo que es cierto para todos.
const DESCRIPCION =
  "Todos los modelos de anteojos Harper, con sus colores y precios. Comprá online y pagá con Mercado Pago.";

export const metadata: Metadata = {
  title: "Anteojos",
  description: DESCRIPCION,
  alternates: { canonical: "/anteojos" },
  openGraph: {
    title: "Anteojos · Harper",
    description: DESCRIPCION,
    type: "website",
  },
};

export default async function Anteojos() {
  const [productos, config] = await Promise.all([getProductos("Anteojos"), getConfig()]);

  return (
    <section className="contenedor seccion seccion--pagina">
      <div className="seccion__cabecera">
        <h1 className="titulo">Anteojos</h1>
      </div>
      <GrillaProductos productos={productos} precargar={4} />
      <MensajesConfianza mensajes={mensajesDeConfianza(config)} variante="tira" />
    </section>
  );
}
