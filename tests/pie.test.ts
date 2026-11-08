import { test } from "node:test";
import assert from "node:assert/strict";
import { urlDeInstagram } from "../lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA } from "../lib/confianza";

test("el Instagram de Config se acepta como @usuario, usuario o URL", () => {
  assert.equal(urlDeInstagram("@harper.ar"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram("harper.ar"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram("https://instagram.com/harper.ar?igsh=xyz"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram("https://www.instagram.com/harper.ar/"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram(""), "");
  assert.equal(urlDeInstagram(undefined), "");
  assert.equal(urlDeInstagram("javascript:alert(1)"), "", "nada que no sea un usuario");
});

test("los plazos: 10 días corridos para devolver, 30 para cambios, y 6 meses de garantía (04/11/2026)", () => {
  assert.equal(DIAS_ARREPENTIMIENTO, 10);
  assert.equal(DIAS_CAMBIO, 30);
  assert.equal(MESES_GARANTIA, 6);
});

test("el pie muestra el usuario de Instagram de Config, o nada", async () => {
  const { usuarioDeInstagram } = await import("../lib/config");
  assert.equal(usuarioDeInstagram("https://www.instagram.com/theharperbrand/"), "@theharperbrand");
  assert.equal(usuarioDeInstagram("https://www.instagram.com/harper.ar"), "@harper.ar");
  assert.equal(usuarioDeInstagram(""), null);
  assert.equal(usuarioDeInstagram(undefined), null);
  assert.equal(usuarioDeInstagram("https://example.com/harper"), null);
});

test("el pie (Ale, 08/11/2026) conserva los enlaces legales, la ayuda, el contacto y el Data Fiscal", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const pie = readFileSync(join(__dirname, "../../components/Footer.tsx"), "utf8");
  // Legales: los mismos textos y destinos.
  for (const [texto, destino] of [
    ["Términos y condiciones", '"/legales/terminos"'],
    ["Política de privacidad", '"/legales/privacidad"'],
    ["Defensa de las y los Consumidores", "{DEFENSA_CONSUMIDOR}"],
    ["Botón de arrepentimiento", '"/legales/arrepentimiento"'],
  ]) {
    assert.ok(pie.includes(texto), `falta «${texto}»`);
    assert.ok(pie.includes(`href=${destino}`), `falta el destino de «${texto}»`);
  }
  assert.match(pie, /const DEFENSA_CONSUMIDOR = "https:\/\/autogestion\.produccion\.gob\.ar\/consumidores";/);
  assert.match(pie, /<EnlacePreferenciasCookies className="pie__enlace" \/>/);
  // El Botón de arrepentimiento va una sola vez.
  assert.equal(pie.split("/legales/arrepentimiento").length - 1, 1);
  // Ayuda y marca: Mi cuenta, preguntas, cambios y devoluciones, garantía y Quiénes somos.
  for (const destino of ['"/suscriptores/mi-cuenta"', '"/preguntas-frecuentes"', '"/legales/devoluciones"', '"/legales/devoluciones#garantia"', '"/quienes-somos"']) {
    assert.ok(pie.includes(`href=${destino}`), `falta ${destino}`);
  }
  // Tienda: las categorías del catálogo, no una lista fija.
  assert.match(pie, /categorias\.map\(\(c\) =>/);
  // Contacto, solo con los datos de Config.
  assert.match(pie, /config\.instagram \?/);
  assert.match(pie, /config\.whatsapp \? `https:\/\/wa\.me\/\$\{config\.whatsapp\}`/);
  assert.match(pie, /mailto:\$\{config\.emailContacto\}/);
  // Medios de pago y Data Fiscal de ARCA, como estaban.
  assert.match(pie, /<MediosDePago className="pie__pagos" \/>/);
  assert.match(pie, /leerDataFiscal\(config\.dataFiscal\)/);
  assert.match(pie, /aria-label="Data Fiscal \(ARCA\): información fiscal del vendedor"/);
  // Sin el programa nuevo, sin © con datos del vendedor y sin teléfonos, direcciones ni horarios inventados.
  // (Se mira el código sin los comentarios, que explican justamente por qué no van.)
  const sinComentarios = pie.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(sinComentarios, /Cr[ée]dito Harper|D[úu]o\b|©|horario|Lunes|\+54|calle/i);
});
