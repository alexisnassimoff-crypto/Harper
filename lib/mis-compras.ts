import { escaparFormula, listRecords, TABLAS } from "./airtable";

/**
 * «Mis compras» de Mi cuenta Harper (Ale, 05/11/2026): los pedidos del
 * cliente, con fecha, productos, importe y estado. Solo lee: no toca el
 * checkout, los pagos ni el cashback.
 *
 * Privacidad: los pedidos salen únicamente de la ficha de Clientes cuyo mail
 * es exactamente el mail verificado de la sesión (el del suscriptor, que
 * entró con el código). De esa ficha se toman sus pedidos enlazados y, al
 * leerlos, se vuelve a comprobar que cada uno esté enlazado a esa misma
 * ficha. Nunca se busca por texto parecido ni por otro dato (DNI, nombre,
 * dirección), y de cada pedido se muestra solo lo de la compra: nada de la
 * dirección, el teléfono ni los datos de facturación.
 *
 * No se muestran los checkouts que no llegaron a pagarse ni los pagos
 * rechazados: no son compras. Un pago que Mercado Pago está revisando sí,
 * como «Pago en revisión».
 */

export type EstadoDeCompra = "en-revision" | "pagado" | "preparando" | "enviado" | "entregado" | "cancelado";

export type ItemDeCompra = {
  nombre: string;
  /** El color, si lo tiene ("Carey"). */
  color: string | null;
  cantidad: number;
  /** Lo que pagó por ese renglón, en pesos. */
  subtotal: number;
  /** La foto chica del producto (una ruta del sitio o https), o null. */
  foto: string | null;
  /** Para volver a la ficha; null si no se sabe. */
  slug: string | null;
};

export type Compra = {
  id: string;
  numero: string;
  /** ISO; null si el pedido no tiene fecha. */
  fecha: string | null;
  estado: EstadoDeCompra;
  items: ItemDeCompra[];
  total: number;
  envio: number;
  /** El número de seguimiento del envío, cuando está cargado. */
  tracking: string | null;
};

/** Lo único que se lee de cada pedido. */
export type FilaPedidoDeCompra = {
  Numero?: string;
  Estado?: string;
  Cliente?: string[];
  Items?: string;
  Total?: number;
  Envio?: number;
  Fecha?: string;
  MP_status?: string;
  Tracking?: string;
};

type FilaClienteDeCompra = { Email?: string; Pedidos?: string[] };

/** Los estados de Mercado Pago de un pago que todavía se puede aprobar. */
const PAGO_EN_REVISION = new Set(["pending", "in_process", "authorized", "in_mediation"]);

const ES_ID = /^rec[A-Za-z0-9]{14}$/;

/** Cuántos pedidos se muestran como mucho: los más recientes. */
export const MAXIMO_DE_COMPRAS = 30;

/** El estado que ve el cliente, o null si el pedido no es una compra (sin pagar o rechazado). */
export function estadoDeCompra(estado: unknown, mpStatus: unknown): EstadoDeCompra | null {
  const e = String(estado ?? "").trim().toLowerCase();
  if (e === "pagado" || e === "preparando" || e === "enviado" || e === "entregado" || e === "cancelado") return e;
  if (e === "pendiente" && PAGO_EN_REVISION.has(String(mpStatus ?? "").trim())) return "en-revision";
  return null;
}

const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : Number(valor));
const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/** Las fotos que puede mostrar next/image (next.config.ts): del sitio o de los dominios permitidos. */
function fotoPermitida(foto: string): boolean {
  if (foto.startsWith("/") && !foto.startsWith("//")) return true;
  try {
    const url = new URL(foto);
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".public.blob.vercel-storage.com") || url.hostname === "v5.airtableusercontent.com" || url.hostname === "dl.airtable.com")
    );
  } catch {
    return false;
  }
}

/**
 * Los productos del pedido, del JSON que escribe el checkout en Items. Si el
 * JSON no se puede leer, lista vacía (el pedido igual se muestra con su total).
 */
export function itemsDeCompra(json: unknown): ItemDeCompra[] {
  if (typeof json !== "string" || !json.trim()) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((i): ItemDeCompra[] => {
    if (!i || typeof i !== "object") return [];
    const d = i as Record<string, unknown>;
    const cantidad = Math.max(1, Math.round(numero(d.cantidad) || 1));
    const subtotal = numero(d.subtotal);
    const unitario = numero(d.precioUnitario);
    const foto = texto(d.foto);
    const slug = texto(d.productoSlug);
    return [
      {
        nombre: texto(d.nombre) ?? "Producto",
        color: texto(d.color),
        cantidad,
        subtotal: Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : Number.isFinite(unitario) ? unitario * cantidad : 0,
        foto: foto && fotoPermitida(foto) ? foto : null,
        slug: slug && /^[a-z0-9-]+$/.test(slug) ? slug : null,
      },
    ];
  });
}

/** Un pedido como compra para mostrar, o null si no lo es. */
export function compraDe(fila: { id: string; createdTime?: string; fields: FilaPedidoDeCompra }): Compra | null {
  const estado = estadoDeCompra(fila.fields.Estado, fila.fields.MP_status);
  if (!estado) return null;
  const total = numero(fila.fields.Total);
  const envio = numero(fila.fields.Envio);
  return {
    id: fila.id,
    numero: texto(fila.fields.Numero) ?? "",
    fecha: texto(fila.fields.Fecha) ?? texto(fila.createdTime),
    estado,
    items: itemsDeCompra(fila.fields.Items),
    total: Number.isFinite(total) ? total : 0,
    envio: Number.isFinite(envio) ? envio : 0,
    tracking: texto(fila.fields.Tracking),
  };
}

/**
 * De los pedidos leídos, las compras de esas fichas de cliente y de nadie
 * más (cada pedido tiene que estar enlazado a una de ellas), de la más nueva
 * a la más vieja.
 */
export function comprasDeLosClientes(
  idsDeClientes: ReadonlySet<string>,
  filas: { id: string; createdTime?: string; fields: FilaPedidoDeCompra }[],
  maximo = MAXIMO_DE_COMPRAS,
): Compra[] {
  return filas
    .filter((f) => (f.fields.Cliente ?? []).some((id) => idsDeClientes.has(id)))
    .map(compraDe)
    .filter((c): c is Compra => c !== null)
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
    .slice(0, maximo);
}

/**
 * Las compras de la cuenta, por su mail verificado. Una consulta para la
 * ficha de cliente con ese mail exacto y otra (o pocas) para sus pedidos.
 */
export async function comprasDeLaCuenta(emailVerificado: string, maximo = MAXIMO_DE_COMPRAS): Promise<Compra[]> {
  const mail = emailVerificado.trim().toLowerCase();
  if (!mail || !mail.includes("@")) return [];

  const clientes = await listRecords<FilaClienteDeCompra>(TABLAS.clientes, {
    filterByFormula: `LOWER({Email}) = '${escaparFormula(mail)}'`,
    revalidate: 0,
  });
  // Doble control: la fórmula ya filtra, pero solo vale el mail idéntico.
  const propios = clientes.filter((c) => (c.fields.Email ?? "").trim().toLowerCase() === mail);
  const idsDeClientes = new Set(propios.map((c) => c.id));
  // Los más recientes quedan al final del enlace: alcanza con los últimos.
  const idsDePedidos = [...new Set(propios.flatMap((c) => c.fields.Pedidos ?? []))].filter((id) => ES_ID.test(id)).slice(-100);
  if (idsDePedidos.length === 0) return [];

  const lotes: string[][] = [];
  for (let i = 0; i < idsDePedidos.length; i += 50) lotes.push(idsDePedidos.slice(i, i + 50));
  const filas = (
    await Promise.all(
      lotes.map((lote) =>
        listRecords<FilaPedidoDeCompra>(TABLAS.pedidos, {
          filterByFormula: `OR(${lote.map((id) => `RECORD_ID() = '${id}'`).join(", ")})`,
          revalidate: 0,
        }),
      ),
    )
  ).flat();

  return comprasDeLosClientes(idsDeClientes, filas, maximo);
}

/** Las cuatro etapas de un pedido pagado, en orden (Ale, 05/11/2026). */
export const ETAPAS_DE_COMPRA = ["pagado", "preparando", "enviado", "entregado"] as const;
export type EtapaDeCompra = (typeof ETAPAS_DE_COMPRA)[number];

/**
 * El recorrido del pedido para «Mis compras», solo con el Estado de Airtable:
 * la etapa en la que está es «actual» y las anteriores, «hecha» (un pedido
 * enviado ya se pagó y se preparó). Sin fechas ni pasos que el Estado no
 * diga. Un pago en revisión y un pedido cancelado no tienen recorrido: null.
 */
export function etapasDeCompra(estado: EstadoDeCompra): { etapa: EtapaDeCompra; paso: "hecha" | "actual" | "pendiente" }[] | null {
  const actual = ETAPAS_DE_COMPRA.indexOf(estado as EtapaDeCompra);
  if (actual < 0) return null;
  return ETAPAS_DE_COMPRA.map((etapa, i) => ({ etapa, paso: i < actual ? "hecha" : i === actual ? "actual" : "pendiente" }));
}

/**
 * Los operadores cuyos enlaces de seguimiento se ofrecen como «Seguir mi
 * envío»: solo https y solo estos dominios. Un enlace de otro sitio no se
 * muestra como enlace (queda el texto para copiar).
 */
const OPERADORES = ["correoargentino.com.ar", "andreani.com", "oca.com.ar", "envia.com"];

/**
 * El seguimiento del pedido, del campo Tracking de Airtable: un número para
 * copiar o, si lo que hay es un enlace de un operador conocido, ese enlace
 * para «Seguir mi envío». No se arma ningún enlace a partir del número.
 */
export function seguimientoDe(tracking: string | null): { numero: string | null; enlace: string | null } {
  const valor = (tracking ?? "").trim();
  if (!valor) return { numero: null, enlace: null };
  if (/^https?:\/\//i.test(valor)) {
    try {
      const url = new URL(valor);
      const host = url.hostname.toLowerCase();
      const delOperador = OPERADORES.some((d) => host === d || host.endsWith(`.${d}`));
      return url.protocol === "https:" && delOperador ? { numero: null, enlace: url.toString() } : { numero: null, enlace: null };
    } catch {
      return { numero: null, enlace: null };
    }
  }
  // Un número de seguimiento: letras, números, guiones y espacios, como lo da el operador.
  return /^[A-Za-z0-9][A-Za-z0-9 \-]{2,63}$/.test(valor) ? { numero: valor, enlace: null } : { numero: null, enlace: null };
}
