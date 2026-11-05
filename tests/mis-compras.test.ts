import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";

import { createRecord, TABLAS } from "../lib/airtable";
import { cumpleFormula } from "../lib/fixtures/formula";
import { comprasDeLaCuenta, comprasDeLosClientes, compraDe, estadoDeCompra, itemsDeCompra, MAXIMO_DE_COMPRAS } from "../lib/mis-compras";

/** «Mis compras» de Mi cuenta Harper (Ale, 05/11/2026). */

const item = (nombre: string, extra: Record<string, unknown> = {}) => ({
  productoSlug: nombre.toLowerCase(),
  nombre,
  color: "Carey",
  foto: `/productos/anteojos/${nombre.toLowerCase()}-carey-1.webp`,
  cantidad: 1,
  subtotal: 89900,
  ...extra,
});

test("mis compras: solo se muestran compras; ni checkouts sin pagar ni pagos rechazados", () => {
  assert.equal(estadoDeCompra("pagado", "approved"), "pagado");
  assert.equal(estadoDeCompra("Preparando", ""), "preparando");
  assert.equal(estadoDeCompra("enviado", ""), "enviado");
  assert.equal(estadoDeCompra("entregado", ""), "entregado");
  assert.equal(estadoDeCompra("cancelado", "refunded"), "cancelado");
  // Mercado Pago lo está revisando: es una compra, en revisión.
  assert.equal(estadoDeCompra("pendiente", "in_process"), "en-revision");
  assert.equal(estadoDeCompra("pendiente", "pending"), "en-revision");
  // Un checkout que no se pagó, o un pago rechazado: no son compras.
  assert.equal(estadoDeCompra("pendiente", ""), null);
  assert.equal(estadoDeCompra("pendiente", undefined), null);
  assert.equal(estadoDeCompra("rechazado", "rejected"), null);
  assert.equal(estadoDeCompra("", ""), null);
});

test("mis compras: los productos salen del JSON del pedido, sin romperse con datos raros", () => {
  assert.deepEqual(itemsDeCompra(JSON.stringify([item("CITRINO")])), [
    { nombre: "CITRINO", color: "Carey", cantidad: 1, subtotal: 89900, foto: "/productos/anteojos/citrino-carey-1.webp", slug: "citrino" },
  ]);
  // Sin subtotal: precio unitario por cantidad. Sin nombre: «Producto».
  const [sinSubtotal] = itemsDeCompra(JSON.stringify([{ precioUnitario: 1000, cantidad: 3 }]));
  assert.equal(sinSubtotal.subtotal, 3000);
  assert.equal(sinSubtotal.nombre, "Producto");
  // Fotos de otros dominios o rutas raras no se muestran; slugs raros no se enlazan.
  const [raro] = itemsDeCompra(JSON.stringify([item("X", { foto: "https://otro.com/a.jpg", productoSlug: "../admin" })]));
  assert.equal(raro.foto, null);
  assert.equal(raro.slug, null);
  assert.equal(itemsDeCompra(JSON.stringify([item("Y", { foto: "//otro.com/a.jpg" })]))[0].foto, null);
  assert.equal(itemsDeCompra(JSON.stringify([item("Z", { foto: "https://abc.public.blob.vercel-storage.com/z.webp" })]))[0].foto, "https://abc.public.blob.vercel-storage.com/z.webp");
  assert.deepEqual(itemsDeCompra("no es json"), []);
  assert.deepEqual(itemsDeCompra(JSON.stringify({ no: "es una lista" })), []);
  assert.deepEqual(itemsDeCompra(undefined), []);
});

test("mis compras: solo los pedidos enlazados a la ficha de ese cliente, de la más nueva a la más vieja", () => {
  const fila = (id: string, cliente: string, fecha: string, estado = "pagado") => ({
    id,
    fields: { Numero: id, Estado: estado, Cliente: [cliente], Fecha: fecha, Total: 1000, Items: JSON.stringify([item("CITRINO")]) },
  });
  const filas = [
    fila("A-VIEJA", "recCLIENTEA000001", "2026-09-01T10:00:00.000Z", "entregado"),
    fila("A-NUEVA", "recCLIENTEA000001", "2026-11-01T10:00:00.000Z"),
    fila("A-SIN-PAGAR", "recCLIENTEA000001", "2026-11-02T10:00:00.000Z", "pendiente"),
    fila("DE-OTRO", "recCLIENTEB000002", "2026-11-03T10:00:00.000Z"),
  ];
  const compras = comprasDeLosClientes(new Set(["recCLIENTEA000001"]), filas);
  assert.deepEqual(compras.map((c) => c.numero), ["A-NUEVA", "A-VIEJA"]);
  // Nunca más de MAXIMO_DE_COMPRAS.
  const muchas = Array.from({ length: MAXIMO_DE_COMPRAS + 5 }, (_, i) => fila(`N${i}`, "recCLIENTEA000001", `2026-10-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`));
  assert.equal(comprasDeLosClientes(new Set(["recCLIENTEA000001"]), muchas).length, MAXIMO_DE_COMPRAS);
  // Sin fecha del pedido, la de creación.
  assert.equal(compraDe({ id: "x", createdTime: "2026-10-10T10:00:00.000Z", fields: { Estado: "pagado" } })?.fecha, "2026-10-10T10:00:00.000Z");
});

test("mis compras: la base de prueba entiende RECORD_ID() como Airtable", () => {
  assert.equal(cumpleFormula("OR(RECORD_ID() = 'recA', RECORD_ID() = 'recB')", {}, "recB"), true);
  assert.equal(cumpleFormula("OR(RECORD_ID() = 'recA', RECORD_ID() = 'recB')", {}, "recC"), false);
});

test("mis compras: la cuenta ve solo sus compras, por su mail verificado exacto", async () => {
  const pedido = (numero: string, estado: string, mp = "approved") =>
    createRecord(TABLAS.pedidos, { Numero: numero, Estado: estado, MP_status: mp, Total: 89900, Envio: 0, Fecha: "2026-10-20T10:00:00.000Z", Items: JSON.stringify([item("CITRINO")]) });

  const [p1, p2, p3, pJuana, pAjeno] = await Promise.all([
    pedido("MC-ANA-1", "entregado"),
    pedido("MC-ANA-2", "pendiente", ""),
    pedido("MC-ANA-3", "rechazado", "rejected"),
    pedido("MC-JUANA-1", "pagado"),
    pedido("MC-AJENO-1", "pagado"),
  ]);
  // Ana compró con su mail; Juana tiene un mail que contiene el de Ana.
  const ana = await createRecord(TABLAS.clientes, { Email: "Mc.Ana@Ejemplo.com", Pedidos: [p1.id, p2.id, p3.id, pAjeno.id] });
  const juana = await createRecord(TABLAS.clientes, { Email: "juana.mc.ana@ejemplo.com", Pedidos: [pJuana.id] });
  const otro = await createRecord(TABLAS.clientes, { Email: "otro@ejemplo.com", Pedidos: [pAjeno.id] });
  // El enlace del lado del pedido (Airtable lo mantiene solo; acá se escribe a mano).
  const { updateRecord } = await import("../lib/airtable");
  await Promise.all([
    ...[p1, p2, p3].map((p) => updateRecord(TABLAS.pedidos, p.id, { Cliente: [ana.id] })),
    updateRecord(TABLAS.pedidos, pJuana.id, { Cliente: [juana.id] }),
    // Un pedido ajeno que quedó en la lista de Ana por error: igual no se muestra.
    updateRecord(TABLAS.pedidos, pAjeno.id, { Cliente: [otro.id] }),
  ]);

  // Mayúsculas y espacios no cambian nada: es el mismo mail.
  const compras = await comprasDeLaCuenta("  mc.ana@ejemplo.com ");
  assert.deepEqual(compras.map((c) => c.numero), ["MC-ANA-1"], "solo su compra: ni la sin pagar, ni la rechazada, ni la ajena");
  assert.equal(compras[0].estado, "entregado");
  assert.deepEqual(compras[0].items.map((i) => i.nombre), ["CITRINO"]);

  // Juana ve la suya y no la de Ana; un mail sin ficha, nada.
  assert.deepEqual((await comprasDeLaCuenta("juana.mc.ana@ejemplo.com")).map((c) => c.numero), ["MC-JUANA-1"]);
  assert.deepEqual(await comprasDeLaCuenta("nadie@ejemplo.com"), []);
  assert.deepEqual(await comprasDeLaCuenta(""), []);
  // Un texto que no es un mail no busca nada (ni con comillas para romper la fórmula).
  assert.deepEqual(await comprasDeLaCuenta("' OR TRUE() OR '"), []);
});
