import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";

import { createRecord, TABLAS } from "../lib/airtable";
import { cumpleFormula } from "../lib/fixtures/formula";
import {
  cancelacionConPago,
  comprasDeLaCuenta,
  comprasDeLosClientes,
  compraDe,
  estadoDeCompra,
  etapasDeCompra,
  itemsDeCompra,
  MAXIMO_DE_COMPRAS,
  seguimientoDe,
  type FilaPedidoDeCompra,
} from "../lib/mis-compras";
import { marcaDeReclamo } from "../lib/webhook-decision";

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

// ---- Cancelados (Ale, 06/11/2026): sin ningún pago no son compras; cobrados, sí ----

/** Lo que ve el cliente de un pedido con esos campos: su estado, o null si no aparece. */
const verComo = (campos: FilaPedidoDeCompra) => compraDe({ id: "recPRUEBACOMPRA01", fields: { Numero: "X", Total: 100, ...campos } })?.estado ?? null;

test("mis compras: un cancelado que nunca tuvo un pago no aparece", () => {
  for (const campos of [
    { MP_status: "sin preferencia de pago" }, // el checkout lo anuló antes de cobrar
    { MP_status: "carrito abandonado, nunca se pago" }, // nota a mano, sin pago registrado
    { MP_status: "pagando con saldo, sin Mercado Pago" }, // el pago con saldo no llegó a confirmarse
    { MP_status: "cancelled" },
    { MP_status: "rejected (cc_rejected_other_reason)" },
    { MP_status: "" },
    {},
  ]) {
    assert.equal(verComo({ Estado: "cancelado", ...campos }), null, JSON.stringify(campos));
    assert.equal(cancelacionConPago(campos), false, JSON.stringify(campos));
  }
});

test("mis compras: un cancelado que se cobró sigue apareciendo, aunque se haya devuelto la plata", () => {
  for (const campos of [
    { MP_payment_id: "100000000001", MP_status: "approved" },
    // La nota que se escribió a mano en un pedido cobrado y devuelto: manda el pago registrado.
    { MP_payment_id: "100000000002", MP_status: "prueba interna de cobro (approved, devolver los $100)" },
    // El webhook puede dejar el MP_status vacío (o en un estado intermedio) en un pedido ya cobrado.
    { MP_payment_id: "100000000003", MP_status: "" },
    { MP_payment_id: "100000000004", MP_status: "in_process" },
    // Estados a los que Mercado Pago llega solo después de aprobar el pago.
    { MP_status: "refunded" },
    { MP_status: "charged_back" },
    { MP_status: "in_mediation" },
    // Pagado con saldo, sin Mercado Pago.
    { MP_status: "pagado con saldo, sin Mercado Pago" },
    // Marcas del webhook sobre un pago: las mira una persona.
    { MP_status: "revisar: se cobró 1000 y el pedido dice 900" },
    { MP_status: marcaDeReclamo({ pagoId: "100000000005", nonce: "abc", desde: 1, pasos: [] }) },
  ]) {
    assert.equal(verComo({ Estado: "cancelado", ...campos }), "cancelado", JSON.stringify(campos));
    assert.equal(cancelacionConPago(campos), true, JSON.stringify(campos));
  }
});

test("mis compras: los pagos en revisión y los demás estados no cambian", () => {
  assert.equal(verComo({ Estado: "pendiente", MP_status: "in_process" }), "en-revision");
  assert.equal(verComo({ Estado: "pendiente", MP_status: "pending", MP_payment_id: "100000000006" }), "en-revision");
  assert.equal(verComo({ Estado: "pendiente", MP_status: "in_mediation" }), "en-revision");
  // Pagado, preparando, enviado y entregado se muestran por su Estado, haya o no datos de pago.
  for (const estado of ["pagado", "preparando", "enviado", "entregado"]) assert.equal(verComo({ Estado: estado }), estado);
  // Sin pagar y rechazado siguen afuera, aunque tengan un pago registrado.
  assert.equal(verComo({ Estado: "pendiente", MP_payment_id: "100000000007" }), null);
  assert.equal(verComo({ Estado: "rechazado", MP_status: "rejected", MP_payment_id: "100000000008" }), null);
});

test("mis compras: con los pedidos de prueba de Ale (06/11/2026) se ven los 2 pagados y los 2 cancelados que se cobraron", () => {
  const CLIENTE = "recCLIENTEPRUEBA1";
  const fila = (id: string, numero: string, estado: string, fecha: string, mp: string, pago?: string) => ({
    id,
    fields: { Numero: numero, Estado: estado, Cliente: [CLIENTE], Fecha: fecha, Total: 100, MP_status: mp, ...(pago ? { MP_payment_id: pago } : {}) },
  });
  const filas = [
    fila("recPRUEBACOMPRA02", "HARPER-39296U9", "pagado", "2026-10-30T05:48:16.316Z", "approved", "100000000011"),
    fila("recPRUEBACOMPRA03", "HARPER-24513SP", "pagado", "2026-08-25T02:21:53.142Z", "approved", "100000000012"),
    fila("recPRUEBACOMPRA04", "HARPER-2436778", "cancelado", "2026-08-25T02:19:27.073Z", "carrito abandonado de la prueba, no se pago"),
    fila("recPRUEBACOMPRA05", "HARPER-956523Y", "cancelado", "2026-08-24T18:20:52.514Z", "prueba interna de mails (approved, devolver los $100)", "100000000013"),
    fila("recPRUEBACOMPRA06", "HARPER-89105UU", "cancelado", "2026-08-24T16:31:45.918Z", "carrito abandonado, nunca se pago"),
    fila("recPRUEBACOMPRA07", "HARPER-8812049", "cancelado", "2026-08-24T16:15:20.846Z", "prueba interna de cobro (approved, devolver los $100)", "100000000014"),
    fila("recPRUEBACOMPRA08", "HARPER-877652V", "cancelado", "2026-08-24T16:09:25.543Z", "prueba interna, nunca se pago"),
    fila("recPRUEBACOMPRA09", "HARPER-52334PH", "pendiente", "2026-11-05T04:18:54.663Z", ""),
  ];
  assert.deepEqual(
    comprasDeLosClientes(new Set([CLIENTE]), filas).map((c) => `${c.numero} ${c.estado}`),
    ["HARPER-39296U9 pagado", "HARPER-24513SP pagado", "HARPER-956523Y cancelado", "HARPER-8812049 cancelado"],
  );
});

test("mis compras: el recorrido sale solo del Estado de Airtable, sin pasos inventados", () => {
  const pasos = (e: Parameters<typeof etapasDeCompra>[0]) => etapasDeCompra(e)?.map((x) => `${x.etapa}:${x.paso}`) ?? null;
  assert.deepEqual(pasos("pagado"), ["pagado:actual", "preparando:pendiente", "enviado:pendiente", "entregado:pendiente"]);
  assert.deepEqual(pasos("preparando"), ["pagado:hecha", "preparando:actual", "enviado:pendiente", "entregado:pendiente"]);
  assert.deepEqual(pasos("enviado"), ["pagado:hecha", "preparando:hecha", "enviado:actual", "entregado:pendiente"]);
  assert.deepEqual(pasos("entregado"), ["pagado:hecha", "preparando:hecha", "enviado:hecha", "entregado:actual"]);
  // El pago en revisión y la cancelación no tienen recorrido: se muestran con su aviso.
  assert.equal(etapasDeCompra("en-revision"), null);
  assert.equal(etapasDeCompra("cancelado"), null);
});

test("mis compras: el seguimiento es un número para copiar, y un enlace solo si es de un operador conocido", () => {
  assert.deepEqual(seguimientoDe("CA123456789AR"), { numero: "CA123456789AR", enlace: null });
  assert.deepEqual(seguimientoDe("  360000012345678 "), { numero: "360000012345678", enlace: null });
  assert.deepEqual(seguimientoDe(null), { numero: null, enlace: null });
  assert.deepEqual(seguimientoDe("   "), { numero: null, enlace: null });
  // Enlaces de los operadores: «Seguir mi envío».
  assert.equal(seguimientoDe("https://www.andreani.com/envio/360000012345678").enlace, "https://www.andreani.com/envio/360000012345678");
  assert.equal(seguimientoDe("https://www.correoargentino.com.ar/formularios/e-commerce?id=CA1").enlace?.startsWith("https://www.correoargentino.com.ar/"), true);
  // Nada que no sea https de un operador conocido se ofrece como enlace (ni se muestra como número).
  assert.deepEqual(seguimientoDe("http://www.andreani.com/envio/1"), { numero: null, enlace: null });
  assert.deepEqual(seguimientoDe("https://andreani.com.estafa.io/envio/1"), { numero: null, enlace: null });
  assert.deepEqual(seguimientoDe("https://otro-sitio.com/seguimiento"), { numero: null, enlace: null });
  assert.deepEqual(seguimientoDe("javascript:alert(1)"), { numero: null, enlace: null });
  assert.deepEqual(seguimientoDe("<script>"), { numero: null, enlace: null });
});
