import { test } from "node:test";
import assert from "node:assert/strict";

// Las cuentas de Suscriptores Harper (Ale, 03/11/2026), sin servidor: el
// reparto del cupón y del saldo, el cashback, las fechas en Buenos Aires y lo
// que el pedido guarda en Notas.

import {
  aplicarBeneficios,
  beneficiosDeNotas,
  cashbackDe,
  cashbackDisponibleDesde,
  CUPON_BIENVENIDA,
  cuotasMaximas,
  fechaArgentina,
  normalizarOrigenSuscripcion,
  notasDeBeneficios,
  repartir,
  saldoDe,
  type MovimientoSaldo,
} from "../lib/suscriptores";
import type { ItemResuelto } from "../lib/tipos";

function item(varianteId: string, precio: number, cantidad = 1): ItemResuelto {
  return {
    productoId: "rec",
    productoSlug: varianteId.toLowerCase(),
    nombre: varianteId,
    categoria: "Anteojos",
    varianteId,
    sku: varianteId,
    color: "Negro",
    foto: null,
    precioLista: precio,
    precioUnitario: precio,
    descuento: 0,
    cantidad,
    subtotal: precio * cantidad,
    stockDisponible: 10,
  };
}

const suma = (n: number[]) => n.reduce((a, b) => a + b, 0);

test("repartir: proporcional, en pesos enteros, el renglón más grande absorbe el redondeo", () => {
  assert.deepEqual(repartir([89900, 45000], 10000), [6665, 3335]);
  assert.deepEqual(repartir([100, 100, 100], 100), [34, 33, 33]);
  assert.deepEqual(repartir([50000], 10000), [10000]);
  // Nunca más que lo que vale cada renglón, ni más que el total.
  assert.deepEqual(repartir([3000, 1000], 10000), [3000, 1000]);
  assert.deepEqual(repartir([0, 5000], 2000), [0, 2000]);
  assert.deepEqual(repartir([], 1000), []);
  assert.deepEqual(repartir([1000], -5), [0]);
  // El total siempre cierra.
  for (const valores of [[89900, 89900, 6990], [1, 2, 3, 4], [179800, 12345]]) {
    for (const monto of [1, 999, 10000, 50001]) {
      const partes = repartir(valores, monto);
      assert.equal(suma(partes), Math.min(monto, suma(valores)), `${valores} / ${monto}`);
      partes.forEach((p, n) => assert.ok(p >= 0 && p <= valores[n]));
    }
  }
});

test("el cupón de bienvenida: $ 10.000 fijos sobre los productos, repartidos entre los renglones", () => {
  const r = aplicarBeneficios([item("A", 89900), item("B", 45000)], { cupon: CUPON_BIENVENIDA, saldo: 0 });
  assert.deepEqual([r.cupon, r.saldo], [10000, 0]);
  assert.deepEqual(r.items.map((i) => [i.cupon, i.subtotal]), [[6665, 83235], [3335, 41665]]);
  assert.equal(suma(r.items.map((i) => i.subtotal)), 134900 - 10000);
  // Dos unidades en un renglón: el unitario puede tener fracción (Mercado Pago lo recibe partido).
  const dos = aplicarBeneficios([item("A", 89900, 2)], { cupon: CUPON_BIENVENIDA, saldo: 0 });
  assert.deepEqual([dos.items[0].subtotal, dos.items[0].precioUnitario], [169800, 84900]);
});

test("el cupón nunca pasa del subtotal de productos; sin productos no se usa", () => {
  const chico = aplicarBeneficios([item("A", 6990)], { cupon: CUPON_BIENVENIDA, saldo: 0 });
  assert.deepEqual([chico.cupon, chico.items[0].subtotal, chico.items[0].precioUnitario], [6990, 0, 0]);
  assert.deepEqual(aplicarBeneficios([], { cupon: CUPON_BIENVENIDA, saldo: 50000 }), { items: [], cupon: 0, saldo: 0 });
});

test("después del cupón, el saldo: cubre lo que queda y puede pagar la compra entera", () => {
  const parcial = aplicarBeneficios([item("A", 89900)], { cupon: CUPON_BIENVENIDA, saldo: 5000 });
  assert.deepEqual([parcial.cupon, parcial.saldo, parcial.items[0].subtotal], [10000, 5000, 74900]);
  assert.deepEqual([parcial.items[0].cupon, parcial.items[0].saldo], [10000, 5000]);

  const entera = aplicarBeneficios([item("A", 89900), item("B", 89900)], { cupon: 0, saldo: 500000 });
  assert.deepEqual([entera.saldo, suma(entera.items.map((i) => i.subtotal))], [179800, 0]);
  assert.ok(entera.items.every((i) => i.subtotal === 0 && i.precioUnitario === 0 && i.cupon === undefined));

  // Saldo con centavos (un ajuste a mano): se usa en pesos enteros.
  assert.equal(aplicarBeneficios([item("A", 89900)], { cupon: 0, saldo: 1234.56 }).saldo, 1234);
});

test("aplicarBeneficios no toca los ítems que recibe", () => {
  const items = [item("A", 89900)];
  const r = aplicarBeneficios(items, { cupon: CUPON_BIENVENIDA, saldo: 1000 });
  assert.equal(items[0].subtotal, 89900);
  assert.equal(items[0].cupon, undefined);
  assert.notEqual(r.items[0], items[0]);
  // Sin beneficios, copias iguales.
  const sin = aplicarBeneficios(items, { cupon: 0, saldo: 0 });
  assert.deepEqual(sin.items, items);
  assert.notEqual(sin.items[0], items[0]);
});

test("cashback: el 10% de lo pagado en productos, redondeado a pesos enteros", () => {
  assert.equal(cashbackDe(74900), 7490);
  assert.equal(cashbackDe(71910), 7191);
  assert.equal(cashbackDe(89905), 8991);
  assert.equal(cashbackDe(89904), 8990);
  assert.equal(cashbackDe(0), 0);
  assert.equal(cashbackDe(-100), 0);
  assert.equal(cashbackDe(Number.NaN), 0);
});

test("el cashback se puede usar a los 30 días del pago, contados en Buenos Aires", () => {
  // 02:30 UTC del 3/11 son las 23:30 del 2/11 en Buenos Aires.
  assert.equal(fechaArgentina(new Date("2026-11-03T02:30:00Z")), "2026-11-02");
  assert.equal(cashbackDisponibleDesde(new Date("2026-11-03T02:30:00Z")), "2026-12-02");
  assert.equal(cashbackDisponibleDesde(new Date("2026-11-03T03:00:00Z")), "2026-12-03");
  // Cambio de año y febrero.
  assert.equal(cashbackDisponibleDesde(new Date("2026-12-15T15:00:00Z")), "2027-01-14");
  assert.equal(cashbackDisponibleDesde(new Date("2027-02-01T15:00:00Z")), "2027-03-03");
});

test("el saldo: lo disponible desde ese día, lo que está en camino y nada de lo anulado", () => {
  const m = (tipo: MovimientoSaldo["tipo"], monto: number, disponibleDesde: string | null, anulado = false): MovimientoSaldo => ({
    id: `rec${tipo}${monto}`,
    tipo,
    monto,
    pedido: "H",
    fecha: "2026-11-01T00:00:00Z",
    disponibleDesde,
    anulado,
  });
  const movimientos = [
    m("Cashback", 17081, "2026-10-12"),
    m("Uso", -5000, null),
    m("Ajuste", 1000, null),
    m("Cashback", 7191, "2026-12-03"),
    m("Cashback", 8990, "2026-12-01", true),
    m("Uso", -3000, null, true),
  ];
  assert.deepEqual(saldoDe(movimientos, "2026-11-03"), { disponible: 13081, enCamino: 7191 });
  // El mismo día en que se habilita, ya cuenta.
  assert.deepEqual(saldoDe(movimientos, "2026-12-03"), { disponible: 20272, enCamino: 0 });
  // Con una fecha: el día de Buenos Aires (el 3/12 a las 01:00 UTC todavía es el 2/12).
  assert.deepEqual(saldoDe(movimientos, new Date("2026-12-03T01:00:00Z")), { disponible: 13081, enCamino: 7191 });
  // Un saldo en negativo (dos pedidos a la vez) se muestra y se usa como 0.
  assert.deepEqual(saldoDe([m("Uso", -2000, null)], "2026-11-03"), { disponible: 0, enCamino: 0 });
  assert.deepEqual(saldoDe([], "2026-11-03"), { disponible: 0, enCamino: 0 });
});

test("lo que el pedido guarda en Notas se lee igual, aunque haya facturación antes y envío después", () => {
  const b = { suscriptorId: "recSUSCANA0000001", email: "ana@ejemplo.com", cupon: 10000, saldoUsado: 5000, cashback: 7490 };
  const lineas = notasDeBeneficios(b);
  assert.equal(lineas.length, 4);
  assert.equal(lineas[0], "Suscriptor: ana@ejemplo.com (recSUSCANA0000001)");
  assert.match(lineas[1], /^Cupón de bienvenida: −\$\s10\.000$/);
  assert.match(lineas[2], /^Saldo usado: −\$\s5\.000$/);
  assert.match(lineas[3], /^Cashback a acreditar: \$\s7\.490$/);
  const notas = `DATOS DE FACTURACIÓN\nFactura B\n\n${lineas.join("\n")}\n\nEnvío: Andreani`;
  assert.deepEqual(beneficiosDeNotas(notas), b);

  // Solo el cupón: lo demás en 0. Sin la línea del suscriptor, o con un id raro: null.
  const soloCupon = notasDeBeneficios({ ...b, saldoUsado: 0, cashback: 0 });
  assert.equal(soloCupon.length, 2);
  assert.deepEqual(beneficiosDeNotas(soloCupon.join("\n")), { ...b, saldoUsado: 0, cashback: 0 });
  assert.equal(beneficiosDeNotas("Cupón: HARPER10 (−$ 8.990)"), null);
  assert.equal(beneficiosDeNotas("Suscriptor: ana@ejemplo.com (otro)"), null);
  assert.equal(beneficiosDeNotas(undefined), null);
});

test("el origen de la suscripción y el tope de cuotas por comprador", () => {
  assert.equal(normalizarOrigenSuscripcion("checkout"), "Checkout");
  assert.equal(normalizarOrigenSuscripcion(" Portada "), "Portada");
  assert.equal(normalizarOrigenSuscripcion("instagram"), "Otro");
  assert.equal(normalizarOrigenSuscripcion(undefined), "Otro");
  // Ale, 05/11/2026: hasta 3 para todos y hasta 6 para suscriptores.
  assert.deepEqual([cuotasMaximas(false), cuotasMaximas(true)], [3, 6]);
});

test("los mails: el código, y la bienvenida con las cuotas solo si Mercado Pago las confirmó", async () => {
  const { mailBienvenidaSuscriptor, mailCodigoSuscriptor } = await import("../lib/mails");
  const config = { razonSocial: "FOCUS VISION SRL", cuit: "30-1", emailContacto: "hola@harper.ar", emailPedidos: "pedidos@harper.ar", whatsapp: "" } as Parameters<typeof mailCodigoSuscriptor>[0]["config"];
  const codigo = mailCodigoSuscriptor({ email: "ana@ejemplo.com", codigo: "123456", config });
  assert.equal(codigo.asunto, "123456 es tu código de Harper");
  assert.ok(!/ana@ejemplo\.com/.test(codigo.texto), "el código no lleva datos de la persona");

  const base = { email: "ana@ejemplo.com", nombre: "Ana Pérez", sitio: "https://harper.ar", enlaceBaja: "https://harper.ar/suscriptores/baja?t=abc", config };
  const sinCuotas = mailBienvenidaSuscriptor({ ...base, cuponDisponible: true, cuotas: null });
  assert.equal(sinCuotas.asunto, "Desbloqueaste tus beneficios de Harper");
  assert.match(sinCuotas.texto, /^Hola, Ana\. Desbloqueaste tus beneficios de Harper\./);
  assert.match(sinCuotas.texto, /\$\s10\.000 de descuento en tu primera compra\./);
  assert.match(sinCuotas.texto, /Te devolvemos el 10% de lo que pagás en productos como saldo para tus próximas compras\. Lo podés usar a los 30 días y no vence\./);
  assert.match(sinCuotas.texto, /Envío gratis siempre/);
  assert.ok(!/cuotas/i.test(sinCuotas.texto), "sin verificar, no se nombran cuotas");
  assert.match(sinCuotas.texto, /https:\/\/harper\.ar\/suscriptores\/mi-cuenta/);
  assert.match(sinCuotas.html, /suscriptores\/baja\?t=abc/);

  const conCuotas = mailBienvenidaSuscriptor({ ...base, cuponDisponible: false, cuotas: { cuotas: 6, montoCuota: 14983.33, cftea: "0,00 %" } });
  assert.match(conCuotas.texto, /6 cuotas sin interés con Visa y Mastercard · CFTEA 0,00 %\./);
  assert.ok(!/primera compra/.test(conCuotas.texto), "sin el cupón (ya compró), no se lo promete");
});
