import { test } from "node:test";
import assert from "node:assert/strict";

// Tarea 07: cómo se cuenta el Dúo en la tienda (ficha, packs, carrito y
// checkout), con los importes del servidor. El carrito real contra el
// Airtable de prueba, sin tramos de anteojos (como hoy) y con el envío gratis
// desde $ 160.000: dos pares de $ 89.900 llegan a lista ($ 179.800) y con el
// Dúo pagan $ 157.325.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE = "160000";
delete process.env.HARPER_FIXTURES_ESCALA;
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;

import { createRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { armarPack } from "../lib/packs";
import { getProductos } from "../lib/catalogo";
import { esCategoriaDeAnteojos } from "../lib/categorias";
import { getTramos, ofertaDeEscala, porcentajeParaCantidad, proximoTramo, totalConDescuento } from "../lib/descuentos";
import { cotizacionParaComprador, envioEnElCarrito } from "../lib/envio-gratis";
import { packConDuo, porcentajeDelDuo, resolverCarrito, type CarritoResuelto } from "../lib/pedidos";
import {
  ahorroDelDuo,
  duoDeLaFicha,
  ofertaEnLaFicha,
  packParaMostrar,
  filasDeDescuento,
  mensajesDelDuo,
  notaEnvioGratisDelDuo,
  ofertaDuoDeLaFicha,
  textoDelRenglon,
} from "../lib/promocion-anteojos";
import { elegirSugerencias } from "../lib/sugerencias";
import type { SuscriptorDelCarrito } from "../lib/suscriptores";
import type { ItemCarrito, Producto } from "../lib/tipos";
import { empujeDeLaBarra } from "../lib/vitrina";

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

async function catalogo() {
  const productos = await getProductos();
  const p = (slug: string) => productos.find((x) => x.slug === slug)!;
  const linea = (slug: string, n = 0, cantidad = 1): ItemCarrito => ({ productoSlug: slug, varianteId: p(slug).variantes[n].id, cantidad });
  return { productos, p, linea };
}

const UMBRALES = { amba: 60_000, nacional: 160_000 };

/** Lo que muestra el resumen del carrito y del checkout, con los textos de la tienda. */
function loQueSeMuestra(c: CarritoResuelto) {
  const envio = envioEnElCarrito(c.subtotalSinCupon, c.envio, UMBRALES);
  const pares = c.items.filter((i) => i.categoria === "Anteojos").reduce((n, i) => n + i.cantidad, 0);
  return {
    filas: filasDeDescuento({ ahorro: c.ahorro, items: c.items, cupon: c.cupon }),
    renglones: c.items.map((i) => textoDelRenglon(i)),
    envio,
    notaDuo: notaEnvioGratisDelDuo({ base: c.subtotalSinCupon, items: c.items, umbral: c.envio === 0 ? UMBRALES.nacional : UMBRALES.amba, gratis: c.envio === 0 || envio.valor === "Gratis en AMBA" }),
    falta: cotizacionParaComprador(c, UMBRALES).falta,
    barra: empujeDeLaBarra({
      pares,
      actual: porcentajeParaCantidad(c.tramos, "Anteojos", pares),
      proximo: proximoTramo(c.tramos, "Anteojos", pares),
      cupon: 0,
      subtotalSinCupon: c.subtotalSinCupon,
      precioPar: 89_900,
      envioGratisDesde: UMBRALES.nacional,
      escala: ofertaDeEscala(c.tramos, "Anteojos", pares),
      duo: c.duo ?? null,
    }),
    carrito: c.duo ? mensajesDelDuo(c.duo, "carrito") : null,
    ficha: c.duo ? mensajesDelDuo(c.duo, "ficha") : null,
  };
}

/** Carritos de prueba: uno, dos, tres y cuatro anteojos, con y sin estuches. */
async function carritos() {
  const { linea } = await catalogo();
  return [
    [linea("amatista")],
    [linea("amatista"), linea("cuarzo", 1)],
    [linea("amatista", 0, 2)],
    [linea("amatista"), linea("cuarzo", 1), linea("m500", 0, 2)],
    [linea("amatista"), linea("cuarzo", 1), linea("obsidiana", 2)],
    [linea("amatista", 0, 3), linea("cuarzo", 1)],
    [linea("m500", 0, 2)],
    [linea("m500"), linea("amatista")],
  ];
}

// ---------- Dúo apagado: todo como hoy ----------

test("Dúo apagado: el servidor no manda nada del Dúo y los textos son los de siempre", async () => {
  assert.equal(porcentajeDelDuo(), null);
  const { p, linea, productos } = await catalogo();
  assert.equal(await packConDuo(p("amatista"), 2), null, "la ficha y la portada no piden nada al servidor");

  const tramos = await getTramos();
  for (const items of await carritos()) {
    const c = await apagado(() => resolverCarrito(items));
    assert.ok(!("duo" in c), "sin el campo duo");
    assert.ok(c.items.every((i) => !("duo" in i)));
    const m = loQueSeMuestra(c);
    // La fila de descuento de siempre: «Descuento» con el ahorro, o nada.
    assert.deepEqual(m.filas, c.ahorro > 0 ? [{ etiqueta: "Descuento", monto: c.ahorro }] : []);
    assert.ok(m.renglones.every((r) => r === null));
    assert.equal(m.notaDuo, null);
    assert.equal(m.carrito, null);
    // La barra, igual que sin el parámetro nuevo.
    const pares = c.items.filter((i) => i.categoria === "Anteojos").reduce((n, i) => n + i.cantidad, 0);
    const deSiempre = empujeDeLaBarra({
      pares,
      actual: porcentajeParaCantidad(c.tramos, "Anteojos", pares),
      proximo: proximoTramo(c.tramos, "Anteojos", pares),
      cupon: 0,
      subtotalSinCupon: c.subtotalSinCupon,
      precioPar: 89_900,
      envioGratisDesde: UMBRALES.nacional,
      escala: ofertaDeEscala(c.tramos, "Anteojos", pares),
    });
    assert.equal(m.barra, deSiempre);
    // Las sugerencias, iguales con y sin el parámetro nuevo.
    assert.deepEqual(elegirSugerencias(c.items, productos, 7, tramos, c.duo ?? null), elegirSugerencias(c.items, productos, 7, tramos));
  }
  // Un cupón aplicado sigue con su nombre.
  assert.deepEqual(filasDeDescuento({ ahorro: 8_990, items: [], cupon: { codigo: "PRUEBA", estado: "aplicado" } }), [{ etiqueta: "Cupón PRUEBA", monto: 8_990 }]);
  void linea;
});

// ---------- Dúo prendido ----------

test("Dúo prendido, un anteojo: invita al Dúo sin decir que está aplicado", async () => {
  const { linea } = await catalogo();
  const c = await prendido(() => resolverCarrito([linea("amatista")]));
  assert.deepEqual(c.duo, { porcentaje: 25, ahorro: 0, unidades: 0, siguiente: "duo" });
  const m = loQueSeMuestra(c);
  assert.deepEqual(m.filas, [], "no hay descuento que mostrar");
  assert.deepEqual(m.renglones, [null]);
  assert.equal(m.carrito?.siguiente, "Sumá otro par y el de menor precio tiene 25% OFF.");
  assert.equal(m.ficha?.aplicado, null, "no dice «ya tenés el Dúo»");
  assert.equal(m.barra, "Sumá otro: 25% OFF en el de menor precio y envío gratis a todo el país.");
});

test("Dúo prendido, dos anteojos: Dúo aplicado, con el ahorro y el renglón que calculó el servidor", async () => {
  const { linea } = await catalogo();
  const c = await prendido(() => resolverCarrito([linea("amatista"), linea("cuarzo", 1)]));
  assert.deepEqual(c.duo, { porcentaje: 25, ahorro: 22_475, unidades: 1, siguiente: null });
  const m = loQueSeMuestra(c);
  assert.deepEqual(m.filas, [{ etiqueta: "Dúo · 25% OFF", monto: 22_475 }]);
  assert.deepEqual(m.renglones, ["Dúo · 25% OFF", null]);
  assert.equal(m.carrito?.siguiente, null, "con dos, un tercero no suma otro con el 25 %");
  assert.equal(m.ficha?.aplicado, "Tu carrito ya tiene el Dúo: 25% OFF en el anteojo de menor precio.");
  assert.equal(m.barra, "Dúo aplicado: 25% OFF y envío gratis a todo el país.");

  // Los dos en un mismo renglón: «en 1 de 2».
  const mismo = await prendido(() => resolverCarrito([linea("amatista", 0, 2)]));
  assert.deepEqual(loQueSeMuestra(mismo).renglones, ["Dúo · 25% OFF en 1 de 2"]);

  // Con estuches: el Dúo en su fila y el tramo de los estuches en «Descuento».
  const estuches = await prendido(() => resolverCarrito([linea("amatista"), linea("cuarzo", 1), linea("m500", 0, 2)]));
  const tramoEstuches = 2 * 8_990 - totalConDescuento(2 * 8_990, 5);
  assert.deepEqual(loQueSeMuestra(estuches).filas, [
    { etiqueta: "Dúo · 25% OFF", monto: 22_475 },
    { etiqueta: "Descuento", monto: tramoEstuches },
  ]);
  assert.equal(estuches.ahorro, 22_475 + tramoEstuches, "las filas suman el ahorro del servidor");
});

test("Dúo prendido, tres anteojos: aplicado y el próximo par suma otro con el 25 %", async () => {
  const { linea } = await catalogo();
  const c = await prendido(() => resolverCarrito([linea("amatista"), linea("cuarzo", 1), linea("obsidiana", 2)]));
  assert.equal(c.duo?.unidades, 1);
  assert.equal(c.duo?.siguiente, "duo");
  const m = loQueSeMuestra(c);
  assert.equal(m.carrito?.siguiente, "Sumá otro par y dos pares tienen 25% OFF.");
  assert.equal(m.barra, "Dúo aplicado. Uno más: 25% OFF en otro par.");
});

test("Envío gratis antes del descuento: se dice claro y nunca «te faltan»", async () => {
  const { linea } = await catalogo();
  const items = [linea("amatista"), linea("cuarzo", 1)];
  const c = await prendido(() => resolverCarrito(items));
  assert.equal(c.subtotal, 157_325);
  assert.equal(c.envio, 0);
  const m = loQueSeMuestra(c);
  assert.equal(m.envio.valor, "Gratis");
  assert.equal(m.envio.nota, null, "sin «Te faltan…»");
  assert.equal(m.falta, 0);
  assert.equal(m.notaDuo, "Envío gratis por tu compra: el mínimo se cuenta antes del descuento del Dúo.");

  // Si ni a lista llega al mínimo, no hay envío gratis ni nota, y lo que falta
  // se mide sobre la misma base que el servidor ($ 180.000 − $ 179.800).
  const fila = (await listRecords<{ Clave?: string; Valor?: string }>(TABLAS.config)).find((f) => f.fields.Clave === "envio_gratis_desde")!;
  const antes = fila.fields.Valor;
  await updateRecord(TABLAS.config, fila.id, { Valor: "180000" });
  try {
    const sinGratis = await prendido(() => resolverCarrito(items));
    assert.ok(sinGratis.envio > 0);
    const u = { amba: 60_000, nacional: 180_000 };
    assert.equal(cotizacionParaComprador(sinGratis, u).falta, 200);
    assert.equal(envioEnElCarrito(sinGratis.subtotalSinCupon, sinGratis.envio, { amba: 0, nacional: 180_000 }).nota, "Te faltan $\u00a0200 para el envío gratis.");
    assert.equal(notaEnvioGratisDelDuo({ base: sinGratis.subtotalSinCupon, items: sinGratis.items, umbral: 180_000, gratis: false }), null);
  } finally {
    await updateRecord(TABLAS.config, fila.id, { Valor: antes });
  }
});

test("Sin contradicciones en ningún carrito de prueba con el Dúo prendido", async () => {
  const { productos } = await catalogo();
  const tramos = await getTramos();
  const suscriptor: SuscriptorDelCarrito = { id: "recPRUEBA", email: "prueba@harper.ar", cuponDisponible: true, saldoDisponible: 0, activo: true };
  for (const items of await carritos()) {
    for (const opciones of [{}, { paraCobrar: true }, { suscriptor }]) {
      const c = await prendido(() => resolverCarrito(items, opciones));
      const m = loQueSeMuestra(c);
      const etiqueta = JSON.stringify(items);
      assert.ok(c.duo, etiqueta);
      const conDuo = c.items.some((i) => i.duo);

      // «Dúo aplicado» si y solo si algún renglón trae el Dúo; y su monto es el del servidor.
      assert.equal(c.duo.ahorro > 0, conDuo, etiqueta);
      assert.equal(c.duo.ahorro, ahorroDelDuo(c.items), etiqueta);
      assert.equal(m.filas.some((f) => f.etiqueta.startsWith("Dúo")), conDuo, etiqueta);
      assert.equal(m.filas.reduce((t, f) => t + f.monto, 0), c.ahorro, `las filas suman el ahorro del servidor ${etiqueta}`);
      assert.equal(Boolean(m.ficha?.aplicado), conDuo, etiqueta);
      if (m.barra?.includes("Dúo aplicado")) assert.ok(conDuo, etiqueta);
      // Con el Dúo aplicado no se anuncia un porcentaje de tramo como aplicado.
      if (conDuo) assert.ok(!/\d+ % OFF aplicado/.test(m.barra ?? ""), etiqueta);

      // «Sumá otro par…25% OFF» solo si el servidor dice que suma otro con el Dúo.
      assert.equal(Boolean(m.carrito?.siguiente), c.duo.siguiente === "duo", etiqueta);
      assert.ok(!(m.carrito?.siguiente && m.carrito.tramos), etiqueta);

      // El envío: si es gratis no hay «te faltan»; la nota del Dúo, solo con envío gratis.
      if (c.envio === 0) {
        assert.ok(!(m.envio.nota ?? "").includes("Te faltan"), etiqueta);
        assert.equal(m.falta, 0, etiqueta);
      }
      if (m.notaDuo) assert.equal(c.envio, 0, etiqueta);

      // Las sugerencias no prometen el tramo del segundo par cuando gana el Dúo.
      const motivos = elegirSugerencias(c.items, productos, 3, tramos, c.duo).map((s) => s.motivo);
      if (c.duo.siguiente === "duo") assert.ok(motivos.every((t) => !/off en los dos/.test(t)), etiqueta);
    }
  }
});

test("Las sugerencias: el segundo par con el Dúo, solo si el servidor lo confirma", async () => {
  const { productos, linea } = await catalogo();
  const tramos = await getTramos();
  const uno = await prendido(() => resolverCarrito([linea("amatista")]));
  const motivos = elegirSugerencias(uno.items, productos, 1, tramos, uno.duo).filter((s) => esCategoriaDeAnteojos(s.categoria)).map((s) => s.motivo);
  assert.ok(motivos.length > 0);
  assert.ok(motivos.every((t) => t === "Segundo par: 25% OFF en el de menor precio"));

  const dos = await prendido(() => resolverCarrito([linea("amatista"), linea("cuarzo", 1)]));
  const conDos = elegirSugerencias(dos.items, productos, 1, tramos, dos.duo).filter((s) => esCategoriaDeAnteojos(s.categoria)).map((s) => s.motivo);
  assert.ok(conDos.every((t) => t === "Otro modelo para sumar"), "con dos, no se promete descuento");
});

// ---------- La ficha y los packs: lo que cobra el servidor ----------

test("La ficha y los packs muestran lo que cobra el servidor por esa cantidad", async () => {
  const { p, linea } = await catalogo();
  const amatista: Producto = p("amatista");

  const dos = await prendido(() => packConDuo(amatista, 2));
  assert.ok(dos);
  assert.equal(dos.total, 157_325);
  assert.equal(dos.lista, 179_800);
  assert.equal(dos.ahorro, 22_475);
  assert.equal(dos.totalParaEnvio, 179_800, "el envío gratis, antes del 25 %");
  assert.equal(dos.promocion, "duo");
  // Es el mismo número que el carrito para esos dos pares.
  const carrito = await prendido(() => resolverCarrito([linea("amatista", 0, 2)]));
  assert.equal(dos.total, carrito.subtotal);
  assert.equal(dos.totalDineroMP, carrito.dineroMP?.subtotal);

  assert.deepEqual(ofertaDuoDeLaFicha({ porcentaje: 25, dos }), {
    titulo: "Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF.",
    detalle: "Dos de este modelo: $ 157.325 (antes $ 179.800).",
  });

  const cuatro = await prendido(() => packConDuo(amatista, 4));
  assert.equal(cuatro?.total, 314_650);
  assert.equal(cuatro?.duo.unidades, 2);

  const uno = await prendido(() => packConDuo(amatista, 1));
  assert.equal(uno?.promocion, "ninguna");
  assert.equal(uno?.total, 89_900);

  // Con el estuche: el estuche a su precio y los anteojos con el Dúo.
  const estuche = p("m500");
  const conEstuche = await prendido(() => packConDuo(amatista, 2, { productoSlug: "m500", varianteId: estuche.variantes[0].id, cantidad: 1 }));
  assert.equal(conEstuche?.precioExtra, estuche.precio);
  assert.equal(conEstuche?.total, 157_325 + estuche.precio);

  // Sin stock para esa cantidad: null (no se inventa un precio).
  assert.equal(await prendido(() => packConDuo(amatista, 200)), null);
});

// ---------- Revisión del PR #65: nada de precios ni promociones sin el servidor ----------

/** Un anteojo con un solo par en stock, cargado en el Airtable de prueba. */
async function anteojoConUnoSolo(): Promise<Producto> {
  const producto = await createRecord(TABLAS.productos, { Activo: true, Nombre: "UNICO", Slug: "unico", Categoria: "Anteojos", Precio: 89_900, Orden: 98 });
  await createRecord(TABLAS.variantes, { Activo: true, SKU: "UNICO-NEGRO", Producto: [producto.id], Color: "Negro", Color_hex: "#1D1D1B", Stock: 1, Orden: 1 });
  return (await getProductos()).find((p) => p.slug === "unico")!;
}

test("Ficha con stock para un solo par: no anuncia el Dúo de dos (ni un tramo)", async () => {
  const unico = await anteojoConUnoSolo();
  assert.equal(unico.variantes.reduce((n, v) => n + v.stock, 0), 1);

  // El servidor no puede armar dos pares de este modelo.
  const dos = await prendido(() => packConDuo(unico, 2));
  assert.equal(dos, null);
  const duo = duoDeLaFicha(25, dos);
  assert.deepEqual(duo, { porcentaje: 25, gana: null, dos: null });
  // La ficha, sin anteojos en el carrito: ninguna línea de promoción.
  assert.deepEqual(ofertaEnLaFicha({ duo, duoDelCarrito: null, anteojosEnCarrito: 0, esAnteojo: true, cuponPorcentaje: 0 }), { duo: null, conTramo: false });

  // Con stock para dos, sí: con lo que cobra el servidor.
  const { p } = await catalogo();
  const conStock = duoDeLaFicha(25, await prendido(() => packConDuo(p("amatista"), 2)));
  assert.equal(conStock?.gana, "duo");
  const oferta = ofertaEnLaFicha({ duo: conStock, duoDelCarrito: null, anteojosEnCarrito: 0, esAnteojo: true, cuponPorcentaje: 0 });
  assert.deepEqual(oferta.duo?.lineas, ["Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF."]);
  assert.equal(oferta.duo?.detalle, "Dos de este modelo: $\u00a0157.325 (antes $\u00a0179.800).");
  assert.equal(oferta.conTramo, false);

  // Si en dos pares gana un tramo, la ficha cuenta el tramo y no el Dúo.
  assert.deepEqual(ofertaEnLaFicha({ duo: { porcentaje: 25, gana: "tramos", dos: null }, duoDelCarrito: null, anteojosEnCarrito: 0, esAnteojo: true, cuponPorcentaje: 0 }), { duo: null, conTramo: true });

  // Dúo apagado: la ficha de siempre (la línea de los tramos, sin Dúo).
  assert.equal(duoDeLaFicha(null, null), null);
  assert.equal(await apagado(() => packConDuo(unico, 2)), null);
  assert.deepEqual(ofertaEnLaFicha({ duo: null, duoDelCarrito: null, anteojosEnCarrito: 0, esAnteojo: true, cuponPorcentaje: 0 }), { duo: null, conTramo: true });
});

test("Portada con el Dúo prendido: un pack sin total del servidor no muestra ningún precio", async () => {
  const sinPack = () => {
    throw new Error("con el Dúo prendido no se calcula en el navegador");
  };

  // Sin respuesta del servidor (por ejemplo, sin stock): sin precio, y nunca el cálculo del navegador.
  const sinPrecio = packParaMostrar(true, null, 4, sinPack);
  assert.equal(sinPrecio.sinPrecio, true);
  assert.equal(sinPrecio.total, 0);
  assert.equal(sinPrecio.precioExtra, null, "sin precio, el estuche no se ofrece");
  assert.equal(packParaMostrar(true, undefined, 2, sinPack).sinPrecio, true);

  // El anteojo con un solo par: el servidor no resuelve 2 ni 4.
  const unico = (await getProductos()).find((p) => p.slug === "unico") ?? (await anteojoConUnoSolo());
  for (const cantidad of [2, 4]) {
    const delServidor = await prendido(() => packConDuo(unico, cantidad));
    assert.equal(delServidor, null);
    assert.equal(packParaMostrar(true, delServidor, cantidad, sinPack).sinPrecio, true);
  }

  // Con el total del servidor: ese total, sin calcular nada.
  const { p } = await catalogo();
  const dos = (await prendido(() => packConDuo(p("amatista"), 2)))!;
  const mostrado = packParaMostrar(true, dos, 2, sinPack);
  assert.equal(mostrado.sinPrecio, undefined);
  assert.equal(mostrado.total, 157_325);
  assert.equal(mostrado.lista, 179_800);
  assert.equal(mostrado.totalParaEnvio, 179_800);
  assert.equal(mostrado.duo, dos);

  // Dúo apagado: exactamente el pack de siempre (lib/packs.ts).
  const tramos = await getTramos();
  for (const cantidad of [1, 2, 4]) {
    const deSiempre = () => armarPack({ precio: 89_900, cantidad, tramos, categoria: "Anteojos", cuponPorcentaje: 0 });
    assert.deepEqual(packParaMostrar(false, null, cantidad, deSiempre), deSiempre());
    assert.deepEqual(packParaMostrar(false, dos, cantidad, deSiempre), deSiempre(), "apagado, se ignora cualquier dato del Dúo");
  }
});
