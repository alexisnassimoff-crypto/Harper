import { test } from "node:test";
import assert from "node:assert/strict";
import { cuotasActivas, evaluarCuotas } from "../lib/cuotas";

test("sin variable no se anuncian cuotas", () => {
  delete process.env.NEXT_PUBLIC_CUOTAS;
  assert.equal(cuotasActivas(), null);
});

test("solo se aceptan enteros de 2 o más", () => {
  for (const [valor, esperado] of [
    ["3", 3],
    ["6", 6],
    ["12", 12],
    ["1", null],
    ["0", null],
    ["si", null],
    [" ", null],
    ["3.5", 3],
  ] as const) {
    process.env.NEXT_PUBLIC_CUOTAS = valor;
    assert.equal(cuotasActivas(), esperado, `con "${valor}"`);
  }
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

// Una respuesta de Mercado Pago (/v1/payment_methods/installments) con la
// forma real: un elemento por banco emisor y sus cuotas.
function respuesta(costos6: Record<string, unknown>, extra: Record<string, unknown>[] = []) {
  return [
    {
      payment_method_id: "visa",
      issuer: { id: "310", name: "Visa" },
      payer_costs: [
        { installments: 1, installment_rate: 0, labels: ["CFT_0,00%|TEA_0,00%"], installment_amount: 89900, total_amount: 89900 },
        { installments: 6, installment_rate: 0, labels: ["CFT_0,00%|TEA_0,00%"], installment_amount: 14983.33, total_amount: 89900, ...costos6 },
        { installments: 12, installment_rate: 38.34, labels: ["CFT_45,61%|TEA_37,86%"], installment_amount: 10318.37, total_amount: 123820.44 },
      ],
    },
    ...extra,
  ];
}

test("con las 6 cuotas sin interés en todas las marcas, se anuncian con el monto de Mercado Pago", () => {
  const r = evaluarCuotas([respuesta({}), respuesta({})], 6, 89900);
  assert.deepEqual(r, { cuotas: 6, montoCuota: 14983.33, cftea: "0,00 %" });
});

test("el monto por cuota ya no se redondea para arriba: 6 × $ 14.984 sumaba $ 89.904", () => {
  const r = evaluarCuotas([respuesta({}), respuesta({})], 6, 89900);
  assert.ok(r && r.montoCuota < 14984);
});

test("si un banco cobra interés en esas cuotas, no se anuncian", () => {
  const otroBanco = { issuer: { id: "1", name: "Banco" }, payer_costs: [{ installments: 6, installment_rate: 12.5, labels: ["CFT_19,87%|TEA_16,02%"], installment_amount: 16856, total_amount: 101137 }] };
  assert.equal(evaluarCuotas([respuesta({}, [otroBanco]), respuesta({})], 6, 89900), null);
});

test("si Mercado Pago informa un CFT distinto de 0, no se anuncian aunque la tasa diga 0", () => {
  assert.equal(evaluarCuotas([respuesta({ labels: ["CFT_3,10%|TEA_0,00%"] }), respuesta({})], 6, 89900), null);
});

test("sin etiqueta de CFT, vale como 0 solo si el total es el precio de contado", () => {
  assert.ok(evaluarCuotas([respuesta({ labels: [] }), respuesta({ labels: undefined })], 6, 89900));
  assert.equal(evaluarCuotas([respuesta({ labels: [], total_amount: 91000 }), respuesta({})], 6, 89900), null);
});

test("las prepagas y los emisores que solo cobran en un pago no impiden el anuncio", () => {
  // Así contesta Mercado Pago de verdad: junto a los bancos con cuotas vienen
  // tarjetas prepagas y algún emisor de crédito que solo ofrece 1 pago.
  const unPago = [{ installments: 1, installment_rate: 0, labels: ["CFT_0,00%|TEA_0,00%"], installment_amount: 89900, total_amount: 89900 }];
  const prepaga = { payment_type_id: "prepaid_card", issuer: { id: "2", name: "Prepaga" }, payer_costs: unPago };
  const soloUnPago = { payment_type_id: "credit_card", issuer: { id: "3", name: "Ripio" }, payer_costs: unPago };
  const r = evaluarCuotas([respuesta({}, [prepaga, soloUnPago]), respuesta({}, [prepaga])], 6, 89900);
  assert.deepEqual(r, { cuotas: 6, montoCuota: 14983.33, cftea: "0,00 %" });
});

test("un banco de crédito que da cuotas pero cobra interés en esas sigue impidiendo el anuncio", () => {
  const conInteres = {
    payment_type_id: "credit_card",
    issuer: { id: "4", name: "Banco" },
    payer_costs: [
      { installments: 1, installment_rate: 0, labels: ["CFT_0,00%|TEA_0,00%"], installment_amount: 89900, total_amount: 89900 },
      { installments: 6, installment_rate: 12.5, labels: ["CFT_19,87%|TEA_16,02%"], installment_amount: 16856, total_amount: 101137 },
    ],
  };
  assert.equal(evaluarCuotas([respuesta({}, [conInteres]), respuesta({})], 6, 89900), null);
});

test("una marca con solo prepagas o un pago no tiene cuotas que anunciar", () => {
  const unPago = [{ installments: 1, installment_rate: 0, labels: ["CFT_0,00%|TEA_0,00%"], installment_amount: 89900, total_amount: 89900 }];
  const prepaga = { payment_type_id: "prepaid_card", issuer: { id: "2", name: "Prepaga" }, payer_costs: unPago };
  const soloUnPago = { payment_type_id: "credit_card", issuer: { id: "3", name: "Ripio" }, payer_costs: unPago };
  assert.equal(evaluarCuotas([respuesta({}), [prepaga, soloUnPago]], 6, 89900), null);
});

test("si esas cuotas no se ofrecen, o una marca no tiene opciones, no se anuncian", () => {
  assert.equal(evaluarCuotas([respuesta({}), respuesta({})], 9, 89900), null);
  assert.equal(evaluarCuotas([respuesta({}), []], 6, 89900), null);
  assert.equal(evaluarCuotas([respuesta({}), { error: "bad_request" }], 6, 89900), null);
  assert.equal(evaluarCuotas([], 6, 89900), null);
});
