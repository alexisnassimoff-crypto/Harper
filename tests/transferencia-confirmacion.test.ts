import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Contra el Airtable en memoria, con el cerrojo en memoria: el mismo camino
// que un pago aprobado del webhook.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { createRecord, getRecord, TABLAS } from "../lib/airtable";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { reiniciar } from "../lib/fixtures/servidor";
import type { ItemResuelto } from "../lib/tipos";
import { NOTA_TRANSFERENCIA } from "../lib/transferencia";
import { confirmarTransferencia, enlaceDeConfirmacion, firmaValida } from "../lib/transferencia-servidor";
import type { Dependencias, FilaPedido } from "../lib/webhook-proceso";

type Mail = Parameters<Dependencias["enviarMail"]>[0];

const AMATISTA_NEGRO = "recLvS1Rce368QVeX";

const ITEM: ItemResuelto = {
  productoId: "recPJzzJFhyEF0DMw",
  productoSlug: "amatista",
  nombre: "AMATISTA",
  categoria: "Anteojos",
  varianteId: AMATISTA_NEGRO,
  sku: "AMATISTA-NEGRO",
  color: "Negro",
  foto: null,
  precioLista: 89900,
  precioUnitario: 72819,
  descuento: 10,
  descuentoTransferencia: 10,
  cantidad: 1,
  subtotal: 72819,
  stockDisponible: 12,
};

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
});

async function crearPedido(numero: string, campos: Partial<FilaPedido> = {}) {
  const cliente = await createRecord(TABLAS.clientes, { Email: "prueba@harper.ar", Nombre: "Prueba Harper" });
  const pedido = await createRecord<FilaPedido>(TABLAS.pedidos, {
    Numero: numero,
    Estado: "pendiente",
    Cliente: [cliente.id],
    Items: JSON.stringify([ITEM]),
    Subtotal: 72819,
    Envio: 0,
    Total: 72819,
    Medio_pago: "Transferencia",
    ...campos,
  });
  return pedido.id;
}

function dependencias() {
  const mails: Mail[] = [];
  let t = 1_761_000_000_000;
  const reloj = { ahora: () => t, dormir: async (ms: number) => void (t += ms) };
  const extra: Partial<Dependencias> = {
    cerrojo: cerrojoEnMemoria(reloj),
    enviarMail: async (mail: Mail) => {
      mails.push(mail);
      return true;
    },
    mailsConfigurados: () => true,
    reloj,
    esperaReclamoMs: 10,
    esperaOcupadoMs: 1_000,
    alConfirmar: async () => {},
  };
  return { extra, mails };
}

const stockDe = async (id: string) => (await getRecord<{ Stock?: number }>(TABLAS.variantes, id)).fields.Stock;

test("el enlace va firmado para ese pedido: otro número o una firma tocada no sirven", () => {
  const enlace = new URL(enlaceDeConfirmacion("https://harper.ar", "HARPER-12345AB")!);
  assert.equal(enlace.pathname, "/transferencia/confirmar");
  const firma = enlace.searchParams.get("firma")!;
  assert.equal(firmaValida("HARPER-12345AB", firma), true);
  assert.equal(firmaValida("HARPER-12345AC", firma), false);
  assert.equal(firmaValida("HARPER-12345AB", `${firma.slice(0, -1)}x`), false);
  assert.equal(firmaValida("HARPER-12345AB", ""), false);
});

test("confirmar una transferencia: pagado, stock descontado una vez, mails de siempre; el segundo click no repite nada", async () => {
  const pedidoId = await crearPedido("HARPER-TR1");
  const antes = await stockDe(AMATISTA_NEGRO);
  const { extra, mails } = dependencias();

  assert.deepEqual(await confirmarTransferencia("HARPER-TR1", "https://harper.ar", extra), { estado: "confirmada" });

  const pedido = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
  assert.equal(pedido.fields.Estado, "pagado");
  assert.equal(pedido.fields.MP_payment_id, `transferencia-${pedidoId}`);
  assert.equal(pedido.fields.MP_status, "approved");
  assert.equal(await stockDe(AMATISTA_NEGRO), (antes ?? 0) - 1);
  assert.deepEqual(
    mails.map((m) => m.para),
    ["prueba@harper.ar", "harpercaseseyewear@gmail.com"],
    "confirmación al comprador y aviso de venta a Harper"
  );
  assert.match(mails[1].asunto, /^Venta HARPER-TR1 .* · transferencia/);
  assert.match(mails[0].texto, /10% off \+ 10% por transferencia/);

  assert.deepEqual(await confirmarTransferencia("HARPER-TR1", "https://harper.ar", extra), { estado: "ya-confirmada" });
  assert.equal(await stockDe(AMATISTA_NEGRO), (antes ?? 0) - 1, "no se descuenta dos veces");
  assert.equal(mails.length, 2);
});

test("el pedido en Notas (sin el campo Medio_pago) también se confirma", async () => {
  await crearPedido("HARPER-TR2", { Medio_pago: undefined, Notas: `${NOTA_TRANSFERENCIA}\nVence: martes 27/10, 15:40` });
  const { extra } = dependencias();
  assert.deepEqual(await confirmarTransferencia("HARPER-TR2", "https://harper.ar", extra), { estado: "confirmada" });
});

test("no se confirma un pedido de Mercado Pago, uno cancelado ni uno que no existe", async () => {
  const { extra, mails } = dependencias();
  await crearPedido("HARPER-MP1", { Medio_pago: "Mercado Pago" });
  await crearPedido("HARPER-TR3", { Estado: "cancelado" });

  assert.deepEqual(await confirmarTransferencia("HARPER-MP1", "https://harper.ar", extra), { estado: "no-es-transferencia" });
  assert.deepEqual(await confirmarTransferencia("HARPER-TR3", "https://harper.ar", extra), {
    estado: "cerrado",
    estadoPedido: "cancelado",
  });
  assert.deepEqual(await confirmarTransferencia("HARPER-NO", "https://harper.ar", extra), { estado: "no-existe" });
  assert.equal(mails.length, 0);
});
