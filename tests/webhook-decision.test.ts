import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirNotificacion,
  esMarcaDeReclamo,
  leerReclamo,
  marcaDeReclamo,
  MARCA_REVISAR,
  reclamoVigente,
  VIGENCIA_RECLAMO_MS,
} from "../lib/webhook-decision";

const PAGO_A = "111";
const PAGO_B = "222";
const AHORA = 1_761_000_000_000;

test("pedido pendiente: aprobado confirma, rechazado rechaza, el resto espera", () => {
  assert.equal(decidirNotificacion({ estadoActual: "pendiente", pagoId: PAGO_A, statusPago: "approved" }), "aprobar");
  assert.equal(decidirNotificacion({ estadoActual: "pendiente", pagoId: PAGO_A, statusPago: "rejected" }), "rechazar");
  assert.equal(decidirNotificacion({ estadoActual: "pendiente", pagoId: PAGO_A, statusPago: "cancelled" }), "rechazar");
  assert.equal(decidirNotificacion({ estadoActual: "pendiente", pagoId: PAGO_A, statusPago: "in_process" }), "esperar");
  assert.equal(decidirNotificacion({ estadoActual: "pendiente", pagoId: PAGO_A, statusPago: "pending" }), "esperar");
});

test("el reintento del mismo pago sobre un pedido ya procesado es un duplicado", () => {
  for (const estado of ["pagado", "preparando", "enviado", "entregado", "rechazado", "cancelado"]) {
    assert.equal(
      decidirNotificacion({ estadoActual: estado, pagoRegistrado: PAGO_A, pagoId: PAGO_A, statusPago: "approved" }),
      "duplicado",
      estado
    );
  }
});

test("un pedido ya pagado NO se pisa con un pago rechazado posterior", () => {
  assert.equal(
    decidirNotificacion({ estadoActual: "pagado", pagoRegistrado: PAGO_A, pagoId: PAGO_B, statusPago: "rejected" }),
    "ignorar"
  );
  assert.equal(
    decidirNotificacion({ estadoActual: "enviado", pagoRegistrado: PAGO_A, pagoId: PAGO_B, statusPago: "in_process" }),
    "ignorar"
  );
});

test("un segundo pago aprobado sobre un pedido pagado no descuenta stock: se revisa", () => {
  assert.equal(
    decidirNotificacion({ estadoActual: "pagado", pagoRegistrado: PAGO_A, pagoId: PAGO_B, statusPago: "approved" }),
    "revisar_segundo_pago"
  );
  // Y sus propios reintentos no vuelven a mandar la alerta.
  assert.equal(
    decidirNotificacion({
      estadoActual: "pagado",
      pagoRegistrado: PAGO_A,
      mpStatusActual: `${MARCA_REVISAR} segundo pago aprobado ${PAGO_B} sobre un pedido pagado`,
      pagoId: PAGO_B,
      statusPago: "approved",
    }),
    "duplicado"
  );
});

test("un pedido cancelado tampoco se reabre solo: un pago aprobado se revisa", () => {
  assert.equal(
    decidirNotificacion({ estadoActual: "cancelado", pagoId: PAGO_B, statusPago: "approved" }),
    "revisar_segundo_pago"
  );
  assert.equal(
    decidirNotificacion({ estadoActual: "cancelado", pagoId: PAGO_B, statusPago: "rejected" }),
    "ignorar"
  );
});

test("un pedido rechazado SÍ se confirma si el comprador reintenta y el nuevo pago se aprueba", () => {
  assert.equal(
    decidirNotificacion({ estadoActual: "rechazado", pagoRegistrado: PAGO_A, pagoId: PAGO_B, statusPago: "approved" }),
    "aprobar"
  );
});

test("un pago marcado para revisar no se vuelve a procesar", () => {
  assert.equal(
    decidirNotificacion({
      estadoActual: "pendiente",
      pagoRegistrado: PAGO_A,
      mpStatusActual: `${MARCA_REVISAR} se cobró 100 y el pedido dice 200`,
      pagoId: PAGO_A,
      statusPago: "approved",
    }),
    "duplicado"
  );
});

// ---- Marcas de reclamo ----

test("la marca de reclamo va y vuelve, con fecha y pasos", () => {
  const marca = marcaDeReclamo({ pagoId: PAGO_A, nonce: "abc123", desde: AHORA, pasos: ["pagado", "mails"] });
  assert.equal(marca, `procesando 111 abc123 ${AHORA} pagado,mails`);
  assert.deepEqual(leerReclamo(marca), { pagoId: PAGO_A, nonce: "abc123", desde: AHORA, pasos: ["pagado", "mails"] });
  assert.deepEqual(leerReclamo(marcaDeReclamo({ pagoId: PAGO_A, nonce: "x", desde: AHORA, pasos: [] })), {
    pagoId: PAGO_A,
    nonce: "x",
    desde: AHORA,
    pasos: [],
  });
  assert.equal(esMarcaDeReclamo(marca), true);
  assert.equal(leerReclamo("approved"), null);
  assert.equal(leerReclamo(`${MARCA_REVISAR} algo`), null);
  assert.equal(leerReclamo(undefined), null);
});

test("una marca del formato viejo (sin fecha) se lee como vencida", () => {
  const vieja = leerReclamo("procesando 111 9f3a-nonce");
  assert.ok(vieja);
  assert.equal(vieja.desde, 0);
  assert.equal(reclamoVigente(vieja, AHORA), false);
});

test("la vigencia: vale hasta VIGENCIA_RECLAMO_MS, después es de una instancia muerta", () => {
  const reclamo = { pagoId: PAGO_A, nonce: "n", desde: AHORA, pasos: [] };
  assert.equal(reclamoVigente(reclamo, AHORA), true);
  assert.equal(reclamoVigente(reclamo, AHORA + VIGENCIA_RECLAMO_MS - 1), true);
  assert.equal(reclamoVigente(reclamo, AHORA + VIGENCIA_RECLAMO_MS), false);
  assert.equal(reclamoVigente(null, AHORA), false);
});

test("con una marca vigente de otra instancia, cualquier notificación espera", () => {
  const vigente = marcaDeReclamo({ pagoId: PAGO_A, nonce: "n", desde: AHORA, pasos: [] });

  for (const statusPago of ["approved", "rejected", "pending"]) {
    assert.equal(
      decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: vigente, pagoId: PAGO_A, statusPago, ahora: AHORA + 5_000 }),
      "en_curso",
      statusPago
    );
  }

  // También si es OTRO pago el que llega: primero termina el que está.
  assert.equal(
    decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: vigente, pagoId: PAGO_B, statusPago: "approved", ahora: AHORA + 5_000 }),
    "en_curso"
  );

  // Y aunque el Estado ya diga pagado: la instancia que lo puso todavía no cerró.
  assert.equal(
    decidirNotificacion({
      estadoActual: "pagado",
      pagoRegistrado: PAGO_A,
      mpStatusActual: vigente,
      pagoId: PAGO_A,
      statusPago: "approved",
      ahora: AHORA + 5_000,
    }),
    "en_curso"
  );
});

test("con la marca vencida del mismo pago, se retoma: aprobar aunque el Estado ya diga pagado", () => {
  const vencida = marcaDeReclamo({ pagoId: PAGO_A, nonce: "n", desde: AHORA, pasos: ["pagado"] });
  const despues = AHORA + VIGENCIA_RECLAMO_MS + 1;

  assert.equal(
    decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: vencida, pagoId: PAGO_A, statusPago: "approved", ahora: despues }),
    "aprobar"
  );
  // Caída después de marcar pagado: NO es duplicado, faltan pasos.
  assert.equal(
    decidirNotificacion({
      estadoActual: "pagado",
      pagoRegistrado: PAGO_A,
      mpStatusActual: vencida,
      pagoId: PAGO_A,
      statusPago: "approved",
      ahora: despues,
    }),
    "aprobar"
  );
  assert.equal(
    decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: vencida, pagoId: PAGO_A, statusPago: "rejected", ahora: despues }),
    "rechazar"
  );
});

test("con la marca vencida, si una persona cerró el pedido a mano se respeta", () => {
  const vencida = marcaDeReclamo({ pagoId: PAGO_A, nonce: "n", desde: AHORA, pasos: [] });
  const despues = AHORA + VIGENCIA_RECLAMO_MS + 1;

  for (const estado of ["cancelado", "rechazado"]) {
    assert.equal(
      decidirNotificacion({ estadoActual: estado, mpStatusActual: vencida, pagoId: PAGO_A, statusPago: "approved", ahora: despues }),
      "duplicado",
      estado
    );
  }
});

test("la marca vencida de OTRO pago no manda: se decide por el estado del pedido", () => {
  const vencida = marcaDeReclamo({ pagoId: PAGO_B, nonce: "n", desde: AHORA, pasos: [] });
  const despues = AHORA + VIGENCIA_RECLAMO_MS + 1;

  assert.equal(
    decidirNotificacion({ estadoActual: "pendiente", mpStatusActual: vencida, pagoId: PAGO_A, statusPago: "approved", ahora: despues }),
    "aprobar"
  );
  assert.equal(
    decidirNotificacion({
      estadoActual: "pagado",
      pagoRegistrado: PAGO_B,
      mpStatusActual: vencida,
      pagoId: PAGO_A,
      statusPago: "approved",
      ahora: despues,
    }),
    "revisar_segundo_pago"
  );
});
