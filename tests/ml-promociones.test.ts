import { test } from "node:test";
import assert from "node:assert/strict";
import {
  descuento,
  filasDePromociones,
  escalonCruzado,
  fechaCorta,
  leerPromociones,
  nombreDeTipo,
  paginaDePromociones,
  separarPromociones,
  type PublicacionConPromo,
} from "../lib/ml-promociones";

test("las promociones de una publicación, vengan en lista o en results", () => {
  const lista = leerPromociones([
    {
      id: "P-MLA1",
      type: "DEAL",
      name: "Cyber Monday",
      status: "pending",
      price: 7_120,
      original_price: 8_900,
      start_date: "2026-11-02T00:00:00-03:00",
      finish_date: "2026-11-04T23:59:59-03:00",
    },
    { id: "C-MLA2", type: "MARKETPLACE_CAMPAIGN", status: "candidate", meli_percentage: 5, seller_percentage: 10, price: 7_565 },
    { status: "started" },
  ]);
  assert.equal(lista.length, 2);
  const { crudo, ...primera } = lista[0];
  assert.ok(crudo.includes("Cyber Monday"));
  assert.deepEqual(primera, {
    id: "P-MLA1",
    tipo: "DEAL",
    nombre: "Cyber Monday",
    estado: "pending",
    precio: 7_120,
    precioOriginal: 8_900,
    desde: "2026-11-02T00:00:00-03:00",
    hasta: "2026-11-04T23:59:59-03:00",
    aporteML: null,
    aporteVendedor: null,
  });
  assert.equal(lista[1].aporteML, 5);
  // Una invitación sin price trae el precio sugerido.
  assert.equal(leerPromociones([{ type: "DEAL", status: "candidate", suggested_discounted_price: 7_300 }])[0].precio, 7_300);
  assert.equal(lista[1].aporteVendedor, 10);
  assert.equal(leerPromociones({ results: [{ type: "PRICE_DISCOUNT", status: "started", price: 1 }] }).length, 1);
  assert.deepEqual(leerPromociones(null), []);
});

test("el descuento se calcula contra el precio original o, si falta, contra el de lista", () => {
  const promo = leerPromociones([{ type: "DEAL", status: "started", price: 7_120, original_price: 8_900 }])[0];
  assert.equal(descuento(promo, null), 20);
  const sinOriginal = leerPromociones([{ type: "PRICE_DISCOUNT", status: "started", price: 71_920 }])[0];
  assert.equal(descuento(sinOriginal, 89_900), 20);
  assert.equal(descuento(sinOriginal, null), null);
  assert.equal(descuento({ ...sinOriginal, precio: 90_000 }, 89_900), null);
});

test("avisa cuando la promoción cruza un escalón de costos de ML", () => {
  assert.match(escalonCruzado(29_900, 23_920) ?? "", /24\.000/);
  assert.equal(escalonCruzado(29_900, 24_000), null);
  assert.match(escalonCruzado(89_900, 30_000) ?? "", /33\.000/);
  assert.equal(escalonCruzado(8_900, 7_120), null);
  assert.equal(escalonCruzado(null, 7_120), null);
});

test("nombres, fechas y separación entre activas e invitaciones", () => {
  assert.equal(nombreDeTipo("DEAL"), "Campaña de ML");
  assert.equal(nombreDeTipo("RARO"), "RARO");
  assert.equal(fechaCorta("2026-11-02T03:00:00Z"), "2/11, 00:00");
  assert.equal(fechaCorta(null), "—");
  assert.equal(fechaCorta("cualquiera"), "cualquiera");

  const pubs: PublicacionConPromo[] = [
    {
      id: "MLA1",
      titulo: "Rectangular",
      precioLista: 8_900,
      promociones: leerPromociones([
        { type: "DEAL", status: "started", price: 7_120 },
        { type: "MARKETPLACE_CAMPAIGN", status: "candidate", price: 7_500 },
        { type: "DEAL", status: "finished", price: 6_000 },
      ]),
    },
  ];
  const { activas, invitaciones } = separarPromociones(pubs);
  assert.equal(activas.length, 1);
  assert.equal(invitaciones.length, 1);
});

test("la página muestra el descuento, el aviso de escalón y escapa los títulos", () => {
  const html = paginaDePromociones({
    fecha: "1/11/26 12:00",
    publicaciones: [
      {
        id: "MLA1",
        titulo: "Paños <b>",
        precioLista: 29_900,
        promociones: leerPromociones([{ type: "PRICE_DISCOUNT", status: "pending", price: 23_920, original_price: 29_900, meli_percentage: 0 }]),
      },
    ],
    errores: [{ id: "MLA2", titulo: "Otro", detalle: "Mercado Libre 403 (forbidden)" }],
  });
  assert.ok(html.includes("Paños &lt;b&gt;"));
  assert.ok(html.includes("programada"));
  assert.ok(html.includes("20%"));
  assert.ok(html.includes("$23.920"));
  assert.ok(html.includes("baja de $24.000"));
  assert.ok(html.includes("No se pudieron leer (1)"));

  const vacia = paginaDePromociones({ fecha: "x", publicaciones: [], errores: [] });
  assert.ok(vacia.includes("Ninguna publicación tiene una promoción activa o programada"));
});

test("las filas para Airtable: una por publicación y promoción, con clave única", () => {
  const filas = filasDePromociones(
    [
      {
        id: "MLA1",
        titulo: "Paños",
        precioLista: 29_900,
        promociones: leerPromociones([
          { id: "P-1", type: "PRICE_DISCOUNT", status: "pending", price: 23_920, start_date: "2026-11-02", finish_date: "2026-11-04" },
          { type: "DEAL", status: "candidate", price: 25_000 },
        ]),
      },
    ],
    Date.parse("2026-11-01T15:00:00Z")
  );
  assert.equal(filas.length, 2);
  assert.equal(filas[0].Clave, "MLA1 · P-1");
  assert.equal(filas[1].Clave, "MLA1 · DEAL-1");
  assert.equal(filas[0].Tipo, "Descuento propio");
  assert.equal(filas[0].Descuento, 20);
  assert.match(filas[0].Escalon ?? "", /24\.000/);
  assert.equal(filas[0].Precio_lista, 29_900);
  assert.equal(filas[0].Actualizado, "2026-11-01T15:00:00.000Z");
});
