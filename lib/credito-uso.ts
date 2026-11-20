import { createHash } from "node:crypto";
import { createRecord, ErrorAirtable, escaparFormula, getRecord, listRecords, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { ErrorCerrojo, soltarSinFallar, tomarConEspera, type Cerrojo } from "./cerrojo";
import { esCategoriaDeAnteojos } from "./categorias";
import { CreditoApagado, filaDelRegistro, puedeEscribirCreditos, type CamposCredito } from "./credito-airtable";
import { esFechaValida, MESES_PARA_VENCER_CREDITO, venceEl } from "./credito-harper";
import { creditoRetenido, vigentesPorPedido, type FilaCredito } from "./credito-persistencia";
import { precio as formatearPrecio } from "./formato";
import { cobroCertificado, type CobroDelPedido, type LectorMercadoPago } from "./mp-cobro";
import { fechaArgentina, fechaLegible, MINUTOS_RESERVA, repartir } from "./suscriptores";
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
 *  - «A revisar»: se perdió un contracargo del pedido. Sigue contando como
 *    usado hasta que Harper decida si lo devuelve;
 *  - «Devuelto»: el crédito usado volvió a la cuenta. La regla de las
 *    devoluciones (20/11/2026, propuesta a Ale, a favor del comprador): en la
 *    Argentina quien se arrepiente dentro de los 10 días recibe TODO lo que
 *    pagó, y una cláusula en la que Harper «decide en cada caso» no vale. Por
 *    eso, si el pedido se reembolsa entero en Mercado Pago, el webhook lo
 *    marca «Devuelto» solo y anota en Disponible_desde el día del reembolso
 *    (`devolverUsoPorReembolso`). También lo puede marcar Harper a mano (un
 *    contracargo perdido que decide devolver, una compra sin Mercado Pago).
 *    El uso sigue descontado de los créditos que consumió (como «Usado»: lo
 *    que ya se repartió no cambia) y lo devuelto es un crédito aparte, que
 *    vence a los 6 meses de ese día (`saldoDeCredito`). Sin una fecha válida
 *    en Disponible_desde, ese crédito devuelto no vence.
 *
 * Contra dos compras a la vez: un cerrojo por CUENTA (el mail) en Redis,
 * obligatorio. Adentro se lee todo de nuevo (lo ganado, lo usado y lo
 * reservado) y la reserva queda escrita antes de soltarlo: la segunda compra
 * la ve. Sin Redis no se usa crédito. Lo que se puede usar es
 *   Disponible ganado + Devuelto − Usado − A revisar − Devuelto − Reservado
 *   vigente − lo vencido,
 * nunca menos de 0 (`saldoDeCredito`: cada uso se descuenta primero del
 * crédito que vence antes; Ale, 18/11/2026).
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
  /**
   * Solo en un uso «Devuelto»: el día en Buenos Aires ("AAAA-MM-DD") en que
   * el crédito volvió a la cuenta (el campo Disponible_desde de la fila). De
   * ahí corren los 6 meses del crédito devuelto. Null o ausente: sin fecha
   * (Harper lo marcó a mano sin ponerla), ese crédito no vence.
   */
  disponibleDesde?: string | null;
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
    // Una fecha que no existe no se adivina: se lee como sin fecha (no vence).
    disponibleDesde: esFechaValida(f.Disponible_desde) ? f.Disponible_desde : null,
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
  /** `disponibleDesde`, solo al marcar «Devuelto»: el día en que volvió a la cuenta (Disponible_desde). */
  actualizar(id: string, cambios: { estado: EstadoUso; notas: string; disponibleDesde?: string | null }): Promise<FilaUso>;
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
    return usoDelRegistro(
      await updateRecord<CamposCredito>(TABLAS.creditos, id, {
        Estado: cambios.estado,
        Notas: cambios.notas,
        ...(cambios.disponibleDesde !== undefined ? { Disponible_desde: cambios.disponibleDesde } : {}),
      })
    );
  },
};

/**
 * Los usos «Devuelto» de todas las cuentas (el crédito que volvió por un
 * reembolso total): el control diario los mira para avisar cuando están por
 * vencer (lib/credito-diario.ts). Solo lectura y sin cache. Lo que queda de
 * cada uno lo dice `saldoDeCredito`, con los usos de su cuenta.
 */
export async function usosDevueltos(): Promise<FilaUso[]> {
  const filas = await listRecords<CamposCredito>(TABLAS.creditos, { filterByFormula: `{Estado} = 'Devuelto'`, revalidate: 0 });
  // Una fila que no se entiende no se avisa: la cuenta está bloqueada hasta que Harper la revise.
  return filas
    .filter((r) => esClaveDeUso(r.fields.Clave))
    .map(usoDelRegistro)
    .filter((u) => u.estado === "Devuelto" && !u.rota);
}

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

/** Un crédito disponible con lo que le queda después de repartir los usos (Ale, 18/11/2026). */
export type CreditoConSaldo = {
  /** La fila de «Créditos»: la del crédito ganado o, en uno devuelto, la del uso «Devuelto». */
  id: string;
  /** El pedido con que se ganó; en uno devuelto, el pedido que se reembolsó. */
  pedido: string;
  /**
   * «ganado»: el crédito de una compra. «devuelto»: el crédito que se usó en
   * una compra que después se reembolsó entera y volvió a la cuenta (un uso
   * «Devuelto», 20/11/2026). Los dos se usan igual: el que vence antes, primero.
   */
  origen: "ganado" | "devuelto";
  /** Lo que se ganó con ese pedido (o lo que volvió a la cuenta). */
  monto: number;
  /** Lo que queda sin usar. Si venció, es lo que se perdió. */
  restante: number;
  /**
   * De lo que ya no queda, lo que tomaron reservas vigentes (pedidos que
   * todavía se pueden pagar): si no se pagan, vuelve. La billetera lo muestra
   * «apartado» y no «usado».
   */
  reservado: number;
  /**
   * El día en que quedó disponible ("AAAA-MM-DD"); en uno devuelto, el día en
   * que volvió a la cuenta. Null: fila sin Disponible_desde (editada a mano).
   */
  disponibleDesde: string | null;
  /** El último día en que se puede usar, inclusive ("AAAA-MM-DD"). Null: sin Disponible_desde, no vence. */
  venceEl: string | null;
  /** Si ya venció hoy (en Buenos Aires). */
  vencido: boolean;
};

export type SaldoDeCredito = {
  /**
   * Lo que entró a la cuenta para usar, vencidos incluidos: lo ganado en
   * «Disponible» y sin incidencia (uno por pedido) más lo devuelto
   * (`devuelto`). Así lo que queda más lo que se usó siempre da esto.
   */
  ganado: number;
  /** De `ganado`, lo que volvió a la cuenta por compras reembolsadas enteras (usos «Devuelto» desde su día). */
  devuelto: number;
  /**
   * Usado, en revisión por un contracargo o devuelto: no se puede volver a
   * usar. Un uso «Devuelto» sigue acá (consumió su crédito); lo que volvió es
   * un crédito aparte, que cuenta en `ganado`.
   */
  usado: number;
  /** Apartado por pedidos que todavía se pueden pagar. */
  reservado: number;
  /** Lo que se puede usar ahora: lo que queda en los créditos que no vencieron. Nunca negativo. */
  usable: number;
  /**
   * Lo usado (y apartado) que ningún crédito cubre, ni siquiera con lo que
   * queda sin vencer: se usó más de lo que se ganó (un crédito ganado que se
   * anuló después de usarlo, un pago tardío de una reserva liberada). Harper
   * revisa. Sin vencimientos es usado + reservado − ganado, como siempre. Un
   * crédito que vence DESPUÉS de usarse no lo genera: ese uso quedó cubierto
   * por él (Ale, 18/11/2026).
   */
  sobregiro: number;
  /** Hay un uso editado a mano que no se entiende: no se usa crédito hasta revisarlo. */
  bloqueado: boolean;
  /** Reservas que ya no apartan nada (se marcan «Liberado» adentro del cerrojo). */
  vencidas: FilaUso[];
  /** Lo que venció sin usarse (Ale, 18/11/2026): ya no se puede usar. */
  vencido: number;
  /**
   * El próximo vencimiento de lo que se puede usar: cuánto vence y qué día
   * (el último en que se puede usar). Null si no queda nada que venza, o si la
   * cuenta está bloqueada.
   */
  proximoVencimiento: { monto: number; venceEl: string } | null;
  /**
   * Cada crédito disponible (sin incidencia, uno por pedido) y cada crédito
   * devuelto, con lo que le queda, en el orden en que se usan: el que vence
   * antes, primero.
   */
  porCredito: CreditoConSaldo[];
};

/** Para ordenar: un crédito sin fecha no vence, va al final. */
const SIN_FECHA = "9999-12-31";

/**
 * Lo que la cuenta puede usar, el único cálculo que usan el carrito, la
 * cotización, el checkout, la billetera, la confirmación del uso y las
 * incidencias (Ale, 18/11/2026: todos tienen que ver el mismo número).
 *
 * Cómo se reparte, con el vencimiento (lib/credito-harper.ts, `venceEl`):
 *  1. Lo ganado que cuenta: uno por pedido, en «Disponible» y sin incidencia
 *     abierta, más los créditos devueltos (abajo). Se ordena por vencimiento,
 *     el que vence antes primero (y, si vencen el mismo día, por
 *     Disponible_desde, por cuándo se anotó, por pedido y por fila, para que
 *     dé siempre lo mismo). Sin Disponible_desde no vence: va al final.
 *  2. Lo usado que cuenta (Usado, A revisar, Devuelto y las reservas
 *     vigentes), en el orden en que se reservó. Cada uso se descuenta del
 *     crédito que vence antes y que no había vencido el día del uso (el de la
 *     reserva, en Buenos Aires: un pago que se acredita después del
 *     vencimiento vale igual). Un uso no se descuenta nunca de un crédito que
 *     ya había vencido cuando se hizo.
 *  3. Lo que ningún crédito cubrió (una deuda: un crédito anulado después de
 *     usarlo) se descuenta de lo que quede sin vencer, del que vence antes
 *     primero, como siempre; lo que ni así se cubre es el `sobregiro`.
 *  4. Lo que queda en los créditos vencidos se pierde (`vencido`); lo que
 *     queda en los demás es lo que se puede usar (`usable`).
 * Así lo que ya se usó nunca se vuelve sobregiro cuando vence un crédito: ese
 * uso ya quedó cubierto por él. Sin vencimientos, da exactamente lo de antes:
 * usable = ganado − usado − reservado (nunca menos de 0) y sobregiro = lo que
 * pasa de lo ganado.
 *
 * Los créditos devueltos (20/11/2026): un uso «Devuelto» se reparte como uno
 * «Usado» (lo que consumió sigue consumido: el reparto de antes no cambia) y
 * lo que volvió es un crédito más, del mismo monto, que entra al mismo orden:
 * disponible desde el Disponible_desde de su fila y con vencimiento a los 6
 * meses de ese día (sin fecha válida, no vence). Existe recién desde que se
 * devolvió: no lo toma el uso del que salió ni ningún uso anterior o de un día
 * anterior, y uno con el día en el futuro (solo por una edición a mano)
 * todavía no cuenta. Con eso nada se cuenta dos veces: lo que queda en todos
 * los créditos más lo que se usó (sin el sobregiro) es siempre `ganado`, que
 * ya incluye lo devuelto. Sin usos «Devuelto», todo da lo mismo que antes.
 */
export function saldoDeCredito(datos: { creditos: readonly FilaCredito[]; usos: readonly FilaUso[] }, pedidos: ReadonlyMap<string, PedidoDeUnUso | null>, ahora: Date): SaldoDeCredito {
  const ahoraMs = ahora.getTime();
  const hoy = fechaArgentina(ahora);

  // Lo usado que cuenta: Usado, A revisar, Devuelto (consumió lo suyo) y las reservas vigentes.
  const usados = datos.usos.filter((u) => u.estado === "Usado" || u.estado === "A revisar" || u.estado === "Devuelto");
  const usado = usados.reduce((t, u) => t + u.monto, 0);
  const reservas = datos.usos.filter((u) => u.estado === "Reservado");
  const vigentes = reservas.filter((u) => reservaVigente(u, pedidos.get(u.pedido) ?? null, ahoraMs));
  const reservado = vigentes.reduce((t, u) => t + u.monto, 0);
  const bloqueado = datos.usos.some((u) => u.rota);

  // El día de cada uso: el de su reserva. Una fecha que no se entiende, o una
  // en el futuro, cuenta como hoy: así nunca se descuenta de un crédito vencido.
  const usos = [...usados, ...vigentes]
    .map((u) => {
      const t = Date.parse(u.generadoEl);
      const momento = Number.isFinite(t) ? Math.min(t, ahoraMs) : ahoraMs;
      return { uso: u, momento, dia: fechaArgentina(new Date(momento)) };
    })
    .sort((a, b) => a.momento - b.momento || a.uso.id.localeCompare(b.uso.id));
  const posicion = new Map(usos.map((u, k) => [u.uso.id, k]));

  // 1. Lo que se puede usar (lo ganado y lo devuelto), el que vence antes primero.
  type Fuente = {
    id: string;
    pedido: string;
    origen: CreditoConSaldo["origen"];
    generadoEl: string;
    monto: number;
    disponibleDesde: string | null;
    venceEl: string | null;
    /** Solo en uno devuelto: la posición de su uso. Lo toman solo los usos que vienen después. */
    despuesDe: number | null;
  };
  const ganados: Fuente[] = vigentesPorPedido(datos.creditos)
    .filter((c) => c.estado === "Disponible" && !creditoRetenido(c))
    .map((c) => {
      const disponibleDesde = esFechaValida(c.disponibleDesde) ? c.disponibleDesde : null;
      return {
        id: c.id,
        pedido: c.pedido,
        origen: "ganado",
        generadoEl: c.generadoEl,
        monto: Number.isFinite(c.monto) ? Math.max(0, c.monto) : 0,
        disponibleDesde,
        venceEl: disponibleDesde ? venceEl(disponibleDesde) : null,
        despuesDe: null,
      };
    });
  // Una fila que no se entiende nunca devuelve nada (y bloquea la cuenta igual).
  const devueltos: Fuente[] = usados
    .filter((u) => u.estado === "Devuelto" && !u.rota && u.monto > 0)
    .map((u): Fuente => {
      const disponibleDesde = esFechaValida(u.disponibleDesde) ? u.disponibleDesde : null;
      return {
        id: u.id,
        pedido: u.pedido,
        origen: "devuelto",
        generadoEl: u.generadoEl,
        monto: u.monto,
        disponibleDesde,
        venceEl: disponibleDesde ? venceEl(disponibleDesde) : null,
        despuesDe: posicion.get(u.id) ?? null,
      };
    })
    .filter((d) => d.disponibleDesde === null || d.disponibleDesde <= hoy);
  const creditos = [...ganados, ...devueltos].sort(
    (a, b) =>
      (a.venceEl ?? SIN_FECHA).localeCompare(b.venceEl ?? SIN_FECHA) ||
      (a.disponibleDesde ?? SIN_FECHA).localeCompare(b.disponibleDesde ?? SIN_FECHA) ||
      a.generadoEl.localeCompare(b.generadoEl) ||
      a.pedido.localeCompare(b.pedido) ||
      a.id.localeCompare(b.id)
  );
  const ganado = creditos.reduce((t, c) => t + c.monto, 0);
  const devuelto = devueltos.reduce((t, c) => t + c.monto, 0);

  // 2. Cada uso, en orden, del crédito que vence antes y que valía ese día.
  const restantes = creditos.map((c) => c.monto);
  const apartados = creditos.map(() => 0);
  const deudas: { reserva: boolean; falta: number }[] = [];
  usos.forEach(({ uso, dia }, k) => {
    let falta = Math.max(0, uso.monto);
    for (let i = 0; i < creditos.length && falta > 0; i++) {
      const c = creditos[i];
      if (restantes[i] <= 0 || (c.venceEl !== null && dia > c.venceEl)) continue;
      // Un crédito devuelto existe recién desde el reembolso: no lo toma su propio uso ni uno de antes.
      if (c.despuesDe !== null && (k <= c.despuesDe || (c.disponibleDesde !== null && dia < c.disponibleDesde))) continue;
      const toma = Math.min(falta, restantes[i]);
      restantes[i] -= toma;
      if (uso.estado === "Reservado") apartados[i] += toma;
      falta -= toma;
    }
    if (falta > 0) deudas.push({ reserva: uso.estado === "Reservado", falta });
  });

  // 3. Lo que ningún crédito pudo cubrir (una deuda: un crédito anulado después
  // de usarlo) se descuenta de lo que quede sin vencer, como siempre. Sin
  // créditos devueltos esto no cambia nada (si hay deuda, los créditos sin
  // vencer ya se usaron enteros); uno devuelto, que solo toman los usos de
  // después, sí la puede cubrir.
  const vencidoHoy = (c: Fuente) => c.venceEl !== null && hoy > c.venceEl;
  let sobregiro = 0;
  for (const deuda of deudas) {
    let falta = deuda.falta;
    for (let i = 0; i < creditos.length && falta > 0; i++) {
      if (restantes[i] <= 0 || vencidoHoy(creditos[i])) continue;
      const toma = Math.min(falta, restantes[i]);
      restantes[i] -= toma;
      if (deuda.reserva) apartados[i] += toma;
      falta -= toma;
    }
    sobregiro += falta;
  }

  // 4. Lo que queda: vencido o para usar.
  const porCredito: CreditoConSaldo[] = creditos.map((c, i) => ({
    id: c.id,
    pedido: c.pedido,
    origen: c.origen,
    monto: c.monto,
    restante: restantes[i],
    reservado: apartados[i],
    disponibleDesde: c.disponibleDesde,
    venceEl: c.venceEl,
    vencido: vencidoHoy(c),
  }));
  const vencido = porCredito.filter((c) => c.vencido).reduce((t, c) => t + c.restante, 0);
  const sinVencer = porCredito.filter((c) => !c.vencido).reduce((t, c) => t + c.restante, 0);
  // La deuda ya se descontó de lo que quedaba sin vencer (paso 3): es lo de
  // siempre, ganado − usado − reservado sin bajar de 0.
  const usable = bloqueado ? 0 : sinVencer;

  const porVencer = porCredito.filter((c) => !c.vencido && c.restante > 0 && c.venceEl !== null);
  const primero = porVencer[0]?.venceEl ?? null;
  const proximoVencimiento =
    !bloqueado && usable > 0 && primero !== null
      ? { monto: porVencer.filter((c) => c.venceEl === primero).reduce((t, c) => t + c.restante, 0), venceEl: primero }
      : null;

  return {
    ganado,
    devuelto,
    usado,
    reservado,
    usable,
    sobregiro,
    bloqueado,
    vencidas: reservas.filter((u) => !vigentes.includes(u)),
    vencido,
    proximoVencimiento,
    porCredito,
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

type SaldoLeido = SaldoDeCredito & { usos: FilaUso[]; creditos: FilaCredito[] };

/** La cuenta, el estado de los pedidos con reservas y lo que se puede usar. Solo lectura. */
async function leerCuenta(email: string, deps: Pick<DependenciasUso, "almacen" | "pedidos" | "reloj">): Promise<{ saldo: SaldoLeido; pedidos: Map<string, PedidoDeUnUso | null> }> {
  const datos = await deps.almacen.cuenta(email);
  const conReserva = [...new Set(datos.usos.filter((u) => u.estado === "Reservado").map((u) => u.pedido))];
  const pedidos = new Map(await Promise.all(conReserva.map(async (n) => [n, await deps.pedidos.porNumero(n)] as const)));
  return { saldo: { ...saldoDeCredito(datos, pedidos, new Date(deps.reloj.ahora())), usos: datos.usos, creditos: datos.creditos }, pedidos };
}

/** Lee la cuenta y el estado de los pedidos con reservas. Solo lectura. */
export async function leerSaldoDeCredito(email: string, deps: Pick<DependenciasUso, "almacen" | "pedidos" | "reloj">): Promise<SaldoLeido> {
  return (await leerCuenta(email, deps)).saldo;
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
    let { saldo: leido, pedidos } = await leerCuenta(mail, deps);
    for (const vencida of leido.vencidas) {
      await deps.almacen.actualizar(vencida.id, { estado: "Liberado", notas: conNota(vencida, deps.reloj.ahora(), "Liberado: el pedido no se pagó a tiempo.") });
    }
    if (leido.vencidas.length > 0) ({ saldo: leido, pedidos } = await leerCuenta(mail, deps));

    const cuenta: CuentaTomada = {
      get saldo() {
        return leido;
      },
      async reservar(numero, monto) {
        if (!Number.isInteger(monto) || monto <= 0) throw new RangeError("El crédito a usar tiene que ser un entero mayor que 0");
        vigilar();
        const n = numero.trim();
        if (leido.usos.some((u) => u.pedido === n)) throw new RangeError(`El pedido ${n} ya tiene un uso de crédito`);
        // Lo que se puede usar se vuelve a calcular en el mismo instante con que
        // se anota la reserva (revisión del 20/11/2026): el saldo de cuando se
        // abrió la cuenta pudo cambiar. Un checkout que cruza la medianoche de
        // Buenos Aires el día del vencimiento leía el crédito como vigente a las
        // 23:59:58 y lo reservaba a las 00:00:03, cuando ya había vencido: la
        // reserva quedaba sin respaldo (sobregiro). Con las reservas ya hechas
        // con esta misma llave.
        const ahora = deps.reloj.ahora();
        const actual = saldoDeCredito({ creditos: leido.creditos, usos: leido.usos }, pedidos, new Date(ahora));
        if (monto > actual.usable) throw new CreditoInsuficiente(actual.usable);
        const uso = await deps.almacen.crear({
          pedido: n,
          email: mail,
          monto,
          estado: "Reservado",
          generadoEl: new Date(ahora).toISOString(),
          notas: linea(ahora, `Reservado: ${monto} para el pedido ${n}, mientras se paga.`),
        });
        // Con la reserva nueva se vuelve a repartir (Ale, 18/11/2026): se
        // descuenta del crédito que vence antes, y el próximo vencimiento y lo
        // que queda de cada crédito siguen siendo los de verdad.
        const usos = [...leido.usos, uso];
        leido = { ...saldoDeCredito({ creditos: leido.creditos, usos }, pedidos, new Date(ahora)), usos, creditos: leido.creditos };
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
  /** Ya se decidió («Devuelto», por un reembolso total o a mano, o «A revisar»): no se toca. */
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
 * Se perdió un contracargo del pedido: el uso queda «A revisar» y sigue
 * contando como usado. Devolverlo o no lo decide Harper (marca «Devuelto» o
 * «Usado»): un contracargo perdido no es una devolución del comprador, así
 * que no se devuelve solo. (El reembolso total, en cambio, devuelve el
 * crédito solo: `devolverUsoPorReembolso`.)
 */
export async function revisarUsoPorReembolso(numero: string, que: string, deps: DependenciasUso): Promise<{ estado: "a-revisar" | "ya" | "sin-uso"; uso?: FilaUso } | CuentaOcupada> {
  return conLaCuentaDelPedido(numero, deps, async (uso) => {
    const actual = usoDelPedido(await deps.almacen.delPedido(numero));
    if (!actual || actual.estado === "A revisar" || actual.estado === "Devuelto" || actual.estado === "Liberado") return { estado: "ya" as const, uso: actual ?? uso };
    const nuevo = await deps.almacen.actualizar(actual.id, { estado: "A revisar", notas: conNota(actual, deps.reloj.ahora(), `A revisar: ${que}. Harper decide si se devuelve.`) });
    return { estado: "a-revisar" as const, uso: nuevo };
  });
}

export type ResultadoDevolucion =
  /** Quedó «Devuelto» con este aviso: el crédito volvió a la cuenta desde `disponibleDesde` hasta `venceEl`. */
  | { estado: "devuelto"; uso: FilaUso; disponibleDesde: string; venceEl: string }
  /** Ya estaba «Devuelto» (un aviso repetido), o «Liberado» (el crédito ya estaba libre): no se toca nada. */
  | { estado: "ya"; uso: FilaUso }
  /** «A revisar» (Harper decide) o una fila editada a mano que no se entiende: no se toca y se le avisa a Harper. */
  | { estado: "decidido"; uso: FilaUso }
  | { estado: "sin-uso" }
  | CuentaOcupada;

/**
 * El pedido se reembolsó ENTERO en Mercado Pago (no un contracargo perdido):
 * el crédito que se usó en él vuelve solo a la cuenta (regla del 20/11/2026,
 * propuesta a Ale: quien se arrepiente dentro de los 10 días recibe todo lo
 * que pagó, también lo pagado con crédito; una cláusula en la que Harper
 * «decide en cada caso» no vale). El uso queda «Devuelto» y en su
 * Disponible_desde, el día del reembolso en Buenos Aires: desde ese día se
 * puede usar de nuevo, con 6 meses nuevos para usarlo, aunque el crédito
 * original ya hubiera vencido (`saldoDeCredito`). Pasa con «Usado» y con
 * «Reservado» (un aviso del reembolso que llega antes que la confirmación del
 * pago). Idempotente: un segundo aviso del mismo reembolso no hace nada más.
 */
export async function devolverUsoPorReembolso(numero: string, deps: DependenciasUso): Promise<ResultadoDevolucion> {
  return conLaCuentaDelPedido(numero, deps, async (uso): Promise<ResultadoDevolucion> => {
    // Se vuelve a leer con la cuenta tomada: pudo cambiar mientras se esperaba la llave.
    const actual = usoDelPedido((await deps.almacen.delPedido(numero)).filter((u) => u.email === uso.email));
    if (!actual) return { estado: "sin-uso" };
    if (actual.rota || actual.estado === "A revisar") return { estado: "decidido", uso: actual };
    if (actual.estado === "Devuelto" || actual.estado === "Liberado") return { estado: "ya", uso: actual };
    const ahora = deps.reloj.ahora();
    const dia = fechaArgentina(new Date(ahora));
    const vence = venceEl(dia);
    const nuevo = await deps.almacen.actualizar(actual.id, {
      estado: "Devuelto",
      disponibleDesde: dia,
      notas: conNota(
        actual,
        ahora,
        `Devuelto: reembolso total en Mercado Pago. El crédito usado vuelve a la cuenta: se puede usar desde el ${dia} y vence el ${vence} (${MESES_PARA_VENCER_CREDITO} meses desde ese día).`
      ),
    });
    return { estado: "devuelto", uso: nuevo, disponibleDesde: dia, venceEl: vence };
  });
}

/**
 * Deja una línea en las Notas de un uso «Devuelto»: las marcas de los avisos
 * al comprador del control diario (lib/credito-diario.ts), como en los
 * créditos ganados. Con el cerrojo de su cuenta (el del checkout: así no se
 * pisa una nota que se escriba a la vez) y releyendo la fila adentro. Si la
 * línea ya está, no la repite. Solo toca Notas. Sin Redis tira `ErrorCerrojo`.
 */
export async function anotarEnUso(candidato: FilaUso, texto: string, deps: DependenciasUso): Promise<{ estado: "anotado" | "ya" | "sin-uso" } | CuentaOcupada> {
  if (!deps.cerrojo) throw new ErrorCerrojo("Redis no está configurado: sin cerrojo no se escribe en los usos del crédito");
  const cerrojo = deps.cerrojo;
  const clave = claveCuentaCredito(candidato.email);
  const nonce = await tomarConEspera(cerrojo, clave, TTL_CUENTA_CREDITO_MS, { esperaMaxMs: deps.esperaOcupadoMs ?? 8_000, reloj: deps.reloj });
  if (!nonce) return { estado: "ocupado" };
  try {
    const actual = (await deps.almacen.delPedido(candidato.pedido)).find((u) => u.id === candidato.id);
    if (!actual || actual.rota || actual.estado !== "Devuelto") return { estado: "sin-uso" };
    if (actual.notas.includes(texto)) return { estado: "ya" };
    await deps.almacen.actualizar(actual.id, { estado: actual.estado, notas: conNota(actual, deps.reloj.ahora(), texto) });
    return { estado: "anotado" };
  } finally {
    await soltarSinFallar(cerrojo, clave, nonce);
  }
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
  /** Reembolso total: el crédito usado vuelve solo. La alerta es informativa (Harper no tiene que hacer nada), salvo con «decidido». */
  | { accion: "devolver"; numero: string; resultado: ResultadoDevolucion; alerta: string | null }
  /** Contracargo perdido: «A revisar», decide Harper. */
  | { accion: "revisar"; numero: string; resultado: Awaited<ReturnType<typeof revisarUsoPorReembolso>>; alerta: string | null }
  | { accion: "parcial"; numero: string; alerta: string };

/** Lo que el texto a Harper dice de cuánto crédito y de quién. */
const delUso = (uso: Pick<FilaUso, "monto" | "email">) => `${formatearPrecio(uso.monto)} de Crédito Harper de ${uso.email}`;

/**
 * Lo que le pasa al crédito USADO en un pedido con el aviso de un pago (del
 * aviso solo se usa el ID; todo se lee de Mercado Pago y de Pedidos):
 *  - cobrado y el pedido confirmado: el uso queda «Usado»;
 *  - reembolso total: el crédito usado vuelve solo a la cuenta, «Devuelto»
 *    con el día del reembolso y 6 meses nuevos (`devolverUsoPorReembolso`), y
 *    a Harper le llega un aviso que no le pide nada;
 *  - contracargo perdido: «A revisar», decide Harper, y aviso;
 *  - reembolso parcial: el uso no cambia y el aviso le dice a Harper qué
 *    tiene que devolverle al comprador (regla del 20/11/2026);
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
  if (cobro.estado === "sin-cobro" && !cobro.contracargoPerdido) {
    // Reembolso total: el crédito usado vuelve solo (regla del 20/11/2026).
    const resultado = await devolverUsoPorReembolso(n, deps.uso);
    let alerta: string | null = null;
    if (resultado.estado === "devuelto") {
      // Solo el aviso que lo devolvió avisa: uno repetido no hace nada más.
      alerta = `El pedido ${n} se pagó en parte con ${delUso(resultado.uso)} y tuvo un reembolso total en Mercado Pago. Ese crédito volvió solo a la cuenta: se puede usar desde el ${fechaLegible(resultado.disponibleDesde)} hasta el ${fechaLegible(resultado.venceEl)} (${MESES_PARA_VENCER_CREDITO} meses nuevos). Quedó «Devuelto» en Créditos. No tenés que hacer nada.`;
    } else if (resultado.estado === "decidido") {
      // No se pisa lo que está «A revisar» ni una fila editada a mano: se repite mientras siga así.
      const hoy = fechaLegible(fechaArgentina(new Date(deps.uso.reloj.ahora())));
      alerta = `El pedido ${n} se pagó en parte con ${delUso(resultado.uso)} y tuvo un reembolso total en Mercado Pago, pero su uso en Créditos está «${resultado.uso.estado}»${resultado.uso.rota ? " y no se entiende (se editó a mano)" : ""}: no se tocó. Con un reembolso total el crédito usado se le devuelve: marcá «Devuelto» su uso y poné en Disponible_desde el día de hoy (${hoy}); desde ese día tiene ${MESES_PARA_VENCER_CREDITO} meses para usarlo.`;
    }
    return { accion: "devolver", numero: n, resultado, alerta };
  }
  if (cobro.estado === "sin-cobro") {
    const que = "contracargo perdido";
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
          ? `El pedido ${n} se pagó en parte con ${delUso(uso)} y tuvo un ${que} en Mercado Pago. El uso quedó «A revisar» y sigue descontado: decidí si se le devuelve. Para devolvérselo, marcá «Devuelto» su uso en Créditos y poné en Disponible_desde el día en que se lo devolvés (desde ese día tiene ${MESES_PARA_VENCER_CREDITO} meses para usarlo; sin fecha, no vence). Si no, marcalo «Usado».`
          : null,
    };
  }
  if (cobro.estado === "parcial") {
    const uso = usoDelPedido(usos);
    const cuanto = uso && uso.monto > 0 ? ` con ${formatearPrecio(uso.monto)} de Crédito Harper` : " con Crédito Harper";
    return {
      accion: "parcial",
      numero: n,
      alerta: `El pedido ${n}, pagado en parte${cuanto}, tuvo un reembolso parcial en Mercado Pago. Si es por una devolución, al comprador le corresponde todo lo que pagó por lo que devolvió: reintegrale ese importe en Mercado Pago, en dinero, incluida la parte que pagó con Crédito Harper (en Items del pedido, cada renglón dice cuánto se pagó con crédito). Si el reembolso que ya hiciste no la incluye, hacé otro por la diferencia. El crédito usado no vuelve a la cuenta: su uso queda «Usado».`,
    };
  }
  return { accion: "nada", motivo: cobro.estado === "pendiente" ? "pendiente" : "sin-pago", numero: n };
}

/** Si el webhook tiene que reintentar el aviso (otra compra tenía la cuenta). */
export const usoHayQueReintentar = (r: ResultadoUsoPago) => (r.accion === "confirmar" || r.accion === "devolver" || r.accion === "revisar") && r.resultado.estado === "ocupado";

/** Las dependencias de verdad: la tabla «Créditos», Pedidos y el Redis del entorno (o null: no se usa crédito). */
export function dependenciasUsoReales(cerrojo: Cerrojo | null): DependenciasUso {
  return { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, cerrojo, reloj: { ahora: () => Date.now(), dormir: (ms) => new Promise((r) => setTimeout(r, ms)) } };
}
