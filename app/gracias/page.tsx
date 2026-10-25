import type { Metadata } from "next";
import Link from "next/link";
import VaciarCarrito from "@/components/carrito/VaciarCarrito";
import EsperarPago from "@/components/EsperarPago";
import EventoPixel from "@/components/EventoPixel";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { getConfig } from "@/lib/config";
import { buscarPedido } from "@/lib/pedidos";
import { datosDeCompra, idEventoCompra } from "@/lib/pixel";
import { ESTADOS_CONFIRMADOS } from "@/lib/webhook-decision";
import { enlaceWhatsApp, mensajeGraduadosPedido, TEXTO_GRADUADOS_PEDIDO } from "@/lib/whatsapp";

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

  // Con la compra confirmada y algún armazón que admite cristales graduados,
  // una invitación a consultar. Solo el número de pedido viaja en el mensaje.
  const llevaArmazonGraduable =
    confirmado && pedido
      ? pedido.items.some((i) => i.categoria !== null && caracteristicasDe({ slug: i.productoSlug, categoria: i.categoria }) !== null)
      : false;
  const enlaceGraduados = llevaArmazonGraduable
    ? enlaceWhatsApp(config.whatsapp, mensajeGraduadosPedido(pedido?.numero ?? numero))
    : null;

  return (
    <>
    {/* Purchase solo con el pago confirmado en Airtable. Mismo event_id que
        manda el webhook por la Conversions API, y una sola vez por pedido en
        este navegador: recargar no es otra compra. */}
    {confirmado && pedido ? (
      <EventoPixel
        evento="Purchase"
        data={datosDeCompra({ items: pedido.items, valor: pedido.subtotal })}
        eventID={idEventoCompra(pedido.numero)}
        unaVez={`harper.compra.${pedido.numero}`}
      />
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

          {enlaceGraduados ? (
            <div className="invitacion-graduados">
              <p>{TEXTO_GRADUADOS_PEDIDO}</p>
              <a
                href={enlaceGraduados}
                target="_blank"
                rel="noopener noreferrer"
                className="boton boton--fantasma boton--chico"
                style={{ justifySelf: "start" }}
              >
                Consultar por WhatsApp
              </a>
            </div>
          ) : null}

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
