import type { Metadata } from "next";
import Link from "next/link";
import VaciarCarrito from "@/components/carrito/VaciarCarrito";
import EsperarPago from "@/components/EsperarPago";
import EventoPixel from "@/components/EventoPixel";
import { getConfig } from "@/lib/config";
import { buscarPedido } from "@/lib/pedidos";
import { ESTADOS_CONFIRMADOS } from "@/lib/webhook-decision";

export const metadata: Metadata = {
  title: "Gracias por tu compra",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const RECHAZADOS = new Set(["rechazado", "cancelado"]);

export default async function Gracias({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const params = await searchParams;
  const numero = params.pedido;

  const [config, pedido] = await Promise.all([
    getConfig(),
    numero ? buscarPedido(numero) : Promise.resolve(null),
  ]);

  // Airtable es la única verdad: lo escribe el webhook después de preguntarle
  // el estado a Mercado Pago. Lo que viene en la URL lo controla el navegador,
  // así que no sirve ni como pista. Mientras el pedido figure "pendiente", la
  // página se actualiza sola hasta que el webhook lo confirme.
  const estado = pedido?.estado;
  const rechazado = estado ? RECHAZADOS.has(estado) : false;
  const confirmado = estado ? ESTADOS_CONFIRMADOS.has(estado) : false;

  const titulo = rechazado
    ? "El pago no se acreditó"
    : confirmado
      ? "Gracias por tu compra"
      : "Estamos confirmando tu pago";

  return (
    <>
    {confirmado && pedido ? (
      <EventoPixel evento="Purchase" data={{ value: pedido.total, currency: "ARS", content_type: "product" }} />
    ) : null}
    <section
      className="contenedor pila"
      style={{
        paddingBlock: "6rem",
        gap: "1.5rem",
        alignItems: "flex-start",
        maxWidth: "38rem",
      }}
    >
      {/* El carrito se vacía recién con el pago confirmado. Si Mercado Pago lo
          rechaza, o todavía no contestó, el comprador conserva lo que armó. */}
      {confirmado ? <VaciarCarrito /> : null}

      <h1 className="titulo">{titulo}</h1>

      {numero ? (
        <p>
          Tu pedido es <strong style={{ fontWeight: 500 }}>{numero}</strong>.
        </p>
      ) : null}

      {rechazado ? (
        <>
          <p className="apagado">
            Mercado Pago rechazó el pago, así que no te cobramos nada. Podés
            probar de nuevo con otro medio de pago: tu carrito quedó como estaba.
          </p>
          <Link href="/checkout" className="boton" style={{ marginTop: "1rem" }}>
            Reintentar el pago
          </Link>
        </>
      ) : (
        <>
          <p className="apagado">
            {confirmado
              ? "Te mandamos la confirmación por mail con el detalle y ya preparamos el envío."
              : "Estamos esperando que Mercado Pago nos confirme el pago. Apenas se acredite te llega el mail con el detalle y preparamos el envío."}
          </p>

          {!confirmado ? <EsperarPago /> : null}

          <p className="apagado" style={{ fontSize: "0.875rem" }}>
            Si no ves el mail en unos minutos, revisá la carpeta de spam o
            escribinos a{" "}
            <a href={`mailto:${config.emailContacto}`} style={{ textDecoration: "underline" }}>
              {config.emailContacto}
            </a>
            {numero ? " con el número de pedido" : ""}.
          </p>

          <Link href="/" className="boton" style={{ marginTop: "1rem" }}>
            Volver a la tienda
          </Link>
        </>
      )}
    </section>
  </>
  );
}
