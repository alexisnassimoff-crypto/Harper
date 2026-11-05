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
 * Cuotas exclusivas (Ale, 05/11/2026): hasta 3 sin interés para todos y hasta
 * 6 para suscriptores con la sesión verificada y los beneficios activos.
 * Cada importe se verifica con Mercado Pago: acá, uno de prueba con mínimos
 * propios (3 sin interés desde $ 70.000 y 6 desde $ 80.000). Los mínimos
 * reales los pone Ale en Mercado Pago y no están en el código.
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

test("cuotas: con el monto debajo del mínimo de 6, el suscriptor ve las 3 que sí son sin interés", () => {
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

test("cuotas: a cada comprador las suyas, y a quien no es suscriptor las que tendría (si son más)", async () => {
  // $ 89.900: 3 para todos, 6 para suscriptores.
  assert.deepEqual(
    Object.fromEntries(Object.entries(await cuotasParaComprador(89_900, false)).map(([k, v]) => [k, v?.cuotas ?? null])),
    { suyas: 3, deSuscriptor: 6 }
  );
  const suscriptor = await cuotasParaComprador(89_900, true);
  assert.equal(suscriptor.suyas?.cuotas, 6);
  assert.equal(suscriptor.suyas?.montoCuota, 14983.33);
  assert.equal(suscriptor.deSuscriptor, null);
  // $ 79.900 (debajo del mínimo de 6): todos tienen 3 y no hay nada más que ofrecer.
  const debajo = await cuotasParaComprador(79_900, false);
  assert.equal(debajo.suyas?.cuotas, 3);
  assert.equal(debajo.deSuscriptor, null);
  assert.equal((await cuotasParaComprador(79_900, true)).suyas?.cuotas, 3);
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

test("cuotas: las 6 salen de la sesión verificada y activa, nunca del mail que se escribe", async () => {
  const tope = async (r: Request) => cuotasDelComprador(await suscriptorDelCarritoDeLaPeticion(r));
  // Ana entró con su mail y su código: su cookie firmada vale 6.
  assert.equal(await tope(peticion(sesionDe(SUSCRIPTOR_ANA, "ana@ejemplo.com"))), 6);
  // Sin cookie, aunque el formulario traiga el mail de Ana: 3.
  assert.equal(await tope(peticion(undefined, { cliente: { email: "ana@ejemplo.com" } })), 3);
  // Una cookie falsificada o de otra clave: 3.
  assert.equal(await tope(peticion("v1.recSUSCANA0000001.ana@ejemplo.com.9999999999999.firma")), 3);
  const otraClave = crearSesionSuscriptor(Buffer.from("otra-clave-de-32-caracteres-minimo-xx"), { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" });
  assert.equal(await tope(peticion(otraClave)), 3);
  // La firma de Ana con el mail de otra persona no coincide con la fila: 3.
  assert.equal(await tope(peticion(sesionDe(SUSCRIPTOR_ANA, "otra@ejemplo.com"))), 3);
  // Carla se dio de baja: su sesión le sirve para el saldo, pero las cuotas son las de todos.
  assert.equal(await tope(peticion(sesionDe(SUSCRIPTOR_CARLA, "carla@ejemplo.com"))), 3);
});

test("cuotas: se verifican con el importe final, después del cupón y del saldo", async () => {
  const items = [{ productoSlug: "citrino", varianteId: "rec5h3kW0JBY8Wd7y", cantidad: 1 }];
  // Beto, recién suscripto: el cupón de bienvenida baja el par a $ 79.900,
  // debajo del mínimo de 6 de este Mercado Pago de prueba: ve 3, no 6.
  const beto = await suscriptorDelCarritoDeLaPeticion(peticion(sesionDe(SUSCRIPTOR_BETO, "beto@ejemplo.com")));
  assert.ok(beto);
  const conCupon = await resolverCarrito(items, { suscriptor: beto, usarCupon: true });
  assert.equal(conCupon.total, 79_900);
  const deBeto = await cuotasParaComprador(conCupon.total, true);
  assert.equal(deBeto.suyas?.cuotas, 3);
  assert.equal(deBeto.suyas?.montoCuota, 26633.33);
  // Ana paga parte con su saldo: las cuotas son para lo que queda.
  const ana = await suscriptorDelCarritoDeLaPeticion(peticion(sesionDe(SUSCRIPTOR_ANA, "ana@ejemplo.com")));
  assert.ok(ana && ana.saldoDisponible > 0);
  const dos = [{ ...items[0], cantidad: 2 }];
  const conSaldo = await resolverCarrito(dos, { suscriptor: ana, usarSaldo: true });
  assert.ok(conSaldo.suscriptor && conSaldo.suscriptor.saldoUsado > 0);
  assert.equal(conSaldo.total, conSaldo.subtotal + conSaldo.envio);
  montosConsultados = [];
  const deAna = await cuotasParaComprador(conSaldo.total, true);
  assert.deepEqual(montosConsultados, [conSaldo.total, conSaldo.total], "una consulta por marca, con el total después del saldo");
  assert.equal(deAna.suyas?.cuotas, conSaldo.total >= MINIMOS[6] ? 6 : conSaldo.total >= MINIMOS[3] ? 3 : undefined);
});
