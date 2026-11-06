import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

// Contra el Airtable en memoria: un único estado compartido, como el real.
// Cada llamada a `procesarNotificacion` corre como una "instancia" distinta
// del servidor, identificada con AsyncLocalStorage para poder demorar o hacer
// fallar las llamadas de una sin tocar a la otra.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { clavePedido, ErrorCerrojo, TTL_PEDIDO_MS, type Cerrojo } from "../lib/cerrojo";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import type { PagoMP } from "../lib/mercadopago";
import { leerMarcas } from "../lib/stock";
import type { ItemResuelto } from "../lib/tipos";
import { MEDIO_DINERO_MP } from "../lib/dinero-mp";
import { notasDeBeneficios } from "../lib/suscriptores";
import { claveSuscriptor } from "../lib/suscriptores-cuenta";
import { esMarcaDeReclamo, VIGENCIA_RECLAMO_MS } from "../lib/webhook-decision";
import { dependenciasReales, pagosDeLaMarca, procesarNotificacion, type Dependencias, type FilaPedido } from "../lib/webhook-proceso";
import { CobroIncierto, pagoDe, type LectorMercadoPago } from "../lib/mp-cobro";

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

/**
 * El lector de pagos de Mercado Pago sobre los mismos pagos de la prueba
 * ("111@A" gana a "111" para la instancia A). `ocultos`: los que la búsqueda
 * todavía no trae.
 */
function lectorDe(pagos: Record<string, PagoMP>, ocultos: ReadonlySet<string> = new Set()): LectorMercadoPago {
  const leer = (id: string) => {
    const p = pagos[`${id}@${quien()}`] ?? pagos[id];
    if (!p) throw new Error(`pago ${id} desconocido`);
    return pagoDe(p);
  };
  return {
    pago: async (id) => leer(id),
    pagosDelPedido: async (pedidoId) =>
      [...new Set(Object.keys(pagos).map((k) => k.split("@")[0]))]
        .filter((id) => !ocultos.has(id) && (pagos[`${id}@${quien()}`] ?? pagos[id]))
        .map(leer)
        .filter((p) => p.pedidoId === pedidoId),
  };
}

function armarDeps(pagos: Record<string, PagoMP>, extra: Partial<Dependencias> = {}) {
  const reloj = relojFalso();
  const mails: { quien: string; mail: Mail }[] = [];
  const deps: Dependencias = {
    // Mercado Pago puede contestarle distinto a cada instancia (el pago pasó
    // de in_process a approved entre una consulta y otra): "111@A" gana a "111".
    obtenerPago: async (id) => {
      const p = pagos[`${id}@${quien()}`] ?? pagos[id];
      if (!p) throw new Error(`pago ${id} desconocido`);
      return p;
    },
    // Todos los pagos del pedido, como los vería esta instancia (Tarea 12).
    lectorPagos: lectorDe(pagos),
    enviarMail: async (mail: Mail) => {
      mails.push({ quien: quien(), mail });
      return true;
    },
    mailsConfigurados: () => true,
    // Sin Redis por defecto y con permiso explícito para seguir sin él: estas
    // pruebas ejercitan las capas de Airtable solas (marcas, verificación,
    // recuperación), que siguen corriendo debajo del cerrojo. En producción
    // ese permiso no existe: sin Redis el webhook no procesa (ver la prueba
    // "SIN REDIS"). Las que dicen "CON CERROJO" agregan el cerrojo.
    cerrojo: null,
    sinCerrojo: "permitir",
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
  reiniciarRedis();
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

test("dinero en Mercado Pago: cobrado con el saldo de la cuenta es una venta normal, marcada así en el aviso", async () => {
  const { pedidoId } = await crearPedido({ Medio_pago: MEDIO_DINERO_MP });
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { payment_type_id: "account_money" }) });

  const r = await como("A", () => procesarNotificacion("111", deps));

  assert.equal(r.cuerpo.estado, "pagado");
  const aviso = mails.map((m) => m.mail).find((m) => m.para === "harpercaseseyewear@gmail.com");
  assert.match(aviso?.asunto ?? "", /^Venta HARPER-T1 .* · dinero en Mercado Pago$/);
});

test("dinero en Mercado Pago cobrado con otra cosa (Mercado Pago no respetó la exclusión): la venta sigue y el aviso dice REVISAR", async () => {
  const { pedidoId } = await crearPedido({ Medio_pago: MEDIO_DINERO_MP });
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { payment_type_id: "credit_card" }) });

  const r = await como("A", () => procesarNotificacion("111", deps));

  assert.equal(r.cuerpo.estado, "pagado", "el comprador pagó lo que vio: se confirma");
  assert.equal(r.cuerpo.stockDescontado, 2);
  const aviso = mails.map((m) => m.mail).find((m) => m.para === "harpercaseseyewear@gmail.com");
  assert.match(aviso?.asunto ?? "", /^REVISAR Venta HARPER-T1/);
  assert.match(aviso?.texto ?? "", /cobró con "credit_card" y no con el saldo de la cuenta/);
});

test("un pedido de Mercado Pago de siempre no se marca ni se revisa, se pague con lo que se pague", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { payment_type_id: "credit_card" }) });

  await como("A", () => procesarNotificacion("111", deps));

  const aviso = mails.map((m) => m.mail).find((m) => m.para === "harpercaseseyewear@gmail.com");
  assert.match(aviso?.asunto ?? "", /^Venta HARPER-T1 — \$\s[\d.]+$/);
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
      if (paso === "mail_cliente") {
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
      if (paso === "mail_cliente") await frenoA.esperar();
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

  // A se retira al ver que la marca ya no es suya, espera a que B termine y,
  // como su pago quedó resuelto, contesta 200. B termina el pedido.
  assert.deepEqual(a, { status: 200, cuerpo: { ok: true, duplicado: true, cedido: true } });
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

  assert.deepEqual(a, { status: 200, cuerpo: { ok: true, duplicado: true, cedido: true } });
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

// ---- Cruces entre notificaciones distintas (lo que destapó la verificación) ----

/** Frena la escritura de la marca de `quienFrena` hasta que se abra la puerta. */
function frenarReclamoDe(quienFrena: string, pedidoId: string) {
  const p = puerta();
  let frenada = false;
  interceptar(async (path, llamada) => {
    if (quien() === quienFrena && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes("procesando") && !frenada) {
      frenada = true;
      await p.esperar();
    }
  });
  return { abrir: p.abrir, llego: () => frenada };
}

/** En el paso dado, deja pasar la marca frenada y espera a que aterrice. */
function dejarPasarEn(paso: string, pedidoId: string, freno: { abrir(): void }) {
  return async (p: string) => {
    if (p !== paso) return;
    const antes = (await estadoDe(pedidoId)).mpStatus;
    freno.abrir();
    await hasta(async () => (await estadoDe(pedidoId)).mpStatus !== antes);
  };
}

test("CRUCE: un 'in_process' tardío (otra instancia) pisa la marca de la que aprueba antes del stock: la que aprueba pide reintento y el reintento completa", async () => {
  const { pedidoId } = await crearPedido();
  // Al mismo pago 111, Mercado Pago le contestó in_process a A y approved a B y C.
  const { deps, mails } = armarDeps({ "111": pago(pedidoId), "111@A": pago(pedidoId, { status: "in_process" }) });

  const freno = frenarReclamoDe("A", pedidoId);
  const a = como("A", () => procesarNotificacion("111", deps));
  await hasta(freno.llego);

  const b = await como("B", () => procesarNotificacion("111", { ...deps, antesDelPaso: dejarPasarEn("stock", pedidoId, freno) }));
  const ra = await a;

  // A registró el pago pendiente; B, al ver la marca pisada, NO contestó 200:
  // su pago aprobado no quedó resuelto, así que pide reintento.
  assert.equal(ra.cuerpo.estado, "in_process");
  assert.equal(b.status, 503);
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pendiente", mpStatus: "in_process", pagoId: "111" });
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
  assert.equal(mails.length, 0);

  // El reintento de Mercado Pago completa la venta.
  const c = await como("C", () => procesarNotificacion("111", deps));
  assert.equal(c.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);
});

test("CRUCE: el 'in_process' tardío pisa la marca cuando el pedido ya está pagado: el reintento manda lo que faltaba", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId), "111@A": pago(pedidoId, { status: "in_process" }) });

  const freno = frenarReclamoDe("A", pedidoId);
  const a = como("A", () => procesarNotificacion("111", deps));
  await hasta(freno.llego);

  // B ya descontó, marcó pagado y mandó el mail al cliente; cede antes del interno.
  const b = await como("B", () => procesarNotificacion("111", { ...deps, antesDelPaso: dejarPasarEn("mail_interno", pedidoId, freno) }));
  await a;

  assert.equal(b.status, 503);
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "in_process", pagoId: "111" });
  assert.equal(mails.length, 1);

  // Pagado pero con MP_status intermedio: el reintento no lo da por duplicado.
  const c = await como("C", () => procesarNotificacion("111", deps));
  assert.equal(c.cuerpo.estado, "pagado");
  assert.equal(c.cuerpo.retomado, true);
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "111" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  // C no sabe qué mails mandó B (B escribió sus pasos en una marca que A pisó):
  // los manda de nuevo. Un mail repetido, ninguno perdido.
  assert.equal(mails.length, 3);
  assert.ok(mails.some((m) => m.quien === "C" && /REVISAR/.test(m.mail.asunto) === false));
});

test("CRUCE: un pago RECHAZADO que llega tarde se cruza con el APROBADO de otro intento: el aprobado pide reintento y termina pagado", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({
    "111": pago(pedidoId, { status: "rejected", status_detail: "cc_rejected_other_reason" }),
    "222": pago(pedidoId, { id: 222 }),
  });

  const freno = frenarReclamoDe("A", pedidoId);
  const a = como("A", () => procesarNotificacion("111", deps));
  await hasta(freno.llego);

  const b = await como("B", () => procesarNotificacion("222", { ...deps, antesDelPaso: dejarPasarEn("stock", pedidoId, freno) }));
  const ra = await a;

  // A rechazó (y le avisó al cliente); B no da su pago aprobado por perdido.
  assert.equal(ra.cuerpo.estado, "rechazado");
  assert.equal(b.status, 503);
  assert.equal((await estadoDe(pedidoId)).estado, "rechazado");
  assert.equal(mails.length, 1);

  // El reintento del 222 confirma la venta: un pedido rechazado sí se aprueba.
  const c = await como("C", () => procesarNotificacion("222", deps));
  assert.equal(c.cuerpo.estado, "pagado");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "222" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });
  assert.equal(mails.length, 3); // rechazo (residuo: le llegó antes) + confirmación + interno
});

test("CRUCE: dos pagos APROBADOS distintos a la vez: el que cede pide reintento y el reintento deja la alerta de doble cobro", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId), "222": pago(pedidoId, { id: 222 }) });

  const freno = frenarReclamoDe("B", pedidoId);
  const b = como("B", () => procesarNotificacion("222", deps));
  await hasta(freno.llego);

  // A ya descontó el stock por el 111 cuando B le pisa la marca.
  const a = await como("A", () => procesarNotificacion("111", { ...deps, antesDelPaso: dejarPasarEn("pagado", pedidoId, freno) }));
  const rb = await b;

  assert.equal(rb.cuerpo.estado, "pagado");
  assert.equal(a.status, 503, JSON.stringify(a));
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "222" });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });

  // El reintento del 111: segundo pago aprobado sobre un pedido pagado → revisar.
  const c = await como("C", () => procesarNotificacion("111", deps));
  assert.equal(c.cuerpo.estado, "revisar");
  assert.match((await estadoDe(pedidoId)).mpStatus ?? "", /^revisar: segundo pago aprobado 111/);
  assert.equal(mails.length, 3);
  assert.match(mails[2].mail.asunto, /^REVISAR/);
});

// ---- Fallos de Airtable y de los mails con la marca puesta ----

test("FALLO PERMANENTE después del reclamo (422 en el stock): no se da por procesado, queda 'revisar:' con el paso y sale la alerta", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  // Un 422 que NO es del campo de marcas: p. ej. Stock creado como texto.
  interceptar((path, llamada) => {
    if (llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes))) {
      throw new RespuestaFixture(422, '{"error":{"type":"INVALID_VALUE_FOR_COLUMN","message":"Field \\"Stock\\" cannot accept the provided value"}}');
    }
  });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.estado, "revisar");
  assert.equal(r.cuerpo.fallo, "stock");

  const e = await estadoDe(pedidoId);
  assert.equal(e.estado, "pendiente");
  assert.match(e.mpStatus ?? "", /^revisar: falló el paso "stock" del pago 111: .*422/);
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
  assert.equal(mails.length, 1);
  assert.match(mails[0].mail.asunto, /^REVISAR .* falló "stock"/);

  // Los reintentos no insisten (una persona ya tiene que mirarlo).
  const otra = await como("B", () => procesarNotificacion("111", deps));
  assert.deepEqual(otra, { status: 200, cuerpo: { ok: true, duplicado: true } });
  assert.equal(mails.length, 1);
});

test("FALLO TRANSITORIO después del reclamo (503 leyendo una variante): nada se escribe, el webhook da 500 y el reintento completa", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  interceptar((path, llamada) => {
    if (quien() === "A" && llamada.method === "GET" && path.endsWith(OBSIDIANA_NEGRO)) throw new RespuestaFixture(503, "Airtable caído");
  });

  await assert.rejects(como("A", () => procesarNotificacion("111", deps)), (e: Error) => e.name === "ErrorTrasReclamo" && /503/.test(e.message));
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
  assert.equal((await estadoDe(pedidoId)).estado, "pendiente");
  assert.ok(esMarcaDeReclamo((await estadoDe(pedidoId)).mpStatus));

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);
});

test("el cliente borrado a mano (404) no frena la venta: sigue con el mail del pago", async () => {
  const { pedidoId } = await crearPedido({ Cliente: ["recBORRADO00000001"] });
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "111" });
  assert.equal(mails.length, 2);
});

test("RESEND CAÍDO (enviarMail devuelve false, sin lanzar): no se anota el paso, el webhook da 500 y el reintento manda los mails", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });

  const depsCaido: Dependencias = { ...deps, enviarMail: async () => false };
  await assert.rejects(como("A", () => procesarNotificacion("111", depsCaido)), (e: Error) => e.name === "ErrorTrasReclamo" && /no salió el mail/.test(e.message));

  // Stock y Estado ya están; la marca sigue, sin el paso de los mails.
  const roto = await estadoDe(pedidoId);
  assert.equal(roto.estado, "pagado");
  assert.ok(esMarcaDeReclamo(roto.mpStatus));
  assert.ok(!/mail/.test(roto.mpStatus ?? ""));

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  await verificarVentaUnica(pedidoId, mails);
});

test("con los mails apagados a propósito (sin Resend), un false no es un fallo: la venta se cierra", async () => {
  const { pedidoId } = await crearPedido();
  const { deps } = armarDeps({ "111": pago(pedidoId) }, { enviarMail: async () => false, mailsConfigurados: () => false });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId: "111" });
});

test("RESEND CAÍDO en una alerta de revisión (monto distinto): no se escribe 'revisar:' hasta que la alerta sale", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId, { transaction_amount: 1000 }) });

  await assert.rejects(como("A", () => procesarNotificacion("111", { ...deps, enviarMail: async () => false })));
  const roto = await estadoDe(pedidoId);
  assert.ok(esMarcaDeReclamo(roto.mpStatus), "la marca tiene que seguir para que el reintento vuelva a intentar la alerta");
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "revisar");
  assert.match((await estadoDe(pedidoId)).mpStatus ?? "", /^revisar: se cobró 1000/);
  assert.equal(mails.length, 1);
  assert.match(mails[0].mail.asunto, /no coincide/);
});

test("RESEND CAÍDO en un rechazo: el Estado no se cierra hasta que el mail sale", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId, { status: "rejected" }) });

  await assert.rejects(como("A", () => procesarNotificacion("111", { ...deps, enviarMail: async () => false })));
  assert.equal((await estadoDe(pedidoId)).estado, "pendiente");

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "rechazado");
  assert.equal((await estadoDe(pedidoId)).estado, "rechazado");
  assert.equal(mails.length, 1);
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

test("sin el campo de marcas en Airtable (422), NUNCA se descuenta a ciegas: queda 'revisar' con el paso y la alerta", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });

  interceptar((path, llamada) => {
    if (llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes)) && llamada.body?.includes("Stock_pedidos")) {
      throw new RespuestaFixture(422, '{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"Stock_pedidos\\""}}');
    }
  });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.estado, "revisar");
  assert.equal(r.cuerpo.fallo, "stock");

  const e = await estadoDe(pedidoId);
  assert.equal(e.estado, "pendiente");
  assert.match(e.mpStatus ?? "", /^revisar: falló el paso "stock" del pago 111: .*UNKNOWN_FIELD_NAME/);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 12, marcas: [] });
  assert.equal(mails.length, 1);
  assert.match(mails[0].mail.asunto, /^REVISAR .* falló "stock"/);

  const otra = await como("B", () => procesarNotificacion("111", deps));
  assert.deepEqual(otra, { status: 200, cuerpo: { ok: true, duplicado: true } });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 12, marcas: [] });
});

// ---- Sin Redis configurado: no se procesa ----

test("SIN REDIS (lo que pasa en producción si faltan las variables): no se procesa, 503 para que MP reintente, y sale la alerta", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) }, { cerrojo: null, sinCerrojo: "rechazar" });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.status, 503);
  assert.equal(r.cuerpo.sinCerrojo, true);

  // Nada se tocó: ni marca, ni stock, ni Estado.
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pendiente", mpStatus: undefined, pagoId: undefined });
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);

  // La alerta interna salió (una sola por instancia, aunque MP reintente).
  assert.equal(mails.length, 1);
  assert.match(mails[0].mail.asunto, /^ALERTA Harper/);
  assert.match(mails[0].mail.asunto, /Redis/);
  const otra = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(otra.status, 503);
  assert.equal(mails.length, 1);

  // Las dependencias reales nunca dan permiso para seguir sin cerrojo.
  const reales = dependenciasReales("https://harper.ar");
  assert.notEqual(reales.sinCerrojo, "permitir");
});

// ---- Con cerrojo Redis ----

test("CON CERROJO: dos notificaciones a la vez: la segunda espera la llave, ve el pedido resuelto y contesta duplicado (sin 503)", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });
  const cerrojo = cerrojoEnMemoria(reloj);
  const d: Dependencias = { ...deps, cerrojo };

  const [a, b] = await Promise.all([
    como("A", () => procesarNotificacion("111", d)),
    como("B", () => procesarNotificacion("111", d)),
  ]);

  assert.equal([a, b].filter((r) => r.cuerpo.estado === "pagado").length, 1, JSON.stringify([a, b]));
  assert.deepEqual([a, b].find((r) => r.cuerpo.estado !== "pagado"), { status: 200, cuerpo: { ok: true, duplicado: true } });
  // La segunda tuvo que esperar la llave del pedido (más las llaves de las variantes de la primera).
  assert.ok(cerrojo.intentos >= 4, `intentos=${cerrojo.intentos}`);
  // Todo quedó suelto.
  assert.equal(await cerrojo.tomar(clavePedido(pedidoId), "x", 1000), true);
  await verificarVentaUnica(pedidoId, mails);
});

test("CON CERROJO: el cruce in_process / approved se serializa: una sola venta, sin reintentos", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId), "111@A": pago(pedidoId, { status: "in_process" }) });
  const d: Dependencias = { ...deps, cerrojo: cerrojoEnMemoria(reloj) };

  const [a, b] = await Promise.all([
    como("A", () => procesarNotificacion("111", d)),
    como("B", () => procesarNotificacion("111", d)),
  ]);

  assert.ok([a, b].every((r) => r.status === 200), JSON.stringify([a, b]));
  assert.equal(b.cuerpo.estado, "pagado");
  // A llegó primero (registró in_process) o después (vio el pedido ya cerrado).
  assert.ok(a.cuerpo.estado === "in_process" || a.cuerpo.duplicado === true, JSON.stringify(a));
  await verificarVentaUnica(pedidoId, mails);
});

test("CON CERROJO: dos pedidos DISTINTOS aprobados a la vez sobre las mismas variantes: el stock baja las dos unidades", async () => {
  const p1 = await crearPedido();
  const p2 = await crearPedido({ Numero: "HARPER-T2" });
  const { deps, reloj, mails } = armarDeps({ "111": pago(p1.pedidoId), "222": pago(p2.pedidoId, { id: 222 }) });
  const d: Dependencias = { ...deps, cerrojo: cerrojoEnMemoria(reloj) };

  const [a, b] = await Promise.all([
    como("A", () => procesarNotificacion("111", d)),
    como("B", () => procesarNotificacion("222", d)),
  ]);

  assert.equal(a.cuerpo.estado, "pagado", JSON.stringify(a));
  assert.equal(b.cuerpo.estado, "pagado", JSON.stringify(b));
  const am = await stockDe(AMATISTA_NEGRO);
  const ob = await stockDe(OBSIDIANA_NEGRO);
  assert.equal(am.stock, 10);
  assert.equal(ob.stock, 10);
  assert.deepEqual([...am.marcas].sort(), ["HARPER-T1", "HARPER-T2"]);
  assert.equal(mails.length, 4);
});

test("CON CERROJO: la instancia muere con la llave tomada: la llave vence sola y el reintento completa sin repetir stock", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId) });
  const cerrojo = cerrojoEnMemoria(reloj);

  // A se cae después del stock y "muere" sin soltar la llave (el finally no corre en una instancia muerta).
  interceptar((path, llamada) => {
    if (quien() === "A" && llamada.method === "PATCH" && path.endsWith(pedidoId) && llamada.body?.includes('"Estado":"pagado"')) {
      throw new Error("caída simulada");
    }
  });
  const sinSoltar: Cerrojo = { tomar: cerrojo.tomar, soltar: async () => { throw new Error("instancia muerta"); } };
  await assert.rejects(como("A", () => procesarNotificacion("111", { ...deps, cerrojo: sinSoltar })));
  interceptar(null);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-T1"] });

  // Reintento temprano: la llave sigue tomada → 503, sin tocar Airtable.
  const temprano = await como("B", () => procesarNotificacion("111", { ...deps, cerrojo, esperaOcupadoMs: 1_000 }));
  assert.equal(temprano.status, 503);
  assert.equal((await estadoDe(pedidoId)).estado, "pendiente");

  // Vencen la llave y la marca: el reintento retoma.
  reloj.avanzar(Math.max(TTL_PEDIDO_MS, VIGENCIA_RECLAMO_MS) + 1);
  const tarde = await como("C", () => procesarNotificacion("111", { ...deps, cerrojo }));
  assert.equal(tarde.cuerpo.estado, "pagado");
  assert.equal(tarde.cuerpo.stockDescontado, 0);
  await verificarVentaUnica(pedidoId, mails);
});

test("CON CERROJO: si Redis no contesta, no se toca Airtable y el webhook reintenta (falla cerrado)", async () => {
  const { pedidoId } = await crearPedido();
  const { deps, mails } = armarDeps({ "111": pago(pedidoId) });
  const roto: Cerrojo = {
    tomar: async () => {
      throw new ErrorCerrojo("Redis no contestó");
    },
    soltar: async () => {},
  };

  await assert.rejects(como("A", () => procesarNotificacion("111", { ...deps, cerrojo: roto })), ErrorCerrojo);
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pendiente", mpStatus: undefined, pagoId: undefined });
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
  assert.equal(mails.length, 0);
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

// ---- Suscriptores Harper (Ale, 03/11/2026) ----

type FilaSuscriptorPrueba = { Email?: string; Cupon?: string; Cupon_pedido?: string };
type FilaSaldoPrueba = { Tipo?: string; Monto?: number; Pedido?: string; Disponible_desde?: string; Suscriptor_id?: string; Anulado?: boolean };

/** Un suscriptor con el cupón disponible y $ 20.000 de saldo para usar. */
async function suscriptorConSaldo(campos: Partial<FilaSuscriptorPrueba> = {}) {
  const fila = await createRecord<FilaSuscriptorPrueba>(TABLAS.suscriptores, { Email: "prueba@harper.ar", Cupon: "Disponible", ...campos });
  await createRecord(TABLAS.saldos, { Suscriptor_id: fila.id, Email: "prueba@harper.ar", Tipo: "Ajuste", Monto: 20000, Movimiento: "Ajuste" });
  return fila.id;
}

/** Un par de $ 89.900 con el cupón ($ 10.000) y $ 5.000 de saldo: se pagan $ 74.900 y vuelven $ 7.490. */
async function pedidoDeSuscriptor(suscriptorId: string, numero = "HARPER-T1") {
  const par: ItemResuelto = { ...item(AMATISTA_NEGRO, "AMATISTA-NEGRO"), cupon: 10000, saldo: 5000, subtotal: 74900, precioUnitario: 74900 };
  const notas = notasDeBeneficios({ suscriptorId, email: "prueba@harper.ar", cupon: 10000, saldoUsado: 5000, cashback: 7490 }).join("\n");
  return crearPedido({ Numero: numero, Items: JSON.stringify([par]), Subtotal: 74900, Total: 74900, Notas: notas });
}

async function saldosDe(suscriptorId: string) {
  return (await listRecords<FilaSaldoPrueba>(TABLAS.saldos))
    .map((f) => f.fields)
    .filter((f) => f.Suscriptor_id === suscriptorId && f.Tipo !== "Ajuste")
    .map((f) => [f.Tipo, f.Monto, f.Pedido, f.Disponible_desde ?? null, f.Anulado === true]);
}

test("Suscriptores: el pago aprobado anota el cupón, el saldo usado y el cashback una sola vez, y los mails lo cuentan", async () => {
  const suscriptorId = await suscriptorConSaldo();
  const { pedidoId } = await pedidoDeSuscriptor(suscriptorId);
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { transaction_amount: 74900 }) });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");

  const fila = await getRecord<FilaSuscriptorPrueba>(TABLAS.suscriptores, suscriptorId);
  assert.deepEqual([fila.fields.Cupon, fila.fields.Cupon_pedido], ["Usado", "HARPER-T1"]);
  // AHORA es el 20/10/2025 a las 19:40 en Buenos Aires: el cashback se usa desde el 19/11.
  assert.deepEqual(await saldosDe(suscriptorId), [
    ["Uso", -5000, "HARPER-T1", null, false],
    ["Cashback", 7490, "HARPER-T1", "2025-11-19", false],
  ]);

  const cliente = mails.find((m) => m.mail.para === "prueba@harper.ar")!.mail;
  assert.match(cliente.texto, /Usaste tu cupón de bienvenida: −\$\s10\.000/);
  assert.match(cliente.texto, /Pagaste \$\s5\.000 con tu saldo/);
  assert.match(cliente.texto, /Te vuelven \$\s7\.490 de saldo: los podés usar desde el 19\/11\/2025/);
  assert.match(cliente.html, /Suscriptores Harper/);
  const interno = mails.find((m) => m.mail.para !== "prueba@harper.ar")!.mail;
  assert.match(interno.asunto, /^Venta HARPER-T1 — .* · suscriptor$/);
  assert.match(interno.texto, /Suscriptor: prueba@harper\.ar · cupón de bienvenida −\$\s10\.000 · saldo usado −\$\s5\.000 · cashback a acreditar \$\s7\.490/);
  assert.match(interno.texto, /Si se devuelve, marcá Anulado en Saldos/);

  // Mercado Pago avisa otra vez: nada se duplica.
  await como("B", () => procesarNotificacion("111", deps));
  assert.equal((await saldosDe(suscriptorId)).length, 2);
  assert.equal(mails.length, 2);
});

test("Suscriptores: una caída antes de los mails no duplica nada al retomar (cada paso es idempotente por pedido y tipo)", async () => {
  const suscriptorId = await suscriptorConSaldo();
  const { pedidoId } = await pedidoDeSuscriptor(suscriptorId);
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId, { transaction_amount: 74900 }) });

  const caido: Dependencias = { ...deps, enviarMail: async () => false };
  await assert.rejects(como("A", () => procesarNotificacion("111", caido)), (e: Error) => e.name === "ErrorTrasReclamo");
  assert.equal((await saldosDe(suscriptorId)).length, 2);

  reloj.avanzar(VIGENCIA_RECLAMO_MS);
  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal((await saldosDe(suscriptorId)).length, 2);
  // El cupón era de este mismo pedido: no es un conflicto.
  const interno = mails.find((m) => m.mail.para !== "prueba@harper.ar")!.mail;
  assert.doesNotMatch(interno.asunto, /^REVISAR/);
});

test("Suscriptores: el cupón ya usado en otro pedido no se pisa y el saldo que ya no alcanzaba se anota igual, con alerta", async () => {
  const suscriptorId = await suscriptorConSaldo({ Cupon: "Usado", Cupon_pedido: "HARPER-OTRO" });
  // Otro pedido ya se llevó $ 18.000 de los $ 20.000.
  await createRecord(TABLAS.saldos, { Suscriptor_id: suscriptorId, Tipo: "Uso", Monto: -18000, Pedido: "HARPER-OTRO", Movimiento: "HARPER-OTRO · Uso" });
  const { pedidoId } = await pedidoDeSuscriptor(suscriptorId);
  const { deps, mails } = armarDeps({ "111": pago(pedidoId, { transaction_amount: 74900 }) });

  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.estado, "pagado", "la venta ya está cobrada: sigue");

  const fila = await getRecord<FilaSuscriptorPrueba>(TABLAS.suscriptores, suscriptorId);
  assert.equal(fila.fields.Cupon_pedido, "HARPER-OTRO");
  const saldos = await saldosDe(suscriptorId);
  assert.ok(saldos.some(([tipo, monto, pedido]) => tipo === "Uso" && monto === -5000 && pedido === "HARPER-T1"));

  const interno = mails.find((m) => m.mail.para !== "prueba@harper.ar")!.mail;
  assert.match(interno.asunto, /^REVISAR /);
  assert.match(interno.texto, /ya figuraba usado en el pedido HARPER-OTRO/);
  assert.match(interno.texto, /ya no le alcanzaba/);
});

test("Suscriptores CON CERROJO: si otro proceso tiene tomado al suscriptor, se reintenta sin anotar nada a medias", async () => {
  const suscriptorId = await suscriptorConSaldo();
  const { pedidoId } = await pedidoDeSuscriptor(suscriptorId);
  const { deps, reloj, mails } = armarDeps({ "111": pago(pedidoId, { transaction_amount: 74900 }) }, { esperaOcupadoMs: 1_000 });
  const cerrojo = cerrojoEnMemoria(reloj);
  await cerrojo.tomar(claveSuscriptor(suscriptorId), "otro", 5_000);
  const d: Dependencias = { ...deps, cerrojo };

  await assert.rejects(como("A", () => procesarNotificacion("111", d)), (e: Error) => e.name === "ErrorTrasReclamo" && /cerrojo del suscriptor/.test(e.message));
  assert.equal((await saldosDe(suscriptorId)).length, 0);
  assert.equal(mails.length, 0);

  // La llave vence sola; el reintento completa.
  reloj.avanzar(Math.max(VIGENCIA_RECLAMO_MS, 5_000));
  const r = await como("B", () => procesarNotificacion("111", d));
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal((await saldosDe(suscriptorId)).length, 2);
});

test("un pedido sin suscriptor no toca Suscriptores ni Saldos", async () => {
  const { pedidoId } = await crearPedido();
  const { deps } = armarDeps({ "111": pago(pedidoId) });
  const antes = (await listRecords(TABLAS.saldos)).length;
  await como("A", () => procesarNotificacion("111", deps));
  assert.equal((await listRecords(TABLAS.saldos)).length, antes);
});

test("Suscriptores: un reembolso o contracargo del pago anula el cashback del pedido una sola vez y avisa a Harper", async () => {
  const suscriptorId = await suscriptorConSaldo();
  const { pedidoId } = await pedidoDeSuscriptor(suscriptorId);
  // A ve el pago aprobado; B y C, el mismo pago ya devuelto (Mercado Pago avisa otra vez).
  const devuelto = pago(pedidoId, { transaction_amount: 74900, status: "refunded" });
  const { deps, mails } = armarDeps({ "111@A": pago(pedidoId, { transaction_amount: 74900 }), "111@B": devuelto, "111@C": devuelto });
  await como("A", () => procesarNotificacion("111", deps));
  const antes = mails.length;

  const r = await como("B", () => procesarNotificacion("111", deps));
  assert.equal(r.cuerpo.duplicado, true, "el pedido no cambia de estado");
  assert.deepEqual(
    (await saldosDe(suscriptorId)).find((m) => m[0] === "Cashback"),
    ["Cashback", 7490, "HARPER-T1", "2025-11-19", true]
  );
  const aviso = mails.slice(antes).map((m) => m.mail);
  assert.equal(aviso.length, 1);
  assert.match(aviso[0].asunto, /^REVISAR HARPER-T1 — reembolso en Mercado Pago: cashback anulado$/);
  assert.match(aviso[0].texto, /Usó \$\s5\.000 de saldo en este pedido/);

  // Otro aviso del mismo reembolso: no vuelve a avisar.
  await como("C", () => procesarNotificacion("111", deps));
  assert.equal(mails.length, antes + 1);
});

// ---- Tarea 12: el cashback ante pagos duplicados ----

const MONTO = 74900;
const devueltoDe = (p: PagoMP): PagoMP => ({ ...p, status: "refunded", transaction_amount_refunded: MONTO } as PagoMP);

/** Un pedido de suscriptor cobrado con el pago 111 (y, si se pide, un segundo pago 222 aprobado que quedó para revisar). */
async function pedidoCobrado(numero: string, conRepetido: boolean) {
  const suscriptorId = await suscriptorConSaldo();
  const { pedidoId } = await pedidoDeSuscriptor(suscriptorId, numero);
  const pagos: Record<string, PagoMP> = { "111": pago(pedidoId, { transaction_amount: MONTO }) };
  const { deps, mails } = armarDeps(pagos);
  await como("A", () => procesarNotificacion("111", deps));
  if (conRepetido) {
    pagos["222"] = pago(pedidoId, { id: 222, transaction_amount: MONTO });
    const r = await como("A", () => procesarNotificacion("222", deps));
    assert.equal(r.cuerpo.estado, "revisar", "el segundo pago queda para revisar, como siempre");
    assert.deepEqual(pagosDeLaMarca((await estadoDe(pedidoId)).mpStatus), ["222", "111"]);
  }
  const cashback = async () => (await saldosDe(suscriptorId)).find((m) => m[0] === "Cashback");
  const anulado = async () => (await cashback())?.[4] === true;
  assert.equal(await anulado(), false);
  const asuntos = (desde: number) => mails.slice(desde).map((m) => m.mail.asunto);
  return { pedidoId, pagos, deps, mails, anulado, asuntos };
}

test("Tarea 12, pago repetido: reembolsar el repetido no anula el cashback", async () => {
  const { pagos, deps, mails, anulado, asuntos } = await pedidoCobrado("HARPER-T12A", true);
  const antes = mails.length;
  pagos["222"] = devueltoDe(pagos["222"]);
  const r = await como("A", () => procesarNotificacion("222", deps));
  assert.equal(r.status, 200);
  assert.equal(await anulado(), false, "el 111 sigue cobrando el pedido");
  assert.deepEqual(asuntos(antes), [], "nada que avisar");
});

test("Tarea 12, reembolso del primario con el repetido vigente: no anula (antes se anulaba)", async () => {
  const { pagos, deps, mails, anulado, asuntos } = await pedidoCobrado("HARPER-T12B", true);
  const antes = mails.length;
  pagos["111"] = devueltoDe(pagos["111"]);
  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.duplicado, true);
  assert.equal(await anulado(), false, "el 222 sigue cobrando el pedido");
  assert.deepEqual(asuntos(antes), []);
});

test("Tarea 12, reembolso de los dos, en cualquier orden: se anula una sola vez, cuando el pedido queda sin cobro", async () => {
  for (const [primero, segundo, numero] of [["111", "222", "HARPER-T12C"], ["222", "111", "HARPER-T12D"]] as const) {
    const { pagos, deps, mails, anulado, asuntos } = await pedidoCobrado(numero, true);
    const antes = mails.length;
    pagos[primero] = devueltoDe(pagos[primero]);
    await como("A", () => procesarNotificacion(primero, deps));
    assert.equal(await anulado(), false, `${numero}: con uno solo devuelto, sigue cobrado`);
    pagos[segundo] = devueltoDe(pagos[segundo]);
    const r = await como("A", () => procesarNotificacion(segundo, deps));
    assert.equal(r.status, 200);
    assert.equal(await anulado(), true, `${numero}: sin cobro, se anula`);
    // Reintentos y avisos repetidos de los dos: no vuelve a avisar.
    await como("B", () => procesarNotificacion(primero, deps));
    await como("C", () => procesarNotificacion(segundo, deps));
    assert.deepEqual(asuntos(antes), [`REVISAR ${numero} — reembolso en Mercado Pago: cashback anulado`]);
  }
});

test("Tarea 12, pago único: reembolso o contracargo perdido anulan; contracargo en curso avisa sin anular; ganado no anula", async () => {
  // Reembolso del único pago: se anula, como siempre.
  const unico = await pedidoCobrado("HARPER-T12E", false);
  unico.pagos["111"] = devueltoDe(unico.pagos["111"]);
  await como("A", () => procesarNotificacion("111", unico.deps));
  assert.equal(await unico.anulado(), true);

  // Contracargo: en curso no anula y avisa; perdido anula.
  const c = await pedidoCobrado("HARPER-T12F", false);
  const antes = c.mails.length;
  c.pagos["111"] = { ...c.pagos["111"], status: "charged_back", status_detail: "in_process" };
  const enCurso = await como("A", () => procesarNotificacion("111", c.deps));
  assert.equal(enCurso.status, 200);
  assert.equal(await c.anulado(), false, "todavía no se sabe si se pierde");
  assert.deepEqual(c.asuntos(antes), ["REVISAR HARPER-T12F — disputa abierta en Mercado Pago: cashback sin anular"]);
  c.pagos["111"] = { ...c.pagos["111"], status: "charged_back", status_detail: "settled" };
  await como("A", () => procesarNotificacion("111", c.deps));
  assert.equal(await c.anulado(), true);
  assert.equal(c.asuntos(antes).at(-1), "REVISAR HARPER-T12F — contracargo en Mercado Pago: cashback anulado");

  // Contracargo ganado: el pedido sigue cobrado, no se anula.
  const g = await pedidoCobrado("HARPER-T12G", false);
  g.pagos["111"] = { ...g.pagos["111"], status: "charged_back", status_detail: "reimbursed" };
  await como("A", () => procesarNotificacion("111", g.deps));
  assert.equal(await g.anulado(), false);
});

test("Revisión del PR #70, las cuatro disputas con un pago único: in_mediation, charged_back/in_process, /settled y /reimbursed", async () => {
  const casos: { numero: string; status: string; detalle?: string; anulado: boolean; asunto: string | null }[] = [
    { numero: "HARPER-D1", status: "in_mediation", anulado: false, asunto: "REVISAR HARPER-D1 — disputa abierta en Mercado Pago: cashback sin anular" },
    { numero: "HARPER-D2", status: "charged_back", detalle: "in_process", anulado: false, asunto: "REVISAR HARPER-D2 — disputa abierta en Mercado Pago: cashback sin anular" },
    { numero: "HARPER-D3", status: "charged_back", detalle: "settled", anulado: true, asunto: "REVISAR HARPER-D3 — contracargo en Mercado Pago: cashback anulado" },
    { numero: "HARPER-D4", status: "charged_back", detalle: "reimbursed", anulado: false, asunto: null },
  ];
  for (const caso of casos) {
    const p = await pedidoCobrado(caso.numero, false);
    const antes = p.mails.length;
    p.pagos["111"] = { ...p.pagos["111"], status: caso.status, ...(caso.detalle ? { status_detail: caso.detalle } : {}) };
    const r = await como("A", () => procesarNotificacion("111", p.deps));
    assert.equal(r.status, 200, caso.numero);
    assert.equal(await p.anulado(), caso.anulado, `${caso.numero}: anulado`);
    assert.deepEqual(p.asuntos(antes), caso.asunto ? [caso.asunto] : [], `${caso.numero}: aviso`);
    if (!caso.anulado && caso.asunto) {
      // La disputa abierta: el aviso dice que no se anuló, el riesgo de Saldos y cómo bloquearlo.
      const texto = p.mails.at(-1)!.mail.texto;
      assert.match(texto, /disputa abierta/);
      assert.match(texto, /NO se anuló/);
      assert.match(texto, /Saldos no tiene un estado de suspensión/);
      assert.match(texto, new RegExp(`marcá Anulado el Cashback de ${caso.numero}`));
    }
  }
});

test("Revisión del PR #70: una disputa abierta termina; perdida y sin cobro anula, ganada conserva", async () => {
  // El cliente gana el reclamo: Mercado Pago le devuelve la plata (refunded). Sin cobro: se anula.
  const perdida = await pedidoCobrado("HARPER-D5", false);
  perdida.pagos["111"] = { ...perdida.pagos["111"], status: "in_mediation" };
  await como("A", () => procesarNotificacion("111", perdida.deps));
  assert.equal(await perdida.anulado(), false, "mientras está abierta, no se anula");
  perdida.pagos["111"] = devueltoDe(perdida.pagos["111"]);
  await como("A", () => procesarNotificacion("111", perdida.deps));
  assert.equal(await perdida.anulado(), true);

  // Harper gana: el pago vuelve a aprobado. El cashback queda como estaba y no hay otro aviso.
  const ganada = await pedidoCobrado("HARPER-D6", false);
  ganada.pagos["111"] = { ...ganada.pagos["111"], status: "in_mediation" };
  await como("A", () => procesarNotificacion("111", ganada.deps));
  const antes = ganada.mails.length;
  ganada.pagos["111"] = { ...ganada.pagos["111"], status: "approved" };
  const r = await como("A", () => procesarNotificacion("111", ganada.deps));
  assert.equal(r.status, 200);
  assert.equal(await ganada.anulado(), false);
  assert.equal(ganada.mails.length, antes);
});

test("Revisión del PR #70: disputa sobre un pago cuando otro pago válido cubre el pedido: se avisa sin riesgo y se conserva, aunque se pierda", async () => {
  // El original (111) en disputa; el repetido (222) sigue aprobado.
  const p = await pedidoCobrado("HARPER-D7", true);
  const antes = p.mails.length;
  p.pagos["111"] = { ...p.pagos["111"], status: "in_mediation" };
  assert.equal((await como("A", () => procesarNotificacion("111", p.deps))).status, 200);
  assert.equal(await p.anulado(), false);
  assert.deepEqual(p.asuntos(antes), ["REVISAR HARPER-D7 — disputa abierta en Mercado Pago: cashback sin anular"]);
  assert.match(p.mails.at(-1)!.mail.texto, /Otro pago válido cubre el pedido/);
  assert.doesNotMatch(p.mails.at(-1)!.mail.texto, /marcá Anulado/, "no hace falta bloquear nada");
  // Se pierde: el pedido sigue cobrado por el 222. Se conserva.
  p.pagos["111"] = { ...p.pagos["111"], status: "charged_back", status_detail: "settled" };
  await como("A", () => procesarNotificacion("111", p.deps));
  assert.equal(await p.anulado(), false);

  // La disputa es sobre el repetido (rama «ignorar»): también se avisa y se conserva.
  const q = await pedidoCobrado("HARPER-D8", true);
  const antesQ = q.mails.length;
  q.pagos["222"] = { ...q.pagos["222"], status: "in_mediation" };
  assert.equal((await como("A", () => procesarNotificacion("222", q.deps))).status, 200);
  assert.equal(await q.anulado(), false);
  assert.deepEqual(q.asuntos(antesQ), ["REVISAR HARPER-D8 — disputa abierta en Mercado Pago: cashback sin anular"]);
});

test("Revisión del PR #70: una disputa sin certeza (Mercado Pago no contesta) no avisa ni anula: 503 y reintento", async () => {
  const p = await pedidoCobrado("HARPER-D9", false);
  const antes = p.mails.length;
  p.pagos["111"] = { ...p.pagos["111"], status: "in_mediation" };
  const caido: LectorMercadoPago = { pago: async () => { throw new Error("Mercado Pago 503"); }, pagosDelPedido: async () => { throw new Error("Mercado Pago 503"); } };
  const r = await como("A", () => procesarNotificacion("111", { ...p.deps, lectorPagos: caido }));
  assert.equal(r.status, 503);
  assert.equal(await p.anulado(), false);
  assert.equal(p.mails.length, antes);
  assert.equal((await como("A", () => procesarNotificacion("111", p.deps))).status, 200);
  assert.equal(p.asuntos(antes).length, 1, "el reintento manda el aviso");
});

test("Tarea 12, fuera de orden: avisos viejos cuando ya está todo devuelto, y una búsqueda atrasada", async () => {
  // Los dos ya devueltos cuando llegan los avisos (el del original, primero): anula una vez.
  const tarde = await pedidoCobrado("HARPER-T12H", true);
  const antes = tarde.mails.length;
  tarde.pagos["111"] = devueltoDe(tarde.pagos["111"]);
  tarde.pagos["222"] = devueltoDe(tarde.pagos["222"]);
  await como("A", () => procesarNotificacion("111", tarde.deps));
  await como("B", () => procesarNotificacion("222", tarde.deps));
  assert.equal(await tarde.anulado(), true);
  assert.equal(tarde.asuntos(antes).length, 1);

  // La búsqueda todavía no trae el repetido vigente: igual se lee, porque quedó en la marca «revisar».
  const atrasada = await pedidoCobrado("HARPER-T12I", true);
  atrasada.pagos["111"] = devueltoDe(atrasada.pagos["111"]);
  const deps = { ...atrasada.deps, lectorPagos: lectorDe(atrasada.pagos, new Set(["222"])) };
  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.status, 200);
  assert.equal(await atrasada.anulado(), false, "el 222 sigue vigente aunque la búsqueda no lo traiga");

  // La búsqueda no trae ni el pago del aviso: «sin cobro» no se certifica; 503 y reintento.
  const unico = await pedidoCobrado("HARPER-T12J", false);
  unico.pagos["111"] = devueltoDe(unico.pagos["111"]);
  const sinBusqueda = { ...unico.deps, lectorPagos: lectorDe(unico.pagos, new Set(["111"])) };
  const incierto = await como("A", () => procesarNotificacion("111", sinBusqueda));
  assert.equal(incierto.status, 503);
  assert.equal(await unico.anulado(), false);
  const reintento = await como("A", () => procesarNotificacion("111", unico.deps));
  assert.equal(reintento.status, 200);
  assert.equal(await unico.anulado(), true);
});

test("Tarea 12, sin certeza no se anula: Mercado Pago caído, búsqueda incompleta, estado desconocido o sin lector → 503", async () => {
  const p = await pedidoCobrado("HARPER-T12K", true);
  p.pagos["111"] = devueltoDe(p.pagos["111"]);
  const casos: [string, LectorMercadoPago | null][] = [
    ["Mercado Pago no contesta", { pago: async () => { throw new Error("Mercado Pago 503"); }, pagosDelPedido: async () => { throw new Error("Mercado Pago 503"); } }],
    ["búsqueda incompleta", { ...lectorDe(p.pagos), pagosDelPedido: async () => { throw new CobroIncierto("la búsqueda trajo 1 de 2 pagos"); } }],
    ["sin lector", null],
  ];
  for (const [que, lectorPagos] of casos) {
    const r = await como("A", () => procesarNotificacion("111", { ...p.deps, lectorPagos }));
    assert.equal(r.status, 503, que);
    assert.equal(r.cuerpo.reintentar, true, que);
    assert.equal(await p.anulado(), false, que);
  }
  // Un estado de Mercado Pago que no se conoce en el repetido: tampoco se supone nada.
  p.pagos["222"] = { ...p.pagos["222"], status: "estado_nuevo_de_mp" };
  const desconocido = await como("A", () => procesarNotificacion("111", p.deps));
  assert.equal(desconocido.status, 503);
  assert.equal(await p.anulado(), false);
  // Cuando Mercado Pago dice algo conocido, el reintento decide.
  p.pagos["222"] = devueltoDe({ ...p.pagos["222"], status: "approved" });
  assert.equal((await como("A", () => procesarNotificacion("111", p.deps))).status, 200);
  assert.equal(await p.anulado(), true);
});

test("Tarea 12, un pedido sin cashback (no es de un suscriptor): el reembolso sigue igual, sin leer los pagos", async () => {
  const { pedidoId } = await crearPedido({ Numero: "HARPER-T12L" });
  const pagos: Record<string, PagoMP> = { "111": pago(pedidoId) };
  let lecturas = 0;
  const { deps } = armarDeps(pagos, {
    lectorPagos: {
      pago: async () => { lecturas++; throw new Error("no debería leer"); },
      pagosDelPedido: async () => { lecturas++; throw new Error("no debería leer"); },
    },
  });
  await como("A", () => procesarNotificacion("111", deps));
  pagos["111"] = { ...pagos["111"], status: "refunded" };
  const r = await como("A", () => procesarNotificacion("111", deps));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.duplicado, true);
  assert.equal(lecturas, 0);
});

test("Tarea 12: de las marcas «revisar» solo se leen pagos de la del segundo pago, nunca montos", () => {
  assert.deepEqual(pagosDeLaMarca("revisar: segundo pago aprobado 222 sobre un pedido pagado (pago anterior 111); posible doble cobro"), ["222", "111"]);
  assert.deepEqual(pagosDeLaMarca("revisar: se cobró 179800 y el pedido dice 179800"), []);
  assert.deepEqual(pagosDeLaMarca("approved"), []);
  assert.deepEqual(pagosDeLaMarca(undefined), []);
});
