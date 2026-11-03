import { createHash, randomUUID } from "node:crypto";
import { createRecord, ErrorAirtable, escaparFormula, getRecord, listRecords, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { cerrojoDesdeEntorno, soltarSinFallar, type Cerrojo } from "./cerrojo";
import { yaCompro } from "./clientes";
import { VERSION_CONDICIONES_SUSCRIPTORES } from "./legales";
import {
  cashbackDisponibleDesde,
  fechaArgentina,
  saldoDe,
  type MovimientoSaldo,
  type OrigenSuscripcion,
  type SuscriptorDelCarrito,
  type TipoMovimiento,
} from "./suscriptores";
import { claveDeSesionSuscriptor, COOKIE_SUSCRIPTOR, leerCookie, leerSesionSuscriptor } from "./suscriptores-sesion";

/**
 * La cuenta del suscriptor en Airtable (Ale, 03/11/2026): la fila de
 * Suscriptores (quién es, si sigue suscripto y si tiene el cupón) y sus
 * movimientos en Saldos (el cashback que suma y el saldo que usa). Es lo que
 * usan las rutas de /api/suscriptores, el carrito, el envío, el checkout y el
 * webhook. Ver las reglas en lib/suscriptores.ts.
 *
 * Todo lo que escribe es idempotente: el alta por mail (nunca dos filas para
 * el mismo), el cupón por pedido y cada movimiento por pedido y tipo. Así un
 * reintento del webhook, o dos pestañas, no duplican nada.
 */

export type FilaSuscriptor = {
  Email?: string;
  Nombre?: string;
  /** ISO. */
  Alta?: string;
  Acepta_mails?: boolean;
  Origen?: string;
  /** "Disponible" | "Usado". Vacío cuenta como sin cupón. */
  Cupon?: string;
  /** El pedido en el que usó el cupón. */
  Cupon_pedido?: string;
  /** ISO. Con fecha, ya no es suscriptor: ni mails ni beneficios. */
  Baja?: string | null;
  Version_condiciones?: string;
  Notas?: string;
};

export type FilaSaldo = {
  /** «HARPER-12345AB · Cashback»: el pedido y el tipo, que no se repiten. */
  Movimiento?: string;
  Email?: string;
  Suscriptor_id?: string;
  Tipo?: string;
  /** Positivo suma, negativo usa. */
  Monto?: number;
  Pedido?: string;
  /** ISO. */
  Fecha?: string;
  /** "2026-12-03". */
  Disponible_desde?: string | null;
  Anulado?: boolean;
  Notas?: string;
};

export type CuentaSuscriptor = {
  id: string;
  email: string;
  nombre: string;
  alta: string;
  aceptaMails: boolean;
  origen: string;
  cupon: "Disponible" | "Usado" | "";
  cuponPedido: string;
  /** ISO de la baja, o null si sigue suscripto. */
  baja: string | null;
};

function cuentaDe(registro: { id: string; fields: FilaSuscriptor }): CuentaSuscriptor {
  const f = registro.fields;
  return {
    id: registro.id,
    email: (f.Email ?? "").trim().toLowerCase(),
    nombre: (f.Nombre ?? "").trim(),
    alta: f.Alta ?? "",
    aceptaMails: f.Acepta_mails === true,
    origen: f.Origen ?? "",
    cupon: f.Cupon === "Disponible" || f.Cupon === "Usado" ? f.Cupon : "",
    cuponPedido: (f.Cupon_pedido ?? "").trim(),
    baja: f.Baja ? f.Baja : null,
  };
}

/** Sigue suscripto: la fila no tiene Baja. */
export function estaActivo(cuenta: Pick<CuentaSuscriptor, "baja">): boolean {
  return !cuenta.baja;
}

/** El cupón sin usar (sin mirar todavía si ese mail ya compró). */
export function tieneCupon(cuenta: Pick<CuentaSuscriptor, "cupon" | "cuponPedido">): boolean {
  return cuenta.cupon === "Disponible" && !cuenta.cuponPedido;
}

/** La fila con ese mail, con baja o sin ella. Si hubiera dos (cargadas a mano), la más vieja. */
export async function suscriptorPorEmail(email: string): Promise<CuentaSuscriptor | null> {
  const filas = await listRecords<FilaSuscriptor>(TABLAS.suscriptores, {
    filterByFormula: `LOWER({Email}) = '${escaparFormula(email.trim().toLowerCase())}'`,
    revalidate: 0,
  });
  const primera = [...filas].sort((a, b) => a.createdTime.localeCompare(b.createdTime))[0];
  return primera ? cuentaDe(primera) : null;
}

/** La fila por su id, fresca. Null si ya no existe. */
export async function suscriptorPorId(id: string): Promise<CuentaSuscriptor | null> {
  try {
    return cuentaDe(await getRecord<FilaSuscriptor>(TABLAS.suscriptores, id));
  } catch (error) {
    if (error instanceof ErrorAirtable && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

/**
 * El suscriptor de la sesión (el valor de la cookie): la firma tiene que ser
 * nuestra, la fila tiene que existir con el mismo mail y sin baja. Si no,
 * null: compra como cualquiera.
 */
export async function suscriptorDeLaSesion(valor: string | null | undefined, ahora = new Date()): Promise<CuentaSuscriptor | null> {
  const clave = claveDeSesionSuscriptor();
  if (!clave || !valor) return null;
  const sesion = leerSesionSuscriptor(clave, valor, ahora.getTime());
  if (!sesion) return null;
  const cuenta = await suscriptorPorId(sesion.suscriptorId);
  if (!cuenta || cuenta.email !== sesion.email.toLowerCase() || !estaActivo(cuenta)) return null;
  return cuenta;
}

/**
 * El suscriptor de una petición a la API, por su cookie. Si Airtable falla,
 * null: el carrito sigue andando, sin los beneficios (el checkout lo vuelve a
 * mirar y, si falla ahí, no cobra).
 */
export async function suscriptorDeLaPeticion(request: Request): Promise<CuentaSuscriptor | null> {
  const valor = leerCookie(request.headers.get("cookie"), COOKIE_SUSCRIPTOR);
  if (!valor) return null;
  try {
    return await suscriptorDeLaSesion(valor);
  } catch (error) {
    console.error("[suscriptores] no se pudo leer el suscriptor de la sesión:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Lo que el carrito necesita: el cupón (solo si ese mail todavía no tiene una
 * compra confirmada, como el viejo HARPER10; el checkout lo vuelve a mirar con
 * el mail y el DNI que escribe) y el saldo que ya se puede usar.
 */
export async function suscriptorParaElCarrito(cuenta: CuentaSuscriptor, ahora = new Date()): Promise<SuscriptorDelCarrito> {
  const [movimientos, compro] = await Promise.all([
    movimientosDe(cuenta.id),
    tieneCupon(cuenta) ? yaCompro(cuenta.email, "") : Promise.resolve(false),
  ]);
  return {
    id: cuenta.id,
    email: cuenta.email,
    cuponDisponible: tieneCupon(cuenta) && !compro,
    saldoDisponible: saldoDe(movimientos, ahora).disponible,
  };
}

/** Lo mismo desde la petición, sin romper: si Airtable falla, sin beneficios. */
export async function suscriptorDelCarritoDeLaPeticion(request: Request): Promise<SuscriptorDelCarrito | null> {
  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return null;
  try {
    return await suscriptorParaElCarrito(cuenta);
  } catch (error) {
    console.error("[suscriptores] no se pudo leer el saldo:", error instanceof Error ? error.message : error);
    return { id: cuenta.id, email: cuenta.email, cuponDisponible: false, saldoDisponible: 0 };
  }
}

export type ResultadoAlta = { estado: "nueva" | "reactivada" | "ya"; cuenta: CuentaSuscriptor };

const TTL_ALTA_MS = 20_000;

/**
 * Suscribe ese mail, o devuelve la fila que ya tiene. Nunca dos filas para el
 * mismo mail (en minúsculas): con Redis, un cerrojo por mail para dos
 * confirmaciones a la vez; sin Redis, la lectura previa.
 *
 *  - Sin fila: se crea, con el cupón Disponible. Es la única vez que el cupón
 *    nace disponible.
 *  - Con baja: se reactiva (sin baja, acepta mails, condiciones de hoy). El
 *    cupón queda como estaba: si ya lo usó, no vuelve.
 *  - Activa: no cambia nada (si no tenía nombre y ahora lo dio, se completa).
 *
 * Quien llama ya comprobó el mail con el código y que la persona aceptó
 * recibir los mails.
 */
export async function darDeAlta(datos: {
  email: string;
  nombre?: string;
  origen: OrigenSuscripcion;
  ahora?: Date;
  cerrojo?: Cerrojo | null;
}): Promise<ResultadoAlta> {
  const email = datos.email.trim().toLowerCase();
  const ahora = datos.ahora ?? new Date();
  const nombre = (datos.nombre ?? "").trim().slice(0, 80);
  const cerrojo = datos.cerrojo === undefined ? cerrojoDesdeEntorno() : datos.cerrojo;
  const clave = `harper:alta-suscriptor:${createHash("sha256").update(email).digest("base64url").slice(0, 20)}`;
  const nonce = randomUUID();

  if (cerrojo && !(await cerrojo.tomar(clave, nonce, TTL_ALTA_MS))) {
    throw new ErrorAltaEnCurso();
  }

  try {
    const existente = await suscriptorPorEmail(email);

    if (existente && estaActivo(existente)) {
      if (nombre && !existente.nombre) {
        await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, existente.id, { Nombre: nombre });
        return { estado: "ya", cuenta: { ...existente, nombre } };
      }
      return { estado: "ya", cuenta: existente };
    }

    if (existente) {
      const anterior = await getRecord<FilaSuscriptor>(TABLAS.suscriptores, existente.id);
      const nota = `Volvió a suscribirse el ${fechaArgentina(ahora)} (estaba de baja desde ${existente.baja}).`;
      const fila = await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, existente.id, {
        Baja: null,
        Acepta_mails: true,
        Version_condiciones: VERSION_CONDICIONES_SUSCRIPTORES,
        ...(nombre && !existente.nombre ? { Nombre: nombre } : {}),
        Notas: [anterior.fields.Notas?.trim(), nota].filter(Boolean).join("\n"),
      });
      return { estado: "reactivada", cuenta: cuentaDe(fila) };
    }

    const fila = await createRecord<FilaSuscriptor>(TABLAS.suscriptores, {
      Email: email,
      ...(nombre ? { Nombre: nombre } : {}),
      Alta: ahora.toISOString(),
      Acepta_mails: true,
      Origen: datos.origen,
      Cupon: "Disponible",
      Version_condiciones: VERSION_CONDICIONES_SUSCRIPTORES,
    });
    return { estado: "nueva", cuenta: cuentaDe(fila) };
  } finally {
    if (cerrojo) await soltarSinFallar(cerrojo, clave, nonce);
  }
}

/** Otra confirmación del mismo mail está en curso (dos pestañas): que reintente en un momento. */
export class ErrorAltaEnCurso extends Error {
  constructor() {
    super("ya hay un alta en curso para ese mail");
    this.name = "ErrorAltaEnCurso";
  }
}

/**
 * La baja: deja de recibir mails y de tener beneficios. Idempotente (dos
 * clics en el enlace son una baja). El saldo queda en Saldos: si vuelve a
 * suscribirse con el mismo mail, lo recupera. Con `email`, solo si la fila
 * sigue teniendo ese mail (el enlace de un mail viejo no da de baja a otro).
 */
export async function darDeBaja(datos: { suscriptorId: string; email?: string; ahora?: Date }): Promise<"baja" | "ya" | "sin-suscriptor"> {
  const cuenta = await suscriptorPorId(datos.suscriptorId);
  if (!cuenta || (datos.email !== undefined && cuenta.email !== datos.email.trim().toLowerCase())) return "sin-suscriptor";
  if (!estaActivo(cuenta)) return "ya";
  await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, cuenta.id, {
    Baja: (datos.ahora ?? new Date()).toISOString(),
    Acepta_mails: false,
  });
  return "baja";
}

export type ResultadoCupon =
  | { estado: "registrado" | "ya"; cuenta: CuentaSuscriptor }
  | { estado: "conflicto"; cuenta: CuentaSuscriptor }
  | { estado: "sin-suscriptor" };

/**
 * Anota que el suscriptor usó su cupón de bienvenida en este pedido.
 * Idempotente: si ya está anotado en el mismo pedido, no hace nada. Si ya lo
 * había usado en OTRO pedido (o figura Usado), no lo pisa: devuelve
 * "conflicto" para que Harper lo revise. Quien llama sostiene el cerrojo del
 * suscriptor (lib/webhook-proceso.ts, lib/suscriptores-sin-pago.ts).
 */
export async function registrarCupon(datos: { suscriptorId: string; numeroPedido: string }): Promise<ResultadoCupon> {
  const cuenta = await suscriptorPorId(datos.suscriptorId);
  if (!cuenta) return { estado: "sin-suscriptor" };
  if (cuenta.cuponPedido === datos.numeroPedido) return { estado: "ya", cuenta };
  if (!tieneCupon(cuenta)) return { estado: "conflicto", cuenta };

  const fila = await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, cuenta.id, {
    Cupon: "Usado",
    Cupon_pedido: datos.numeroPedido,
  });
  return { estado: "registrado", cuenta: cuentaDe(fila) };
}

/** Devuelve el cupón si el pedido en el que se anotó no se concretó (el pedido en $ 0 que falló). */
export async function devolverCupon(datos: { suscriptorId: string; numeroPedido: string }): Promise<void> {
  const cuenta = await suscriptorPorId(datos.suscriptorId);
  if (!cuenta || cuenta.cuponPedido !== datos.numeroPedido) return;
  await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, cuenta.id, { Cupon: "Disponible", Cupon_pedido: "" });
}

function movimientoDe(registro: AirtableRecord<FilaSaldo>): MovimientoSaldo {
  const f = registro.fields;
  const tipo: TipoMovimiento = f.Tipo === "Cashback" || f.Tipo === "Uso" ? f.Tipo : "Ajuste";
  return {
    id: registro.id,
    tipo,
    monto: typeof f.Monto === "number" ? f.Monto : Number(f.Monto ?? 0),
    pedido: (f.Pedido ?? "").trim(),
    fecha: f.Fecha ?? registro.createdTime,
    disponibleDesde: f.Disponible_desde ? f.Disponible_desde.slice(0, 10) : null,
    anulado: f.Anulado === true,
  };
}

/** Los movimientos del suscriptor, del más nuevo al más viejo. Frescos: con esto se cobra. */
export async function movimientosDe(suscriptorId: string): Promise<MovimientoSaldo[]> {
  const filas = await listRecords<FilaSaldo>(TABLAS.saldos, {
    filterByFormula: `{Suscriptor_id} = '${escaparFormula(suscriptorId)}'`,
    revalidate: 0,
  });
  return filas.map(movimientoDe).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** El movimiento de ese tipo de ese pedido, si existe (anulado o no). */
async function movimientoDelPedido(numeroPedido: string, tipo: TipoMovimiento): Promise<AirtableRecord<FilaSaldo> | null> {
  const filas = await listRecords<FilaSaldo>(TABLAS.saldos, {
    filterByFormula: `AND({Pedido} = '${escaparFormula(numeroPedido)}', {Tipo} = '${tipo}')`,
    revalidate: 0,
  });
  return filas[0] ?? null;
}

type DatosMovimiento = { suscriptorId: string; email: string; numeroPedido: string; fecha: Date };

/**
 * Crea el movimiento de ese pedido y tipo, si no existe. Uno por pedido y
 * tipo, aunque esté anulado: un reintento nunca vuelve a crear lo que Harper
 * anuló a mano.
 */
async function registrarMovimiento(
  datos: DatosMovimiento & { tipo: TipoMovimiento; monto: number; disponibleDesde: string | null; notas?: string }
): Promise<{ estado: "creado" | "ya"; movimiento: MovimientoSaldo }> {
  const existente = await movimientoDelPedido(datos.numeroPedido, datos.tipo);
  if (existente) return { estado: "ya", movimiento: movimientoDe(existente) };

  const fila = await createRecord<FilaSaldo>(TABLAS.saldos, {
    Movimiento: `${datos.numeroPedido} · ${datos.tipo}`,
    Email: datos.email,
    Suscriptor_id: datos.suscriptorId,
    Tipo: datos.tipo,
    Monto: datos.monto,
    Pedido: datos.numeroPedido,
    Fecha: datos.fecha.toISOString(),
    ...(datos.disponibleDesde ? { Disponible_desde: datos.disponibleDesde } : {}),
    ...(datos.notas ? { Notas: datos.notas } : {}),
  });
  return { estado: "creado", movimiento: movimientoDe(fila) };
}

/**
 * El saldo que usó en un pedido: una fila Uso en negativo. `alcanzaba` dice
 * si, sin contar este pedido, tenía ese saldo disponible: si no (dos pedidos
 * pagados a la vez con el mismo saldo), la fila se crea igual (el comprador ya
 * pagó menos y el saldo queda en negativo hasta el próximo cashback) y quien
 * llama avisa a Harper.
 */
export async function registrarUso(datos: DatosMovimiento & { monto: number }): Promise<{ estado: "creado" | "ya"; alcanzaba: boolean }> {
  // Lo que tenía sin este pedido: también al retomar, cuando el Uso ya está.
  const otros = (await movimientosDe(datos.suscriptorId)).filter((m) => !(m.tipo === "Uso" && m.pedido === datos.numeroPedido));
  const alcanzaba = saldoDe(otros, datos.fecha).disponible >= datos.monto;
  const r = await registrarMovimiento({ ...datos, tipo: "Uso", monto: -Math.abs(datos.monto), disponibleDesde: null });
  return { estado: r.estado, alcanzaba };
}

/** El cashback de un pago: una fila Cashback que se puede usar a los 30 días del pago (en Buenos Aires). */
export async function registrarCashback(datos: DatosMovimiento & { monto: number }): Promise<{ estado: "creado" | "ya"; disponibleDesde: string }> {
  const disponibleDesde = cashbackDisponibleDesde(datos.fecha);
  const r = await registrarMovimiento({ ...datos, tipo: "Cashback", monto: Math.abs(datos.monto), disponibleDesde });
  return { estado: r.estado, disponibleDesde: r.movimiento.disponibleDesde ?? disponibleDesde };
}

/** Anula una fila (el Uso de un pedido en $ 0 que no se pudo completar). */
export async function anularMovimiento(id: string, motivo: string): Promise<void> {
  const fila = await getRecord<FilaSaldo>(TABLAS.saldos, id);
  await updateRecord<FilaSaldo>(TABLAS.saldos, id, {
    Anulado: true,
    Notas: [fila.fields.Notas?.trim(), motivo].filter(Boolean).join("\n"),
  });
}

export type ResultadoAnulacion =
  | { estado: "anulado" | "ya-anulado" | "disponible"; monto: number; disponibleDesde: string | null }
  | { estado: "sin-cashback" };

/**
 * Si el pedido tiene un cashback que todavía no se puede usar, lo anula (el
 * arrepentimiento o la devolución, Ale, 03/11/2026). Si ya se puede usar, no
 * lo toca: lo decide Harper.
 */
export async function anularCashbackPendiente(numeroPedido: string, motivo: string, ahora = new Date()): Promise<ResultadoAnulacion> {
  const fila = await movimientoDelPedido(numeroPedido, "Cashback");
  if (!fila) return { estado: "sin-cashback" };
  const m = movimientoDe(fila);
  if (m.anulado) return { estado: "ya-anulado", monto: m.monto, disponibleDesde: m.disponibleDesde };
  if (!m.disponibleDesde || m.disponibleDesde <= fechaArgentina(ahora)) {
    return { estado: "disponible", monto: m.monto, disponibleDesde: m.disponibleDesde };
  }
  await anularMovimiento(fila.id, motivo);
  return { estado: "anulado", monto: m.monto, disponibleDesde: m.disponibleDesde };
}

/** Lo que muestra «mi cuenta»: el saldo, lo que está en camino, el cupón y el historial. */
export async function resumenDeLaCuenta(cuenta: CuentaSuscriptor, ahora = new Date()) {
  const movimientos = await movimientosDe(cuenta.id);
  const saldo = saldoDe(movimientos, ahora);
  return {
    email: cuenta.email,
    nombre: cuenta.nombre,
    /** "Disponible": lo tiene para su primera compra; "Usado": en `cuponPedido`. */
    cupon: tieneCupon(cuenta) ? ("Disponible" as const) : ("Usado" as const),
    cuponPedido: cuenta.cuponPedido,
    saldoDisponible: saldo.disponible,
    saldoEnCamino: saldo.enCamino,
    movimientos: movimientos.filter((m) => !m.anulado),
  };
}

/** El cerrojo de un suscriptor: el webhook y el pedido en $ 0 no tocan su cupón y su saldo a la vez. */
export const claveSuscriptor = (suscriptorId: string) => `harper:suscriptor:${suscriptorId}`;
