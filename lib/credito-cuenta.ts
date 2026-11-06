import { creditosPorEmail } from "./credito-airtable";
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

// ---------- La billetera ----------

export type EstadoMovimientoCredito = "disponible" | "pendiente" | "en-revision" | "anulado";

export type MovimientoCredito = {
  pedido: string;
  monto: number;
  porcentaje: number;
  estado: EstadoMovimientoCredito;
  /** El día en Buenos Aires en que se anotó ("AAAA-MM-DD"). */
  fecha: string;
  /** Desde qué día se puede usar ("AAAA-MM-DD"), si ya hay entrega confirmada. */
  disponibleDesde: string | null;
  /** Pendiente con una devolución, reclamo o contracargo abierto. */
  conGestionAbierta: boolean;
};

export type BilleteraCredito = {
  disponible: number;
  pendiente: number;
  enRevision: number;
  /** Un movimiento por pedido, el más reciente primero. */
  movimientos: MovimientoCredito[];
};

const ESTADOS: Record<FilaCredito["estado"], EstadoMovimientoCredito> = {
  Disponible: "disponible",
  Pendiente: "pendiente",
  "A revisar": "en-revision",
  Anulado: "anulado",
};

/**
 * La billetera de un mail con sus filas de Créditos. Los totales son los de
 * `saldosDeLaCuenta` (un pedido con dos filas cuenta una vez; lo anulado no
 * suma). Las filas de otro mail o sin monto (las que solo bloquean un pedido)
 * no se muestran. No mira Saldos: el saldo de Suscriptores va aparte.
 */
export function billeteraDeCredito(filas: readonly FilaCredito[], email: string, hoy: Date | string = new Date()): BilleteraCredito {
  const mail = email.trim().toLowerCase();
  const propias = filas.filter((f) => f.email === mail && f.monto > 0);
  const { credito } = saldosDeLaCuenta([], propias, hoy);
  const porPedido = new Map<string, FilaCredito[]>();
  for (const f of propias) porPedido.set(f.clave, [...(porPedido.get(f.clave) ?? []), f]);
  const movimientos = [...porPedido.values()]
    .map((grupo) => laDelPedido(grupo))
    .filter((f): f is FilaCredito => f !== null)
    .map((f) => {
      const generado = new Date(f.generadoEl);
      return {
        pedido: f.pedido,
        monto: f.monto,
        porcentaje: f.porcentaje,
        estado: ESTADOS[f.estado],
        fecha: Number.isNaN(generado.getTime()) ? "" : fechaArgentina(generado),
        disponibleDesde: f.disponibleDesde,
        conGestionAbierta: f.estado === "Pendiente" && f.incidenciaAbierta,
        orden: f.generadoEl,
      };
    })
    .sort((a, b) => b.orden.localeCompare(a.orden))
    .map(({ orden: _orden, ...m }) => m);
  return { disponible: credito.disponible, pendiente: credito.pendiente, enRevision: credito.aRevisar, movimientos };
}

/**
 * La billetera de la cuenta, leída de Airtable por el mail de la sesión. Si
 * Airtable no contesta, tira: la página muestra el error, nunca un $ 0.
 */
export async function billeteraDeLaCuenta(
  visita: VisitaCuenta,
  leer: (email: string) => Promise<FilaCredito[]> = creditosPorEmail,
  hoy: Date = new Date()
): Promise<BilleteraCredito> {
  return billeteraDeCredito(await leer(visita.email), visita.email, hoy);
}
