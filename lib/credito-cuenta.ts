import { createHash } from "node:crypto";
import { almacenUsosAirtable, leerSaldoDeCredito, lectorPedidosDeUsosAirtable, type AlmacenUsos, type FilaUso, type LectorPedidosDeUsos } from "./credito-uso";
import { creditoActivo } from "./credito-harper";
import { laDelPedido, saldosDeLaCuenta, type FilaCredito } from "./credito-persistencia";
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
 */
export async function creditoParaElCarrito(request: Request, usarCredito: unknown): Promise<{ usable: number; pedido: number | null } | null> {
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
    return { usable: saldo.usable, pedido };
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

export type EstadoMovimientoCredito = "disponible" | "pendiente" | "en-revision" | "anulado" | "usado" | "reservado";

export type MovimientoCredito = {
  /** «ganado»: el crédito de una compra. «uso»: lo que se usó en una compra (paso 4). */
  tipo: "ganado" | "uso";
  pedido: string;
  monto: number;
  /** 0 en un uso. */
  porcentaje: number;
  estado: EstadoMovimientoCredito;
  /** El día en Buenos Aires en que se anotó ("AAAA-MM-DD"). */
  fecha: string;
  /** Desde qué día se puede usar ("AAAA-MM-DD"), si ya hay entrega confirmada. */
  disponibleDesde: string | null;
  /** Pendiente con una devolución, reclamo o contracargo abierto; en un uso, en revisión por un reembolso. */
  conGestionAbierta: boolean;
};

export type BilleteraCredito = {
  /** Lo que se puede usar ahora: lo ganado disponible menos lo usado y lo apartado por compras en curso. */
  disponible: number;
  pendiente: number;
  enRevision: number;
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

/**
 * La billetera de un mail con sus filas de Créditos. Los totales de lo ganado
 * son los de `saldosDeLaCuenta` (un pedido con dos filas cuenta una vez; lo
 * anulado no suma). Con `uso` (paso 4), lo disponible es lo que se puede usar
 * (lib/credito-uso.ts) y se suman los usos: «usado» y «reservado» (una compra
 * en curso); lo liberado o devuelto no se muestra. Las filas de otro mail o
 * sin monto no se muestran. No mira Saldos: el saldo de Suscriptores va aparte.
 */
export function billeteraDeCredito(
  filas: readonly FilaCredito[],
  email: string,
  hoy: Date | string = new Date(),
  uso?: { usos: readonly FilaUso[]; usable: number; vencidas?: readonly FilaUso[] }
): BilleteraCredito {
  const mail = email.trim().toLowerCase();
  const propias = filas.filter((f) => f.email === mail && f.monto > 0);
  const { credito } = saldosDeLaCuenta([], propias, hoy);
  const porPedido = new Map<string, FilaCredito[]>();
  for (const f of propias) porPedido.set(f.clave, [...(porPedido.get(f.clave) ?? []), f]);
  const ganados = [...porPedido.values()]
    .map((grupo) => laDelPedido(grupo))
    .filter((f): f is FilaCredito => f !== null)
    .map((f) => ({
      tipo: "ganado" as const,
      pedido: f.pedido,
      monto: f.monto,
      porcentaje: f.porcentaje,
      estado: ESTADOS[f.estado],
      fecha: diaDe(f.generadoEl),
      disponibleDesde: f.disponibleDesde,
      conGestionAbierta: f.estado === "Pendiente" && f.incidenciaAbierta,
      orden: f.generadoEl,
    }));
  const vencidas = new Set((uso?.vencidas ?? []).map((u) => u.id));
  const usados = (uso?.usos ?? [])
    .filter((u) => u.email === mail && u.monto > 0 && !vencidas.has(u.id) && (u.estado === "Usado" || u.estado === "A revisar" || u.estado === "Reservado"))
    .map((u) => ({
      tipo: "uso" as const,
      pedido: u.pedido,
      monto: u.monto,
      porcentaje: 0,
      estado: (u.estado === "Reservado" ? "reservado" : "usado") as EstadoMovimientoCredito,
      fecha: diaDe(u.generadoEl),
      disponibleDesde: null,
      conGestionAbierta: u.estado === "A revisar",
      orden: u.generadoEl,
    }));
  const movimientos = [...ganados, ...usados].sort((a, b) => b.orden.localeCompare(a.orden)).map(({ orden: _orden, ...m }) => m);
  return { disponible: uso ? uso.usable : credito.disponible, pendiente: credito.pendiente, enRevision: credito.aRevisar, movimientos };
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
  return billeteraDeCredito(leido.creditos, visita.email, hoy, { usos: leido.usos, usable: leido.usable, vencidas: leido.vencidas });
}
