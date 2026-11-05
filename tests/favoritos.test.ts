import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
delete process.env.VERCEL;

import { getRecord, TABLAS } from "../lib/airtable";
import { getProductos } from "../lib/catalogo";
import { SUSCRIPTOR_ANA, SUSCRIPTOR_BETO } from "../lib/fixtures/datos";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import {
  cambiarFavorito,
  escribirFavoritos,
  favoritosDelCatalogo,
  leerFavoritos,
  MAXIMO_DE_FAVORITOS,
  normalizarSku,
  skusDeAnteojos,
} from "../lib/favoritos";
import { aplicarFavorito, leerPedidoDeFavorito } from "../lib/favoritos-servidor";
import { suscriptorDeLaSesion, suscriptorPorId } from "../lib/suscriptores-cuenta";
import { claveDeSesionSuscriptor, crearSesionSuscriptor } from "../lib/suscriptores-sesion";

/** «Mis favoritos» de Mi cuenta Harper (Ale, 05/11/2026). */

beforeEach(() => {
  reiniciar();
  interceptar(null);
});

const filaDe = async (id: string) => (await getRecord<{ Favoritos?: string }>(TABLAS.suscriptores, id)).fields;

test("favoritos: se leen un SKU por renglón, en mayúsculas, sin repetidos ni basura", () => {
  assert.deepEqual(leerFavoritos("CITRINO-CAREY\n amatista-gris \n\nCITRINO-CAREY\n<script>\nOBSIDIANA-NEGRO"), [
    "CITRINO-CAREY",
    "AMATISTA-GRIS",
    "OBSIDIANA-NEGRO",
  ]);
  assert.deepEqual(leerFavoritos(undefined), []);
  assert.deepEqual(leerFavoritos(""), []);
  assert.deepEqual(leerFavoritos(42), []);
  // Una fila con de más (cargada a mano) se lee hasta el máximo.
  const muchos = Array.from({ length: MAXIMO_DE_FAVORITOS + 10 }, (_, i) => `MODELO-${i}`).join("\n");
  assert.equal(leerFavoritos(muchos).length, MAXIMO_DE_FAVORITOS);
  assert.equal(normalizarSku("' OR TRUE() OR '"), null);
  assert.equal(normalizarSku("  citrino-carey "), "CITRINO-CAREY");
});

test("favoritos: el corazón suma adelante, no duplica, saca, y al pasarse se va el más viejo", () => {
  assert.deepEqual(cambiarFavorito(["A-1"], "b-2", true), ["B-2", "A-1"]);
  assert.deepEqual(cambiarFavorito(["B-2", "A-1"], "A-1", true), ["B-2", "A-1"], "tocar dos veces no lo mueve");
  assert.deepEqual(cambiarFavorito(["B-2", "A-1"], "b-2", false), ["A-1"]);
  assert.deepEqual(cambiarFavorito(["A-1"], "NO-ESTA", false), ["A-1"]);
  assert.deepEqual(cambiarFavorito(["A-1"], "no vale", true), ["A-1"]);
  const llena = Array.from({ length: MAXIMO_DE_FAVORITOS }, (_, i) => `M-${i}`);
  const despues = cambiarFavorito(llena, "NUEVO-1", true);
  assert.equal(despues.length, MAXIMO_DE_FAVORITOS);
  assert.equal(despues[0], "NUEVO-1");
  assert.ok(!despues.includes(`M-${MAXIMO_DE_FAVORITOS - 1}`));
  assert.equal(escribirFavoritos(["B-2", "A-1"]), "B-2\nA-1");
});

test("favoritos: Mi cuenta muestra foto, modelo, color, precio y la ficha en ese color; solo anteojos publicados", async () => {
  const productos = await getProductos();
  const vista = favoritosDelCatalogo(["AMATISTA-GRIS", "R100-MARRON", "YA-NO-EXISTE", "CITRINO-CAREY"], productos);
  assert.deepEqual(
    vista.map((f) => `${f.modelo} ${f.color}`),
    ["AMATISTA Gris traslúcido", "CITRINO Carey"],
    "en el orden guardado, sin el estuche ni el que ya no está"
  );
  const [amatista, citrino] = vista;
  assert.equal(amatista.precio, productos.find((p) => p.slug === "amatista")!.precio);
  assert.match(amatista.enlace, /^\/producto\/amatista(\/amatista-gris)?$/);
  assert.ok(amatista.foto && amatista.foto.startsWith("/productos/anteojos/"));
  assert.ok(amatista.tinte.startsWith("#"));
  assert.equal(citrino.sku, "CITRINO-CAREY");
  // Los SKU que se pueden sumar: todos los colores de anteojos, ninguno de estuches o paños.
  const skus = skusDeAnteojos(productos);
  assert.ok(skus.has("CITRINO-NEGRO"));
  assert.ok(!skus.has("R100-MARRON"));
  assert.ok(!skus.has("PANO-ALTA-NEGRO"));
});

test("favoritos: el pedido del corazón tiene que ser { sku, favorito: true | false }", () => {
  assert.deepEqual(leerPedidoDeFavorito({ sku: "citrino-carey", favorito: true }), { sku: "CITRINO-CAREY", quiere: true });
  assert.deepEqual(leerPedidoDeFavorito({ sku: "CITRINO-CAREY", favorito: false }), { sku: "CITRINO-CAREY", quiere: false });
  assert.equal(leerPedidoDeFavorito({ sku: "CITRINO-CAREY", favorito: "si" }), null);
  assert.equal(leerPedidoDeFavorito({ sku: "", favorito: true }), null);
  assert.equal(leerPedidoDeFavorito(null), null);
  assert.equal(leerPedidoDeFavorito("CITRINO-CAREY"), null);
});

test("favoritos: se guardan en la fila de la cuenta de la sesión y en ninguna otra", async () => {
  // La sesión de Ana, como la lee la ruta (la cookie firmada, releída de Airtable).
  const valor = crearSesionSuscriptor(claveDeSesionSuscriptor()!, { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" });
  const ana = await suscriptorDeLaSesion(valor);
  assert.ok(ana);
  assert.deepEqual(ana.favoritos, ["CITRINO-CAREY", "AMATISTA-GRIS", "OBSIDIANA-NEGRO"]);

  const sumar = await aplicarFavorito(ana, { sku: "CUARZO-NEGRO", quiere: true });
  assert.deepEqual(sumar, { estado: "ok", favoritos: ["CUARZO-NEGRO", "CITRINO-CAREY", "AMATISTA-GRIS", "OBSIDIANA-NEGRO"] });
  assert.equal((await filaDe(SUSCRIPTOR_ANA)).Favoritos, "CUARZO-NEGRO\nCITRINO-CAREY\nAMATISTA-GRIS\nOBSIDIANA-NEGRO");
  // La de Beto no se tocó.
  assert.equal((await filaDe(SUSCRIPTOR_BETO)).Favoritos, undefined);

  // Sacar, con la fila otra vez fresca (como en cada pedido a la ruta).
  const sacar = await aplicarFavorito((await suscriptorPorId(SUSCRIPTOR_ANA))!, { sku: "CITRINO-CAREY", quiere: false });
  assert.deepEqual(sacar, { estado: "ok", favoritos: ["CUARZO-NEGRO", "AMATISTA-GRIS", "OBSIDIANA-NEGRO"] });

  // Un estuche no se suma; uno que ya no se vende sí se puede sacar.
  assert.deepEqual(await aplicarFavorito((await suscriptorPorId(SUSCRIPTOR_ANA))!, { sku: "R100-MARRON", quiere: true }), { estado: "no-es-anteojo" });
  assert.deepEqual(await aplicarFavorito((await suscriptorPorId(SUSCRIPTOR_ANA))!, { sku: "YA-NO-EXISTE", quiere: false }), {
    estado: "ok",
    favoritos: ["CUARZO-NEGRO", "AMATISTA-GRIS", "OBSIDIANA-NEGRO"],
  });
  // Sin catálogo no se suma nada.
  assert.deepEqual(await aplicarFavorito((await suscriptorPorId(SUSCRIPTOR_ANA))!, { sku: "CUARZO-AMBAR", quiere: true }, async () => []), {
    estado: "sin-catalogo",
  });
});

test("favoritos: tocar el mismo corazón dos veces no escribe de nuevo en Airtable", async () => {
  const escrituras: string[] = [];
  interceptar((path, { method }) => {
    if (method === "PATCH") escrituras.push(path);
  });
  const ana = (await suscriptorPorId(SUSCRIPTOR_ANA))!;
  assert.deepEqual(await aplicarFavorito(ana, { sku: "CITRINO-CAREY", quiere: true }), {
    estado: "ok",
    favoritos: ["CITRINO-CAREY", "AMATISTA-GRIS", "OBSIDIANA-NEGRO"],
  });
  assert.deepEqual(escrituras, []);
});

test("favoritos: si falta el campo «Favoritos» en Airtable, el error sube y la cuenta sigue leyéndose", async () => {
  interceptar((_path, { method }) => {
    if (method === "PATCH") throw new RespuestaFixture(422, JSON.stringify({ error: { type: "UNKNOWN_FIELD_NAME", message: 'Unknown field name: "Favoritos"' } }));
  });
  const beto = (await suscriptorPorId(SUSCRIPTOR_BETO))!;
  assert.deepEqual(beto.favoritos, [], "una fila sin el campo, sin favoritos");
  await assert.rejects(aplicarFavorito(beto, { sku: "CITRINO-NEGRO", quiere: true }), /422/);
});
