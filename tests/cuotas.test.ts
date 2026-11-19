import { test } from "node:test";
import assert from "node:assert/strict";
import { cuotasActivas, cuotasAnunciables, evaluarCuotas, evaluarMejoresCuotas, topeDeCuotas } from "../lib/cuotas";
import { CUOTAS_SON_BENEFICIO, CUOTAS_SUSCRIPTORES, CUOTAS_TODOS, cuotasDelComprador, cuotasMaximas, tieneCuotasDeSuscriptor } from "../lib/suscriptores";

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

test("hasta 3 cuotas para todos, con cuenta o sin cuenta: nadie tiene 6, y nunca más que el tope (Ale, 18/11/2026)", () => {
  // El tope de la preferencia de Mercado Pago es el mismo para cualquier
  // comprador: las cuotas dejaron de ser un beneficio de suscriptor.
  assert.deepEqual([CUOTAS_TODOS, CUOTAS_SUSCRIPTORES], [3, 3]);
  assert.deepEqual([cuotasMaximas(false), cuotasMaximas(true)], [3, 3]);
  assert.equal(CUOTAS_SON_BENEFICIO, false);

  // Aunque el tope de los anuncios siga en 6 (o suba a 12), a nadie se le anuncian más de 3.
  process.env.NEXT_PUBLIC_CUOTAS = "6";
  assert.deepEqual([cuotasActivas(), cuotasActivas(false), cuotasActivas(true)], [3, 3, 3]);
  process.env.NEXT_PUBLIC_CUOTAS = "12";
  assert.deepEqual([cuotasActivas(), cuotasActivas(false), cuotasActivas(true)], [3, 3, 3]);
  // Con el tope en 3, todos ven 3; con 2, todos ven 2.
  process.env.NEXT_PUBLIC_CUOTAS = "3";
  assert.deepEqual([cuotasActivas(), cuotasActivas(true)], [3, 3]);
  process.env.NEXT_PUBLIC_CUOTAS = "2";
  assert.deepEqual([cuotasActivas(), cuotasActivas(true)], [2, 2]);
  // Una cantidad pedida a mano también respeta el tope, y menos de 2 no se anuncia.
  assert.deepEqual([cuotasAnunciables(12), cuotasAnunciables(3), cuotasAnunciables(1), cuotasAnunciables()], [2, 2, null, 2]);
  // Sin pedir una cantidad, las de todos.
  process.env.NEXT_PUBLIC_CUOTAS = "6";
  assert.deepEqual([cuotasAnunciables(), cuotasAnunciables(CUOTAS_SUSCRIPTORES), cuotasAnunciables(3), cuotasAnunciables(1)], [3, 3, 3, null]);
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

test("nadie tiene cuotas de suscriptor: con sesión, sin sesión o dado de baja, el tope es 3 (Ale, 18/11/2026)", () => {
  const compradores = [null, undefined, { activo: true }, {}, { activo: false }];
  for (const comprador of compradores) {
    assert.equal(tieneCuotasDeSuscriptor(comprador), false, JSON.stringify(comprador));
    assert.equal(cuotasDelComprador(comprador), 3, JSON.stringify(comprador));
  }
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

test("las cuotas se verifican con Mercado Pago y son hasta 3 para todos, aunque Mercado Pago dé 6 sin interés (Ale, 18/11/2026; Mercado Pago de prueba)", async () => {
  const { cuotasDeTodosYSuscriptores, cuotasParaComprador, verificarCuotas, verificarCuotasPara } = await import("../lib/cuotas-servidor");
  const costo = (n: number, tasa: number) => ({
    installments: n,
    installment_rate: tasa,
    labels: [tasa === 0 ? "CFT_0,00%|TEA_0,00%" : "CFT_19,87%|TEA_16,02%"],
    installment_amount: Math.round((89900 / n) * 100) / 100,
    total_amount: tasa === 0 ? 89900 : 101137,
  });
  let tresConInteres = false;
  const pedidos: string[] = [];
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    pedidos.push(String(url));
    // Este Mercado Pago da 6 sin interés: la tienda igual anuncia 3.
    const opciones = [{ payment_type_id: "credit_card", issuer: { id: "1", name: "Banco" }, payer_costs: [costo(1, 0), costo(3, tresConInteres ? 12.5 : 0), costo(6, 0)] }];
    return new Response(JSON.stringify(opciones), { status: 200 });
  }) as typeof fetch;
  process.env.MP_ACCESS_TOKEN = "TEST-prueba";
  process.env.NEXT_PUBLIC_CUOTAS = "6";
  try {
    // Lo que usan la barra, la portada, la ficha, los listados y las preguntas: sin decir cuántas, 3.
    const deTodos = await verificarCuotas(89900);
    assert.deepEqual(deTodos, { cuotas: 3, montoCuota: 29966.67, cftea: "0,00 %" });
    assert.equal((await verificarCuotasPara([120000, 89900]))?.cuotas, 3);
    // Con el tope de un suscriptor, lo mismo: su tope es el de todos.
    assert.equal((await verificarCuotas(89900, cuotasMaximas(true)))?.cuotas, 3);
    assert.equal((await verificarCuotas(89900, cuotasDelComprador({ activo: true })))?.cuotas, 3);
    // El carrito y el checkout, para cada comprador: las mismas, y nada «de suscriptor» que ofrecer.
    for (const esSuscriptor of [false, true]) {
      assert.deepEqual(await cuotasParaComprador(89900, esSuscriptor), { suyas: deTodos, deSuscriptor: null }, `esSuscriptor=${esSuscriptor}`);
    }
    // Lo que quedó de antes (las dos cantidades juntas): las de todos y ninguna de suscriptor,
    // con una sola consulta a Mercado Pago por marca.
    const antesDeLasDos = pedidos.length;
    const dos = await cuotasDeTodosYSuscriptores([89900, 120000], 5_000);
    assert.equal(dos.todos?.cuotas, 3);
    assert.equal(dos.suscriptores, null);
    assert.equal(pedidos.length - antesDeLasDos, 2);
    // Si el banco cobra interés en 3, no se anuncian cuotas: nunca las 6 en su lugar.
    tresConInteres = true;
    assert.equal(await verificarCuotas(89900), null);
    assert.deepEqual(await cuotasParaComprador(89900, true), { suyas: null, deSuscriptor: null });
    tresConInteres = false;
    // Sin el interruptor, nadie ve cuotas y ni se le pregunta a Mercado Pago.
    delete process.env.NEXT_PUBLIC_CUOTAS;
    const antes = pedidos.length;
    assert.equal(await verificarCuotas(89900), null);
    assert.deepEqual(await cuotasParaComprador(89900, true), { suyas: null, deSuscriptor: null });
    assert.equal(pedidos.length, antes);
  } finally {
    globalThis.fetch = fetchReal;
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.NEXT_PUBLIC_CUOTAS;
  }
});

test("la preferencia de Mercado Pago nunca lleva más de 3 cuotas, aunque se le pidan 6 o 12, y 1 con dinero en cuenta (Ale, 18/11/2026)", async () => {
  const { crearPreferencia, CUOTAS_PREFERENCIA } = await import("../lib/mercadopago");
  // El techo de cualquier preferencia es el tope de cuotas de todos.
  assert.equal(CUOTAS_PREFERENCIA, 3);
  assert.equal(CUOTAS_PREFERENCIA, CUOTAS_TODOS);
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
    items: [{ productoId: "p", productoSlug: "citrino", nombre: "CITRINO", categoria: "Anteojos" as const, varianteId: "v", sku: "C", color: "Negro", foto: null, precioLista: 89900, precioUnitario: 89900, descuento: 0, cantidad: 1, subtotal: 89900, stockDisponible: 3 }],
    envio: 0,
    total: 89900,
    cliente: { email: "a@b.c", nombre: "A", telefono: "1", dni: "", direccion: "x", ciudad: "x", provincia: "x", cp: "1", aceptaPromos: false },
    sitio: "http://localhost:3000",
  };
  const cuotasDe = async (opciones: { cuotasMaximas?: number; soloDineroEnCuenta?: boolean }) => {
    cuerpos.length = 0;
    await crearPreferencia({ ...base, ...opciones });
    assert.equal(cuerpos.length, 1);
    return cuerpos[0].payment_methods.installments;
  };
  try {
    // Sin decir nada, 3. Y lo que manda el checkout (CUOTAS_TODOS), 3.
    assert.equal(await cuotasDe({}), 3);
    assert.equal(await cuotasDe({ cuotasMaximas: CUOTAS_TODOS }), 3);
    // Aunque quien llama pida más (las 6 de antes, las 12 de siempre o cualquier otra cosa), 3.
    for (const pedidas of [cuotasMaximas(true), 4, 6, 12, 24, 3.9, Number.POSITIVE_INFINITY]) {
      assert.equal(await cuotasDe({ cuotasMaximas: pedidas }), 3, `pidiendo ${pedidas}`);
    }
    // Menos sí se puede; y un pedido sin sentido nunca abre más cuotas: un pago.
    assert.equal(await cuotasDe({ cuotasMaximas: 2 }), 2);
    for (const pedidas of [1, 0, -6, Number.NaN]) {
      assert.equal(await cuotasDe({ cuotasMaximas: pedidas }), 1, `pidiendo ${pedidas}`);
    }
    // Con dinero en Mercado Pago, un pago, se pida lo que se pida.
    for (const pedidas of [undefined, 3, 6, 12]) {
      assert.equal(await cuotasDe({ cuotasMaximas: pedidas, soloDineroEnCuenta: true }), 1, `dinero en cuenta, pidiendo ${pedidas}`);
    }
  } finally {
    globalThis.fetch = fetchReal;
    delete process.env.MP_ACCESS_TOKEN;
  }
});
