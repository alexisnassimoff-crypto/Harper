import type { Metadata } from "next";
import FormularioCheckout from "@/components/checkout/FormularioCheckout";
import { direccionesDisponibles } from "@/lib/direcciones-servidor";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default async function PaginaCheckout({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // InitiateCheckout lo dispara el formulario, cuando el carrito ya está
  // resuelto (con valor e ítems) y solo si de verdad hay algo para comprar y
  // no es la vuelta de un pago rechazado.
  return (
    <section className="contenedor checkout">
      <h1 className="titulo titulo--chico checkout__titulo">Finalizar compra</h1>

      {/* Es a donde vuelve el cliente cuando Mercado Pago rechaza el pago.
          Sin este aviso se encontraba con un formulario en blanco y ninguna
          explicación de qué había pasado. */}
      {error === "pago" ? (
        <p role="alert" className="checkout__aviso">
          El pago no se pudo completar y no te cobramos nada. Revisá los datos
          de la tarjeta o probá con otro medio de pago.
        </p>
      ) : null}

      {/* Con Google Places configurado, la dirección es un solo casillero con
          sugerencias; sin él, los campos de siempre. Se decide en el servidor
          para que el formulario no tenga que averiguarlo con una consulta. */}
      <FormularioCheckout reintento={error === "pago"} buscador={direccionesDisponibles()} />
    </section>
  );
}
