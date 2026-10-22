import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirNotificacion, MARCA_REVISAR } from "../lib/webhook-decision";

const PAGO_A = "111";
const PAGO_B = "222";

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
