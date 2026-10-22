import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

// Contra el Airtable en memoria: un único estado compartido, como el real.
// Cada llamada a `procesarNotificacion` corre como una "instancia" distinta
// del servidor, identificada con AsyncLocalStorage para poder demorar o hacer
// fallar las llamadas de una sin tocar a la otra.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { createRecord, getRecord, TABLAS, updateRecord } from "../lib/airtable";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import type { PagoMP } from "../lib/mercadopago";
import { leerMarcas } from "../lib/stock";
import type { ItemResuelto } from "../lib/tipos";
import { esMarcaDeReclamo, VIGENCIA_RECLAMO_MS } from "../lib/webhook-decision";
import { procesarNotificacion, type Dependencias, type FilaPedido } from "../lib/webhook-proceso";

type FilaVariante = { Stock?: number; Stock_pedidos?: string };
type Mail = Parameters<Dependencias["enviarMail"]>[0];

const AMATISTA_NEGRO = "recLvS1Rce368QVeX";
const OBSIDIANA_NEGRO = "rect8rgXzLjIGbTge";
const AHORA = 1_761_000_000_000;

const instancia = new AsyncLocalStorage<string>();
const como = <T>(nombre: string, fn: () => Promise<T>) => instancia.run(nombre, fn);
const quien = () => instancia.getStore() ?? "?";

const tick = () => new Promise<void>((r) => setImmediate(r));
async function hasta(condicion: () => Promise<boolean> | boolean, intentos = 200) {
  for (let i = 0; i < intentos; i++) {
    if (await condicion()) return;
    await tick();
  }
  throw new Error("la condición no se cumplió");
}

function puerta() {
  let abrir!: () => void;
  const promesa = new Promise<void>((r) => (abrir = r));
  return { esperar: () => promesa, abrir };
}

function relojFalso(inicio = AHORA) {
  let t = inicio;
  const dormidas: { quien: string; ms: number }[] = [];
  return {
    ahora: () => t,
    async dormir(ms: number) {
      dormidas.push({ quien: quien(), ms });
      t += ms;
      await tick();
    },
    avanzar: (ms: number) => void (t += ms),
    dormidas,
  };
}

function item(varianteId: string, sku: string, cantidad = 1): ItemResuelto {
  return {
    productoId: "recPJzzJFhyEF0DMw",
    productoSlug: "amatista",
    nombre: "AMATISTA",
    categoria: "Anteojos",
    varianteId,
    sku,
    color: "Negro",
    foto: null,
    precioLista: 89900,
    precioUnitario: 89900,
    descuento: 0,
    cantidad,
    subtotal: 89900 * cantidad,
    stockDisponible: 12,
  };
}

const ITEMS = [item(AMATISTA_NEGRO, "AMATISTA-NEGRO"), item(OBSIDIANA_NEGRO, "OBSIDIANA-NEGRO")];
const TOTAL = 179800;

async function crearPedido(campos: Partial<FilaPedido> = {}) {
  const cliente = await createRecord(TABLAS.clientes, { Email: "prueba@harper.ar", Nombre: "Prueba Harper" });
  const pedido = await createRecord<FilaPedido>(TABLAS.pedidos, {
    Numero: "HARPER-T1",
    Estado: "pendiente",
    Cliente: [cliente.id],
    Items: JSON.stringify(ITEMS),
    Subtotal: TOTAL,
    Envio: 0,
    Total: TOTAL,
    Direccion: "Núñez 2422",
    Ciudad: "CABA",
    Provincia: "CABA",
    CP: "1429",
    ...campos,
  });
  return { pedidoId: pedido.id, clienteId: cliente.id };
}

function pago(pedidoId: string, extra: Partial<PagoMP> = {}): PagoMP {
  return { id: 111, status: "approved", external_reference: pedidoId, transaction_amount: TOTAL, payer: { email: "prueba@harper.ar" }, ...extra };
}

function armarDeps(pagos: Record<string, PagoMP>, extra: Partial<Dependencias> = {}) {
  const reloj = relojFalso();
  const mails: { quien: string; mail: Mail }[] = [];
  const deps: Dependencias = {
    obtenerPago: async (id) => {
      const p = pagos[id];
      if (!p) throw new Error(`pago ${id} desconocido`);
      return p;
    },
    enviarMail: async (mail: Mail) => {
      mails.push({ quien: quien(), mail });
      return true;
    },
    reloj,
    esperaReclamoMs: 50,
    esperaOcupadoMs: 5_000,
    sitio: "https://harper.ar",
    ...extra,
  };
  return { deps, reloj, mails };
}

async function estadoDe(pedidoId: string) {
  const p = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
  return { estado: p.fields.Estado, mpStatus: p.fields.MP_status, pagoId: p.fields.MP_payment_id };
}

async function stockDe(id: string) {
  const v = await getRecord<FilaVariante>(TABLAS.variantes, id);
  return { stock: v.fields.Stock, marcas: leerMarcas(v.fields.Stock_pedidos) };
}

/** Lo que tiene que quedar después de UNA venta confirmada de ITEMS. */
async function verificarVentaUnica(pedidoId: string, mails: { mail: Mail }[]) {
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "111" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  assert.deepEqual(await stockDe(OBSIDIANA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  assert.equal(mails.length, 2, `mails: ${mails.map((m) => m.mail.asunto).join(" | ")}`);
}

beforeEach(() => {
  reiniciar();
  interceptar(null);
});

// ---------------------------------------------------------------------------

test("un pago aprobado, una vez: stock, pagado, dos mails, cierre", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const r = await como("A", () => procesarNotificacion("111", deps));

  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal(r.cuerpo.stockDescontado, 2);
  await verificarVentaUnica(pedidoId, mails);

  // El reintento de Mercado Pago no hace nada.
  const otra = await como("B", () => procesarNotificacion("111", deps));
  assert.deepEqual(otra, { status: 200, cuerpo: { ok: true, duplicado: true } });
  await verificarVentaUnica(pedidoId, mails);
});

test("dos notificaciones del mismo pago A LA VEZ en dos instancias: una procesa, la otra espera y contesta duplicado", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const [a, b] = await Promise.all([
    como("A", () => procesarNotificacion("111", deps)),
    como("B", () => procesarNotificacion("111", deps)),
  ]);

  const procesadas = [a, b].filter((r) => r.cuerpo.estado === "pagado");
  const duplicadas = [a, b].filter((r) => r.cuerpo.duplicado === true);
  assert.equal(procesadas.length, 1, JSON.stringify([a, b]));
  assert.equal(duplicadas.length, 1, JSON.stringify([a, b]));
  assert.ok([a, b].every((r) => r.status === 200));
  await verificarVentaUnica(pedidoId, mails);
});

test("diez notificaciones a la vez: una sola venta", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const resultados = await Promise.all(
    Array.from({ length: 10 }, (_, i) => como(`I${i}`, () => procesarNotificacion("111", deps)))
  );

  assert.equal(resultados.filter((r) => r.cuerpo.estado === "pagado").length, 1);
  assert.equal(resultados.filter((r) => r.cuerpo.duplicado === true).length, 9);
  await verificarVentaUnica(pedidoId, mails);
});

test("ESCALONADA: la segunda llega mientras la primera procesa; espera a que termine y contesta duplicado", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  // A se frena antes de los mails hasta que B haya esperado dos veces.
  const depsA: Dependencias = {
    ...deps,
    antesDelPaso: async (paso) => {
      if (paso === "mails") {
        await hasta(() => reloj.dormidas.filter((d) => d.quien === "B").length >= 2);
      }
    },
  };

  const a = como("A", () => procesarNotificacion("111", depsA));
  // B llega cuando A ya tiene la marca puesta.
  await hasta(async () => esMarcaDeReclamo((await estadoDe(pedidoId)).mpStatus));
  const b = await como("B", () => procesarNotificacion("111", deps));
  const ra = await a;

  assert.equal(ra.cuerpo.estado, "pagado");
  assert.deepEqual(b, { status: 200, cuerpo: { ok: true, duplicado: true } });
  // B nunca escribió nada: ni marca, ni stock, ni mails.
  assert.ok(reloj.dormidas.filter((d) => d.quien === "B").length >= 2, "B tendría que haber esperado");
  assert.equal(mails.filter((m) => m.quien === "B").length, 0);
  await verificarVentaUnica(pedidoId, mails);
});

test("ESCALONADA: si la primera tarda más que la espera, la segunda pide reintento (503) sin tocar nada", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const frenoA = puerta();
  const depsA: Dependencias = {
    ...deps,
    antesDelPaso: async (paso) => {
      if (paso === "mails") await frenoA.esperar();
    },
  };

  const a = como("A", () => procesarNotificacion("111", depsA));
  await hasta(async () => esMarcaDeReclamo((await estadoDe(pedidoId)).mpStatus));

  const b = await como("B", () => procesarNotificacion("111", { ...deps, esperaOcupadoMs: 2_000 }));
  assert.equal(b.status, 503);
  assert.equal(b.cuerpo.ocupado, true);
  assert.equal(mails.filter((m) => m.quien === "B").length, 0);
  // La marca sigue siendo la de A.
  assert.ok(esMarcaDeReclamo((await estadoDe(pedidoId)).mpStatus));

  frenoA.abrir();
  const ra = await a;
  assert.equal(ra.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);

  // El reintento que Mercado Pago manda después: duplicado.
  const c = await como("C", () => procesarNotificacion("111", deps));
  assert.deepEqual(c, { status: 200, cuerpo: { ok: true, duplicado: true } });
  await verificarVentaUnica(pedidoId, mails);
});

test("VENTANA DEL RECLAMO: B leyó antes de que A escribiera y escribió después de que A releyó; las dos creen ganar, el stock se descuenta una vez", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  // B queda frenada justo antes de escribir su marca (ya leyó el pedido limpio).
  const puertaB = puerta();
  let frenadaB = false;
  interceptar(async (path, llamada) => {
    if (quien() === "B" && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes("procesando") && !frenadaB) {
      frenadaB = true;
      await puertaB.esperar();
    }
  });

  // A, ya ganadora y con el stock descontado, deja pasar a B antes de marcar pagado.
  const depsA: Dependencias = {
    ...deps,
    antesDelPaso: async (paso) => {
      if (paso === "pagado") {
        const antes = (await estadoDe(pedidoId)).mpStatus;
        puertaB.abrir();
        await hasta(async () => (await estadoDe(pedidoId)).mpStatus !== antes);
      }
    },
  };

  const b = como("B", () => procesarNotificacion("111", deps));
  await hasta(() => frenadaB);
  const a = await como("A", () => procesarNotificacion("111", depsA));
  const rb = await b;

  // A se retira al ver que la marca ya no es suya; B termina el pedido.
  assert.deepEqual(a, { status: 200, cuerpo: { ok: true, cedido: true } });
  assert.equal(rb.status, 200);
  assert.equal(rb.cuerpo.estado, "pagado");
  // B no volvió a descontar: las variantes ya tenían la marca de A.
  assert.equal(rb.cuerpo.stockDescontado, 0);
  assert.equal(rb.cuerpo.stockOmitido, 2);
  await verificarVentaUnica(pedidoId, mails);
});

test("VENTANA DEL RECLAMO, tarde: B pisa la marca cuando A ya mandó los mails; A se retira, B completa (y repite el mail: el residuo documentado)", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const puertaB = puerta();
  let frenadaB = false;
  interceptar(async (path, llamada) => {
    if (quien() === "B" && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes("procesando") && !frenadaB) {
      frenadaB = true;
      await puertaB.esperar();
    }
  });

  const depsA: Dependencias = {
    ...deps,
    antesDelPaso: async (paso) => {
      if (paso === "cierre") {
        const antes = (await estadoDe(pedidoId)).mpStatus;
        puertaB.abrir();
        await hasta(async () => (await estadoDe(pedidoId)).mpStatus !== antes);
      }
    },
  };

  const b = como("B", () => procesarNotificacion("111", deps));
  await hasta(() => frenadaB);
  const a = await como("A", () => procesarNotificacion("111", depsA));
  const rb = await b;

  assert.deepEqual(a, { status: 200, cuerpo: { ok: true, cedido: true } });
  // B encontró el pedido ya "pagado" pero sin cerrar: no lo da por duplicado
  // (A pudo haber cedido a mitad de camino), lo completa.
  assert.equal(rb.cuerpo.estado, "pagado");
  assert.equal(rb.cuerpo.retomado, true);
  assert.equal(rb.cuerpo.stockDescontado, 0);
  assert.equal(rb.cuerpo.stockOmitido, 2);
  // B no puede saber que A ya mandó los mails (A escribió sus pasos en una
  // marca que B pisó), así que los manda de nuevo. Es el residuo documentado
  // de esta ventana: un mail repetido. Nunca el stock, nunca el cobro.
  assert.equal(mails.length, 4, `mails: ${mails.map((m) => `${m.quien}:${m.mail.asunto}`).join(" | ")}`);
  assert.equal(mails.filter((m) => m.quien === "A").length, 2);
  assert.equal(mails.filter((m) => m.quien === "B").length, 2);
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "111" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  assert.deepEqual(await stockDe(OBSIDIANA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
});

// ---- Caídas a mitad de camino ----

test("CAÍDA después de descontar stock y antes de marcar pagado: el reintento no descuenta de nuevo y termina", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  interceptar((path, llamada) => {
    if (quien() === "A" && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes('"Estado":"pagado"')) {
      throw new Error("caída simulada de la instancia A");
    }
  });

  await assert.rejects(como("A", () => procesarNotificacion("111", deps)), /caída simulada/);

  // Quedó: stock descontado y marcado, pedido pendiente con la marca de A.
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  const roto = await estadoDe(pedidoId);
  assert.equal(roto.estado, "pendiente");
  assert.ok(esMarcaDeReclamo(roto.mpStatus));
  assert.equal(mails.length, 0);

  // Reintento inmediato: la marca sigue vigente, se pide reintento sin tocar nada.
  const temprano = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(temprano.status, 503);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });

  // Reintento con la marca vencida: retoma. Stock intacto, pagado, mails, cierre.
  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const tarde = await como("C", () => procesarNotificacion("111", deps));
  assert.equal(tarde.status, 200);
  assert.equal(tarde.cuerpo.estado, "pagado");
  assert.equal(tarde.cuerpo.retomado, true);
  assert.equal(tarde.cuerpo.stockDescontado, 0);
  assert.equal(tarde.cuerpo.stockOmitido, 2);
  await verificarVentaUnica(pedidoId, mails);
});

test("CAÍDA después de marcar pagado y antes de los mails: el reintento manda los mails una vez", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  const depsA: Dependencias = {
    ...deps,
    enviarMail: async () => {
      throw new Error("Resend caído en A");
    },
  };

  await assert.rejects(como("A", () => procesarNotificacion("111", depsA)), /Resend caído/);

  // El Estado ya dice pagado pero la marca sigue: NO es un duplicado.
  const roto = await estadoDe(pedidoId);
  assert.equal(roto.estado, "pagado");
  assert.ok(esMarcaDeReclamo(roto.mpStatus));

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal(r.cuerpo.retomado, true);
  await verificarVentaUnica(pedidoId, mails);
});

test("CAÍDA después de marcar pagado; una persona lo pasa a 'preparando' antes del reintento: no se lo vuelve atrás", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  const depsA: Dependencias = {
    ...deps,
    enviarMail: async () => {
      throw new Error("Resend caído en A");
    },
  };
  await assert.rejects(como("A", () => procesarNotificacion("111", depsA)));
  assert.equal((await estadoDe(pedidoId)).estado, "pagado");

  // Ale lo ve pagado en Airtable y empieza a prepararlo.
  await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, { Estado: "preparando" });

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "preparando", mpStatus: "approved", pagoId: "111" });
  assert.equal(mails.length, 2);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
});

test("CAÍDA después de los mails y antes del cierre: el reintento NO repite los mails", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  interceptar((path, llamada) => {
    if (quien() === "A" && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes('"MP_status":"approved"')) {
      throw new Error("caída simulada antes del cierre");
    }
  });

  await assert.rejects(como("A", () => procesarNotificacion("111", deps)), /antes del cierre/);
  assert.equal(mails.length, 2);
  assert.ok(esMarcaDeReclamo((await estadoDe(pedidoId)).mpStatus));

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);
});

test("CAÍDA y después una persona cancela el pedido a mano: el reintento lo respeta", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  interceptar((path, llamada) => {
    if (quien() === "A" && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes('"Estado":"pagado"')) {
      throw new Error("caída simulada");
    }
  });
  await assert.rejects(como("A", () => procesarNotificacion("111", deps)));

  await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, { Estado: "cancelado" });
  reloj.avanzar(VIGENCIA_RECLAMO_MS);

  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.deepEqual(r, { status: 200, cuerpo: { ok: true, duplicado: true } });
  assert.equal((await estadoDe(pedidoId)).estado, "cancelado");
  assert.equal(mails.length, 0);
});

test("una marca del formato anterior (sin fecha) no traba el pedido: se retoma", async () => {
  const { pedidoId } = await crearPedido({ MP_status: "procesando 111 nonce-viejo" });
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);
});

// ---- Los otros caminos ----

test("pago rechazado: estado, mail al cliente, y el reintento es duplicado", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { status: "rejected", status_detail: "cc_rejected_bad_filled_security_code" }) });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "rechazado");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "rechazado", mpStatus: "rejected (cc_rejected_bad_filled_security_code)", pagoId: "111" });
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
  assert.equal(mails.length, 1);

  const otra = await como("B", () => procesarNotificacion("111", deps));
  assert.deepEqual(otra, { status: 200, cuerpo: { ok: true, duplicado: true } });
  assert.equal(mails.length, 1);
});

test("rechazado y después aprobado con otro pago: se confirma una sola vez", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({
    "111": pago(pedidoId, { status: "rejected" }),
    "222": pago(pedidoId, { id: 222 }),
  });

  await como("A", () => procesarNotificacion("111", deps));
  const r = await como("B", () => procesarNotificacion("222", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "222" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  assert.equal(mails.length, 3); // rechazo + confirmación + interno
});

test("un segundo pago aprobado sobre un pedido ya pagado: se marca para revisar, sin tocar stock", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId), "222": pago(pedidoId, { id: 222 }) });

  await como("A", () => procesarNotificacion("111", deps));
  const r = await como("B", () => procesarNotificacion("222", deps));

  assert.equal(r.cuerpo.estado, "revisar");
  const e = await estadoDe(pedidoId);
  assert.equal(e.estado, "pagado");
  assert.match(e.mpStatus ?? "", /^revisar: segundo pago aprobado 222/);
  assert.equal(e.pagoId, "111");
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  assert.equal(mails.length, 3);
  assert.match(mails[2].mail.asunto, /^REVISAR/);

  // Y el reintento de ese segundo pago no vuelve a avisar.
  const otra = await como("C", () => procesarNotificacion("222", deps));
  assert.deepEqual(otra, { status: 200, cuerpo: { ok: true, duplicado: true } });
  assert.equal(mails.length, 3);
});

test("el monto cobrado no coincide: no se confirma ni se descuenta, se avisa", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { transaction_amount: 1000 }) });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "revisar");
  const e = await estadoDe(pedidoId);
  assert.equal(e.estado, "pendiente");
  assert.match(e.mpStatus ?? "", /^revisar: se cobró 1000/);
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
  assert.equal(mails.length, 1);
  assert.match(mails[0].mail.asunto, /no coincide/);

  const otra = await como("B", () => procesarNotificacion("111", deps));
  assert.deepEqual(otra, { status: 200, cuerpo: { ok: true, duplicado: true } });
});

test("pago pendiente: solo se registra, sin reclamo; cuando se aprueba, se procesa", async () => {
  const { pedidoId } = await crearPedido();
  const pendiente = pago(pedidoId, { status: "in_process" });
  const { deps, mails } = armarDeps({ "111": pendiente });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "in_process");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pendiente", mpStatus: "in_process", pagoId: "111" });
  assert.equal(mails.length, 0);

  pendiente.status = "approved";
  const r2 = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r2.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);
});

test("sin el campo de marcas en Airtable, la venta se confirma igual y el resultado lo avisa", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  interceptar((path, llamada) => {
    if (llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes)) && llamada.body?.includes("Stock_pedidos")) {
      throw new RespuestaFixture(422, '{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"Stock_pedidos\\""}}');
    }
  });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal(r.cuerpo.stockSinMarca, true);
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "111" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: [] });
  assert.equal(mails.length, 2);
});

test("el gancho de venta confirmada recibe el pedido y, si falla, no toca la venta", async () => {
  const { pedidoId, clienteId } = await crearPedido();
  const ventas: unknown[] = [];
  const { deps, mails } = armarDeps(
    { "111": pago(pedidoId) },
    {
      alConfirmar: async (venta) => {
        ventas.push(venta);
        throw new Error("Meta caído");
      },
    }
  );

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal(ventas.length, 1);
  assert.equal((ventas[0] as { numero: string }).numero, "HARPER-T1");
  assert.equal((ventas[0] as { clienteId?: string }).clienteId, clienteId);
  await verificarVentaUnica(pedidoId, mails);
});
