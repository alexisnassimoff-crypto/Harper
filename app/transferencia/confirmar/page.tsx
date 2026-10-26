import type { Metadata } from "next";
import { getRecord, TABLAS } from "@/lib/airtable";
import { aNumero, precio as formatearPrecio } from "@/lib/formato";
import { fechaDeVencimiento, esPedidoPorTransferencia, venceLaTransferencia } from "@/lib/transferencia";
import { firmaValida, pedidoPorNumero } from "@/lib/transferencia-servidor";
import type { ItemResuelto } from "@/lib/tipos";
import { ESTADOS_CONFIRMADOS } from "@/lib/webhook-decision";

export const metadata: Metadata = {
  title: "Confirmar transferencia",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Lo que vuelve de la confirmación (ver app/api/transferencia/confirmar). */
const RESULTADOS: Record<string, { texto: string; error?: boolean }> = {
  confirmada: { texto: "Listo: el pago quedó confirmado. Se descontó el stock y al comprador le llegó la confirmación." },
  "ya-confirmada": { texto: "Este pedido ya estaba confirmado: no se hizo nada de nuevo." },
  cerrado: { texto: "El pedido está cancelado: no se confirmó. Si llegó la transferencia, pasalo a «pendiente» en Airtable y volvé a abrir este enlace.", error: true },
  revisar: { texto: "No se pudo terminar: el pedido quedó marcado para revisar en Airtable (te llegó un aviso).", error: true },
  reintentar: { texto: "No se pudo terminar por un problema momentáneo. Esperá dos minutos y volvé a confirmar: retoma lo que faltó, sin repetir nada.", error: true },
};

/**
 * La página a la que lleva el enlace del aviso interno (y de Notas en
 * Airtable): muestra el pedido y un botón. Abrirla no confirma nada; el botón
 * hace un POST.
 */
export default async function ConfirmarTransferencia({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; firma?: string; resultado?: string; detalle?: string }>;
}) {
  const { pedido: numero, firma, resultado, detalle } = await searchParams;

  if (!numero || !firmaValida(numero, firma)) {
    return (
      <Marco>
        <h1 className="titulo">Enlace inválido</h1>
        <p className="apagado">Abrí el enlace completo del aviso de la transferencia, o el que está en Notas del pedido en Airtable.</p>
      </Marco>
    );
  }

  const pedido = await pedidoPorNumero(numero).catch(() => null);

  if (!pedido || !esPedidoPorTransferencia(pedido.fields)) {
    return (
      <Marco>
        <h1 className="titulo">No encontré el pedido</h1>
        <p className="apagado">El pedido {numero} no existe o no es por transferencia.</p>
      </Marco>
    );
  }

  const f = pedido.fields;
  const estado = f.Estado ?? "pendiente";
  const confirmado = ESTADOS_CONFIRMADOS.has(estado);
  const cerrado = estado === "cancelado" || estado === "rechazado";
  const total = f.Total ?? 0;

  let items: ItemResuelto[] = [];
  try {
    const parseado: unknown = JSON.parse(f.Items ?? "[]");
    if (Array.isArray(parseado)) items = parseado as ItemResuelto[];
  } catch {
    // Sin ítems legibles se confirma igual; la lista queda vacía.
  }

  const [cliente, faltantes] = await Promise.all([
    f.Cliente?.[0]
      ? getRecord<{ Nombre?: string; Email?: string }>(TABLAS.clientes, f.Cliente[0]).catch(() => null)
      : Promise.resolve(null),
    confirmado || cerrado ? Promise.resolve([]) : stockQueFalta(items),
  ]);

  const creado = f.Fecha ? new Date(f.Fecha) : null;
  const vence = creado && !Number.isNaN(creado.getTime()) ? venceLaTransferencia(creado) : null;
  const vencido = vence ? Date.now() > vence.getTime() : false;
  const aviso = resultado ? RESULTADOS[resultado] : undefined;

  return (
    <Marco>
      <h1 className="titulo">Transferencia — {numero}</h1>

      {aviso ? (
        <p role="status" style={{ color: aviso.error ? "var(--alerta)" : "var(--verde)" }}>
          {aviso.texto}
          {aviso.error && detalle ? ` (${detalle})` : ""}
        </p>
      ) : null}

      <div className="datos-transferencia">
        <div className="datos-transferencia__importe">
          <div>
            <span className="label">{confirmado ? "Cobrado" : "Tenés que recibir"}</span>
            <strong>{formatearPrecio(total)}</strong>
          </div>
          <span className="label">{estado}</span>
        </div>
        <dl className="datos-transferencia__lista">
          <div>
            <dt>Comprador</dt>
            <dd>{[cliente?.fields.Nombre, cliente?.fields.Email].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
          <div>
            <dt>Pedido</dt>
            <dd>{items.map((i) => `${i.cantidad}× ${i.nombre} ${i.color}`).join(" · ") || "—"}</dd>
          </div>
          {vence ? (
            <div>
              <dt>Vence</dt>
              <dd>{fechaDeVencimiento(vence)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {confirmado ? (
        <p className="apagado">El pago ya está confirmado. Este enlace no vuelve a hacer nada.</p>
      ) : cerrado ? (
        <p className="apagado">
          El pedido está {estado}. Si llegó la transferencia, pasalo a «pendiente» en Airtable y volvé a abrir este enlace.
        </p>
      ) : (
        <>
          {vencido ? (
            <p style={{ color: "var(--alerta)" }}>
              El plazo de 24 horas ya venció. Confirmalo solo si la transferencia llegó.
            </p>
          ) : null}

          {faltantes.length > 0 ? (
            <p style={{ color: "var(--alerta)" }}>
              Ojo, falta stock: {faltantes.join(" · ")}. Si confirmás, el stock queda en 0 y hay que resolverlo con el comprador.
            </p>
          ) : null}

          <form method="post" action="/api/transferencia/confirmar" className="pila" style={{ gap: "0.75rem", alignItems: "flex-start" }}>
            <input type="hidden" name="pedido" value={numero} />
            <input type="hidden" name="firma" value={firma} />
            <button type="submit" className="boton">
              Confirmar que recibí {formatearPrecio(total)}
            </button>
          </form>

          <p className="apagado" style={{ fontSize: "0.875rem" }}>
            Al confirmar, el pedido pasa a «pagado», se descuenta el stock, al comprador le llega la confirmación de la
            compra y a vos el aviso de venta para prepararla. Confirmá solo cuando veas la plata en la cuenta.
          </p>
        </>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <section className="contenedor pila" style={{ paddingBlock: "5rem", gap: "1.25rem", alignItems: "flex-start", maxWidth: "38rem" }}>
      {children}
    </section>
  );
}

/** Las variantes que hoy no alcanzan para el pedido (el stock no se reservó). */
async function stockQueFalta(items: ItemResuelto[]): Promise<string[]> {
  const porVariante = new Map<string, { item: ItemResuelto; cantidad: number }>();
  for (const item of items) {
    const previo = porVariante.get(item.varianteId);
    porVariante.set(item.varianteId, { item, cantidad: (previo?.cantidad ?? 0) + item.cantidad });
  }

  const faltan = await Promise.all(
    [...porVariante.entries()].map(async ([varianteId, { item, cantidad }]) => {
      try {
        const variante = await getRecord<{ Stock?: number }>(TABLAS.variantes, varianteId);
        const stock = aNumero(variante.fields.Stock, 0);
        return stock < cantidad ? `${item.nombre} ${item.color}: quedan ${stock}, el pedido lleva ${cantidad}` : null;
      } catch {
        return null;
      }
    })
  );
  return faltan.filter((f): f is string => f !== null);
}
