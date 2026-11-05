import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  calcularContribucion,
  calcularEscenario,
  CASHBACK_ALTERNATIVO,
  CASHBACK_PRINCIPAL,
  cashbackComprometido,
  contribucionDelCliente,
  costoEnvioNeto,
  CREDITO_DE_LA_RECOMPRA,
  descuentoDelSegundo,
  descuentosAplicados,
  escenariosDeLaMatriz,
  escenariosObligatorios,
  matrizEnMarkdown,
  PARAMETROS_REFERENCIA,
  PRECIO_REFERENCIA,
  primeraCompraDuo,
  recompraConCredito,
  type PedidoModelo,
} from "../lib/contribucion";

/** Motor de contribución por pedido (Ale, 05/11/2026 · Tarea 01). */

const IVA = 1.21;
const SIN_IVA_EN_ENVIO = { ...PARAMETROS_REFERENCIA, envioIncluyeIva: false };
const cerca = (real: number, esperado: number, tolerancia = 0.011) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `esperaba ${esperado}, dio ${real}`);
const unPar = (extra: Partial<PedidoModelo> = {}): PedidoModelo => ({ pares: [PRECIO_REFERENCIA], descuentoSegundo: 0, cuotas: 1, costoEnvio: 5_500, ...extra });
const dosPares = (extra: Partial<PedidoModelo> = {}): PedidoModelo => unPar({ pares: [PRECIO_REFERENCIA, PRECIO_REFERENCIA], ...extra });

test("contribución: el caso base (1 par, 1 pago, envío $ 5.500), desglosado a mano", () => {
  const r = calcularContribucion(unPar());
  // Venta: $ 89.900 con IVA → 89.900 ÷ 1,21.
  assert.equal(r.ventaNeta, 74_297.52);
  assert.equal(r.facturadoNeto, 74_297.52);
  assert.deepEqual(r.costos, {
    producto: 9_570,
    preparacion: 2_000,
    envio: 4_545.45, // 5.500 ÷ 1,21: el IVA del envío es crédito
    mercadoPago: 3_047.61, // 3,39 % de 89.900
    financiacion: 0,
    iibb: 2_228.93, // 3 % de la venta neta
    devoluciones: 2_228.93, // 3 % de la venta neta
    cashback: 0,
    publicidad: 20_000,
  });
  assert.equal(r.contribucionAntesDePublicidad, 50_676.6);
  assert.equal(r.contribucion, 30_676.6);
  cerca(r.margen, 0.41289, 0.00001);
  assert.equal(r.superaMinimo, true);
  assert.equal(r.promocion, "ninguna");
});

test("contribución: el envío se puede informar con IVA o sin IVA, y la diferencia es su IVA", () => {
  assert.equal(costoEnvioNeto(12_100), 10_000);
  assert.equal(costoEnvioNeto(12_100, SIN_IVA_EN_ENVIO), 12_100);
  const conIva = calcularContribucion(unPar({ costoEnvio: 15_000 }));
  const sinIva = calcularContribucion(unPar({ costoEnvio: 15_000 }), SIN_IVA_EN_ENVIO);
  assert.equal(conIva.costos.envio, 12_396.69);
  assert.equal(sinIva.costos.envio, 15_000);
  cerca(conIva.contribucion - sinIva.contribucion, 15_000 - 15_000 / IVA);
  // Lo demás no cambia: la venta neta es la misma.
  assert.equal(conIva.ventaNeta, sinIva.ventaNeta);
  // Envío cobrado al comprador: suma a la venta neta (÷ 1,21) y a lo cobrado por Mercado Pago (con IVA).
  const cobrandoEnvio = calcularContribucion(unPar({ envioCobrado: 6_050 }));
  assert.equal(cobrandoEnvio.ventaNeta, 79_297.52);
  assert.equal(cobrandoEnvio.bruto.cobrado, 95_950);
});

test("contribución: el descuento Dúo va al segundo par de menor precio", () => {
  assert.equal(descuentoDelSegundo([89_900, 89_900], 0.25), 22_475);
  assert.equal(descuentoDelSegundo([89_900, 69_900], 0.2), 13_980, "sobre el más barato");
  assert.equal(descuentoDelSegundo([69_900, 89_900], 0.2), 13_980, "sin importar el orden");
  assert.equal(descuentoDelSegundo([89_900], 0.3), 0, "un par solo no tiene segundo");
  assert.equal(descuentoDelSegundo([100_000, 90_000, 80_000], 0.2), 16_000, "con tres, uno: el más barato");
  assert.equal(descuentoDelSegundo([100_000, 90_000, 80_000, 70_000], 0.2), 30_000, "con cuatro, los dos más baratos");
});

test("contribución: cashback 10 % sin tope sobre lo pagado en productos — el ejemplo de Ale", () => {
  // Dos anteojos de $ 89.900 = $ 179.800; el segundo al 25 % = −$ 22.475; productos $ 157.325; 10 % = $ 15.733.
  const r = calcularContribucion(dosPares({ descuentoSegundo: 0.25, cashback: CASHBACK_PRINCIPAL }));
  assert.equal(r.bruto.lista, 179_800);
  assert.equal(r.bruto.duo, 22_475);
  assert.equal(r.bruto.productos, 157_325);
  assert.equal(r.bruto.cashbackComprometido, 15_733);
  cerca(r.costos.cashback, 15_733 / IVA);
  // Sin tope: cuanto más paga, más crédito. Con tope (si alguna vez se quiere), se corta.
  assert.equal(cashbackComprometido(500_000, CASHBACK_PRINCIPAL), 50_000);
  assert.equal(cashbackComprometido(500_000, { porcentaje: 0.1, tope: 10_000 }), 10_000);
  assert.equal(cashbackComprometido(157_325, CASHBACK_ALTERNATIVO), 7_866, "5 %, redondeado al peso");
  // Sin el envío: cobrarlo no suma crédito.
  assert.equal(calcularContribucion(unPar({ cashback: CASHBACK_PRINCIPAL, envioCobrado: 6_050 })).bruto.cashbackComprometido, 8_990);
  // Si se espera que se use la mitad, cuesta la mitad.
  cerca(calcularContribucion(unPar({ cashback: { ...CASHBACK_PRINCIPAL, tasaDeUso: 0.5 } })).costos.cashback, 8_990 / IVA / 2);
});

test("contribución: bienvenida fija de $ 5.000 y $ 10.000, sin acumularse con el Dúo", () => {
  const cinco = calcularContribucion(unPar({ bienvenida: 5_000, cashback: CASHBACK_PRINCIPAL }));
  assert.equal(cinco.promocion, "bienvenida");
  assert.equal(cinco.bruto.productos, 84_900);
  assert.equal(cinco.bruto.cashbackComprometido, 8_490, "el cashback, sobre lo pagado después de la bienvenida");
  assert.equal(calcularContribucion(unPar({ bienvenida: 10_000 })).bruto.productos, 79_900);
  // Dos pares con Dúo −25 % ($ 22.475) y bienvenida de $ 10.000: queda solo el Dúo, que descuenta más.
  const duo = calcularContribucion(dosPares({ descuentoSegundo: 0.25, bienvenida: 10_000 }));
  assert.equal(duo.promocion, "duo");
  assert.equal(duo.bruto.descuento, 22_475);
  assert.equal(duo.bruto.bienvenida, 0);
  // Si la bienvenida descuenta más que el Dúo, queda la bienvenida (nunca los dos).
  assert.deepEqual(descuentosAplicados([89_900, 89_900], 0.05, 10_000), { duo: 0, bienvenida: 10_000, promocion: "bienvenida" });
  // Solo se suman si se pide a propósito.
  const juntas = calcularContribucion(dosPares({ descuentoSegundo: 0.25, bienvenida: 10_000, acumularBienvenidaConDuo: true }));
  assert.equal(juntas.promocion, "duo+bienvenida");
  assert.equal(juntas.bruto.descuento, 32_475);
  // La bienvenida nunca deja el pedido en negativo.
  assert.equal(descuentosAplicados([4_000], 0, 5_000).bienvenida, 4_000);
});

test("contribución: tres y seis cuotas suman su costo sobre lo cobrado", () => {
  const base = calcularContribucion(unPar());
  assert.equal(calcularContribucion(unPar({ cuotas: 3 })).costos.financiacion, 4_045.5); // 4,50 % de 89.900
  const seis = calcularContribucion(unPar({ cuotas: 6 }));
  assert.equal(seis.costos.financiacion, 9_259.7); // 10,30 % de 89.900
  cerca(base.contribucion - seis.contribucion, 9_259.7);
});

test("contribución: el cliente en dos compras — primera, recompra incremental y acumulado, con el crédito contado una vez", () => {
  const cliente = contribucionDelCliente(primeraCompraDuo(5_500), recompraConCredito(5_500, 3));
  // Primera compra: 2 pares, Dúo −25 %, 6 cuotas; provisiona los $ 15.733 que promete.
  assert.equal(cliente.creditoPrometido, 15_733);
  assert.equal(cliente.creditoUsado, CREDITO_DE_LA_RECOMPRA);
  assert.equal(cliente.creditoPendiente, 0);
  cerca(cliente.primera.costos.cashback, 15_733 / IVA);
  cerca(cliente.primera.contribucion, 41_993.69, 0.02); // a mano: 130.020,66 − 88.026,97
  // Recompra: un par de $ 89.900 que usa los $ 15.733; paga $ 74.167 y promete 10 % de eso.
  const r = cliente.recompra;
  assert.equal(r.bruto.cobrado, 74_167);
  assert.equal(r.bruto.cashbackComprometido, 7_417);
  assert.equal(r.ventaNeta, calcularContribucion(unPar()).ventaNeta, "la venta se mide antes del crédito: no se resta otra vez");
  cerca(r.contribucion, 22_132.76, 0.02); // a mano, con 3 cuotas y $ 20.000 de publicidad
  // Lo único que el crédito cambia en la recompra es lo que de verdad baja: comisión, cuotas, IIBB y su propio cashback.
  const sinCredito = calcularContribucion(unPar({ cuotas: 3, cashback: CASHBACK_PRINCIPAL }));
  const ahorro = 15_733 * (0.0339 + 0.045) + (15_733 / IVA) * 0.03 + (8_990 - 7_417) / IVA;
  cerca(r.contribucion - sinCredito.contribucion, ahorro, 0.02);
  // Acumulado: la suma de las dos; el crédito pesa una sola vez (si pesara dos, daría ~$ 13.000 menos).
  cerca(cliente.acumulada.contribucion, cliente.primera.contribucion + r.contribucion, 0.02);
  cerca(cliente.acumulada.ventaNeta, cliente.primera.ventaNeta + r.ventaNeta, 0.02);
  cerca(cliente.acumulada.margen, cliente.acumulada.contribucion / cliente.acumulada.ventaNeta, 0.00001);
  // En 6 cuotas, la recompra deja menos; y sin publicidad, más.
  cerca(contribucionDelCliente(primeraCompraDuo(5_500), recompraConCredito(5_500, 6)).recompra.contribucion, 17_831.08, 0.02);
  cerca(contribucionDelCliente(primeraCompraDuo(5_500), recompraConCredito(5_500, 3, 0)).recompra.contribucion, 42_132.76, 0.02);
  // Usar menos crédito del prometido deja el resto pendiente (sigue provisionado en la primera).
  assert.equal(contribucionDelCliente(primeraCompraDuo(5_500), { ...recompraConCredito(5_500, 3), saldoAplicado: 10_000 }).creditoPendiente, 5_733);
  // Y no puede usar más del que se prometió.
  assert.throws(() => contribucionDelCliente(primeraCompraDuo(5_500), { ...recompraConCredito(5_500, 3), saldoAplicado: 20_000 }), RangeError);
});

test("contribución: un pedido sin sentido no se calcula", () => {
  assert.throws(() => calcularContribucion({ ...unPar(), pares: [] }), RangeError);
  assert.throws(() => calcularContribucion({ ...unPar(), pares: [0] }), RangeError);
  assert.throws(() => calcularContribucion(unPar({ descuentoSegundo: 1 })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ bienvenida: -1 })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ cuotas: 12 as never })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ costoEnvio: -1 })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ publicidad: -1 })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ saldoAplicado: 100_000 })), RangeError, "más saldo que productos");
  assert.throws(() => calcularContribucion(unPar({ cashback: { porcentaje: 0.1, tope: null, tasaDeUso: 2 } })), RangeError);
});

test("contribución: los escenarios obligatorios (CAC $ 20.000, mínimo 22 %)", () => {
  const [completo, completoCb, bienvenida, bienvenidaCb, duo, recompra3, recompra6] = escenariosObligatorios();
  const margenes = (e: (typeof completo)["pedido"], p = PARAMETROS_REFERENCIA) => [5_500, 10_000, 15_000].map((envio) => calcularContribucion(e(envio), p));
  const marcas = (rs: ReturnType<typeof margenes>) => rs.map((r) => (r.superaMinimo ? "✓" : "✗")).join("");

  // 1 par a precio completo, 6 cuotas: llega con envíos de $ 5.500 y $ 10.000, no con $ 15.000.
  assert.equal(marcas(margenes(completo.pedido)), "✓✓✗");
  cerca(margenes(completo.pedido)[2].margen, 0.1826, 0.0001);
  // Con el cashback del 10 %, no llega con ningún envío.
  assert.equal(marcas(margenes(completoCb.pedido)), "✗✗✗");
  // Bienvenida de $ 5.000, 6 cuotas: llega solo con el envío más barato.
  cerca(margenes(bienvenida.pedido)[0].contribucion, 18_217.11, 0.02);
  assert.equal(marcas(margenes(bienvenida.pedido)), "✓✗✗");
  assert.equal(marcas(margenes(bienvenidaCb.pedido)), "✗✗✗");
  // 2 pares, Dúo −25 %, cashback 10 % sin tope, 6 cuotas: llega siempre.
  assert.equal(marcas(margenes(duo.pedido)), "✓✓✓");
  // Recompra con $ 15.733 de crédito (con $ 20.000 de publicidad): en 3 cuotas llega salvo con el envío
  // más caro (a mano: $ 22.132,76 − $ 7.851,24 de envío extra = $ 14.281,52, 19,2 %); en 6, solo con el más barato.
  assert.equal(marcas(margenes(recompra3.pedido)), "✓✓✗");
  cerca(margenes(recompra3.pedido)[2].contribucion, 14_281.52, 0.02);
  assert.equal(marcas(margenes(recompra6.pedido)), "✓✗✗");
  // Con el envío informado sin IVA, el par a precio completo en 6 cuotas también se cae con $ 10.000.
  assert.equal(marcas(margenes(completo.pedido, SIN_IVA_EN_ENVIO)), "✓✗✗");
});

test("contribución: la matriz — estrategias × cashback (10 % y 5 % sin tope, y sin) × cuotas × envío, y el archivo al día", () => {
  const escenarios = escenariosDeLaMatriz();
  assert.equal(escenarios.length, 162);
  // Lo que se espera de cualquier modelo sensato: más cuotas, más envío o cashback, deja menos; y el envío sin IVA, también.
  for (const e of escenarios) {
    const r = calcularEscenario(e);
    if (e.cuotas !== 6) assert.ok(calcularEscenario({ ...e, cuotas: e.cuotas === 1 ? 3 : 6 }).contribucion < r.contribucion);
    if (e.costoEnvio !== 15_000) assert.ok(calcularEscenario({ ...e, costoEnvio: 15_000 }).contribucion < r.contribucion);
    if (!e.cashback) assert.ok(calcularEscenario({ ...e, cashback: CASHBACK_ALTERNATIVO }).contribucion < r.contribucion);
    if (e.cashback === CASHBACK_ALTERNATIVO) assert.ok(calcularEscenario({ ...e, cashback: CASHBACK_PRINCIPAL }).contribucion < r.contribucion);
    assert.ok(calcularEscenario(e, SIN_IVA_EN_ENVIO).contribucion < r.contribucion);
  }

  // El archivo de la matriz está al día con el código (ACTUALIZAR_MATRIZ=1 npm test lo vuelve a escribir).
  const archivo = path.join(process.cwd(), "docs", "contribucion-matriz.md");
  const generada = matrizEnMarkdown();
  if (process.env.ACTUALIZAR_MATRIZ === "1") fs.writeFileSync(archivo, generada);
  assert.equal(fs.readFileSync(archivo, "utf8"), generada, "docs/contribucion-matriz.md está desactualizado: ACTUALIZAR_MATRIZ=1 npm test");
});
