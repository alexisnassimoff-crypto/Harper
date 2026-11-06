import { createHash } from "node:crypto";
import { createRecord, ErrorAirtable, escaparFormula, getRecord, listRecords, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { ErrorCerrojo, soltarSinFallar, tomarConEspera, type Cerrojo } from "./cerrojo";
import { esCategoriaDeAnteojos } from "./categorias";
import { CreditoApagado, filaDelRegistro, puedeEscribirCreditos, type CamposCredito } from "./credito-airtable";
import { saldosDeLaCuenta, type FilaCredito } from "./credito-persistencia";
import { cobroCertificado, type CobroDelPedido, type LectorMercadoPago } from "./mp-cobro";
import { MINUTOS_RESERVA, repartir } from "./suscriptores";
import type { ItemResuelto } from "./tipos";
import { ESTADOS_CONFIRMADOS } from "./webhook-decision";
import type { Reloj } from "./webhook-lock";

/**
 * Crédito Harper, paso 4: usar el crédito Disponible en el checkout, solo en
 * anteojos (docs/plan-programa-harper.md §1, punto 6). Todo detrás de
 * HARPER_CREDITO_ACTIVO: apagado, el checkout es el de siempre.
 *
 * Cada uso es una fila en «Créditos», aparte de los créditos ganados: Clave
 * `uso-credito-harper:<pedido>`, el Monto usado y un Estado propio:
 *  - «Reservado»: el pedido se creó y espera el pago (cuenta como usado);
 *  - «Usado»: el pago se acreditó (lo confirma el webhook, o el pedido en $ 0);
 *  - «Liberado»: el pedido no se pagó (vencido, rechazado sin reintento o
 *    cancelado): vuelve a estar disponible;
 *  - «A revisar»: el pedido se reembolsó o se perdió un contracargo. Sigue
 *    contando como usado hasta que Harper decida (la regla de devolución está
 *    pendiente de la revisión legal, §14 L1 y L5);
 *  - «Devuelto»: Harper decidió devolverlo. Solo lo marca Harper.
 *
 * Contra dos compras a la vez: un cerrojo por CUENTA (el mail) en Redis,
 * obligatorio. Adentro se lee todo de nuevo (lo ganado, lo usado y lo
 * reservado) y la reserva queda escrita antes de soltarlo: la segunda compra
 * la ve. Sin Redis no se usa crédito. Lo que se puede usar es
 *   Disponible ganado − Usado − A revisar − Reservado vigente,
 * nunca menos de 0.
 */

export const PREFIJO_USO = "uso-credito-harper:";
export const REGLAS_USO = "uso-credito-harper-v1";
export const claveDelUso = (numero: string) => `${PREFIJO_USO}${numero.trim()}`;
export const esClaveDeUso = (clave: unknown) => typeof clave === "string" && clave.trim().startsWith(PREFIJO_USO);

export type EstadoUso = "Reservado" | "Usado" | "Liberado" | "Devuelto" | "A revisar";
const ESTADOS_USO: readonly EstadoUso[] = ["Reservado", "Usado", "Liberado", "Devuelto", "A revisar"];

export type FilaUso = {
  id: string;
  clave: string;
  /** El pedido que usó el crédito. */
  pedido: string;
  email: string;
  monto: number;
  estado: EstadoUso;
  /** ISO: cuándo se reservó. */
  generadoEl: string;
  notas: string;
  /** Una fila editada a mano que no se entiende: bloquea la cuenta hasta que Harper la revise. */
  rota: boolean;
};

/** De Airtable a un uso. Lo que no se entiende queda «rota»: nunca libera crédito. */
export function usoDelRegistro(r: AirtableRecord<CamposCredito>): FilaUso {
  const f = r.fields;
  const pedido = (f.Pedido ?? "").trim();
  const estado = ESTADOS_USO.find((e) => e === f.Estado) ?? null;
  const monto = typeof f.Monto === "number" && Number.isInteger(f.Monto) && f.Monto > 0 ? f.Monto : null;
  const rota = estado === null || monto === null || pedido === "" || (f.Clave ?? "").trim() !== claveDelUso(pedido);
  return {
    id: r.id,
    clave: (f.Clave ?? "").trim(),
    pedido,
    email: (f.Email ?? "").trim().toLowerCase(),
    monto: monto ?? 0,
    estado: estado ?? "A revisar",
    generadoEl: f.Generado_el || r.createdTime,
    notas: f.Notas ?? "",
    rota,
  };
}

// ---------- Dónde se guarda ----------

export interface AlmacenUsos {
  /** Los créditos ganados y los usos de un mail (sin cache). */
  cuenta(email: string): Promise<{ creditos: FilaCredito[]; usos: FilaUso[] }>;
  /** Los usos de un pedido (por su clave). */
  delPedido(numero: string): Promise<FilaUso[]>;
  crear(uso: Omit<FilaUso, "id" | "rota" | "clave">): Promise<FilaUso>;
  actualizar(id: string, cambios: { estado: EstadoUso; notas: string }): Promise<FilaUso>;
}

/** La tabla «Créditos»: escribe solo con el crédito prendido o en el Airtable de prueba. */
export const almacenUsosAirtable: AlmacenUsos = {
  async cuenta(email) {
    const mail = email.trim().toLowerCase();
    const filas = await listRecords<CamposCredito>(TABLAS.creditos, { filterByFormula: `LOWER({Email}) = '${escaparFormula(mail)}'`, revalidate: 0 });
    const propias = filas.filter((r) => (r.fields.Email ?? "").trim().toLowerCase() === mail);
    return {
      creditos: propias.filter((r) => !esClaveDeUso(r.fields.Clave)).map(filaDelRegistro),
      usos: propias.filter((r) => esClaveDeUso(r.fields.Clave)).map(usoDelRegistro),
    };
  },
  async delPedido(numero) {
    const clave = claveDelUso(numero);
    const filas = await listRecords<CamposCredito>(TABLAS.creditos, { filterByFormula: `{Clave} = '${escaparFormula(clave)}'`, revalidate: 0 });
    return filas.filter((r) => (r.fields.Clave ?? "").trim() === clave).map(usoDelRegistro);
  },
  async crear(uso) {
    if (!puedeEscribirCreditos()) throw new CreditoApagado();
    const fila = await createRecord<CamposCredito>(TABLAS.creditos, {
      Clave: claveDelUso(uso.pedido),
      Pedido: uso.pedido,
      Email: uso.email,
      Monto: uso.monto,
      Porcentaje: 0,
      Base: 0,
      Anteojos: 0,
      Estado: uso.estado,
      Generado_el: uso.generadoEl,
      Reglas: REGLAS_USO,
      Notas: uso.notas,
    });
    return usoDelRegistro(fila);
  },
  async actualizar(id, cambios) {
    if (!puedeEscribirCreditos()) throw new CreditoApagado();
    return usoDelRegistro(await updateRecord<CamposCredito>(TABLAS.creditos, id, { Estado: cambios.estado, Notas: cambios.notas }));
  },
};

/** Lo que importa del pedido para saber si su reserva sigue en pie. */
export type PedidoDeUnUso = { id: string; numero: string; estado: string; mpStatus: string; total: number; pagoRegistrado: string | null; fecha: number };

export interface LectorPedidosDeUsos {
  porNumero(numero: string): Promise<PedidoDeUnUso | null>;
  porId(id: string): Promise<PedidoDeUnUso | null>;
}

type FilaPedidoUso = { Numero?: string; Estado?: string; MP_status?: string; Total?: number; MP_payment_id?: string; Fecha?: string };

function pedidoDeUnUso(r: AirtableRecord<FilaPedidoUso>): PedidoDeUnUso {
  const fecha = Date.parse(r.fields.Fecha ?? r.createdTime);
  return {
    id: r.id,
    numero: (r.fields.Numero ?? "").trim(),
    estado: (r.fields.Estado ?? "").trim(),
    mpStatus: (r.fields.MP_status ?? "").trim(),
    total: typeof r.fields.Total === "number" ? r.fields.Total : Number.NaN,
    pagoRegistrado: r.fields.MP_payment_id?.trim() || null,
    fecha: Number.isFinite(fecha) ? fecha : Date.parse(r.createdTime),
  };
}

/** Lee Pedidos, sin cache. No escribe nada. */
export const lectorPedidosDeUsosAirtable: LectorPedidosDeUsos = {
  async porNumero(numero) {
    const n = numero.trim();
    const filas = await listRecords<FilaPedidoUso>(TABLAS.pedidos, { filterByFormula: `{Numero} = '${escaparFormula(n)}'`, revalidate: 0 });
    const propias = filas.filter((r) => (r.fields.Numero ?? "").trim() === n).map(pedidoDeUnUso);
    // Si hubiera dos con el mismo número, vale el más avanzado: nunca se libera por uno viejo.
    return propias.find((p) => ESTADOS_CONFIRMADOS.has(p.estado)) ?? propias[0] ?? null;
  },
  async porId(id) {
    try {
      return pedidoDeUnUso(await getRecord<FilaPedidoUso>(TABLAS.pedidos, id));
    } catch (error) {
      if (error instanceof ErrorAirtable && error.status === 404) return null;
      throw error;
    }
  },
};

// ---------- Cuánto se puede usar ----------

/** Mientras el link de pago cobra, más un margen: como el saldo de Suscriptores (lib/suscriptores-cuenta.ts). */
export const VENTANA_RESERVA_MS = (MINUTOS_RESERVA + 15) * 60_000;
/** Un pago todavía en revisión en Mercado Pago: se puede aprobar después. */
const PAGO_EN_REVISION = new Set(["pending", "in_process", "authorized", "in_mediation"]);

/**
 * Si una reserva sigue apartando crédito. Solo se libera cuando el pedido ya
 * no se puede pagar: cancelado, o pasada la ventana del link sin un pago en
 * revisión. Un pago rechazado dentro de la ventana la mantiene (se puede
 * reintentar con otra tarjeta).
 */
export function reservaVigente(uso: FilaUso, pedido: PedidoDeUnUso | null, ahora: number): boolean {
  if (uso.estado !== "Reservado") return false;
  const desde = Date.parse(uso.generadoEl);
  const reciente = !Number.isFinite(desde) || ahora - desde <= VENTANA_RESERVA_MS;
  if (!pedido) return reciente;
  if (ESTADOS_CONFIRMADOS.has(pedido.estado)) return true;
  if (pedido.estado === "cancelado") return false;
  if (PAGO_EN_REVISION.has(pedido.mpStatus)) return true;
  return reciente;
}

export type SaldoDeCredito = {
  /** Disponible ganado (créditos en «Disponible», uno por pedido). */
  ganado: number;
  /** Usado o en revisión por un reembolso: no se puede volver a usar. */
  usado: number;
  /** Apartado por pedidos que todavía se pueden pagar. */
  reservado: number;
  /** Lo que se puede usar ahora. Nunca negativo. */
  usable: number;
  /** Lo ganado no alcanza para lo usado (un crédito ganado que se anuló después de usarlo): Harper revisa. */
  sobregiro: number;
  /** Hay un uso editado a mano que no se entiende: no se usa crédito hasta revisarlo. */
  bloqueado: boolean;
  /** Reservas que ya no apartan nada (se marcan «Liberado» adentro del cerrojo). */
  vencidas: FilaUso[];
};

export function saldoDeCredito(datos: { creditos: readonly FilaCredito[]; usos: readonly FilaUso[] }, pedidos: ReadonlyMap<string, PedidoDeUnUso | null>, ahora: Date): SaldoDeCredito {
  const ganado = saldosDeLaCuenta([], datos.creditos, ahora).credito.disponible;
  const usado = datos.usos.filter((u) => u.estado === "Usado" || u.estado === "A revisar").reduce((t, u) => t + u.monto, 0);
  const reservas = datos.usos.filter((u) => u.estado === "Reservado");
  const vigentes = reservas.filter((u) => reservaVigente(u, pedidos.get(u.pedido) ?? null, ahora.getTime()));
  const reservado = vigentes.reduce((t, u) => t + u.monto, 0);
  const bloqueado = datos.usos.some((u) => u.rota);
  const neto = ganado - usado - reservado;
  return {
    ganado,
    usado,
    reservado,
    usable: bloqueado ? 0 : Math.max(0, neto),
    sobregiro: Math.max(0, -neto),
    bloqueado,
    vencidas: reservas.filter((u) => !vigentes.includes(u)),
  };
}

export type DependenciasUso = {
  almacen: AlmacenUsos;
  pedidos: LectorPedidosDeUsos;
  /** Obligatorio para usar o confirmar crédito: sin Redis, no se toca. */
  cerrojo: Cerrojo | null;
  reloj: Reloj;
  /** Cuánto se espera a otra compra de la misma cuenta. */
  esperaOcupadoMs?: number;
};

/** Lee la cuenta y el estado de los pedidos con reservas. Solo lectura. */
export async function leerSaldoDeCredito(
  email: string,
  deps: Pick<DependenciasUso, "almacen" | "pedidos" | "reloj">
): Promise<SaldoDeCredito & { usos: FilaUso[]; creditos: FilaCredito[] }> {
  const datos = await deps.almacen.cuenta(email);
  const conReserva = [...new Set(datos.usos.filter((u) => u.estado === "Reservado").map((u) => u.pedido))];
  const pedidos = new Map(await Promise.all(conReserva.map(async (n) => [n, await deps.pedidos.porNumero(n)] as const)));
  return { ...saldoDeCredito(datos, pedidos, new Date(deps.reloj.ahora())), usos: datos.usos, creditos: datos.creditos };
}

// ---------- El cerrojo de la cuenta ----------

export const TTL_CUENTA_CREDITO_MS = 60_000;
/** Pasado esto desde que se tomó la llave, ya no se escribe (pudo vencer). */
const MARGEN_CUENTA_MS = 15_000;
export const claveCuentaCredito = (email: string) => `harper:credito-cuenta:${createHash("sha256").update(email.trim().toLowerCase()).digest("base64url").slice(0, 24)}`;

export type CuentaOcupada = { estado: "ocupado" };
const linea = (ahora: number, texto: string) => `${new Date(ahora).toISOString()} · ${texto}`;
const conNota = (uso: FilaUso, ahora: number, texto: string) => [uso.notas.trim(), linea(ahora, texto)].filter(Boolean).join("\n");

/** Lo que tiene quien sostiene la cuenta: lo que puede usar y cómo reservarlo. */
export type CuentaTomada = {
  /** Lo que la cuenta puede usar ahora (se actualiza con cada reserva). */
  readonly saldo: SaldoDeCredito;
  /** Aparta `monto` para el pedido `numero`. Tira si ya no alcanza o si la llave pudo vencer. */
  reservar(numero: string, monto: number): Promise<FilaUso>;
  /** Confirma el uso del pedido (el pedido en $ 0, que no pasa por Mercado Pago). */
  confirmar(numero: string): Promise<ResultadoConfirmacion>;
  /**
   * Libera la reserva del pedido (no se pudo crear o pagar). Con
   * `tambienUsado` (solo el pedido en $ 0, que no tiene pago de Mercado Pago):
   * deshace también el «Usado» que se confirmó antes de que fallara.
   */
  liberar(numero: string, motivo: string, opciones?: { tambienUsado?: boolean }): Promise<void>;
};

/** El crédito ya no alcanza (otra compra lo usó): el comprador revisa el total. */
export class CreditoInsuficiente extends Error {
  constructor(readonly usable: number) {
    super(`El crédito disponible cambió (queda ${usable})`);
    this.name = "CreditoInsuficiente";
  }
}

/**
 * Toma la cuenta (cerrojo por mail) y, con la llave ya tomada, lee todo de
 * nuevo y marca «Liberado» las reservas vencidas. Sin Redis tira
 * `ErrorCerrojo`; si otra compra la tiene, devuelve «ocupado». Quien la abre
 * la cierra (`cerrar`, en un finally).
 */
export async function abrirCuentaDeCredito(email: string, deps: DependenciasUso): Promise<{ cuenta: CuentaTomada; cerrar: () => Promise<void> } | CuentaOcupada> {
  const mail = email.trim().toLowerCase();
  if (!mail.includes("@")) throw new RangeError("La cuenta del crédito necesita un mail");
  if (!deps.cerrojo) throw new ErrorCerrojo("Redis no está configurado: sin cerrojo no se usa crédito");
  const cerrojo = deps.cerrojo;
  const clave = claveCuentaCredito(mail);
  const nonce = await tomarConEspera(cerrojo, clave, TTL_CUENTA_CREDITO_MS, { esperaMaxMs: deps.esperaOcupadoMs ?? 8_000, reloj: deps.reloj });
  if (!nonce) return { estado: "ocupado" };
  const cerrar = () => soltarSinFallar(cerrojo, clave, nonce);
  const inicio = deps.reloj.ahora();
  const vigilar = () => {
    if (deps.reloj.ahora() - inicio > TTL_CUENTA_CREDITO_MS - MARGEN_CUENTA_MS) throw new ErrorCerrojo("La llave de la cuenta pudo vencer: no se escribe y se reintenta");
  };
  try {
    let leido = await leerSaldoDeCredito(mail, deps);
    for (const vencida of leido.vencidas) {
      await deps.almacen.actualizar(vencida.id, { estado: "Liberado", notas: conNota(vencida, deps.reloj.ahora(), "Liberado: el pedido no se pagó a tiempo.") });
    }
    if (leido.vencidas.length > 0) leido = await leerSaldoDeCredito(mail, deps);

    const cuenta: CuentaTomada = {
      get saldo() {
        return leido;
      },
      async reservar(numero, monto) {
        if (!Number.isInteger(monto) || monto <= 0) throw new RangeError("El crédito a usar tiene que ser un entero mayor que 0");
        vigilar();
        const n = numero.trim();
        if (leido.usos.some((u) => u.pedido === n)) throw new RangeError(`El pedido ${n} ya tiene un uso de crédito`);
        if (monto > leido.usable) throw new CreditoInsuficiente(leido.usable);
        const ahora = deps.reloj.ahora();
        const uso = await deps.almacen.crear({
          pedido: n,
          email: mail,
          monto,
          estado: "Reservado",
          generadoEl: new Date(ahora).toISOString(),
          notas: linea(ahora, `Reservado: ${monto} para el pedido ${n}, mientras se paga.`),
        });
        leido = { ...leido, usable: leido.usable - monto, reservado: leido.reservado + monto, usos: [...leido.usos, uso] };
        return uso;
      },
      async confirmar(numero) {
        vigilar();
        return confirmarAdentro(numero, mail, deps);
      },
      async liberar(numero, motivo, opciones) {
        await liberarAdentro(numero, mail, motivo, deps, opciones?.tambienUsado === true);
      },
    };
    return { cuenta, cerrar };
  } catch (error) {
    await cerrar();
    throw error;
  }
}

/** Corre `hacer` con la cuenta tomada y la suelta al terminar (ver abrirCuentaDeCredito). */
export async function conCuentaDeCredito<T>(email: string, deps: DependenciasUso, hacer: (cuenta: CuentaTomada) => Promise<T>): Promise<T | CuentaOcupada> {
  const abierta = await abrirCuentaDeCredito(email, deps);
  if ("estado" in abierta) return abierta;
  try {
    return await hacer(abierta.cuenta);
  } finally {
    await abierta.cerrar();
  }
}

// ---------- Confirmar, liberar y revisar ----------

export type ResultadoConfirmacion =
  | { estado: "confirmado" | "ya"; uso: FilaUso; sobregiro: number }
  | { estado: "sin-uso" }
  /** Harper ya decidió («Devuelto» o «A revisar»): no se toca. */
  | { estado: "decidido"; uso: FilaUso };

/** El uso de un pedido: el más viejo que no esté liberado (o el último, si todos lo están). */
function usoDelPedido(usos: readonly FilaUso[]): FilaUso | null {
  const ordenados = [...usos].sort((a, b) => a.generadoEl.localeCompare(b.generadoEl) || a.id.localeCompare(b.id));
  return ordenados.find((u) => u.estado !== "Liberado") ?? ordenados.at(-1) ?? null;
}

async function confirmarAdentro(numero: string, mail: string, deps: DependenciasUso): Promise<ResultadoConfirmacion> {
  const uso = usoDelPedido((await deps.almacen.delPedido(numero)).filter((u) => u.email === mail));
  if (!uso) return { estado: "sin-uso" };
  if (uso.estado === "Devuelto" || uso.estado === "A revisar") return { estado: "decidido", uso };
  const ahora = deps.reloj.ahora();
  const nuevo =
    uso.estado === "Usado"
      ? uso
      : await deps.almacen.actualizar(uso.id, {
          estado: "Usado",
          notas: conNota(uso, ahora, uso.estado === "Liberado" ? "Usado: el pago llegó después de liberar la reserva." : "Usado: el pago se acreditó."),
        });
  // Con el uso confirmado, ¿alcanza lo ganado? Si no (un pago tardío después de
  // liberar la reserva), queda el sobregiro para que Harper lo revise.
  const despues = await leerSaldoDeCredito(mail, deps);
  return { estado: uso.estado === "Usado" ? "ya" : "confirmado", uso: nuevo, sobregiro: despues.sobregiro };
}

async function liberarAdentro(numero: string, mail: string, motivo: string, deps: DependenciasUso, tambienUsado: boolean): Promise<void> {
  for (const uso of await deps.almacen.delPedido(numero)) {
    if (uso.email !== mail) continue;
    if (uso.estado !== "Reservado" && !(tambienUsado && uso.estado === "Usado")) continue;
    await deps.almacen.actualizar(uso.id, { estado: "Liberado", notas: conNota(uso, deps.reloj.ahora(), `Liberado: ${motivo}.`) });
  }
}

/** Con la cuenta del uso tomada (la del mail de su fila). */
async function conLaCuentaDelPedido<T>(numero: string, deps: DependenciasUso, hacer: (uso: FilaUso, cuenta: CuentaTomada) => Promise<T>): Promise<T | CuentaOcupada | { estado: "sin-uso" }> {
  const uso = usoDelPedido(await deps.almacen.delPedido(numero));
  if (!uso) return { estado: "sin-uso" };
  return conCuentaDeCredito(uso.email, deps, (cuenta) => hacer(uso, cuenta));
}

/** El pago se acreditó: «Usado». Idempotente. */
export async function confirmarUso(numero: string, deps: DependenciasUso): Promise<ResultadoConfirmacion | CuentaOcupada> {
  const r = await conLaCuentaDelPedido(numero, deps, (_uso, cuenta) => cuenta.confirmar(numero));
  return r;
}

/**
 * El pedido se reembolsó entero o se perdió un contracargo: el uso queda «A
 * revisar» y sigue contando como usado. Devolverlo o no lo decide Harper (la
 * regla está pendiente de la revisión legal): nunca se devuelve solo.
 */
export async function revisarUsoPorReembolso(numero: string, que: string, deps: DependenciasUso): Promise<{ estado: "a-revisar" | "ya" | "sin-uso"; uso?: FilaUso } | CuentaOcupada> {
  return conLaCuentaDelPedido(numero, deps, async (uso) => {
    const actual = usoDelPedido(await deps.almacen.delPedido(numero));
    if (!actual || actual.estado === "A revisar" || actual.estado === "Devuelto" || actual.estado === "Liberado") return { estado: "ya" as const, uso: actual ?? uso };
    const nuevo = await deps.almacen.actualizar(actual.id, { estado: "A revisar", notas: conNota(actual, deps.reloj.ahora(), `A revisar: ${que}. Harper decide si se devuelve.`) });
    return { estado: "a-revisar" as const, uso: nuevo };
  });
}

// ---------- En el carrito ----------

/**
 * El crédito sobre los anteojos (después del Dúo, de los tramos, del cupón y
 * del saldo de Suscriptores; antes del 10 % por dinero en Mercado Pago).
 * Nunca toca estuches, paños ni envío, ni pasa de lo que queda por pagar en
 * anteojos. Repartido entre los renglones de anteojos como el saldo.
 */
export function aplicarCreditoHarper(items: ItemResuelto[], monto: number): { items: ItemResuelto[]; credito: number; elegible: number } {
  const elegibles = items.map((i) => (esCategoriaDeAnteojos(i.categoria) ? Math.max(0, i.subtotal) : 0));
  const elegible = Math.floor(elegibles.reduce((t, s) => t + s, 0));
  const credito = Math.min(Math.floor(Math.max(0, Number.isFinite(monto) ? monto : 0)), elegible);
  if (credito === 0) return { items: items.map((i) => ({ ...i })), credito: 0, elegible };
  const partes = repartir(elegibles, credito);
  return {
    items: items.map((item, n) => {
      if (partes[n] <= 0) return { ...item };
      const subtotal = item.subtotal - partes[n];
      return { ...item, credito: partes[n], subtotal, precioUnitario: subtotal / item.cantidad };
    }),
    credito,
    elegible,
  };
}

/** La línea de Notas del pedido (para Harper; el uso de verdad está en «Créditos»). */
export const notaDeUso = (monto: number, email: string) => `Crédito Harper usado: $ ${monto} (${email})`;

// ---------- Con el aviso de un pago ----------

export type DependenciasUsoPago = { uso: DependenciasUso; mp: LectorMercadoPago };

export type ResultadoUsoPago =
  | { accion: "nada"; motivo: "pago-sin-pedido" | "pedido-inexistente" | "sin-uso" | "sin-pago" | "pendiente" | "pedido-no-confirmado"; numero?: string }
  | { accion: "confirmar"; numero: string; resultado: ResultadoConfirmacion | CuentaOcupada; alerta: string | null }
  | { accion: "revisar"; numero: string; resultado: Awaited<ReturnType<typeof revisarUsoPorReembolso>>; alerta: string | null }
  | { accion: "parcial"; numero: string; alerta: string };

/**
 * Lo que le pasa al crédito USADO en un pedido con el aviso de un pago (del
 * aviso solo se usa el ID; todo se lee de Mercado Pago y de Pedidos):
 *  - cobrado y el pedido confirmado: el uso queda «Usado»;
 *  - sin cobro (reembolso total, contracargo perdido): «A revisar» y aviso;
 *  - reembolso parcial: no cambia y se avisa (la regla está pendiente);
 *  - pendiente o sin pago: nada (la reserva vence sola si no se paga).
 * Un pedido sin uso de crédito no lee Mercado Pago más allá del pago.
 */
export async function procesarUsoDelPago(pagoId: string, deps: DependenciasUsoPago): Promise<ResultadoUsoPago> {
  const pago = await deps.mp.pago(pagoId);
  if (!pago.pedidoId) return { accion: "nada", motivo: "pago-sin-pedido" };
  const pedido = await deps.uso.pedidos.porId(pago.pedidoId);
  if (!pedido) return { accion: "nada", motivo: "pedido-inexistente" };
  const n = pedido.numero;
  const usos = await deps.uso.almacen.delPedido(n);
  if (usos.length === 0) return { accion: "nada", motivo: "sin-uso", numero: n };
  const cobro: CobroDelPedido = await cobroCertificado(deps.mp, pedido.id, [pago.id, pedido.pagoRegistrado], pedido.total, n);

  if (cobro.estado === "cobrado") {
    if (!ESTADOS_CONFIRMADOS.has(pedido.estado)) return { accion: "nada", motivo: "pedido-no-confirmado", numero: n };
    const resultado = await confirmarUso(n, deps.uso);
    const sobregiro = "sobregiro" in resultado ? resultado.sobregiro : 0;
    return {
      accion: "confirmar",
      numero: n,
      resultado,
      alerta:
        sobregiro > 0
          ? `El pedido ${n} usó Crédito Harper y, con su pago, la cuenta quedó con $ ${sobregiro} más usado que ganado (un pago que llegó después de liberar la reserva, o un crédito ganado que se anuló). Revisalo en Créditos.`
          : null,
    };
  }
  if (cobro.estado === "sin-cobro") {
    const que = cobro.contracargoPerdido ? "contracargo perdido" : "reembolso total";
    const resultado = await revisarUsoPorReembolso(n, que, deps.uso);
    const uso = "uso" in resultado ? resultado.uso : null;
    return {
      accion: "revisar",
      numero: n,
      resultado,
      // Mientras siga «A revisar» se avisa con cada aviso del pago: si un mail no
      // salió, el reintento lo vuelve a mandar (mejor repetido que perdido).
      alerta:
        uso && uso.estado === "A revisar"
          ? `El pedido ${n} se pagó en parte con $ ${uso.monto} de Crédito Harper de ${uso.email} y tuvo un ${que} en Mercado Pago. El uso quedó «A revisar» y sigue descontado: decidí si se le devuelve (marcá «Devuelto») o no («Usado»).`
          : null,
    };
  }
  if (cobro.estado === "parcial") {
    return {
      accion: "parcial",
      numero: n,
      alerta: `El pedido ${n}, pagado en parte con Crédito Harper, tuvo un reembolso parcial en Mercado Pago. El crédito usado no cambia: la regla de la devolución parcial está pendiente. Revisalo.`,
    };
  }
  return { accion: "nada", motivo: cobro.estado === "pendiente" ? "pendiente" : "sin-pago", numero: n };
}

/** Si el webhook tiene que reintentar el aviso (otra compra tenía la cuenta). */
export const usoHayQueReintentar = (r: ResultadoUsoPago) => (r.accion === "confirmar" || r.accion === "revisar") && r.resultado.estado === "ocupado";

/** Las dependencias de verdad: la tabla «Créditos», Pedidos y el Redis del entorno (o null: no se usa crédito). */
export function dependenciasUsoReales(cerrojo: Cerrojo | null): DependenciasUso {
  return { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, cerrojo, reloj: { ahora: () => Date.now(), dormir: (ms) => new Promise((r) => setTimeout(r, ms)) } };
}
