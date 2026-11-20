import { createHash } from "node:crypto";
import {
  almacenUsosAirtable,
  leerSaldoDeCredito,
  lectorPedidosDeUsosAirtable,
  saldoDeCredito,
  type AlmacenUsos,
  type CreditoConSaldo,
  type FilaUso,
  type LectorPedidosDeUsos,
  type SaldoDeCredito,
} from "./credito-uso";
import { creditoActivo, esFechaValida, venceEl } from "./credito-harper";
import { creditoRetenido, laDelPedido, saldosDeLaCuenta, type FilaCredito } from "./credito-persistencia";
import { codigoCorrecto, normalizarEmail } from "./reconocer-cliente";
import { fechaArgentina } from "./suscriptores";
import { estaActivo, suscriptorDeLaSesion, suscriptorPorEmail, type CuentaSuscriptor } from "./suscriptores-cuenta";
import {
  claveDeSesionCuenta,
  claveDeSesionSuscriptor,
  COOKIE_CUENTA,
  COOKIE_SUSCRIPTOR,
  crearSesionCuenta,
  crearSesionSuscriptor,
  leerCookie,
  leerSesionCuenta,
} from "./suscriptores-sesion";

/**
 * Crédito Harper, paso 3: Mi Cuenta para cualquier comprador con su mail
 * verificado y la billetera «Mi Crédito Harper». Todo detrás de
 * HARPER_CREDITO_ACTIVO, apagado: apagado, Mi Cuenta es la de siempre (solo
 * suscriptores) y no se muestra el crédito.
 *
 * El acceso a la cuenta queda separado del consentimiento para las
 * novedades: entrar con el código NUNCA da de alta en Suscriptores, no
 * reactiva una baja, no crea un cupón, un cashback ni un cliente, y no manda
 * mails. Quien ya tiene su fila en Suscriptores (suscripto o de baja) entra
 * con su sesión de siempre; quien no, con una sesión de cuenta que solo dice
 * su mail (COOKIE_CUENTA) y que el carrito y el checkout no leen.
 *
 * El crédito se lee de Airtable por el mail de la sesión: el de la fila de
 * Suscriptores (releída en cada visita) o el de la cookie firmada. Nunca por
 * un mail que mande el navegador.
 */

/** Si Mi Cuenta se abre a compradores sin suscripción y muestra el Crédito Harper. */
export const cuentaConCredito = (): boolean => creditoActivo();

// ---------- Quién está en la cuenta ----------

export type VisitaCuenta =
  /** Suscriptor (o de baja) con su sesión de siempre: la cuenta completa. */
  | { tipo: "suscriptor"; email: string; cuenta: CuentaSuscriptor }
  /** Compró (o va a comprar) sin suscribirse: compras y crédito, sin beneficios del programa anterior. */
  | { tipo: "comprador"; email: string };

/**
 * La cuenta de esta visita, por sus cookies. La del suscriptor manda; la de
 * la cuenta sin suscripción solo vale con el crédito prendido. Sin ninguna
 * válida, null.
 */
export async function visitaDeLaCuenta(
  cookies: { suscriptor?: string | null; cuenta?: string | null },
  opciones: { abierta?: boolean; ahora?: Date } = {}
): Promise<VisitaCuenta | null> {
  const ahora = opciones.ahora ?? new Date();
  const cuenta = await suscriptorDeLaSesion(cookies.suscriptor ?? null, ahora);
  if (cuenta) return { tipo: "suscriptor", email: cuenta.email, cuenta };
  if (!(opciones.abierta ?? cuentaConCredito())) return null;
  const clave = claveDeSesionCuenta();
  const sesion = clave ? leerSesionCuenta(clave, cookies.cuenta ?? null, ahora.getTime()) : null;
  return sesion ? { tipo: "comprador", email: sesion.email } : null;
}

/** La cuenta de una petición a la API (el checkout y el carrito, paso 4), por sus cookies. */
export function visitaDeLaPeticion(request: Request, opciones: { abierta?: boolean; ahora?: Date } = {}): Promise<VisitaCuenta | null> {
  const cookie = request.headers.get("cookie");
  return visitaDeLaCuenta({ suscriptor: leerCookie(cookie, COOKIE_SUSCRIPTOR), cuenta: leerCookie(cookie, COOKIE_CUENTA) }, opciones);
}

/**
 * Paso 4: lo que el carrito y la cotización del envío necesitan para mostrar
 * el Crédito Harper (solo lectura: no reserva nada; reservar es del checkout,
 * con la cuenta tomada). Null si está apagado, no hay cuenta verificada, no
 * tiene crédito para usar o Airtable no contesta: el carrito sigue sin él.
 * `usarCredito`: true para todo lo que se pueda, un monto, o nada (0).
 * `usable` y `proximoVencimiento` salen de `saldoDeCredito`, el mismo cálculo
 * de la billetera y del checkout (lo vencido no se puede usar; Ale, 18/11/2026).
 */
export async function creditoParaElCarrito(
  request: Request,
  usarCredito: unknown
): Promise<{ usable: number; pedido: number | null; proximoVencimiento: SaldoDeCredito["proximoVencimiento"] } | null> {
  if (!cuentaConCredito()) return null;
  try {
    const visita = await visitaDeLaPeticion(request);
    if (!visita) return null;
    const saldo = await leerSaldoDeCredito(visita.email, {
      almacen: almacenUsosAirtable,
      pedidos: lectorPedidosDeUsosAirtable,
      reloj: { ahora: () => Date.now(), dormir: async () => {} },
    });
    if (saldo.usable <= 0) return null;
    const pedido = usarCredito === true ? null : typeof usarCredito === "number" && usarCredito > 0 ? Math.floor(usarCredito) : 0;
    return { usable: saldo.usable, pedido, proximoVencimiento: saldo.proximoVencimiento };
  } catch (error) {
    console.error("[credito] no se pudo leer el crédito para el carrito:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------- Entrar con el código, sin darse de alta ----------

export type ResultadoEntrada =
  | {
      ok: true;
      /** "cuenta": sin suscripción. "ya": suscriptor. "baja": se dio de baja (entra con su saldo, sin beneficios nuevos). */
      estado: "cuenta" | "ya" | "baja";
      email: string;
      /** La cookie que abre la sesión, y la que se borra (para no quedar con la de otra persona). */
      abrir: { nombre: string; valor: string };
      cerrar: string;
    }
  | { ok: false; status: 400 | 404 | 503; error: string };

/**
 * Comprueba el código y abre la sesión de la cuenta. Solo LEE Suscriptores:
 * no escribe nada en Airtable ni manda mails. El código es el mismo de
 * /api/suscriptores/codigo (propósito «suscriptor»).
 */
export async function entrarALaCuenta(
  datos: { email: unknown; codigo: unknown; desafio: unknown },
  deps: {
    claveCodigos: Buffer | null;
    abierta?: boolean;
    ahora?: number;
    buscarSuscriptor?: (email: string) => Promise<CuentaSuscriptor | null>;
  }
): Promise<ResultadoEntrada> {
  if (!(deps.abierta ?? cuentaConCredito())) return { ok: false, status: 404, error: "No disponible" };
  const claveSuscriptor = claveDeSesionSuscriptor();
  const claveCuenta = claveDeSesionCuenta();
  if (!deps.claveCodigos || !claveSuscriptor || !claveCuenta) return { ok: false, status: 503, error: "No disponible" };
  const email = normalizarEmail(datos.email);
  if (!email) return { ok: false, status: 400, error: "Revisá el mail" };
  const ahora = deps.ahora ?? Date.now();
  if (!codigoCorrecto(deps.claveCodigos, datos.desafio, email, datos.codigo, ahora, "suscriptor")) {
    return { ok: false, status: 400, error: "El código no es correcto o ya venció. Revisalo o pedí otro." };
  }
  const existente = await (deps.buscarSuscriptor ?? suscriptorPorEmail)(email);
  if (existente) {
    return {
      ok: true,
      estado: estaActivo(existente) ? "ya" : "baja",
      email: existente.email,
      abrir: { nombre: COOKIE_SUSCRIPTOR, valor: crearSesionSuscriptor(claveSuscriptor, { suscriptorId: existente.id, email: existente.email }, ahora) },
      cerrar: COOKIE_CUENTA,
    };
  }
  return { ok: true, estado: "cuenta", email, abrir: { nombre: COOKIE_CUENTA, valor: crearSesionCuenta(claveCuenta, email, ahora) }, cerrar: COOKIE_SUSCRIPTOR };
}

/** Lo que la ruta /api/cuenta/entrar necesita de la petición. */
export type PeticionEntrada = { cuerpo: unknown; ip: string; desdeOtroSitio: boolean };

export type RespuestaEntrada = {
  status: number;
  cuerpo: Record<string, unknown>;
  reintentarEnSegundos?: number;
  /** La sesión que se abre y la cookie que se borra. */
  sesion?: { abrir: { nombre: string; valor: string }; cerrar: string; ahora: number };
};

const MINUTO = 60_000;

/**
 * Atiende POST /api/cuenta/entrar. El orden importa (revisión del PR #81):
 * con el interruptor apagado contesta 404 ANTES de tocar la cuota de
 * intentos, que comparte con /api/suscriptores/confirmar; así la ruta
 * apagada no le gasta intentos a nadie.
 */
export async function atenderEntrada(
  peticion: PeticionEntrada,
  deps: {
    /** lib/cuota.ts: `excedida` trae la ventana que se pasó, o null. */
    consumirCuota: (ventanas: { clave: string; ventanaMs: number; limite: number }[]) => Promise<{ excedida: unknown }>;
    claveCodigos: Buffer | null;
    abierta?: boolean;
    ahora?: number;
    buscarSuscriptor?: (email: string) => Promise<CuentaSuscriptor | null>;
  }
): Promise<RespuestaEntrada> {
  if (peticion.desdeOtroSitio) return { status: 403, cuerpo: { error: "Origen no permitido" } };
  const abierta = deps.abierta ?? cuentaConCredito();
  if (!abierta) return { status: 404, cuerpo: { error: "No disponible" } };

  const datos = (peticion.cuerpo ?? {}) as { email?: unknown; codigo?: unknown; desafio?: unknown };
  const email = normalizarEmail(datos.email);
  if (email) {
    const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
    const cuota = await deps.consumirCuota([
      { clave: `suscriptor-confirmar-ip:${peticion.ip}`, ventanaMs: 60 * MINUTO, limite: 20 },
      { clave: `suscriptor-confirmar-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 6 },
    ]);
    if (cuota.excedida) {
      return { status: 429, cuerpo: { error: "Demasiados intentos. Esperá unos minutos y pedí un código nuevo." }, reintentarEnSegundos: 300 };
    }
  }

  const ahora = deps.ahora ?? Date.now();
  const r = await entrarALaCuenta(
    { email: datos.email, codigo: datos.codigo, desafio: datos.desafio },
    { claveCodigos: deps.claveCodigos, abierta, ahora, buscarSuscriptor: deps.buscarSuscriptor }
  );
  if (!r.ok) return { status: r.status, cuerpo: { error: r.error } };
  return { status: 200, cuerpo: { estado: r.estado }, sesion: { abrir: r.abrir, cerrar: r.cerrar, ahora } };
}

// ---------- La billetera ----------

/**
 * «vencido» (Ale, 18/11/2026): un crédito disponible que venció con algo sin
 * usar. Si venció después de usarse entero, queda «usado».
 *
 * Un crédito disponible (ganado o devuelto) al que no le queda nada
 * (20/11/2026) no se ve «disponible»: «reservado» si lo tomó, aunque sea en
 * parte, una compra que todavía se está pagando (si no se paga, vuelve), y
 * «usado» si no.
 */
export type EstadoMovimientoCredito = "disponible" | "pendiente" | "en-revision" | "anulado" | "usado" | "reservado" | "vencido";

export type MovimientoCredito = {
  /**
   * «ganado»: el crédito de una compra. «uso»: lo que se usó en una compra
   * (paso 4). «devuelto» (20/11/2026): el crédito que se usó en una compra
   * que después se reembolsó entera y volvió a la cuenta; `pedido` es esa
   * compra, y tiene su propio vencimiento (6 meses desde que volvió).
   */
  tipo: "ganado" | "uso" | "devuelto";
  pedido: string;
  monto: number;
  /** 0 en un uso y en uno devuelto. */
  porcentaje: number;
  /**
   * En uno ganado o devuelto: «disponible», «reservado», «usado», «vencido»
   * (y, en uno ganado, también «pendiente», «en-revision» o «anulado»). En un
   * uso: «reservado» (la compra se está pagando) o «usado».
   */
  estado: EstadoMovimientoCredito;
  /** El día en Buenos Aires en que se anotó ("AAAA-MM-DD"); en uno devuelto, el día en que volvió ("" si no se sabe). */
  fecha: string;
  /**
   * Desde qué día se puede usar ("AAAA-MM-DD"), si ya hay entrega confirmada.
   * En uno pendiente es el día previsto; en uno disponible, el día real en que
   * quedó disponible; en uno devuelto, el día en que volvió a la cuenta.
   */
  disponibleDesde: string | null;
  /**
   * Hasta qué día se puede usar, inclusive ("AAAA-MM-DD"; Ale, 18/11/2026): 6
   * meses después de `disponibleDesde`. En uno pendiente es el previsto (si
   * se libera más tarde, vence más tarde). Null en un uso, en uno anulado o
   * sin fecha (una fila disponible, o un devuelto, sin fecha no vence).
   */
  venceEl: string | null;
  /**
   * Lo que queda sin usar de un crédito disponible o devuelto, del mismo
   * cálculo que `disponible` (si venció, lo que se perdió). Null en los demás.
   */
  restante: number | null;
  /** Pendiente con una devolución, reclamo o contracargo abierto; en un uso, en revisión por un contracargo. */
  conGestionAbierta: boolean;
  /**
   * Solo en un uso: la compra se reembolsó entera y ese crédito volvió a la
   * cuenta (es el movimiento «devuelto» del mismo pedido). El uso se sigue
   * viendo «usado»: lo que volvió es un crédito aparte. False en los demás.
   */
  devuelto: boolean;
};

export type BilleteraCredito = {
  /** Lo que se puede usar ahora: lo que queda sin vencer, después de lo usado y lo apartado por compras en curso. */
  disponible: number;
  pendiente: number;
  enRevision: number;
  /** Lo que venció sin usarse (Ale, 18/11/2026). */
  vencido: number;
  /** El próximo vencimiento de lo disponible: cuánto y el último día en que se puede usar. */
  proximoVencimiento: { monto: number; venceEl: string } | null;
  /** Un movimiento por pedido (lo ganado y lo usado), el más reciente primero. */
  movimientos: MovimientoCredito[];
};

const ESTADOS: Record<FilaCredito["estado"], EstadoMovimientoCredito> = {
  Disponible: "disponible",
  Pendiente: "pendiente",
  "A revisar": "en-revision",
  Anulado: "anulado",
};

const diaDe = (iso: string) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "" : fechaArgentina(fecha);
};

/** `hoy` como un momento: un "AAAA-MM-DD" es el mediodía de ese día en Buenos Aires. */
const momentoDe = (hoy: Date | string) => (typeof hoy === "string" ? new Date(`${hoy}T12:00:00.000-03:00`) : hoy);

/**
 * El estado de un crédito con su reparto (ganado o devuelto). Vencido: con
 * algo sin usar, «vencido»; usado entero antes de vencer, «usado» (Ale,
 * 18/11/2026). Sin vencer y sin nada que le quede (20/11/2026): «reservado»
 * si lo tomó una compra que todavía se está pagando, «usado» si no; nunca
 * «disponible» con $ 0.
 */
function estadoDelReparto(c: CreditoConSaldo): EstadoMovimientoCredito {
  if (c.vencido) return c.restante > 0 ? "vencido" : "usado";
  if (c.restante > 0) return "disponible";
  return c.reservado > 0 ? "reservado" : "usado";
}

/**
 * La billetera de un mail con sus filas de Créditos. Lo pendiente y lo que
 * está en revisión son los de `saldosDeLaCuenta` (un pedido con dos filas
 * cuenta una vez; lo anulado no suma). Lo disponible, lo vencido, el próximo
 * vencimiento y lo que queda de cada crédito salen de `saldoDeCredito`
 * (lib/credito-uso.ts, Ale, 18/11/2026): el mismo cálculo del carrito y del
 * checkout, nunca lo ganado solo. Con `uso.saldo` (el que leyó
 * `leerSaldoDeCredito`) se usa ese; sin él, se calcula acá con estas filas y
 * los usos que vengan (sin el estado de los pedidos: una reserva cuenta
 * mientras es reciente). `uso.usable` ya no se lee: queda por compatibilidad.
 *
 * Con `uso` (paso 4) se suman los usos: «usado» y «reservado» (una compra en
 * curso); lo liberado no se muestra. Un uso «Devuelto» (la compra se
 * reembolsó entera, 20/11/2026) se sigue viendo «usado», con `devuelto`, y lo
 * que volvió es un movimiento aparte, de tipo «devuelto», con lo que le queda
 * y su vencimiento. Las filas de otro mail o sin monto no se muestran. No
 * mira Saldos: el saldo de Suscriptores va aparte.
 */
export function billeteraDeCredito(
  filas: readonly FilaCredito[],
  email: string,
  hoy: Date | string = new Date(),
  uso?: { usos: readonly FilaUso[]; usable?: number; vencidas?: readonly FilaUso[]; saldo?: SaldoDeCredito }
): BilleteraCredito {
  const mail = email.trim().toLowerCase();
  const propias = filas.filter((f) => f.email === mail && f.monto > 0);
  const usosPropios = (uso?.usos ?? []).filter((u) => u.email === mail);
  const { credito } = saldosDeLaCuenta([], propias, hoy);
  const saldo = uso?.saldo ?? saldoDeCredito({ creditos: propias, usos: usosPropios }, new Map(), momentoDe(hoy));
  const calculo = new Map(saldo.porCredito.map((c) => [c.id, c]));
  const porPedido = new Map<string, FilaCredito[]>();
  for (const f of propias) porPedido.set(f.clave, [...(porPedido.get(f.clave) ?? []), f]);
  const ganados = [...porPedido.values()]
    .map((grupo) => laDelPedido(grupo))
    .filter((f): f is FilaCredito => f !== null)
    .map((f) => {
      const repartido = calculo.get(f.id) ?? null;
      // Disponible con una incidencia abierta (paso 5): retenido, se ve en revisión.
      // Con su reparto (disponible y sin incidencia): lo que le queda dice el estado.
      const estado: EstadoMovimientoCredito = repartido ? estadoDelReparto(repartido) : creditoRetenido(f) ? "en-revision" : ESTADOS[f.estado];
      const vence = repartido ? repartido.venceEl : f.estado !== "Anulado" && esFechaValida(f.disponibleDesde) ? venceEl(f.disponibleDesde) : null;
      return {
        tipo: "ganado" as const,
        pedido: f.pedido,
        monto: f.monto,
        porcentaje: f.porcentaje,
        estado,
        fecha: diaDe(f.generadoEl),
        disponibleDesde: f.disponibleDesde,
        venceEl: vence,
        restante: repartido ? repartido.restante : null,
        conGestionAbierta: (f.estado === "Pendiente" || f.estado === "Disponible") && f.incidenciaAbierta,
        devuelto: false,
        orden: f.generadoEl,
      };
    });
  const vencidas = new Set((uso?.vencidas ?? saldo.vencidas).map((u) => u.id));
  const usados = usosPropios
    .filter((u) => u.monto > 0 && !vencidas.has(u.id) && (u.estado === "Usado" || u.estado === "A revisar" || u.estado === "Reservado" || u.estado === "Devuelto"))
    .map((u) => ({
      tipo: "uso" as const,
      pedido: u.pedido,
      monto: u.monto,
      porcentaje: 0,
      estado: (u.estado === "Reservado" ? "reservado" : "usado") as EstadoMovimientoCredito,
      fecha: diaDe(u.generadoEl),
      disponibleDesde: null,
      venceEl: null,
      restante: null,
      conGestionAbierta: u.estado === "A revisar",
      devuelto: u.estado === "Devuelto",
      orden: u.generadoEl,
    }));
  // Lo que volvió por un reembolso total (20/11/2026): un crédito más, con su
  // reparto. Sin fecha (marcado a mano) va junto a su uso, arriba de él.
  const propiosPorId = new Map(usosPropios.map((u) => [u.id, u]));
  const devueltos = saldo.porCredito
    .filter((c) => c.origen === "devuelto" && propiosPorId.has(c.id))
    .map((c) => {
      const delUso = propiosPorId.get(c.id) as FilaUso;
      const volvio = c.disponibleDesde ? `${c.disponibleDesde}T15:00:00.000Z` : delUso.generadoEl;
      return {
        tipo: "devuelto" as const,
        pedido: c.pedido,
        monto: c.monto,
        porcentaje: 0,
        estado: estadoDelReparto(c),
        fecha: c.disponibleDesde ?? "",
        disponibleDesde: c.disponibleDesde,
        venceEl: c.venceEl,
        restante: c.restante,
        conGestionAbierta: false,
        devuelto: false,
        // Nunca antes que el uso del que salió.
        orden: volvio > delUso.generadoEl ? volvio : delUso.generadoEl,
      };
    });
  // Con la misma fecha, el devuelto va antes que su uso (el orden es estable).
  const movimientos = [...ganados, ...devueltos, ...usados].sort((a, b) => b.orden.localeCompare(a.orden)).map(({ orden: _orden, ...m }) => m);
  return {
    disponible: saldo.usable,
    pendiente: credito.pendiente,
    enRevision: credito.aRevisar,
    vencido: saldo.vencido,
    proximoVencimiento: saldo.proximoVencimiento,
    movimientos,
  };
}

/**
 * La billetera de la cuenta, leída de Airtable por el mail de la sesión: lo
 * ganado y lo usado (lib/credito-uso.ts). Solo lee. Si Airtable no contesta,
 * tira: la página muestra el error, nunca un $ 0.
 */
export async function billeteraDeLaCuenta(
  visita: VisitaCuenta,
  opciones: { hoy?: Date; almacen?: AlmacenUsos; pedidos?: LectorPedidosDeUsos } = {}
): Promise<BilleteraCredito> {
  const hoy = opciones.hoy ?? new Date();
  const leido = await leerSaldoDeCredito(visita.email, {
    almacen: opciones.almacen ?? almacenUsosAirtable,
    pedidos: opciones.pedidos ?? lectorPedidosDeUsosAirtable,
    reloj: { ahora: () => hoy.getTime(), dormir: async () => {} },
  });
  return billeteraDeCredito(leido.creditos, visita.email, hoy, { usos: leido.usos, vencidas: leido.vencidas, saldo: leido });
}
