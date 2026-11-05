import { test } from "node:test";
import assert from "node:assert/strict";

// El registro del Dúo en el pedido (Tarea 05), contra el Airtable de prueba:
// el carrito real del servidor, el pedido guardado y leído de nuevo. El envío
// gratis desde $ 160.000, como en tests/duo-carrito.test.ts.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE = "160000";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { getProductos, getProductosParaCobrar } from "../lib/catalogo";
import { categoriaDesdeTexto } from "../lib/categorias";
import { aplicarMejorPromocion, cuponDeNotas, type Cupon } from "../lib/cupones";
import { totalConDescuento } from "../lib/descuentos";
import { esPedidoConDineroMP, NOTA_DINERO_MP } from "../lib/dinero-mp";
import { calcularDuo, leerRegistroDelDuo, notaDelDuo, PREFIJO_NOTA_DUO, registroDelDuo, type RegistroDuo } from "../lib/duo";
import { esEnvioGratis } from "../lib/envio-gratis";
import { ENCABEZADO_NOTAS, lineasDeNotas } from "../lib/facturacion";
import { itemsDeCompra } from "../lib/mis-compras";
import { buscarPedido, itemsDelPedido, notasDelPedido, resolverCarrito, resumirItems, type CarritoResuelto } from "../lib/pedidos";
import { beneficiosDeNotas, notasDeBeneficios, type SuscriptorDelCarrito } from "../lib/suscriptores";
import type { ItemCarrito, ItemResuelto } from "../lib/tipos";

async function conInterruptor<T>(valor: string | undefined, hacer: () => Promise<T>): Promise<T> {
  const antes = process.env.HARPER_DUO_ACTIVO;
  if (valor === undefined) delete process.env.HARPER_DUO_ACTIVO;
  else process.env.HARPER_DUO_ACTIVO = valor;
  try {
    return await hacer();
  } finally {
    if (antes === undefined) delete process.env.HARPER_DUO_ACTIVO;
    else process.env.HARPER_DUO_ACTIVO = antes;
  }
}
const apagado = <T>(hacer: () => Promise<T>) => conInterruptor(undefined, hacer);
const prendido = <T>(hacer: () => Promise<T>) => conInterruptor("1", hacer);

async function variantes() {
  const productos = await getProductos();
  const v = (slug: string, n = 0) => {
    const p = productos.find((x) => x.slug === slug)!;
    return { productoSlug: slug, varianteId: p.variantes[n].id, precio: p.precio };
  };
  return { amatistaNegro: v("amatista", 0), cuarzoAmbar: v("cuarzo", 1), obsidianaGris: v("obsidiana", 2), estuche: v("m500", 0) };
}
const linea = (v: { productoSlug: string; varianteId: string }, cantidad = 1): ItemCarrito => ({ productoSlug: v.productoSlug, varianteId: v.varianteId, cantidad });

const NBSP = " ";

let numero = 0;
/**
 * Guarda el pedido en el Airtable de prueba con los mismos campos que arma el
 * checkout (app/api/checkout/route.ts) y lo vuelve a leer.
 */
async function guardarYLeer(cobro: { items: ItemResuelto[]; subtotal: number; envio: number; total: number }, notasSuscriptor: string | null = null) {
  type Fila = { Numero?: string; Items?: string; Resumen?: string; Subtotal?: number; Envio?: number; Total?: number; Notas?: string };
  const notas = notasDelPedido(notasSuscriptor, cobro.items);
  const creado = await createRecord<Fila>(TABLAS.pedidos, {
    Numero: `HARPER-DUO-${++numero}`,
    Items: itemsDelPedido(cobro.items),
    Resumen: resumirItems(cobro.items),
    Subtotal: cobro.subtotal,
    Envio: cobro.envio,
    Total: cobro.total,
    ...(notas ? { Notas: notas } : {}),
  });
  return (await getRecord<Fila>(TABLAS.pedidos, creado.id)).fields;
}

/** Los importes de cada renglón: lo que se cobra. */
const importesDe = (items: readonly ItemResuelto[]) =>
  items.map((i) => ({ sku: i.sku, cantidad: i.cantidad, precioUnitario: i.precioUnitario, subtotal: i.subtotal, descuento: i.descuento, cupon: i.cupon, saldo: i.saldo, descuentoDineroMP: i.descuentoDineroMP }));

const cobroDe = (c: CarritoResuelto) => ({ items: c.items, subtotal: c.subtotal, envio: c.envio, total: c.total });

// ---------- Dúo apagado: todo como hoy ----------

test("Pedido con el Dúo apagado: Items y Notas quedan exactamente como hoy", async () => {
  const { amatistaNegro, cuarzoAmbar, estuche } = await variantes();
  const carrito = await apagado(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar), linea(estuche, 2)], { paraCobrar: true }));

  // El campo Items es el mismo JSON que escribía el checkout antes de la Tarea 05.
  assert.equal(itemsDelPedido(carrito.items), JSON.stringify(carrito.items, null, 2));
  assert.ok(!itemsDelPedido(carrito.items).includes('"duo"'), "ningún renglón lleva Dúo");
  assert.ok(carrito.items.every((i) => !("duo" in i)));

  // Notas: las mismas que antes (las del suscriptor o ninguna).
  const suscriptor = notasDeBeneficios({ email: "ana@ejemplo.com", suscriptorId: "recCLIENTEANA0001", cupon: 10_000, saldoUsado: 0, cashback: 0 }).join("\n");
  assert.equal(notasDelPedido(null, carrito.items), null);
  assert.equal(notasDelPedido(suscriptor, carrito.items), suscriptor);

  // Cualquier valor que no sea "1" es apagado.
  for (const valor of ["0", "", "true"]) {
    const otro = await conInterruptor(valor, () => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar), linea(estuche, 2)], { paraCobrar: true }));
    assert.equal(itemsDelPedido(otro.items), itemsDelPedido(carrito.items), `HARPER_DUO_ACTIVO="${valor}"`);
  }

  // Guardado y leído: sin registro del Dúo, sin Notas.
  const fila = await guardarYLeer(cobroDe(carrito));
  assert.equal(fila.Items, JSON.stringify(carrito.items, null, 2));
  assert.equal(fila.Notas, undefined);
  assert.equal(leerRegistroDelDuo(fila.Items), null);
  assert.equal(fila.Total, 179_800 + totalConDescuento(2 * estuche.precio, 5));
});

// ---------- Dúo prendido: qué promoción, cuánto y en qué productos ----------

test("Pedido con el Dúo prendido: queda la promoción, el descuento y el producto que lo recibió", async () => {
  const { amatistaNegro, cuarzoAmbar, estuche } = await variantes();
  const carrito = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar), linea(estuche, 2)], { paraCobrar: true }));
  const estuches = totalConDescuento(2 * estuche.precio, 5);

  // Los importes son los de la Tarea 04: el registro no cambia lo que se cobra.
  assert.deepEqual(carrito.items.map((i) => i.subtotal), [67_425, 89_900, estuches]);
  assert.equal(carrito.subtotal, 157_325 + estuches);
  assert.equal(carrito.ahorro, 22_475 + (2 * estuche.precio - estuches));

  // Solo el renglón que llevó el Dúo tiene `duo`; el estuche sigue con su tramo, sin Dúo.
  assert.deepEqual(carrito.items.map((i) => i.duo ?? null), [{ porcentaje: 25, unidades: 1, descuento: 22_475 }, null, null]);

  const esperado: RegistroDuo = {
    promocion: "Dúo",
    porcentaje: 25,
    descuento: 22_475,
    productos: [{ sku: "AMATISTA-NEGRO", nombre: "AMATISTA", color: "Negro", cantidad: 1, unidadesConDescuento: 1, descuento: 22_475 }],
  };
  assert.deepEqual(registroDelDuo(carrito.items), esperado);

  // Guardado en Airtable y leído de nuevo.
  const fila = await guardarYLeer(cobroDe(carrito));
  assert.deepEqual(leerRegistroDelDuo(fila.Items), esperado);
  assert.equal(fila.Notas, `Promoción: Dúo 25 % · −$${NBSP}22.475 · AMATISTA Negro (1 de 1)`);

  // Los importes guardados son los cobrados, renglón por renglón.
  const guardados = JSON.parse(fila.Items!) as ItemResuelto[];
  assert.deepEqual(importesDe(guardados), importesDe(carrito.items));
  assert.equal(fila.Subtotal, guardados.reduce((t, i) => t + i.subtotal, 0));
  assert.equal(fila.Total, fila.Subtotal! + fila.Envio!);
  // El descuento del Dúo cierra contra la lista de los renglones que lo llevaron.
  for (const i of guardados.filter((x) => x.duo)) assert.equal(i.precioLista * i.cantidad - i.subtotal, i.duo!.descuento);
});

test("Dúo prendido: con dos renglones descontados y con varias unidades del mismo", async () => {
  const { amatistaNegro, cuarzoAmbar, obsidianaGris } = await variantes();

  // Cuatro anteojos de $ 89.900: dos con el 25 %, en los primeros renglones.
  const cuatro = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar), linea(obsidianaGris, 2)], { paraCobrar: true }));
  assert.deepEqual(registroDelDuo(cuatro.items), {
    promocion: "Dúo",
    porcentaje: 25,
    descuento: 44_950,
    productos: [
      { sku: "AMATISTA-NEGRO", nombre: "AMATISTA", color: "Negro", cantidad: 1, unidadesConDescuento: 1, descuento: 22_475 },
      { sku: "CUARZO-AMBAR", nombre: "CUARZO", color: "Ámbar traslúcido", cantidad: 1, unidadesConDescuento: 1, descuento: 22_475 },
    ],
  });
  assert.equal(registroDelDuo(cuatro.items)!.descuento, cuatro.ahorro);
  assert.equal(
    notaDelDuo(registroDelDuo(cuatro.items)),
    `Promoción: Dúo 25 % · −$${NBSP}44.950 · AMATISTA Negro (1 de 1), CUARZO Ámbar traslúcido (1 de 1)`
  );

  // Tres del mismo renglón: una con el 25 %.
  const tres = await prendido(() => resolverCarrito([linea(amatistaNegro, 3)], { paraCobrar: true }));
  assert.deepEqual(registroDelDuo(tres.items)?.productos, [
    { sku: "AMATISTA-NEGRO", nombre: "AMATISTA", color: "Negro", cantidad: 3, unidadesConDescuento: 1, descuento: 22_475 },
  ]);
  const fila = await guardarYLeer(cobroDe(tres));
  assert.equal(fila.Notas, `Promoción: Dúo 25 % · −$${NBSP}22.475 · AMATISTA Negro (1 de 3)`);
  assert.equal(fila.Total, 3 * 89_900 - 22_475);

  // Un anteojo solo: no hay Dúo y el pedido queda como hoy.
  const uno = await prendido(() => resolverCarrito([linea(amatistaNegro)], { paraCobrar: true }));
  assert.equal(registroDelDuo(uno.items), null);
  const unoApagado = await apagado(() => resolverCarrito([linea(amatistaNegro)], { paraCobrar: true }));
  assert.equal(itemsDelPedido(uno.items), itemsDelPedido(unoApagado.items));
  assert.ok(!itemsDelPedido(uno.items).includes('"duo"'));
});

test("Dúo prendido con suscriptor y dinero en Mercado Pago: el registro no cambia y las Notas se siguen leyendo", async () => {
  const { amatistaNegro, cuarzoAmbar } = await variantes();
  const suscriptor: SuscriptorDelCarrito = { id: "recPRUEBA", email: "prueba@harper.ar", cuponDisponible: true, saldoDisponible: 0, activo: true };
  const carrito = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar)], { suscriptor, paraCobrar: true }));

  // El cupón de bienvenida del suscriptor va después del Dúo y no lo borra.
  assert.equal(carrito.suscriptor?.cupon, 10_000);
  assert.equal(registroDelDuo(carrito.items)?.descuento, 22_475);
  // Con dinero en Mercado Pago (los renglones que cobra el checkout), tampoco.
  assert.ok(carrito.dineroMP);
  assert.deepEqual(registroDelDuo(carrito.dineroMP.items), registroDelDuo(carrito.items));

  // Las Notas como las arma el checkout: facturación, cupón y medio primero;
  // después el suscriptor y el Dúo (crearPedido en app/api/checkout/route.ts).
  const beneficios = { email: "prueba@harper.ar", suscriptorId: "recPRUEBA00000001", cupon: 10_000, saldoUsado: 0, cashback: 0 };
  const notasSuscriptor = notasDeBeneficios(beneficios).join("\n");
  const extra = notasDelPedido(notasSuscriptor, carrito.dineroMP.items)!;
  assert.equal(extra, `${notasSuscriptor}\n\n${PREFIJO_NOTA_DUO} 25 % · −$${NBSP}22.475 · AMATISTA Negro (1 de 1)`);

  const factura = `${ENCABEZADO_NOTAS}\nFactura A a nombre de un titular con CUIT\nCUIT: 20-12345678-6`;
  const notas = [factura, "Cupón: PRUEBA", NOTA_DINERO_MP, extra].join("\n\n");
  assert.deepEqual(lineasDeNotas(notas), ["Factura A a nombre de un titular con CUIT", "CUIT: 20-12345678-6"]);
  assert.equal(cuponDeNotas(notas), "PRUEBA");
  assert.equal(esPedidoConDineroMP({ Notas: notas }), true);
  assert.deepEqual(beneficiosDeNotas(notas), beneficios);
  // Sin el suscriptor, la línea del Dúo no se confunde con ninguna de esas.
  const soloDuo = notasDelPedido(null, carrito.items)!;
  assert.equal(beneficiosDeNotas(soloDuo), null);
  assert.equal(cuponDeNotas(soloDuo), null);
  assert.equal(lineasDeNotas(soloDuo), null);
  assert.equal(esPedidoConDineroMP({ Notas: soloDuo }), false);
});

test("Un cupón que reemplaza la promoción saca el Dúo del registro; uno que no conviene lo deja", async () => {
  const { amatistaNegro, cuarzoAmbar } = await variantes();
  const carrito = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar)], { paraCobrar: true }));
  // Hoy no hay cupones (lib/cupones.ts): se prueba con una lista propia.
  const cupones: Cupon[] = [
    { codigo: "PRUEBA30", porcentaje: 30, soloPrimeraCompra: false },
    { codigo: "PRUEBA5", porcentaje: 5, soloPrimeraCompra: false },
  ];

  // 30 % sobre los dos (125.860) le gana al Dúo (157.325): queda el cupón, sin Dúo.
  const conCupon = aplicarMejorPromocion(carrito.items, "PRUEBA30", cupones);
  assert.equal(conCupon.cupon?.estado, "aplicado");
  assert.ok(conCupon.items.every((i) => !("duo" in i)));
  assert.equal(registroDelDuo(conCupon.items), null);
  assert.equal(notasDelPedido(null, conCupon.items), null);

  // 5 % no le gana: queda el Dúo, con su registro.
  const sinCupon = aplicarMejorPromocion(carrito.items, "PRUEBA5", cupones);
  assert.equal(sinCupon.cupon?.estado, "no-conviene");
  assert.deepEqual(registroDelDuo(sinCupon.items), registroDelDuo(carrito.items));
});

// ---------- Compatibilidad con los pedidos anteriores ----------

test("Pedidos anteriores y datos raros: sin registro del Dúo y sin romper nada", async () => {
  // El pedido de prueba de siempre (dos anteojos con el 5 %, sin Dúo).
  const viejo = await getRecord<{ Items?: string }>(TABLAS.pedidos, "recPEDIDOPRUEBA01");
  assert.equal(leerRegistroDelDuo(viejo.fields.Items), null);

  for (const crudo of [undefined, null, 42, "", "no es JSON", "{}", "null", "[1, 2]", '[{"sku": "X"}]']) {
    assert.equal(leerRegistroDelDuo(crudo), null, String(crudo));
  }

  // Un `duo` incompleto o sin sentido no se toma como Dúo.
  const base = { sku: "AMATISTA-NEGRO", nombre: "AMATISTA", color: "Negro", cantidad: 2 };
  for (const duo of [
    null,
    "25",
    { porcentaje: 25, unidades: 0, descuento: 22_475 },
    { porcentaje: 25, unidades: 3, descuento: 22_475 },
    { porcentaje: 25, unidades: 1.5, descuento: 22_475 },
    { porcentaje: 25, unidades: 1, descuento: -1 },
    { porcentaje: 25, unidades: 1, descuento: "22475" },
    { porcentaje: 0, unidades: 1, descuento: 22_475 },
    { porcentaje: 100, unidades: 1, descuento: 22_475 },
    { unidades: 1, descuento: 22_475 },
  ]) {
    assert.equal(leerRegistroDelDuo(JSON.stringify([{ ...base, duo }])), null, JSON.stringify(duo));
  }
});

test("Los que leen el campo Items (Mis compras, gracias) ven el pedido con Dúo igual que sin el detalle", async () => {
  const { amatistaNegro, cuarzoAmbar } = await variantes();
  const carrito = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar)], { paraCobrar: true }));
  const sinDetalle = carrito.items.map(({ duo: _duo, ...i }) => i);
  assert.deepEqual(itemsDeCompra(itemsDelPedido(carrito.items)), itemsDeCompra(JSON.stringify(sinDetalle, null, 2)));

  const fila = await guardarYLeer(cobroDe(carrito));
  const publico = await buscarPedido(fila.Numero!);
  assert.deepEqual(
    publico?.items.map((i) => [i.sku, i.cantidad, i.precioUnitario]),
    [
      ["AMATISTA-NEGRO", 1, 67_425],
      ["CUARZO-AMBAR", 1, 89_900],
    ]
  );
  assert.equal(publico?.total, 157_325 + carrito.envio);
});

// ---------- Caso de la revisión del PR #62: el Dúo que pierde el envío gratis ----------

test("Caso de la revisión: un Dúo que pierde el envío gratis termina pagando más (regla actual, a decidir)", async () => {
  // El ejemplo de la revisión: un par de $ 89.900 y otro de $ 69.900, envío
  // gratis desde $ 150.000 y una cotización de $ 20.000.
  const umbrales = { amba: 60_000, nacional: 150_000 };
  const duo = calcularDuo([
    { categoria: "Anteojos", precioLista: 89_900, cantidad: 1 },
    { categoria: "Anteojos", precioLista: 69_900, cantidad: 1 },
  ]);
  assert.equal(duo.descuento, 17_475, "el 25 % va al más barato");
  const sinDuo = 159_800;
  const conDuo = sinDuo - duo.descuento;
  assert.equal(conDuo, 142_325);
  assert.equal(esEnvioGratis(sinDuo, "resto", umbrales), true);
  assert.equal(esEnvioGratis(conDuo, "resto", umbrales), false);
  const cotizacion = 20_000;
  // HOY (umbral medido después del Dúo): paga $ 2.525 más que sin el Dúo.
  assert.equal(conDuo + cotizacion, 162_325);
  assert.equal(conDuo + cotizacion - sinDuo, 2_525);
  // Con la alternativa recomendada (umbral medido antes del Dúo, como el
  // cupón y el dinero en Mercado Pago), pagaría $ 142.325: NO está
  // implementada, espera la aprobación de Ale.
  assert.equal(esEnvioGratis(sinDuo, "resto", umbrales) ? conDuo : conDuo + cotizacion, 142_325);

  // Con los precios de hoy no pasa: dos de $ 89.900 con el Dúo quedan en
  // $ 157.325, arriba de los $ 150.000. En AMBA (desde $ 60.000), nunca.
  assert.equal(esEnvioGratis(2 * 89_900 - 22_475, "resto", umbrales), true);
  assert.equal(esEnvioGratis(2 * 89_900 - 22_475, "amba", umbrales), true);
});

test("Caso de la revisión con el carrito del servidor: con un umbral de $ 160.000 y un envío de $ 25.000", async () => {
  // Con la tarifa plana del Airtable de prueba ($ 10.100) el Dúo siempre
  // conviene; para ver el caso se sube a $ 25.000 solo en esta prueba.
  const config = await listRecords<{ Clave?: string; Valor?: string }>(TABLAS.config);
  const costo = config.find((f) => f.fields.Clave === "costo_envio")!;
  const antes = costo.fields.Valor;
  await updateRecord(TABLAS.config, costo.id, { Valor: "25000" });
  try {
    const { amatistaNegro, cuarzoAmbar } = await variantes();
    const items = [linea(amatistaNegro), linea(cuarzoAmbar)];
    const sin = await apagado(() => resolverCarrito(items, { paraCobrar: true }));
    const con = await prendido(() => resolverCarrito(items, { paraCobrar: true }));

    assert.equal(sin.subtotal, 179_800);
    assert.equal(sin.envio, 0);
    assert.equal(sin.total, 179_800);

    // La regla actual: el umbral se mide después del Dúo y el Dúo se elige
    // sin mirar el envío. Paga $ 2.525 más que sin el Dúo.
    assert.equal(con.subtotal, 157_325);
    assert.equal(con.subtotalSinCupon, 157_325);
    assert.equal(con.envio, 25_000);
    assert.equal(con.total, 182_325);
    assert.equal(con.total - sin.total, 2_525);
    // Y el pedido registra el Dúo tal como se cobró.
    assert.equal(registroDelDuo(con.items)?.descuento, 22_475);
  } finally {
    await updateRecord(TABLAS.config, costo.id, { Valor: antes });
  }
});

// ---------- Un clip suelto no es un anteojo completo ----------

test("Un clip que se vende suelto no puede recibir el descuento de un anteojo completo", async () => {
  // Las únicas categorías con Dúo son las de anteojos completos. Un clip
  // suelto no tiene categoría propia hoy: con cualquier otro nombre, el
  // producto no se publica ni se puede cobrar.
  for (const texto of ["Clip", "Clips", "Clip suelto", "Clip magnético", "Clip-On accesorio", "Accesorios", "Accesorio"]) {
    assert.equal(categoriaDesdeTexto(texto), null, texto);
  }
  assert.equal(categoriaDesdeTexto("Clip-On"), "Clip-On", "Clip-On es el anteojo completo con su clip (Ale, 05/11/2026)");

  // Un clip suelto cargado en Airtable con una de esas categorías.
  const clip = await createRecord(TABLAS.productos, { Activo: true, Nombre: "CLIP SUELTO", Slug: "clip-suelto", Categoria: "Clip", Precio: 29_900, Orden: 99 });
  const variante = await createRecord(TABLAS.variantes, { Activo: true, SKU: "CLIP-SUELTO-NEGRO", Producto: [clip.id], Color: "Negro", Color_hex: "#1D1D1B", Stock: 10, Orden: 1 });

  assert.ok(!(await getProductosParaCobrar()).some((p) => p.slug === "clip-suelto"), "no se publica");

  const { amatistaNegro, cuarzoAmbar } = await variantes();
  const clipEnCarrito: ItemCarrito = { productoSlug: "clip-suelto", varianteId: variante.id, cantidad: 1 };

  // Un anteojo y un clip suelto no son un Dúo: el clip no entra al carrito.
  const unoYClip = await prendido(() => resolverCarrito([linea(amatistaNegro), clipEnCarrito], { paraCobrar: true }));
  assert.deepEqual(unoYClip.descartados, [{ varianteId: variante.id, motivo: "no-existe" }]);
  assert.deepEqual(unoYClip.items.map((i) => i.sku), ["AMATISTA-NEGRO"]);
  assert.equal(unoYClip.subtotal, 89_900);
  assert.equal(registroDelDuo(unoYClip.items), null);

  // Dos anteojos y un clip suelto: el Dúo va a un anteojo; el clip, afuera.
  const dosYClip = await prendido(() => resolverCarrito([clipEnCarrito, linea(amatistaNegro), linea(cuarzoAmbar)], { paraCobrar: true }));
  assert.deepEqual(dosYClip.items.map((i) => i.sku), ["AMATISTA-NEGRO", "CUARZO-AMBAR"]);
  assert.deepEqual(registroDelDuo(dosYClip.items)?.productos.map((p) => p.sku), ["AMATISTA-NEGRO"]);
  assert.equal(dosYClip.subtotal, 157_325);
});
