import type { Metadata } from "next";
import Link from "next/link";
import VaciarCarrito from "@/components/carrito/VaciarCarrito";
import { getConfig } from "@/lib/config";
import { buscarPedido } from "@/lib/pedidos";

export const metadata: Metadata = {
  title: "Gracias por tu compra",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Estados de Airtable en los que la venta ya está confirmada. */
const CONFIRMADOS = new Set(["pagado", "preparando", "enviado", "entregado"]);
const RECHAZADOS = new Set(["rechazado", "cancelado"]);

export default async function Gracias({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; status?: string; collection_status?: string }>;
}) {
  const params = await searchParams;
  const numero = params.pedido;

  const [config, pedido] = await Promise.all([
    getConfig(),
    numero ? buscarPedido(numero) : Promise.resolve(null),
  ]);

  // Airtable es la verdad, porque lo escribe el webhook después de preguntarle
  // el estado a Mercado Pago. Lo que viene en la URL lo controla el navegador.
  //
  // Pero el redirect suele ganarle la carrera al webhook, así que un pedido
  // recién pagado todavía figura "pendiente". Para ese hueco —y solo para ese—
  // se usa el estado que Mercado Pago agrega a la URL como pista: sirve para
  // felicitar antes de tiempo, nunca para contradecir un rechazo.
  const estado = pedido?.estado;
  const pistaMP = params.collection_status ?? params.status;

  const rechazado = estado ? RECHAZADOS.has(estado) : false;
  const confirmado =
    (estado ? CONFIRMADOS.has(estado) : false) || (!rechazado && pistaMP === "approved");

  const titulo = rechazado
    ? "El pago no se acreditó"
    : confirmado
      ? "Gracias por tu compra"
      : "Estamos confirmando tu pago";

  return (
    <section
      className="contenedor pila"
      style={{
        paddingBlock: "6rem",
        gap: "1.5rem",
        alignItems: "flex-start",
        maxWidth: "38rem",
      }}
    >
      {/* Si el pago no se acreditó, el carrito se conserva para reintentar. */}
      {rechazado ? null : <VaciarCarrito />}

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
              ? `Te mandamos la confirmación por mail con el detalle. Preparamos el envío y llega en ${config.plazoEntrega}.`
              : "Estamos esperando que Mercado Pago nos confirme el pago. Apenas se acredite te llega el mail con el detalle y preparamos el envío."}
          </p>

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
  );
}
