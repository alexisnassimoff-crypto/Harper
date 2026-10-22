import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Contra el Airtable en memoria: es un único estado compartido, como el real,
// y acá hace de "las dos instancias" que escriben sobre el mismo pedido.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { createRecord, getRecord, TABLAS, updateRecord } from "../lib/airtable";
import { anotarPaso, reclamarPedido, verificarReclamo, type Reloj } from "../lib/webhook-lock";
import { decidirNotificacion, esMarcaDeReclamo, leerReclamo } from "../lib/webhook-decision";

type Fila = { Numero?: string; Estado?: string; MP_payment_id?: string; MP_status?: string };

const AHORA = 1_761_000_000_000;

/** Un reloj que no espera de verdad: avanza el tiempo y cede el turno. */
function relojFalso(inicio = AHORA): Reloj & { avanzar(ms: number): void } {
  let t = inicio;
  return {
    ahora: () => t,
    async dormir(ms) {
      t += ms;
      await new Promise((r) => setImmediate(r));
    },
    avanzar(ms) {
      t += ms;
    },
  };
}

async function pedidoNuevo() {
  const creado = await createRecord<Fila>(TABLAS.pedidos, { Numero: "HARPER-TEST", Estado: "pendiente" });
  return creado.id;
}

beforeEach(async () => {
  const { reiniciar, interceptar } = await import("../lib/fixtures/servidor");
  reiniciar();
  interceptar(null);
});

test("dos instancias reclaman el mismo pago a la vez: gana exactamente una", async () => {
  const id = await pedidoNuevo();
  const reloj = relojFalso();

  const [a, b] = await Promise.all([
    reclamarPedido<Fila>(id, "111", { esperaMs: 150, reloj }),
    reclamarPedido<Fila>(id, "111", { esperaMs: 150, reloj }),
  ]);

  assert.equal([a.gano, b.gano].filter(Boolean).length, 1, "ganó más de una (o ninguna)");
  assert.ok(esMarcaDeReclamo((await getRecord<Fila>(TABLAS.pedidos, id)).fields.MP_status));
});

test("la marca lleva el pago, un nonce único y la hora del reloj", async () => {
  const id = await pedidoNuevo();
  const reloj = relojFalso();

  const r = await reclamarPedido<Fila>(id, "111", { esperaMs: 10, reloj });
  assert.equal(r.gano, true);
  assert.equal(r.reclamo.pagoId, "111");
  assert.equal(r.reclamo.desde, AHORA);
  assert.deepEqual(r.reclamo.pasos, []);

  const guardada = leerReclamo(r.pedido.fields.MP_status);
  assert.deepEqual(guardada, r.reclamo);
});

test("una instancia que reclama tarde, con el pedido ya pagado y cerrado, decide 'duplicado'", async () => {
  const id = await pedidoNuevo();
  const reloj = relojFalso();

  // La primera instancia gana, confirma el pedido y deja el estado final.
  const primera = await reclamarPedido<Fila>(id, "111", { esperaMs: 50, reloj });
  assert.equal(primera.gano, true);
  await updateRecord<Fila>(TABLAS.pedidos, id, { Estado: "pagado", MP_payment_id: "111", MP_status: "approved" });

  // La segunda llega después: reclama, "gana" la marca, pero al releer ve el
  // pedido pagado y la decisión (sin su propia marca) es no hacer nada.
  const segunda = await reclamarPedido<Fila>(id, "111", { esperaMs: 50, reloj });
  assert.equal(segunda.gano, true);
  const accion = decidirNotificacion({
    estadoActual: segunda.pedido.fields.Estado ?? "pendiente",
    pagoRegistrado: segunda.pedido.fields.MP_payment_id,
    mpStatusActual: "",
    pagoId: "111",
    statusPago: "approved",
    ahora: reloj.ahora(),
  });
  assert.equal(accion, "duplicado");
});

test("si el ganador se cae, su marca vence y el reintento retoma heredando los pasos", async () => {
  const id = await pedidoNuevo();
  const reloj = relojFalso();

  const caida = await reclamarPedido<Fila>(id, "111", { esperaMs: 50, reloj });
  assert.equal(caida.gano, true);
  // Alcanzó a anotar un paso y murió.
  await anotarPaso<Fila>(id, caida.reclamo, "mails");

  // Mientras la marca vale, cualquier notificación espera.
  let pedido = await getRecord<Fila>(TABLAS.pedidos, id);
  assert.equal(
    decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: pedido.fields.MP_status, pagoId: "111", statusPago: "approved", ahora: reloj.ahora() }),
    "en_curso"
  );

  // Vencida: se retoma, y los pasos ya hechos viajan en la nueva marca.
  reloj.avanzar(120_001);
  pedido = await getRecord<Fila>(TABLAS.pedidos, id);
  const previa = leerReclamo(pedido.fields.MP_status);
  assert.equal(
    decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: pedido.fields.MP_status, pagoId: "111", statusPago: "approved", ahora: reloj.ahora() }),
    "aprobar"
  );

  const reintento = await reclamarPedido<Fila>(id, "111", { esperaMs: 50, reloj, pasos: previa?.pasos });
  assert.equal(reintento.gano, true);
  assert.notEqual(reintento.reclamo.nonce, caida.reclamo.nonce);
  assert.deepEqual(reintento.reclamo.pasos, ["mails"]);
  assert.equal(reintento.pedido.fields.Estado, "pendiente");
});

test("diez notificaciones simultáneas del mismo pago: un solo ganador", async () => {
  const id = await pedidoNuevo();
  const reloj = relojFalso();
  const resultados = await Promise.all(
    Array.from({ length: 10 }, () => reclamarPedido<Fila>(id, "222", { esperaMs: 120, reloj }))
  );
  assert.equal(resultados.filter((r) => r.gano).length, 1);
});

test("verificar antes de cada paso: si otra instancia pisó la marca, ya no es nuestra", async () => {
  const id = await pedidoNuevo();
  const reloj = relojFalso();

  const a = await reclamarPedido<Fila>(id, "111", { esperaMs: 10, reloj });
  assert.equal(a.gano, true);

  let v = await verificarReclamo<Fila>(id, a.reclamo);
  assert.equal(v.vigente, true);

  // Anotar un paso no cambia el nonce: sigue siendo nuestra, con el paso.
  const conPaso = await anotarPaso<Fila>(id, a.reclamo, "pagado", { Estado: "pagado" });
  v = await verificarReclamo<Fila>(id, a.reclamo);
  assert.equal(v.vigente, true);
  assert.deepEqual(v.reclamo.pasos, ["pagado"]);
  assert.equal(v.reclamo.nonce, conPaso.nonce);
  assert.equal(v.pedido.fields.Estado, "pagado");

  // Otra instancia escribe su marca: la nuestra ya no vale.
  const b = await reclamarPedido<Fila>(id, "111", { esperaMs: 10, reloj });
  assert.equal(b.gano, true);
  v = await verificarReclamo<Fila>(id, a.reclamo);
  assert.equal(v.vigente, false);

  // Y si el pedido ya se cerró, tampoco.
  await updateRecord<Fila>(TABLAS.pedidos, id, { MP_status: "approved" });
  v = await verificarReclamo<Fila>(id, b.reclamo);
  assert.equal(v.vigente, false);
});
