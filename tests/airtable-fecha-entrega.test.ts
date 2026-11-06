import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Tarea 14 (plan §18): el script de la automatización «Fecha de entrega» de
// Airtable. Se corre el mismo texto que está en Airtable
// (airtable/automatizaciones/fecha-de-entrega.js), con un Airtable simulado y
// un reloj fijo. No toca ninguna base.

const RAIZ = path.resolve(__dirname, "..", "..");
const SCRIPT = fs.readFileSync(path.join(RAIZ, "airtable", "automatizaciones", "fecha-de-entrega.js"), "utf8");

const TABLA = "tbl4HkvPUGzjbdWAe";
const ESTADO = "fldc5zBBzlfMxc1GA";
const FECHA = "fld04ZWywkyXDEXUW";

type Celdas = Record<string, unknown>;

/** Lo que vuelve del contexto del script, pasado a JSON para comparar fácil. */
function plano<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

async function correr(filas: Record<string, Celdas>, pedidoId: string, ahora: string) {
  const escrituras: { id: string; campos: Celdas }[] = [];
  const lecturas: { id: string; opciones: unknown }[] = [];
  const tablasPedidas: string[] = [];
  const salidas: Record<string, unknown> = {};
  const tabla = {
    async selectRecordAsync(id: string, opciones: unknown) {
      lecturas.push(plano({ id, opciones }));
      const f = filas[id];
      if (!f) return null;
      return { getCellValue: (campo: string) => (campo in f ? f[campo] : null) };
    },
    async updateRecordAsync(id: string, campos: Celdas) {
      escrituras.push(plano({ id, campos }));
      Object.assign(filas[id], plano(campos));
    },
  };
  let configLeida = false;
  const RealDate = Date;
  class DateFijo extends RealDate {
    constructor(...a: unknown[]) {
      super(...((a.length ? a : [ahora]) as [string]));
    }
    static now() {
      return new RealDate(ahora).getTime();
    }
  }
  const contexto = vm.createContext({
    base: {
      getTable(id: string) {
        tablasPedidas.push(id);
        return tabla;
      },
    },
    input: {
      config() {
        if (configLeida) throw new Error("input.config() se llamó dos veces");
        configLeida = true;
        return { pedidoId };
      },
    },
    output: { set: (k: string, v: unknown) => (salidas[k] = plano(v)) },
    Intl,
    Date: DateFijo,
  });
  await vm.runInContext(`(async () => {\n${SCRIPT}\n})()`, contexto);
  return { escrituras, lecturas, salidas, tablasPedidas };
}

const sel = (name: string) => ({ id: `sel-${name}`, name, color: "x" });
const MEDIODIA = "2026-11-06T15:00:00Z";

test("El script de Airtable usa la tabla Pedidos y los campos Estado y Fecha_entrega de la base real", () => {
  assert.match(SCRIPT, new RegExp(`const TABLA_PEDIDOS = "${TABLA}";`));
  assert.match(SCRIPT, new RegExp(`const CAMPO_ESTADO = "${ESTADO}";`));
  assert.match(SCRIPT, new RegExp(`const CAMPO_FECHA = "${FECHA}";`));
});

test("El script no manda mails ni llama a ningún servicio", () => {
  assert.doesNotMatch(SCRIPT, /fetch\s*\(|remoteFetchAsync|input\.secret|https?:\/\//);
});

test("Pasa a entregado con el campo vacío: pone la fecha de hoy en la Argentina y nada más", async () => {
  const filas = { rec1: { [ESTADO]: sel("entregado") } };
  const r = await correr(filas, "rec1", MEDIODIA);
  assert.deepEqual(r.escrituras, [{ id: "rec1", campos: { [FECHA]: "2026-11-06" } }]);
  assert.deepEqual(r.salidas, { resultado: "fecha-registrada", fecha: "2026-11-06" });
  assert.deepEqual(r.tablasPedidas, [TABLA]);
  assert.deepEqual(r.lecturas, [{ id: "rec1", opciones: { fields: [ESTADO, FECHA] } }]);
});

test("A las 23:30 de Buenos Aires (02:30 UTC del día siguiente) vale la fecha de la Argentina", async () => {
  const filas = { rec1: { [ESTADO]: sel("entregado") } };
  const r = await correr(filas, "rec1", "2026-11-06T02:30:00Z");
  assert.equal(r.escrituras[0]?.campos[FECHA], "2026-11-05");
});

test("A las 00:30 de Buenos Aires ya es el día nuevo", async () => {
  const filas = { rec1: { [ESTADO]: sel("entregado") } };
  const r = await correr(filas, "rec1", "2026-11-06T03:30:00Z");
  assert.equal(r.escrituras[0]?.campos[FECHA], "2026-11-06");
});

test("Entregado con una fecha ya cargada: no la sobrescribe", async () => {
  const filas = { rec1: { [ESTADO]: sel("entregado"), [FECHA]: "2026-11-01" } };
  const r = await correr(filas, "rec1", MEDIODIA);
  assert.deepEqual(r.escrituras, []);
  assert.deepEqual(r.salidas, { resultado: "ya-tenia-fecha", fecha: "2026-11-01" });
  assert.equal(filas.rec1[FECHA], "2026-11-01");
});

test("Si al correr el pedido ya no está entregado, no escribe nada", async () => {
  for (const estado of ["pendiente", "pagado", "preparando", "enviado", "cancelado", "rechazado"]) {
    const filas = { rec1: { [ESTADO]: sel(estado) } };
    const r = await correr(filas, "rec1", MEDIODIA);
    assert.deepEqual(r.escrituras, [], estado);
    assert.deepEqual(r.salidas, { resultado: "no-entregado" }, estado);
  }
  const vacio = await correr({ rec1: {} }, "rec1", MEDIODIA);
  assert.deepEqual(vacio.escrituras, []);
  assert.deepEqual(vacio.salidas, { resultado: "no-entregado" });
});

test("El pedido ya no existe: no escribe nada", async () => {
  const r = await correr({}, "recNOEXISTE", MEDIODIA);
  assert.deepEqual(r.escrituras, []);
  assert.deepEqual(r.salidas, { resultado: "sin-pedido" });
});

test("Entregado, vuelta atrás y otra vez entregado: queda la primera fecha", async () => {
  const filas: Record<string, Celdas> = { rec1: { [ESTADO]: sel("entregado") } };
  await correr(filas, "rec1", "2026-11-06T15:00:00Z");
  filas.rec1[ESTADO] = sel("enviado");
  await correr(filas, "rec1", "2026-11-07T15:00:00Z");
  filas.rec1[ESTADO] = sel("entregado");
  const r = await correr(filas, "rec1", "2026-11-08T15:00:00Z");
  assert.deepEqual(r.escrituras, []);
  assert.equal(filas.rec1[FECHA], "2026-11-06");
});

test("Solo escribe el pedido que disparó la automatización", async () => {
  const filas: Record<string, Celdas> = { rec1: { [ESTADO]: sel("entregado") }, rec2: { [ESTADO]: sel("entregado") } };
  const r = await correr(filas, "rec1", MEDIODIA);
  assert.deepEqual(r.escrituras.map((e) => e.id), ["rec1"]);
  assert.equal(filas.rec2[FECHA], undefined);
});
