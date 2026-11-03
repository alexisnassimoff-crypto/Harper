import type { Metadata } from "next";
import FormularioCheckout from "@/components/checkout/FormularioCheckout";
import { getProductos } from "@/lib/catalogo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { cuotasDeTodosYSuscriptores } from "@/lib/cuotas-servidor";
import { direccionesDisponibles } from "@/lib/direcciones-servidor";
import { leerMedioPago } from "@/lib/dinero-mp";
import { puedeCotizar } from "@/lib/envia";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default async function PaginaCheckout({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; medio?: string }>;
}) {
  const { error, medio } = await searchParams;
  // Si el pago rechazado era con dinero en Mercado Pago, vuelve con esa opción elegida.
  const conDineroMP = leerMedioPago(medio) === "dineroMP";
  // Sin Envia (o sin origen o transportistas en Config), el checkout no
  // intenta cotizar y se ve como siempre, con la tarifa plana.
  const [config, productos] = await Promise.all([getConfig(), getProductos()]);
  const cotizaEnvio = puedeCotizar(config);
  // Las 6 cuotas de suscriptor, para nombrarlas en la invitación a
  // suscribirse solo si Mercado Pago las confirma (Ale, 03/11/2026).
  const { suscriptores: cuotasSuscriptor } = await cuotasDeTodosYSuscriptores(
    productos.filter((p) => esCategoriaDeAnteojos(p.categoria)).map((p) => p.precio),
    2_000
  );

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
          {conDineroMP
            ? "El pago no se pudo completar y no te cobramos nada. Revisá que tengas saldo en tu cuenta de Mercado Pago o probá con otro medio de pago."
            : "El pago no se pudo completar y no te cobramos nada. Revisá los datos de la tarjeta o probá con otro medio de pago."}
        </p>
      ) : null}

      {/* Con Google Places configurado, la dirección es un solo casillero con
          sugerencias; sin él, los campos de siempre. Se decide en el servidor
          para que el formulario no tenga que averiguarlo con una consulta. */}
      <FormularioCheckout
        reintento={error === "pago"}
        buscador={direccionesDisponibles()}
        cotizaEnvio={cotizaEnvio}
        medioInicial={conDineroMP ? "dineroMP" : "mercadopago"}
        cuotasSuscriptor={cuotasSuscriptor}
      />
    </section>
  );
}
