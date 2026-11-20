import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
delete process.env.VERCEL;

import { evaluarMejoresCuotas } from "../lib/cuotas";
import { cuotasParaComprador, verificarCuotas } from "../lib/cuotas-servidor";
import { SUSCRIPTOR_ANA, SUSCRIPTOR_BETO, SUSCRIPTOR_CARLA } from "../lib/fixtures/datos";
import { reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar } from "../lib/fixtures/servidor";
import { resolverCarrito } from "../lib/pedidos";
import { cuotasDelComprador } from "../lib/suscriptores";
import { suscriptorDelCarritoDeLaPeticion } from "../lib/suscriptores-cuenta";
import { claveDeSesionSuscriptor, COOKIE_SUSCRIPTOR, crearSesionSuscriptor } from "../lib/suscriptores-sesion";

/**
 * Las cuotas por comprador. Entre el 05/11 y el 18/11/2026 eran «exclusivas»:
 * hasta 3 sin interés para todos y hasta 6 para suscriptores con la sesión
 * verificada. Ale, 18/11/2026: son las mismas para todos, hasta 3, con cuenta
 * o sin cuenta; nadie tiene 6. Cada importe se sigue verificando con Mercado
 * Pago: acá, uno de prueba con mínimos propios (3 sin interés desde $ 70.000
 * y 6 desde $ 80.000, para ver que las 6 no se anuncian aunque Mercado Pago
 * las dé). Los mínimos reales los pone Ale en Mercado Pago y no están en el
 * código.
 */

const MINIMOS = { 3: 70_000, 6: 80_000 } as Record<number, number>;

/** La respuesta de /v1/payment_methods/installments para un monto, con los mínimos de arriba. */
function respuestaMP(monto: number) {
  const costo = (n: number) => {
    const sinInteres = n === 1 || (MINIMOS[n] !== undefined && monto >= MINIMOS[n]);
    const total = sinInteres ? monto : Math.round(monto * 1.3 * 100) / 100;
    return {
      installments: n,
      installment_rate: sinInteres ? 0 : 30,
      labels: [sinInteres ? "CFT_0,00%|TEA_0,00%" : "CFT_48,10%|TEA_38,00%"],
      installment_amount: Math.round((total / n) * 100) / 100,
      total_amount: total,
    };
  };
  return [{ payment_type_id: "credit_card", issuer: { id: "1", name: "Banco" }, payer_costs: [1, 3, 6, 12].map(costo) }];
}

let montosConsultados: number[] = [];
let mercadoPagoCaido = false;
const fetchReal = globalThis.fetch;

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
  montosConsultados = [];
  mercadoPagoCaido = false;
  process.env.MP_ACCESS_TOKEN = "TEST-prueba";
  process.env.NEXT_PUBLIC_CUOTAS = "6";
  globalThis.fetch = (async (url: string | URL) => {
    const u = new URL(String(url));
    if (!u.pathname.endsWith("/v1/payment_methods/installments")) return fetchReal(url);
    if (mercadoPagoCaido) return new Response("{}", { status: 500 });
    const monto = Number(u.searchParams.get("amount"));
    montosConsultados.push(monto);
    return new Response(JSON.stringify(respuestaMP(monto)), { status: 200 });
  }) as typeof fetch;
});

test("cuotas: de un tope para abajo, las más que Mercado Pago confirma sin interés para ese importe", () => {
  const conSeis = [respuestaMP(89_900), respuestaMP(89_900)];
  assert.equal(evaluarMejoresCuotas(conSeis, 6, 89_900)?.cuotas, 6);
  assert.equal(evaluarMejoresCuotas(conSeis, 3, 89_900)?.cuotas, 3);
  const sinSeis = [respuestaMP(79_900), respuestaMP(79_900)];
  assert.equal(evaluarMejoresCuotas(sinSeis, 6, 79_900)?.cuotas, 3);
  // Debajo de todos los mínimos: ninguna cantidad es sin interés, no se anuncia nada.
  const ninguna = [respuestaMP(50_000), respuestaMP(50_000)];
  assert.equal(evaluarMejoresCuotas(ninguna, 6, 50_000), null);
  assert.equal(evaluarMejoresCuotas(ninguna, 3, 50_000), null);
});

test("cuotas: las mismas para todos, hasta 3, aunque Mercado Pago dé 6 sin interés para ese importe (Ale, 18/11/2026)", async () => {
  // $ 89.900: este Mercado Pago da 6 sin interés, pero la tienda anuncia 3 a
  // cualquiera, y a nadie le ofrece «las de suscriptor».
  const visitante = await cuotasParaComprador(89_900, false);
  const conCuenta = await cuotasParaComprador(89_900, true);
  assert.deepEqual(visitante, { suyas: { cuotas: 3, montoCuota: 29966.67, cftea: "0,00 %" }, deSuscriptor: null });
  assert.deepEqual(conCuenta, visitante, "con cuenta o sin cuenta, lo mismo");
  // $ 79.900 (debajo del mínimo de 6 de este Mercado Pago): 3, igual.
  for (const esSuscriptor of [false, true]) {
    const debajo = await cuotasParaComprador(79_900, esSuscriptor);
    assert.equal(debajo.suyas?.cuotas, 3);
    assert.equal(debajo.deSuscriptor, null);
  }
  // $ 50.000: ninguna sin interés, para nadie.
  assert.deepEqual(await cuotasParaComprador(50_000, true), { suyas: null, deSuscriptor: null });
  assert.deepEqual(await cuotasParaComprador(50_000, false), { suyas: null, deSuscriptor: null });
  // Se pregunta por el monto exacto, no por uno redondeado.
  assert.ok(montosConsultados.includes(79_900));
});

test("cuotas: si Mercado Pago no contesta o los anuncios están apagados, no se dice «sin interés»", async () => {
  mercadoPagoCaido = true;
  assert.deepEqual(await cuotasParaComprador(89_900, false), { suyas: null, deSuscriptor: null });
  assert.equal(await verificarCuotas(89_900, 6), null);
  mercadoPagoCaido = false;
  delete process.env.NEXT_PUBLIC_CUOTAS;
  assert.deepEqual(await cuotasParaComprador(89_900, true), { suyas: null, deSuscriptor: null });
  assert.deepEqual(montosConsultados, [], "sin el interruptor ni se le pregunta a Mercado Pago");
});

/** Una petición con la cookie de sesión de ese suscriptor (firmada con la clave del sitio). */
function peticion(cookie?: string, cuerpo: unknown = {}) {
  return new Request("https://harper.ar/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie: `${COOKIE_SUSCRIPTOR}=${cookie}` } : {}) },
    body: JSON.stringify(cuerpo),
  });
}
const sesionDe = (suscriptorId: string, email: string) => crearSesionSuscriptor(claveDeSesionSuscriptor()!, { suscriptorId, email });

test("cuotas: ninguna sesión da más de 3: ni la verificada, ni la falsificada, ni la de quien se dio de baja (Ale, 18/11/2026)", async () => {
  const comprador = async (r: Request) => {
    const cuenta = await suscriptorDelCarritoDeLaPeticion(r);
    return { email: cuenta?.email ?? null, tope: cuotasDelComprador(cuenta) };
  };
  // Ana entró con su mail y su código: la cookie firmada la reconoce (para su
  // cuenta y su saldo), pero ya no le da 6 cuotas.
  assert.deepEqual(await comprador(peticion(sesionDe(SUSCRIPTOR_ANA, "ana@ejemplo.com"))), { email: "ana@ejemplo.com", tope: 3 });
  // Sin cookie, aunque el formulario traiga el mail de Ana: nadie, y 3.
  assert.deepEqual(await comprador(peticion(undefined, { cliente: { email: "ana@ejemplo.com" } })), { email: null, tope: 3 });
  // Una cookie falsificada o de otra clave: nadie, y 3.
  assert.deepEqual(await comprador(peticion("v1.recSUSCANA0000001.ana@ejemplo.com.9999999999999.firma")), { email: null, tope: 3 });
  const otraClave = crearSesionSuscriptor(Buffer.from("otra-clave-de-32-caracteres-minimo-xx"), { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" });
  assert.deepEqual(await comprador(peticion(otraClave)), { email: null, tope: 3 });
  // La firma de Ana con el mail de otra persona no coincide con la fila: nadie, y 3.
  assert.deepEqual(await comprador(peticion(sesionDe(SUSCRIPTOR_ANA, "otra@ejemplo.com"))), { email: null, tope: 3 });
  // Carla se dio de baja de las novedades: su cuenta sigue, con las cuotas de todos.
  assert.deepEqual(await comprador(peticion(sesionDe(SUSCRIPTOR_CARLA, "carla@ejemplo.com"))), { email: "carla@ejemplo.com", tope: 3 });
  // Y lo que resuelve el carrito para cada una: 3.
  for (const [id, email] of [[SUSCRIPTOR_ANA, "ana@ejemplo.com"], [SUSCRIPTOR_BETO, "beto@ejemplo.com"], [SUSCRIPTOR_CARLA, "carla@ejemplo.com"]] as const) {
    const suscriptor = await suscriptorDelCarritoDeLaPeticion(peticion(sesionDe(id, email)));
    const carrito = await resolverCarrito([{ productoSlug: "citrino", varianteId: "rec5h3kW0JBY8Wd7y", cantidad: 1 }], { suscriptor });
    assert.equal(carrito.suscriptor?.cuotas, 3, email);
  }
});

test("cuotas: se verifican con el importe final; la cuenta no baja el precio (sin cupón de bienvenida) y el saldo de antes, sí (Ale, 18/11/2026)", async () => {
  const items = [{ productoSlug: "citrino", varianteId: "rec5h3kW0JBY8Wd7y", cantidad: 1 }];
  const visitante = await resolverCarrito(items);
  // Beto tiene en su fila el cupón de bienvenida «Disponible» (se suscribió
  // antes del 18/11): ya no se aplica, ni pidiéndolo. Paga lo mismo que un
  // visitante, envío incluido, y sus cuotas se verifican con ese total.
  const beto = await suscriptorDelCarritoDeLaPeticion(peticion(sesionDe(SUSCRIPTOR_BETO, "beto@ejemplo.com")));
  assert.ok(beto);
  assert.equal(beto.cuponDisponible, false);
  const deBetoElCarrito = await resolverCarrito(items, { suscriptor: beto, usarCupon: true });
  assert.equal(deBetoElCarrito.suscriptor?.cupon, 0);
  assert.deepEqual(
    [deBetoElCarrito.subtotal, deBetoElCarrito.envio, deBetoElCarrito.total],
    [visitante.subtotal, visitante.envio, visitante.total]
  );
  assert.equal(deBetoElCarrito.subtotal, 89_900);
  montosConsultados = [];
  const deBeto = await cuotasParaComprador(deBetoElCarrito.total, true);
  assert.deepEqual(montosConsultados, [deBetoElCarrito.total, deBetoElCarrito.total], "una consulta por marca, con el total de cualquier comprador");
  assert.equal(deBeto.suyas?.cuotas, 3);
  assert.equal(deBeto.suyas?.montoCuota, Math.round((deBetoElCarrito.total / 3) * 100) / 100);
  assert.deepEqual(deBeto, await cuotasParaComprador(visitante.total, false));
  // Ana paga parte con el saldo que tenía de antes: las cuotas son para lo que queda, y nunca 6.
  const ana = await suscriptorDelCarritoDeLaPeticion(peticion(sesionDe(SUSCRIPTOR_ANA, "ana@ejemplo.com")));
  assert.ok(ana && ana.saldoDisponible > 0);
  const dos = [{ ...items[0], cantidad: 2 }];
  const conSaldo = await resolverCarrito(dos, { suscriptor: ana, usarSaldo: true });
  assert.ok(conSaldo.suscriptor && conSaldo.suscriptor.saldoUsado > 0);
  assert.equal(conSaldo.total, conSaldo.subtotal + conSaldo.envio);
  assert.ok(conSaldo.total >= MINIMOS[6], "un total con el que este Mercado Pago daría 6 sin interés");
  montosConsultados = [];
  const deAna = await cuotasParaComprador(conSaldo.total, true);
  assert.deepEqual(montosConsultados, [conSaldo.total, conSaldo.total], "una consulta por marca, con el total después del saldo");
  assert.equal(deAna.suyas?.cuotas, 3);
  assert.equal(deAna.deSuscriptor, null);
});
