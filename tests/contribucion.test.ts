import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  calcularContribucion,
  calcularEscenario,
  cashbackComprometido,
  descuentoDelSegundo,
  escenariosDeReferencia,
  matrizEnMarkdown,
  PARAMETROS_REFERENCIA,
  PRECIO_REFERENCIA,
  type PedidoModelo,
} from "../lib/contribucion";

/** Motor de contribución por pedido (Ale, 05/11/2026 · Tarea 01). */

const IVA = 1.21;
const cerca = (real: number, esperado: number, tolerancia = 0.011) =>
  assert.ok(Math.abs(real - esperado) <= tolerancia, `esperaba ${esperado}, dio ${real}`);
const unPar = (extra: Partial<PedidoModelo> = {}): PedidoModelo => ({ pares: [PRECIO_REFERENCIA], descuentoSegundo: 0, cuotas: 1, costoEnvio: 5_500, ...extra });

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
});

test("contribución: IVA recuperable — la venta y el envío se miden netos; producto, preparación y publicidad ya vienen netos", () => {
  const conIva = calcularContribucion(unPar({ costoEnvio: 12_100 }));
  assert.equal(conIva.costos.envio, 10_000);
  const sinIva = calcularContribucion(unPar({ costoEnvio: 12_100 }), { ...PARAMETROS_REFERENCIA, envioIncluyeIva: false });
  assert.equal(sinIva.costos.envio, 12_100);
  cerca(conIva.contribucion - sinIva.contribucion, 2_100);
  // Envío cobrado al comprador: suma a la venta neta (÷ 1,21) y a lo cobrado por Mercado Pago (con IVA).
  const cobrandoEnvio = calcularContribucion(unPar({ envioCobrado: 6_050 }));
  assert.equal(cobrandoEnvio.ventaNeta, 79_297.52);
  assert.equal(cobrandoEnvio.bruto.cobrado, 95_950);
  cerca(cobrandoEnvio.costos.mercadoPago, 95_950 * 0.0339);
  // El producto se cuenta neto, sin dividir otra vez.
  assert.equal(calcularContribucion({ ...unPar(), pares: [PRECIO_REFERENCIA, PRECIO_REFERENCIA] }).costos.producto, 19_140);
});

test("contribución: el descuento va al segundo par de menor precio", () => {
  assert.equal(descuentoDelSegundo([89_900, 89_900], 0.25), 22_475);
  assert.equal(descuentoDelSegundo([89_900, 69_900], 0.2), 13_980, "sobre el más barato");
  assert.equal(descuentoDelSegundo([69_900, 89_900], 0.2), 13_980, "sin importar el orden");
  assert.equal(descuentoDelSegundo([89_900], 0.3), 0, "un par solo no tiene segundo");
  assert.equal(descuentoDelSegundo([100_000, 90_000, 80_000], 0.2), 16_000, "con tres, uno: el más barato");
  assert.equal(descuentoDelSegundo([100_000, 90_000, 80_000, 70_000], 0.2), 30_000, "con cuatro, los dos más baratos");
  const dos = calcularContribucion({ ...unPar(), pares: [89_900, 69_900], descuentoSegundo: 0.2 });
  assert.equal(dos.bruto.productos, 145_820);
  assert.equal(dos.ventaNeta, Math.round((145_820 / IVA) * 100) / 100);
});

test("contribución: el cashback se promete sobre lo pagado en productos, con tope, y cuesta neto de IVA", () => {
  assert.equal(cashbackComprometido(89_900, { porcentaje: 0.05, tope: 5_000 }), 4_495, "el tope no muerde");
  assert.equal(cashbackComprometido(161_820, { porcentaje: 0.05, tope: 5_000 }), 5_000, "con dos pares, sí");
  assert.equal(cashbackComprometido(161_820, { porcentaje: 0.1, tope: null }), 16_182);
  assert.equal(cashbackComprometido(89_900, null), 0);

  const r = calcularContribucion(unPar({ cashback: { porcentaje: 0.1, tope: 10_000 }, envioCobrado: 6_050 }));
  assert.equal(r.bruto.cashbackComprometido, 8_990, "sin el envío: 10 % de 89.900");
  cerca(r.costos.cashback, 8_990 / IVA);
  // Si se espera que se use la mitad, cuesta la mitad.
  const mitad = calcularContribucion(unPar({ cashback: { porcentaje: 0.1, tope: null, tasaDeUso: 0.5 } }));
  cerca(mitad.costos.cashback, 8_990 / IVA / 2);
  // Comparado con el mismo pedido sin cashback, baja exactamente el costo del crédito.
  cerca(calcularContribucion(unPar()).contribucion - calcularContribucion(unPar({ cashback: { porcentaje: 0.1, tope: null } })).contribucion, 8_990 / IVA);
});

test("contribución: tres y seis cuotas suman su costo sobre lo cobrado", () => {
  const base = calcularContribucion(unPar());
  const tres = calcularContribucion(unPar({ cuotas: 3 }));
  const seis = calcularContribucion(unPar({ cuotas: 6 }));
  assert.equal(tres.costos.financiacion, 4_045.5); // 4,50 % de 89.900
  assert.equal(seis.costos.financiacion, 9_259.7); // 10,30 % de 89.900
  cerca(base.contribucion - seis.contribucion, 9_259.7);
  assert.ok(base.contribucion > tres.contribucion && tres.contribucion > seis.contribucion);
});

test("contribución: el crédito se cuenta una sola vez — al prometerlo, no otra vez al usarlo", () => {
  const cashback = { porcentaje: 0.1, tope: null };
  // Pedido A: compra un par y le prometemos 10 %.
  const aSin = calcularContribucion(unPar());
  const aCon = calcularContribucion(unPar({ cashback }));
  const credito = aCon.bruto.cashbackComprometido;
  assert.equal(credito, 8_990);
  // Pedido B: vuelve a comprar un par y usa ese saldo.
  const bSin = calcularContribucion(unPar());
  const bCon = calcularContribucion(unPar({ saldoAplicado: credito }));
  assert.equal(bCon.ventaNeta, bSin.ventaNeta, "la venta del pedido B se mide antes del saldo: no se resta otra vez");
  assert.equal(bCon.bruto.cobrado, 89_900 - credito);
  cerca(bCon.facturadoNeto, (89_900 - credito) / IVA);
  // En B solo bajan lo que de verdad baja: la comisión y los IIBB sobre lo que se cobra y factura.
  const ahorro = credito * 0.0339 + (credito / IVA) * 0.03;
  cerca(bCon.contribucion - bSin.contribucion, ahorro);
  // Los dos pedidos juntos: el crédito pesa una vez (neto de IVA), más ese ahorro.
  const juntos = aCon.contribucion + bCon.contribucion - (aSin.contribucion + bSin.contribucion);
  cerca(juntos, -credito / IVA + ahorro, 0.02);
  // Contarlo dos veces (como costo en A y como descuento en B) daría el doble: eso no pasa.
  assert.ok(Math.abs(juntos - (-2 * credito / IVA + ahorro)) > 1_000);
  // Y el cashback del pedido B se calcula sobre lo que paga de verdad en productos (sin el saldo).
  assert.equal(calcularContribucion(unPar({ saldoAplicado: credito, cashback })).bruto.cashbackComprometido, Math.round((89_900 - credito) * 0.1));
});

test("contribución: un pedido sin sentido no se calcula", () => {
  assert.throws(() => calcularContribucion({ ...unPar(), pares: [] }), RangeError);
  assert.throws(() => calcularContribucion({ ...unPar(), pares: [0] }), RangeError);
  assert.throws(() => calcularContribucion(unPar({ descuentoSegundo: 1 })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ cuotas: 12 as never })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ costoEnvio: -1 })), RangeError);
  assert.throws(() => calcularContribucion(unPar({ saldoAplicado: 100_000 })), RangeError, "más saldo que productos");
  assert.throws(() => calcularContribucion(unPar({ cashback: { porcentaje: 0.1, tope: null, tasaDeUso: 2 } })), RangeError);
});

test("contribución: la matriz de referencia — 1 y 2 pares, 20/25/30 % en el segundo, cashback 5 y 10 % con tope, 1/3/6 cuotas, tres envíos", () => {
  const escenarios = escenariosDeReferencia();
  assert.equal(escenarios.length, 108);
  const resultado = (filtro: (e: (typeof escenarios)[number]) => boolean) => escenarios.filter(filtro).map((e) => ({ e, r: calcularEscenario(e) }));

  // Lo que se espera de cualquier modelo sensato: más cuotas, más envío o más cashback, deja menos.
  for (const { e, r } of resultado(() => true)) {
    if (e.cuotas !== 6) assert.ok(calcularEscenario({ ...e, cuotas: e.cuotas === 1 ? 3 : 6 }).contribucion < r.contribucion);
    if (e.costoEnvio !== 15_000) assert.ok(calcularEscenario({ ...e, costoEnvio: 15_000 }).contribucion < r.contribucion);
    if (!e.cashback) assert.ok(calcularEscenario({ ...e, cashback: { porcentaje: 0.05, tope: 5_000 } }).contribucion < r.contribucion);
  }

  // Un par, de contado y envío barato, llega; en 6 cuotas con el envío más caro, no.
  assert.equal(resultado((e) => e.pares === 1 && !e.cashback && e.cuotas === 1 && e.costoEnvio === 5_500)[0].r.superaMinimo, true);
  const peor = resultado((e) => e.pares === 1 && !e.cashback && e.cuotas === 6 && e.costoEnvio === 15_000)[0].r;
  assert.equal(peor.superaMinimo, false);
  cerca(peor.margen, 0.1826, 0.0001);
  // Dos pares reparten la publicidad: con el 30 % en el segundo, el peor caso igual llega.
  for (const { r } of resultado((e) => e.pares === 2 && e.descuentoSegundo === 0.3)) assert.equal(r.superaMinimo, true);

  // El archivo de la matriz está al día con el código (ACTUALIZAR_MATRIZ=1 npm test lo vuelve a escribir).
  const archivo = path.join(process.cwd(), "docs", "contribucion-matriz.md");
  const generada = matrizEnMarkdown();
  if (process.env.ACTUALIZAR_MATRIZ === "1") fs.writeFileSync(archivo, generada);
  assert.equal(fs.readFileSync(archivo, "utf8"), generada, "docs/contribucion-matriz.md está desactualizado: ACTUALIZAR_MATRIZ=1 npm test");
});
