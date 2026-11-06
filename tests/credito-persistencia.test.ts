import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Tareas 09 y 10: la persistencia del Crédito Harper, contra un almacén y un
// cerrojo en memoria (sandbox). No hay Airtable ni Redis de verdad: nada de
// esto escribe en la base real ni lo usa el webhook todavía.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;

import { ErrorCerrojo, type Cerrojo } from "../lib/cerrojo";
import type { PedidoParaCredito, RenglonCobrado } from "../lib/credito-harper";
import {
  MARGEN_CERROJO_MS,
  REGLAS_CREDITO,
  TTL_CREDITO_MS,
  anularPorPedido,
  aplicarDevolucion,
  claveCerrojoCredito,
  confirmarEntrega,
  liberarDisponibles,
  marcarIncidencia,
  registrarCredito,
  saldosDeLaCuenta,
  type AlmacenCreditos,
  type DependenciasCredito,
  type FilaCredito,
  type PedidoAcreditable,
} from "../lib/credito-persistencia";
import { saldoDe, type MovimientoSaldo } from "../lib/suscriptores";

// ---------- El sandbox ----------

const pausa = () => new Promise<void>((listo) => setImmediate(listo));

/** La tabla «Créditos», en memoria. Cada operación espera un turno, como una llamada de red. */
class AlmacenEnMemoria implements AlmacenCreditos {
  filas: FilaCredito[] = [];
  escrituras = 0;
  lecturas = 0;
  private siguiente = 1;
  /** Para forzar carreras, simular una caída o una lectura lenta. */
  antesDeCrear: () => Promise<void> = async () => {};
  despuesDeCrear: () => Promise<void> = async () => {};
  alLeer: () => void = () => {};

  async delPedido(pedido: string) {
    await pausa();
    this.lecturas++;
    this.alLeer();
    return this.filas.filter((f) => f.pedido === pedido).map((f) => ({ ...f }));
  }
  async crear(fila: Omit<FilaCredito, "id">) {
    await this.antesDeCrear();
    await pausa();
    const nueva = { ...fila, id: `rec${String(this.siguiente++).padStart(14, "0")}` };
    this.filas.push(nueva);
    this.escrituras++;
    await this.despuesDeCrear();
    return { ...nueva };
  }
  async actualizar(id: string, cambios: Partial<FilaCredito>) {
    await pausa();
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) throw new Error(`No existe ${id}`);
    Object.assign(fila, cambios);
    this.escrituras++;
    return { ...fila };
  }
  async pendientes() {
    await pausa();
    return this.filas.filter((f) => f.estado === "Pendiente").map((f) => ({ ...f }));
  }
}

/** Un cerrojo como el de Redis (SET NX con nonce). */
class CerrojoEnMemoria implements Cerrojo {
  llaves = new Map<string, string>();
  tomados: string[] = [];
  falla: "tomar" | "soltar" | null = null;
  /**
   * SOLO EN ESTAS PRUEBAS: un cerrojo que no excluye, como uno cuya llave
   * venció (TTL) o un Redis que la perdió. Sirve para probar la defensa de
   * respaldo; en producción no hay forma de pedir esto.
   */
  noExcluye = false;
  async tomar(clave: string, nonce: string, ttlMs: number) {
    assert.equal(ttlMs, TTL_CREDITO_MS);
    if (this.falla === "tomar") throw new Error("Redis no contestó");
    if (this.noExcluye) return true;
    if (this.llaves.has(clave)) return false;
    this.llaves.set(clave, nonce);
    this.tomados.push(clave);
    return true;
  }
  async soltar(clave: string, nonce: string) {
    if (this.falla === "soltar") throw new Error("Redis no contestó");
    if (this.llaves.get(clave) === nonce) this.llaves.delete(clave);
  }
}

function sandbox(
  opciones: { cerrojo?: "redis" | "sin-redis" | "no-excluye"; hoy?: string; cashback?: Record<string, { anulado: boolean }> } = {}
) {
  const almacen = new AlmacenEnMemoria();
  const cerrojo = new CerrojoEnMemoria();
  cerrojo.noExcluye = opciones.cerrojo === "no-excluye";
  let ahora = new Date(`${opciones.hoy ?? "2026-11-05"}T15:00:00Z`);
  let n = 0;
  const deps: DependenciasCredito = {
    almacen,
    cerrojo: opciones.cerrojo === "sin-redis" ? null : cerrojo,
    cashbackAnterior: async (pedido) => opciones.cashback?.[pedido] ?? null,
    ahora: () => ahora,
    nonce: () => `nonce-${++n}`,
  };
  return {
    almacen,
    cerrojo,
    deps,
    irA: (dia: string) => (ahora = new Date(`${dia}T15:00:00Z`)),
    avanzar: (ms: number) => (ahora = new Date(ahora.getTime() + ms)),
  };
}

/** El pedido quedó sin cobro (en estas pruebas, dicho a mano; en el webhook se lee de Mercado Pago). */
const SIN_COBRO = { quedoSinCobro: async () => true };

const anteojo = (subtotal: number, cantidad = 1): RenglonCobrado => ({ categoria: "Anteojos", cantidad, subtotal });
const estuche = (subtotal: number): RenglonCobrado => ({ categoria: "Estuches", cantidad: 1, subtotal });

/** Un Dúo pagado: 89.900 + 67.425 = 157.325 → 10 % = 15.733. */
const DUO: PedidoParaCredito & { email: string } = {
  numero: "HARPER-2001",
  renglones: [anteojo(89_900), anteojo(67_425), estuche(9_900)],
  pagado: true,
  regimen: "nuevo",
  email: " Cliente@Ejemplo.com ",
};
const vigentes = (almacen: AlmacenEnMemoria, pedido = DUO.numero) => almacen.filas.filter((f) => f.pedido === pedido && f.estado !== "Anulado");

// ---------- 1. Un solo crédito por pedido ----------

test("Al acreditarse el pago: una fila Pendiente con el 10 % de lo pagado en anteojos, sin estuches", async () => {
  const { almacen, deps } = sandbox();
  const r = await registrarCredito(DUO, deps);
  assert.equal(r.estado, "creado");
  assert.equal(almacen.filas.length, 1);
  const [fila] = almacen.filas;
  assert.equal(fila.clave, "credito-harper:HARPER-2001");
  assert.equal(fila.email, "cliente@ejemplo.com");
  assert.deepEqual(
    { monto: fila.monto, porcentaje: fila.porcentaje, base: fila.base, anteojos: fila.anteojos, estado: fila.estado },
    { monto: 15_733, porcentaje: 10, base: 157_325, anteojos: 2, estado: "Pendiente" }
  );
  assert.equal(fila.fechaEntrega, null);
  assert.equal(fila.disponibleDesde, null);
  assert.equal(fila.incidenciaAbierta, false);
  assert.equal(fila.reglas, REGLAS_CREDITO);
  assert.match(fila.notas, /Pendiente: 10 % de \$ 157325/);

  const uno = await registrarCredito({ ...DUO, numero: "HARPER-2002", renglones: [anteojo(89_900)] }, deps);
  assert.equal(uno.estado, "creado");
  assert.equal(uno.estado === "creado" && uno.fila.monto, 4_495, "5 % con un anteojo");
});

test("Reintentos: el mismo pago notificado otra vez no crea otro crédito", async () => {
  const { almacen, deps } = sandbox();
  assert.equal((await registrarCredito(DUO, deps)).estado, "creado");
  for (let i = 0; i < 3; i++) {
    const r = await registrarCredito(DUO, deps);
    assert.equal(r.estado, "ya");
    assert.equal(r.estado === "ya" && r.fila?.id, almacen.filas[0].id);
  }
  // Con espacios en el número, también es el mismo pedido.
  assert.equal((await registrarCredito({ ...DUO, numero: ` ${DUO.numero} ` }, deps)).estado, "ya");
  assert.equal(almacen.filas.length, 1);
});

test("Diez notificaciones a la vez, con el cerrojo: una crea, las demás quedan ocupadas y al reintentar ven «ya»", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  const resultados = await Promise.all(Array.from({ length: 10 }, () => registrarCredito(DUO, deps)));
  assert.equal(resultados.filter((r) => r.estado === "creado").length, 1);
  assert.equal(resultados.filter((r) => r.estado === "ocupado").length, 9);
  assert.equal(almacen.filas.length, 1);
  assert.equal(cerrojo.llaves.size, 0, "soltó la llave");
  assert.equal(cerrojo.tomados[0], claveCerrojoCredito(DUO.numero));
  assert.equal(claveCerrojoCredito(DUO.numero), "harper:credito:HARPER-2001");

  const reintentos = await Promise.all(Array.from({ length: 10 }, () => registrarCredito(DUO, deps)));
  assert.ok(reintentos.every((r) => r.estado === "ya" || r.estado === "ocupado"));
  assert.equal(almacen.filas.length, 1);
});

test("Sin Redis no se escribe nada: cada operación tira ErrorCerrojo (se reintenta) y al volver Redis funciona", async () => {
  const { almacen, cerrojo, deps, irA } = sandbox({ cerrojo: "sin-redis" });
  const operaciones: [string, () => Promise<unknown>][] = [
    ["registrar", () => registrarCredito(DUO, deps)],
    ["entrega", () => confirmarEntrega(DUO.numero, "2026-11-10", deps)],
    ["liberar", () => liberarDisponibles(deps)],
    ["devolución", () => aplicarDevolucion(DUO.numero, [], deps)],
    ["reembolso", () => anularPorPedido(DUO.numero, "reembolso", deps, SIN_COBRO)],
    ["incidencia", () => marcarIncidencia(DUO.numero, true, "reclamo", deps)],
  ];
  for (const [que, hacer] of operaciones) await assert.rejects(hacer(), ErrorCerrojo, que);
  assert.equal(almacen.escrituras, 0);
  assert.equal(almacen.lecturas, 0, "ni siquiera lee");

  // Vuelve Redis: el reintento anota normalmente.
  deps.cerrojo = cerrojo;
  assert.equal((await registrarCredito(DUO, deps)).estado, "creado");
  assert.equal((await confirmarEntrega(DUO.numero, "2026-11-10", deps)).estado, "anotada");
  irA("2026-12-10");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, [DUO.numero]);
});

test("Si el trabajo tarda tanto que la llave pudo vencer, no escribe y se puede reintentar", async () => {
  const { almacen, cerrojo, deps, avanzar } = sandbox();
  // Una lectura de Airtable lentísima: pasa el TTL menos el margen.
  almacen.alLeer = () => avanzar(TTL_CREDITO_MS - MARGEN_CERROJO_MS + 1);
  await assert.rejects(registrarCredito(DUO, deps), ErrorCerrojo);
  assert.equal(almacen.escrituras, 0);
  assert.equal(cerrojo.llaves.size, 0, "soltó la llave");
  almacen.alLeer = () => {};
  assert.equal((await registrarCredito(DUO, deps)).estado, "creado");
  assert.equal(almacen.filas.length, 1);
});

test("Respaldo, SOLO PRUEBA: con un cerrojo que no excluye (llave vencida) y dos avisos que leen a la vez, queda una vigente", async () => {
  const { almacen, deps } = sandbox({ cerrojo: "no-excluye" });
  // Las dos leen «no hay nada» antes de que cualquiera escriba.
  let llegaron = 0;
  let soltar!: () => void;
  const lasDos = new Promise<void>((listo) => (soltar = listo));
  almacen.antesDeCrear = async () => {
    if (++llegaron === 2) soltar();
    await lasDos;
  };
  const [a, b] = await Promise.all([registrarCredito(DUO, deps), registrarCredito(DUO, deps)]);
  assert.equal(almacen.filas.length, 2, "las dos llegaron a escribir");
  assert.equal(vigentes(almacen).length, 1, "pero queda una sola vigente");
  const queda = vigentes(almacen)[0];
  assert.equal(queda.id, almacen.filas[0].id, "la más vieja");
  const anulada = almacen.filas[1];
  assert.equal(anulada.estado, "Anulado");
  assert.match(anulada.notas, new RegExp(`duplicado de ${queda.id}`));
  for (const r of [a, b]) {
    assert.equal(r.estado, "creado");
    assert.equal(r.estado === "creado" && r.fila.id, queda.id, "las dos devuelven la misma");
  }
  // Y un reintento posterior la ve.
  assert.equal((await registrarCredito(DUO, deps)).estado, "ya");
});

test("Si quedó un duplicado (una caída entre escribir y verificar), la próxima operación lo anula", async () => {
  const { almacen, deps } = sandbox();
  await registrarCredito(DUO, deps);
  // Una segunda fila vigente que nadie verificó (como la deja una instancia que murió).
  almacen.filas.push({ ...almacen.filas[0], id: "rec99999999999999", generadoEl: "2026-11-05T15:00:01.000Z" });
  const r = await registrarCredito(DUO, deps);
  assert.equal(r.estado, "ya");
  assert.equal(vigentes(almacen).length, 1);
  assert.equal(vigentes(almacen)[0].id, almacen.filas[0].id);

  // También al liberar: un duplicado nunca pasa a Disponible.
  const otro = sandbox();
  await registrarCredito(DUO, otro.deps);
  await confirmarEntrega(DUO.numero, "2026-11-10", otro.deps);
  otro.almacen.filas.push({ ...otro.almacen.filas[0], id: "rec99999999999999", generadoEl: "2026-11-05T15:00:01.000Z" });
  otro.irA("2026-12-10");
  const { liberados } = await liberarDisponibles(otro.deps);
  assert.deepEqual(liberados, [DUO.numero]);
  assert.deepEqual(
    otro.almacen.filas.map((f) => f.estado),
    ["Disponible", "Anulado"]
  );
});

test("Una caída después de escribir: el reintento ve el crédito y no escribe otro", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  almacen.despuesDeCrear = async () => {
    throw new Error("la instancia murió");
  };
  await assert.rejects(registrarCredito(DUO, deps), /murió/);
  assert.equal(almacen.filas.length, 1);
  assert.equal(cerrojo.llaves.size, 0, "la llave se soltó igual");
  almacen.despuesDeCrear = async () => {};
  assert.equal((await registrarCredito(DUO, deps)).estado, "ya");
  assert.equal(almacen.filas.length, 1);
});

test("Cerrojo ocupado por otra instancia: no lee ni escribe nada y avisa «ocupado»", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  cerrojo.llaves.set(claveCerrojoCredito(DUO.numero), "de-otra-instancia");
  assert.deepEqual(await registrarCredito(DUO, deps), { estado: "ocupado" });
  assert.deepEqual(await confirmarEntrega(DUO.numero, "2026-11-10", deps), { estado: "ocupado" });
  assert.deepEqual(await anularPorPedido(DUO.numero, "cancelacion", deps, SIN_COBRO), { estado: "ocupado" });
  assert.equal(almacen.escrituras, 0);
  assert.equal(cerrojo.llaves.get(claveCerrojoCredito(DUO.numero)), "de-otra-instancia", "no soltó la llave ajena");
});

test("Redis falla al tomar la llave: falla cerrado, sin escribir; si falla al soltarla, lo hecho queda", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  cerrojo.falla = "tomar";
  await assert.rejects(registrarCredito(DUO, deps), /Redis/);
  assert.equal(almacen.escrituras, 0);

  cerrojo.falla = "soltar";
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await registrarCredito(DUO, deps)).estado, "creado");
  } finally {
    console.error = original;
  }
  assert.equal(almacen.filas.length, 1);
});

// ---------- 2. El crédito y el cashback de hoy ----------

test("Un pedido con el cashback de hoy (anulado o no) no recibe crédito nuevo, y no se escribe nada", async () => {
  for (const anulado of [false, true]) {
    const { almacen, deps } = sandbox({ cashback: { [DUO.numero]: { anulado } } });
    const r = await registrarCredito(DUO, deps);
    assert.deepEqual(r, { estado: "ya", fila: null, motivo: "ya-registrado" }, `anulado: ${anulado}`);
    assert.equal(almacen.escrituras, 0);
  }
});

test("Un crédito anulado tampoco se vuelve a crear (Harper lo anuló a propósito)", async () => {
  const { almacen, deps } = sandbox();
  await registrarCredito(DUO, deps);
  await anularPorPedido(DUO.numero, "cancelacion", deps, SIN_COBRO);
  const r = await registrarCredito(DUO, deps);
  assert.equal(r.estado, "ya");
  assert.equal(r.estado === "ya" && r.fila?.estado, "Anulado");
  assert.equal(almacen.filas.length, 1);
});

test("Sin pago acreditado, con las reglas de hoy, sin anteojos o pagado con crédito: nada", async () => {
  const casos: [Partial<PedidoParaCredito>, string][] = [
    [{ pagado: false }, "no-pagado"],
    [{ regimen: "anterior" }, "regimen-anterior"],
    [{ renglones: [estuche(9_900)] }, "sin-anteojos"],
    [{ renglones: [{ ...anteojo(0), saldo: 89_900 }] }, "pagado-con-credito"],
  ];
  for (const [cambio, motivo] of casos) {
    const { almacen, deps } = sandbox();
    const r = await registrarCredito({ ...DUO, ...cambio }, deps);
    assert.equal(r.estado, "nada", motivo);
    assert.equal(r.estado === "nada" && r.motivo, motivo);
    assert.equal(almacen.escrituras, 0, motivo);
  }
});

test("Datos que no sirven: sin número, sin mail o con una entrega imposible, error y nada escrito", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  await assert.rejects(registrarCredito({ ...DUO, numero: "  " }, deps), RangeError);
  await assert.rejects(registrarCredito({ ...DUO, email: "" }, deps), RangeError);
  await assert.rejects(registrarCredito({ ...DUO, renglones: [anteojo(-1)] }, deps), RangeError);
  await assert.rejects(registrarCredito({ ...DUO, fechaEntrega: "2026-02-30" }, deps), RangeError);
  assert.equal(almacen.escrituras, 0);
  assert.equal(cerrojo.llaves.size, 0, "soltó la llave aunque falló");
});

test("El saldo de hoy no cambia: el crédito va en su propio bolsillo y solo cuenta lo Disponible", () => {
  const movimientos: MovimientoSaldo[] = [
    { id: "s1", tipo: "Cashback", monto: 8_990, pedido: "HARPER-1", fecha: "2026-10-01T12:00:00Z", disponibleDesde: "2026-10-31", anulado: false },
    { id: "s2", tipo: "Cashback", monto: 7_000, pedido: "HARPER-2", fecha: "2026-11-01T12:00:00Z", disponibleDesde: "2026-12-01", anulado: false },
    { id: "s3", tipo: "Uso", monto: -3_000, pedido: "HARPER-3", fecha: "2026-11-02T12:00:00Z", disponibleDesde: null, anulado: false },
  ];
  const credito = (pedido: string, estado: FilaCredito["estado"], monto: number, generadoEl = "2026-11-01T00:00:00Z", id = `rec-${pedido}-${estado}`): FilaCredito => ({
    id,
    clave: `credito-harper:${pedido}`,
    pedido,
    email: "cliente@ejemplo.com",
    monto,
    porcentaje: 10,
    base: monto * 10,
    anteojos: 2,
    estado,
    generadoEl,
    fechaEntrega: null,
    disponibleDesde: null,
    incidenciaAbierta: false,
    reglas: REGLAS_CREDITO,
    notas: "",
  });
  const creditos = [
    credito("HARPER-10", "Disponible", 15_733),
    credito("HARPER-11", "Pendiente", 14_159),
    credito("HARPER-12", "A revisar", 4_495),
    credito("HARPER-13", "Anulado", 9_000),
    // Un duplicado que quedó vigente: cuenta una sola vez.
    credito("HARPER-10", "Disponible", 15_733, "2026-11-01T00:00:01Z", "rec-dup"),
  ];
  const hoy = "2026-11-05";
  const r = saldosDeLaCuenta(movimientos, creditos, hoy);
  assert.deepEqual(r.anterior, saldoDe(movimientos, hoy), "el saldo de hoy, exactamente igual");
  assert.deepEqual(r.anterior, { disponible: 5_990, enCamino: 7_000 });
  assert.deepEqual(r.credito, { disponible: 15_733, pendiente: 14_159, aRevisar: 4_495 });
  // Sin créditos, lo de siempre.
  assert.deepEqual(saldosDeLaCuenta(movimientos, [], hoy), { anterior: saldoDe(movimientos, hoy), credito: { disponible: 0, pendiente: 0, aRevisar: 0 } });
});

// ---------- 3. Pendiente hasta 30 días después de la entrega ----------

test("Entrega confirmada: disponible 30 días después, ni un día antes", async () => {
  const { almacen, deps, irA } = sandbox();
  await registrarCredito(DUO, deps);

  // Sin entrega confirmada no se libera nunca.
  irA("2027-06-01");
  assert.deepEqual(await liberarDisponibles(deps), { liberados: [], ocupados: [] });
  assert.equal(almacen.filas[0].estado, "Pendiente");

  irA("2026-11-11");
  const e = await confirmarEntrega(DUO.numero, "2026-11-10", deps);
  assert.equal(e.estado, "anotada");
  assert.equal(almacen.filas[0].fechaEntrega, "2026-11-10");
  assert.equal(almacen.filas[0].disponibleDesde, "2026-12-10");

  irA("2026-12-09");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, []);
  assert.equal(almacen.filas[0].estado, "Pendiente");

  irA("2026-12-10");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, [DUO.numero]);
  assert.equal(almacen.filas[0].estado, "Disponible");
  // Liberar otra vez no hace nada.
  const escrituras = almacen.escrituras;
  assert.deepEqual(await liberarDisponibles(deps), { liberados: [], ocupados: [] });
  assert.equal(almacen.escrituras, escrituras);
});

test("La fecha de entrega: la misma otra vez es «ya»; otra distinta no pisa la primera; una imposible se rechaza", async () => {
  const { almacen, deps } = sandbox();
  assert.deepEqual(await confirmarEntrega(DUO.numero, "2026-11-10", deps), { estado: "sin-credito" });
  await registrarCredito(DUO, deps);
  assert.equal((await confirmarEntrega(DUO.numero, "2026-11-10", deps)).estado, "anotada");
  assert.equal((await confirmarEntrega(DUO.numero, "2026-11-10", deps)).estado, "ya");
  const distinta = await confirmarEntrega(DUO.numero, "2026-11-20", deps);
  assert.equal(distinta.estado, "distinta");
  assert.equal(distinta.estado === "distinta" && distinta.fechaGuardada, "2026-11-10");
  assert.equal(almacen.filas[0].fechaEntrega, "2026-11-10");
  for (const imposible of ["2026-02-29", "2026-02-31", "2026-13-01", "10/11/2026", ""]) {
    await assert.rejects(confirmarEntrega(DUO.numero, imposible, deps), RangeError, imposible);
  }
  assert.equal(almacen.filas[0].fechaEntrega, "2026-11-10");
});

test("Con una incidencia abierta no se libera; al cerrarse a favor de Harper (contracargo ganado), sí", async () => {
  const { almacen, deps, irA } = sandbox();
  await registrarCredito(DUO, deps);
  await confirmarEntrega(DUO.numero, "2026-11-10", deps);
  assert.equal((await marcarIncidencia(DUO.numero, true, "contracargo iniciado", deps)).estado, "incidencia-abierta");
  irA("2026-12-15");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, []);
  assert.equal(almacen.filas[0].estado, "Pendiente");
  assert.equal((await marcarIncidencia(DUO.numero, false, "contracargo ganado", deps)).estado, "incidencia-cerrada");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, [DUO.numero]);
  assert.equal(almacen.filas[0].estado, "Disponible");
  assert.match(almacen.filas[0].notas, /contracargo iniciado[\s\S]*contracargo ganado[\s\S]*Disponible/);
});

test("Liberar con el cerrojo de un pedido ocupado: ese queda para la próxima vuelta, los demás salen", async () => {
  const { almacen, cerrojo, deps, irA } = sandbox();
  await registrarCredito(DUO, deps);
  await registrarCredito({ ...DUO, numero: "HARPER-2003" }, deps);
  await confirmarEntrega(DUO.numero, "2026-11-10", deps);
  await confirmarEntrega("HARPER-2003", "2026-11-10", deps);
  irA("2026-12-10");
  cerrojo.llaves.set(claveCerrojoCredito("HARPER-2003"), "otra");
  assert.deepEqual(await liberarDisponibles(deps), { liberados: [DUO.numero], ocupados: ["HARPER-2003"] });
  cerrojo.llaves.clear();
  assert.deepEqual(await liberarDisponibles(deps), { liberados: ["HARPER-2003"], ocupados: [] });
  assert.deepEqual(
    almacen.filas.map((f) => f.estado),
    ["Disponible", "Disponible"]
  );
});

// ---------- 4. Devoluciones, cancelaciones y contracargos ----------

test("Devolución total con el crédito pendiente: se anula, y no se puede liberar", async () => {
  const { almacen, deps, irA } = sandbox();
  await registrarCredito(DUO, deps);
  await confirmarEntrega(DUO.numero, "2026-11-10", deps);
  const r = await aplicarDevolucion(DUO.numero, [estuche(9_900)], deps);
  assert.equal(r.estado, "anulado");
  assert.equal(almacen.filas[0].estado, "Anulado");
  irA("2027-01-01");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, []);
  assert.equal((await aplicarDevolucion(DUO.numero, [], deps)).estado, "ya-anulado");
});

test("Devolución parcial con el crédito pendiente: se recalcula al 5 % de lo que quedó, nunca sube", async () => {
  const { almacen, deps } = sandbox();
  await registrarCredito(DUO, deps);
  const r = await aplicarDevolucion(DUO.numero, [anteojo(67_425)], deps);
  assert.equal(r.estado, "recalculado");
  assert.deepEqual(
    { monto: almacen.filas[0].monto, porcentaje: almacen.filas[0].porcentaje, base: almacen.filas[0].base, anteojos: almacen.filas[0].anteojos, estado: almacen.filas[0].estado },
    { monto: 3_371, porcentaje: 5, base: 67_425, anteojos: 1, estado: "Pendiente" }
  );
  assert.match(almacen.filas[0].notas, /\$ 15733 → \$ 3371/);
  // Lo mismo otra vez: sin cambio.
  assert.equal((await aplicarDevolucion(DUO.numero, [anteojo(67_425)], deps)).estado, "sin-cambio");
  // Lo que quedó «vale más» que el crédito: no sube.
  assert.equal((await aplicarDevolucion(DUO.numero, [anteojo(200_000, 3)], deps)).estado, "sin-cambio");
  assert.equal(almacen.filas[0].monto, 3_371);
});

test("Cancelación, reembolso y contracargo perdido con el crédito pendiente: se anula", async () => {
  for (const motivo of ["cancelacion", "reembolso", "contracargo-perdido"] as const) {
    const { almacen, deps } = sandbox();
    await registrarCredito(DUO, deps);
    assert.equal((await anularPorPedido(DUO.numero, motivo, deps, SIN_COBRO)).estado, "anulado", motivo);
    assert.equal(almacen.filas[0].estado, "Anulado");
    assert.equal((await anularPorPedido(DUO.numero, motivo, deps, SIN_COBRO)).estado, "ya-anulado", "repetido, no hace nada");
  }
  // Sin crédito todavía: queda anulado de antemano (Tarea 10, reembolso anticipado).
  const { deps } = sandbox();
  assert.equal((await anularPorPedido("HARPER-NO-EXISTE", "reembolso", deps, SIN_COBRO)).estado, "anulado-antes");
});

test("Con el crédito ya disponible, nada se anula solo: queda «A revisar» y deja de contar", async () => {
  const preparar = async () => {
    const s = sandbox();
    await registrarCredito(DUO, s.deps);
    await confirmarEntrega(DUO.numero, "2026-11-10", s.deps);
    s.irA("2026-12-10");
    await liberarDisponibles(s.deps);
    assert.equal(s.almacen.filas[0].estado, "Disponible");
    return s;
  };
  const casos: [string, (deps: DependenciasCredito) => Promise<{ estado: string }>][] = [
    ["devolución", (d) => aplicarDevolucion(DUO.numero, [], d)],
    ["reembolso", (d) => anularPorPedido(DUO.numero, "reembolso", d, SIN_COBRO)],
    ["contracargo perdido", (d) => anularPorPedido(DUO.numero, "contracargo-perdido", d, SIN_COBRO)],
    ["contracargo abierto", (d) => marcarIncidencia(DUO.numero, true, "contracargo abierto", d)],
  ];
  for (const [que, hacer] of casos) {
    const { almacen, deps } = await preparar();
    assert.equal((await hacer(deps)).estado, "a-revisar", que);
    const fila = almacen.filas[0];
    assert.equal(fila.estado, "A revisar", que);
    assert.equal(fila.monto, 15_733, `${que}: el monto no se toca`);
    assert.deepEqual(saldosDeLaCuenta([], almacen.filas, "2026-12-10").credito, { disponible: 0, pendiente: 0, aRevisar: 15_733 }, que);
    // Repetido: sigue «A revisar», sin más cambios.
    assert.equal((await hacer(deps)).estado, que === "contracargo abierto" ? "incidencia-abierta" : "a-revisar", `${que} repetido`);
    assert.equal(almacen.filas[0].estado, "A revisar");
  }
});

// ---------- 5. Pagos duplicados (Tarea 10) ----------

test("Dos pagos aprobados del mismo pedido (pago repetido): un solo crédito, sobre el pedido y no sobre la suma de pagos", async () => {
  const { almacen, deps } = sandbox();
  assert.equal((await registrarCredito(DUO, deps)).estado, "creado");
  // El segundo pago llega como otro aviso del mismo pedido.
  const segundo = await registrarCredito({ numero: DUO.numero, leer: async () => DUO }, deps);
  assert.equal(segundo.estado, "ya");
  assert.equal(almacen.filas.length, 1);
  assert.equal(almacen.filas[0].monto, 15_733);

  // Y si llegan a la vez: uno anota, el otro queda ocupado y al reintentar ve «ya».
  const s = sandbox();
  const [a, b] = await Promise.all([registrarCredito(DUO, s.deps), registrarCredito({ numero: DUO.numero, leer: async () => DUO }, s.deps)]);
  assert.deepEqual([a.estado, b.estado].sort(), ["creado", "ocupado"]);
  assert.equal((await registrarCredito(DUO, s.deps)).estado, "ya");
  assert.equal(s.almacen.filas.length, 1);
});

test("Anular sin leer si el pedido quedó sin cobro no se puede (Tarea 11): tira antes de tomar el cerrojo", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  await registrarCredito(DUO, deps);
  const sinLectura = anularPorPedido as (n: string, m: "reembolso", d: DependenciasCredito, o?: unknown) => Promise<unknown>;
  await assert.rejects(sinLectura(DUO.numero, "reembolso", deps), TypeError);
  await assert.rejects(sinLectura(DUO.numero, "reembolso", deps, {}), TypeError);
  assert.equal(almacen.filas[0].estado, "Pendiente");
  assert.equal(cerrojo.llaves.size, 0);
});

test("Se reembolsa el pago repetido y el pedido sigue cobrado: el crédito no se toca", async () => {
  const { almacen, deps } = sandbox();
  await registrarCredito(DUO, deps);
  const r = await anularPorPedido(DUO.numero, "reembolso", deps, { quedoSinCobro: async () => false });
  assert.equal(r.estado, "sigue-cobrado");
  assert.equal(almacen.filas[0].estado, "Pendiente");
  assert.equal(almacen.filas[0].monto, 15_733);
  // Se reembolsa también el otro: ahora sí, sin cobro.
  assert.equal((await anularPorPedido(DUO.numero, "reembolso", deps, { quedoSinCobro: async () => true })).estado, "anulado");
  assert.equal(almacen.filas[0].estado, "Anulado");
  // Sin crédito y con el pedido todavía cobrado, tampoco deja nada.
  const s = sandbox();
  assert.deepEqual(await anularPorPedido("HARPER-3001", "reembolso", s.deps, { quedoSinCobro: async () => false }), { estado: "sigue-cobrado", fila: null });
  assert.equal(s.almacen.escrituras, 0);
});

// ---------- 6. Reembolsos anticipados ----------

test("El reembolso llega antes que el aviso del pago: queda anulado y el pago que llega después no anota crédito", async () => {
  const { almacen, deps } = sandbox();
  const r = await anularPorPedido(DUO.numero, "reembolso", deps, SIN_COBRO);
  assert.equal(r.estado, "anulado-antes");
  assert.equal(almacen.filas.length, 1);
  assert.deepEqual(
    { estado: almacen.filas[0].estado, monto: almacen.filas[0].monto, porcentaje: almacen.filas[0].porcentaje, clave: almacen.filas[0].clave },
    { estado: "Anulado", monto: 0, porcentaje: 0, clave: "credito-harper:HARPER-2001" }
  );
  assert.match(almacen.filas[0].notas, /Anulado antes de anotarse el crédito: reembolso del pago/);

  const tarde = await registrarCredito(DUO, deps);
  assert.equal(tarde.estado, "ya");
  assert.equal(almacen.filas.length, 1, "no se creó el crédito");
  assert.deepEqual(saldosDeLaCuenta([], almacen.filas, "2027-01-01").credito, { disponible: 0, pendiente: 0, aRevisar: 0 });
  // Repetido: ya anulado, sin otra fila.
  assert.equal((await anularPorPedido(DUO.numero, "reembolso", deps, SIN_COBRO)).estado, "ya-anulado");
  assert.equal(almacen.filas.length, 1);
});

test("Leyendo el pago de la fuente que manda: si ya se reembolsó cuando llega el aviso, no se anota nada", async () => {
  const { almacen, deps } = sandbox();
  // El aviso dice «aprobado», pero adentro del cerrojo se lee el estado de hoy: reembolsado.
  const r = await registrarCredito({ numero: DUO.numero, leer: async () => ({ ...DUO, pagado: false }) }, deps);
  assert.equal(r.estado, "nada");
  assert.equal(r.estado === "nada" && r.motivo, "no-pagado");
  assert.equal(almacen.escrituras, 0);
});

test("El reembolso llega mientras otro aviso anota el crédito: espera su turno y lo anula", async () => {
  const { almacen, deps } = sandbox();
  let soltar!: () => void;
  const enCurso = new Promise<void>((listo) => (soltar = listo));
  almacen.antesDeCrear = () => enCurso;
  const registro = registrarCredito(DUO, deps);
  await pausa();
  await pausa();
  // Mientras tanto llega el reembolso: el cerrojo está tomado.
  assert.deepEqual(await anularPorPedido(DUO.numero, "reembolso", deps, SIN_COBRO), { estado: "ocupado" });
  soltar();
  assert.equal((await registro).estado, "creado");
  almacen.antesDeCrear = async () => {};
  // El reintento del reembolso lo anula.
  assert.equal((await anularPorPedido(DUO.numero, "reembolso", deps, SIN_COBRO)).estado, "anulado");
  assert.equal(almacen.filas.length, 1);
  assert.equal(almacen.filas[0].estado, "Anulado");
});

test("Una cancelación o una devolución total antes del crédito: anulado; una devolución parcial: «A revisar» (lo decide Harper)", async () => {
  for (const hacer of [
    (d: DependenciasCredito) => anularPorPedido(DUO.numero, "cancelacion", d, SIN_COBRO),
    (d: DependenciasCredito) => anularPorPedido(DUO.numero, "contracargo-perdido", d, SIN_COBRO),
    (d: DependenciasCredito) => aplicarDevolucion(DUO.numero, [estuche(9_900)], d),
  ]) {
    const { almacen, deps } = sandbox();
    assert.equal((await hacer(deps)).estado, "anulado-antes");
    assert.equal((await registrarCredito(DUO, deps)).estado, "ya");
    assert.deepEqual(almacen.filas.map((f) => f.estado), ["Anulado"]);
  }
  const { almacen, deps, irA } = sandbox();
  assert.equal((await aplicarDevolucion(DUO.numero, [anteojo(67_425)], deps)).estado, "a-revisar-antes");
  assert.equal((await registrarCredito(DUO, deps)).estado, "ya", "no anota solo el crédito completo");
  assert.deepEqual(almacen.filas.map((f) => [f.estado, f.monto]), [["A revisar", 0]]);
  irA("2027-06-01");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, []);
});

// ---------- 7. Eventos fuera de orden ----------

test("La entrega se confirma antes de que llegue el pago: se toma al anotar el crédito y se libera a los 30 días", async () => {
  const { almacen, deps, irA } = sandbox();
  assert.deepEqual(await confirmarEntrega(DUO.numero, "2026-11-10", deps), { estado: "sin-credito" });
  assert.equal(almacen.escrituras, 0);
  const r = await registrarCredito({ numero: DUO.numero, leer: async (): Promise<PedidoAcreditable> => ({ ...DUO, fechaEntrega: "2026-11-10" }) }, deps);
  assert.equal(r.estado, "creado");
  assert.equal(almacen.filas[0].fechaEntrega, "2026-11-10");
  assert.equal(almacen.filas[0].disponibleDesde, "2026-12-10");
  irA("2026-12-09");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, []);
  irA("2026-12-10");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, [DUO.numero]);
});

test("El contracargo se abre antes de anotar el crédito: nace con la incidencia abierta y no se libera hasta cerrarla", async () => {
  const { almacen, deps, irA } = sandbox();
  assert.deepEqual(await marcarIncidencia(DUO.numero, true, "contracargo abierto", deps), { estado: "sin-credito" });
  await registrarCredito({ ...DUO, fechaEntrega: "2026-11-10", incidenciaAbierta: true }, deps);
  assert.equal(almacen.filas[0].incidenciaAbierta, true);
  irA("2026-12-20");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, []);
  assert.equal((await marcarIncidencia(DUO.numero, false, "contracargo ganado", deps)).estado, "incidencia-cerrada");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, [DUO.numero]);
});

test("«Contracargo ganado» llega antes que «contracargo abierto»: leyendo el estado de verdad, no se vuelve a abrir", async () => {
  const { almacen, deps, irA } = sandbox();
  await registrarCredito({ ...DUO, fechaEntrega: "2026-11-10" }, deps);
  // El estado en Mercado Pago, hoy: cerrado a favor de Harper.
  const abiertaEnMP = async () => false;
  assert.equal((await marcarIncidencia(DUO.numero, abiertaEnMP, "contracargo ganado", deps)).estado, "incidencia-cerrada");
  // El aviso viejo de «abierto» llega después y vuelve a leer: sigue cerrado.
  assert.equal((await marcarIncidencia(DUO.numero, abiertaEnMP, "contracargo abierto (aviso atrasado)", deps)).estado, "incidencia-cerrada");
  assert.equal(almacen.filas[0].incidenciaAbierta, false);
  irA("2026-12-10");
  assert.deepEqual((await liberarDisponibles(deps)).liberados, [DUO.numero]);
});

test("Un aviso de pago atrasado no revive un crédito anulado ni toca uno ya disponible", async () => {
  const anulado = sandbox();
  await registrarCredito(DUO, anulado.deps);
  await anularPorPedido(DUO.numero, "reembolso", anulado.deps, SIN_COBRO);
  assert.equal((await registrarCredito(DUO, anulado.deps)).estado, "ya");
  assert.deepEqual(anulado.almacen.filas.map((f) => f.estado), ["Anulado"]);

  const disponible = sandbox();
  await registrarCredito({ ...DUO, fechaEntrega: "2026-11-10" }, disponible.deps);
  disponible.irA("2026-12-10");
  await liberarDisponibles(disponible.deps);
  const escrituras = disponible.almacen.escrituras;
  assert.equal((await registrarCredito(DUO, disponible.deps)).estado, "ya");
  assert.equal(disponible.almacen.escrituras, escrituras, "sin cambios");
  assert.equal(disponible.almacen.filas[0].estado, "Disponible");
});

test("Leer el pedido adentro del cerrojo: si falla o trae otro pedido, no se escribe nada y se suelta la llave", async () => {
  const { almacen, cerrojo, deps } = sandbox();
  await assert.rejects(registrarCredito({ numero: DUO.numero, leer: async () => { throw new Error("Mercado Pago no contestó"); } }, deps), /Mercado Pago/);
  await assert.rejects(registrarCredito({ numero: DUO.numero, leer: async () => ({ ...DUO, numero: "HARPER-OTRO" }) }, deps), RangeError);
  assert.equal(almacen.escrituras, 0);
  assert.equal(cerrojo.llaves.size, 0);
});

// ---------- Sin conectar ----------

test("Fuera de sus archivos, solo el webhook y el checkout usan el crédito (paso 1, §17.9); ninguna página ni componente", () => {
  const raiz = path.resolve(__dirname, "..", "..");
  const propios = ["credito-harper", "credito-persistencia", "credito-airtable", "credito-pagos"].map((n) => path.join("lib", `${n}.ts`));
  const usos: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.(ts|tsx)$/.test(entrada.name) && !propios.includes(relativo)) {
        const texto = fs.readFileSync(path.join(raiz, relativo), "utf8");
        if (/from\s+["'](?:\.\.?\/|@\/lib\/|\.\.\/lib\/)credito-(?:persistencia|airtable|pagos)["']/.test(texto)) usos.push(relativo);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) recorrer(dir);
  assert.deepEqual(usos, [path.join("app", "api", "checkout", "route.ts"), path.join("lib", "credito-diario.ts"), path.join("lib", "webhook-proceso.ts")]);
  // El control diario (paso 2) solo lo usa su ruta, detrás del cron y del interruptor, y no tiene cron todavía.
  const ruta = fs.readFileSync(path.join(raiz, "app", "api", "credito", "diario", "route.ts"), "utf8");
  assert.match(ruta, /if \(!cronAutorizado\(request\.headers\.get\("authorization"\)\)\) \{/);
  assert.match(ruta, /if \(!controlDiarioActivo\(\)\) \{/);
  assert.doesNotMatch(fs.readFileSync(path.join(raiz, "vercel.json"), "utf8"), /credito/, "sin cron del crédito hasta el corte");
  // El checkout solo marca el régimen en las Notas (apagado, idénticas).
  const checkout = fs.readFileSync(path.join(raiz, "app", "api", "checkout", "route.ts"), "utf8");
  assert.match(checkout, /import \{ notasConRegimen \} from "@\/lib\/credito-pagos";/);
  assert.doesNotMatch(checkout, /from\s+["']@\/lib\/credito-(?:persistencia|airtable|harper)["']/);

  // La persistencia no sabe de Airtable: eso es del adaptador.
  const persistencia = fs.readFileSync(path.join(raiz, "lib", "credito-persistencia.ts"), "utf8");
  assert.doesNotMatch(persistencia, /from\s+["']\.\/airtable["']/);
  assert.doesNotMatch(persistencia, /TABLAS\./);
  // Y no hay forma de pedir «sin cerrojo»: null tira, no corre igual.
  assert.doesNotMatch(persistencia, /if \(!deps\.cerrojo\) return/);
});
