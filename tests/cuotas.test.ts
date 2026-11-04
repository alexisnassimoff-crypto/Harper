import { test } from "node:test";
import assert from "node:assert/strict";
import { cuotasActivas, cuotasAnunciables, evaluarCuotas, topeDeCuotas } from "../lib/cuotas";
import { CUOTAS_SON_BENEFICIO, cuotasMaximas } from "../lib/suscriptores";

test("sin variable no se anuncian cuotas, ni a los suscriptores", () => {
  delete process.env.NEXT_PUBLIC_CUOTAS;
  assert.equal(cuotasActivas(), null);
  assert.equal(cuotasActivas(true), null);
});

test("el tope solo acepta enteros de 2 o más", () => {
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
    assert.equal(topeDeCuotas(), esperado, `con "${valor}"`);
  }
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

test("por ahora 6 cuotas para todos, también suscriptores, nunca más que el tope (Ale, 04/11/2026)", () => {
  // El tope de la preferencia de Mercado Pago, por comprador: el mismo para todos,
  // así que las cuotas no son un beneficio de suscriptor.
  assert.deepEqual([cuotasMaximas(false), cuotasMaximas(true)], [6, 6]);
  assert.equal(CUOTAS_SON_BENEFICIO, false);

  process.env.NEXT_PUBLIC_CUOTAS = "6";
  assert.deepEqual([cuotasActivas(), cuotasActivas(false), cuotasActivas(true)], [6, 6, 6]);
  process.env.NEXT_PUBLIC_CUOTAS = "12";
  assert.deepEqual([cuotasActivas(), cuotasActivas(true)], [6, 6]);
  // Con el tope en 3, todos ven 3; con 2, todos ven 2.
  process.env.NEXT_PUBLIC_CUOTAS = "3";
  assert.deepEqual([cuotasActivas(), cuotasActivas(true)], [3, 3]);
  process.env.NEXT_PUBLIC_CUOTAS = "2";
  assert.deepEqual([cuotasActivas(), cuotasActivas(true)], [2, 2]);
  // Una cantidad pedida a mano también respeta el tope, y menos de 2 no se anuncia.
  process.env.NEXT_PUBLIC_CUOTAS = "6";
  assert.deepEqual([cuotasAnunciables(12), cuotasAnunciables(3), cuotasAnunciables(1), cuotasAnunciables()], [6, 3, null, 6]);
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

test("cada cantidad se verifica aparte con Mercado Pago, y sin cuotas de suscriptor se pregunta una sola vez (Mercado Pago de prueba)", async () => {
  const { cuotasDeTodosYSuscriptores, verificarCuotas } = await import("../lib/cuotas-servidor");
  const costo = (n: number, tasa: number) => ({
    installments: n,
    installment_rate: tasa,
    labels: [tasa === 0 ? "CFT_0,00%|TEA_0,00%" : "CFT_19,87%|TEA_16,02%"],
    installment_amount: Math.round((89900 / n) * 100) / 100,
    total_amount: tasa === 0 ? 89900 : 101137,
  });
  let seisConInteres = false;
  const pedidos: string[] = [];
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    pedidos.push(String(url));
    const opciones = [{ payment_type_id: "credit_card", issuer: { id: "1", name: "Banco" }, payer_costs: [costo(1, 0), costo(3, 0), costo(6, seisConInteres ? 12.5 : 0)] }];
    return new Response(JSON.stringify(opciones), { status: 200 });
  }) as typeof fetch;
  process.env.MP_ACCESS_TOKEN = "TEST-prueba";
  process.env.NEXT_PUBLIC_CUOTAS = "6";
  try {
    assert.equal((await verificarCuotas(89900))?.cuotas, 6);
    assert.equal((await verificarCuotas(89900, cuotasMaximas(true)))?.cuotas, 6);
    assert.equal((await verificarCuotas(89900, 3))?.cuotas, 3);
    // Mientras las cuotas no sean un beneficio, las de suscriptor no se anuncian
    // ni se le preguntan aparte a Mercado Pago (una consulta por marca, no dos).
    const antesDeLasDos = pedidos.length;
    const dos = await cuotasDeTodosYSuscriptores([89900, 120000], 5_000);
    assert.equal(dos.todos?.cuotas, 6);
    assert.equal(dos.suscriptores, null);
    assert.equal(pedidos.length - antesDeLasDos, 2);
    // Si el banco cobra interés en 6, no se anuncian 6; 3 se pueden verificar igual.
    seisConInteres = true;
    assert.equal(await verificarCuotas(89900, 6), null);
    assert.equal((await verificarCuotas(89900, 3))?.cuotas, 3);
    // Sin el interruptor, nadie ve cuotas y ni se le pregunta a Mercado Pago.
    delete process.env.NEXT_PUBLIC_CUOTAS;
    const antes = pedidos.length;
    assert.equal(await verificarCuotas(89900, 6), null);
    assert.equal(pedidos.length, antes);
  } finally {
    globalThis.fetch = fetchReal;
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.NEXT_PUBLIC_CUOTAS;
  }
});

test("la preferencia de Mercado Pago: tope de 6 cuotas para todos (también suscriptores), el que se le pida, y 1 con dinero en cuenta", async () => {
  const { crearPreferencia } = await import("../lib/mercadopago");
  const cuerpos: { payment_methods: { installments: number } }[] = [];
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "pref", init_point: "https://mp/pagar" }), { status: 201 });
  }) as typeof fetch;
  process.env.MP_ACCESS_TOKEN = "TEST-prueba";
  const base = {
    numeroPedido: "HARPER-1",
    pedidoId: "recPEDIDO",
    items: [{ productoId: "p", productoSlug: "citrino", nombre: "CITRINO", categoria: "Anteojos" as const, varianteId: "v", sku: "C", color: "Negro", foto: null, precioLista: 89900, precioUnitario: 79900, descuento: 0, cupon: 10000, cantidad: 1, subtotal: 79900, stockDisponible: 3 }],
    envio: 0,
    total: 79900,
    cliente: { email: "a@b.c", nombre: "A", telefono: "1", dni: "", direccion: "x", ciudad: "x", provincia: "x", cp: "1", aceptaPromos: false },
    sitio: "http://localhost:3000",
  };
  try {
    await crearPreferencia(base);
    await crearPreferencia({ ...base, cuotasMaximas: cuotasMaximas(true) });
    await crearPreferencia({ ...base, cuotasMaximas: 3 });
    await crearPreferencia({ ...base, cuotasMaximas: cuotasMaximas(true), soloDineroEnCuenta: true });
    assert.deepEqual(cuerpos.map((c) => c.payment_methods.installments), [6, 6, 3, 1]);
  } finally {
    globalThis.fetch = fetchReal;
    delete process.env.MP_ACCESS_TOKEN;
  }
});
