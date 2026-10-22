import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Contra el Airtable en memoria: es un único estado compartido, como el real,
// y acá hace de "las dos instancias" que escriben sobre el mismo pedido.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { createRecord, getRecord, TABLAS, updateRecord } from "../lib/airtable";
import { reclamarPedido, esMarcaDeReclamo } from "../lib/webhook-lock";
import { decidirNotificacion } from "../lib/webhook-decision";

type Fila = { Numero?: string; Estado?: string; MP_payment_id?: string; MP_status?: string };

async function pedidoNuevo() {
  const creado = await createRecord<Fila>(TABLAS.pedidos, { Numero: "HARPER-TEST", Estado: "pendiente" });
  return creado.id;
}

beforeEach(async () => {
  const { reiniciar } = await import("../lib/fixtures/servidor");
  reiniciar();
});

test("dos instancias reclaman el mismo pago a la vez: gana exactamente una", async () => {
  const id = await pedidoNuevo();

  const [a, b] = await Promise.all([
    reclamarPedido<Fila>(id, "111", 150),
    reclamarPedido<Fila>(id, "111", 150),
  ]);

  assert.equal([a.gano, b.gano].filter(Boolean).length, 1, "ganó más de una (o ninguna)");
  assert.ok(esMarcaDeReclamo((await getRecord<Fila>(TABLAS.pedidos, id)).fields.MP_status));
});

test("una instancia que reclama tarde, con el pedido ya pagado, decide 'duplicado'", async () => {
  const id = await pedidoNuevo();

  // La primera instancia gana, confirma el pedido y deja el estado final.
  const primera = await reclamarPedido<Fila>(id, "111", 50);
  assert.equal(primera.gano, true);
  await updateRecord<Fila>(TABLAS.pedidos, id, { Estado: "pagado", MP_payment_id: "111", MP_status: "approved" });

  // La segunda llega después: reclama, "gana" la marca, pero al releer ve el
  // pedido pagado y la decisión es no hacer nada.
  const segunda = await reclamarPedido<Fila>(id, "111", 50);
  assert.equal(segunda.gano, true);
  const accion = decidirNotificacion({
    estadoActual: segunda.pedido.fields.Estado ?? "pendiente",
    pagoRegistrado: segunda.pedido.fields.MP_payment_id,
    mpStatusActual: segunda.pedido.fields.MP_status,
    pagoId: "111",
    statusPago: "approved",
  });
  assert.equal(accion, "duplicado");
});

test("si el ganador se cae, la marca no traba nada: el reintento vuelve a reclamar y gana", async () => {
  const id = await pedidoNuevo();

  const caida = await reclamarPedido<Fila>(id, "111", 50);
  assert.equal(caida.gano, true);
  // ...y no escribe nada más: el pedido sigue pendiente con la marca puesta.

  const reintento = await reclamarPedido<Fila>(id, "111", 50);
  assert.equal(reintento.gano, true);
  assert.equal(reintento.pedido.fields.Estado, "pendiente");
});

test("diez notificaciones simultáneas del mismo pago: un solo ganador", async () => {
  const id = await pedidoNuevo();
  const resultados = await Promise.all(
    Array.from({ length: 10 }, () => reclamarPedido<Fila>(id, "222", 120))
  );
  assert.equal(resultados.filter((r) => r.gano).length, 1);
});
