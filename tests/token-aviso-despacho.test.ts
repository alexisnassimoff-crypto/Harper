import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { tokenAvisoDespachoValido, tokenValido } from "../lib/media";

// Tarea 16: AVISO_DESPACHO_TOKEN, el secreto propio de la automatización
// «Aviso de despacho». Abre SOLO POST /api/pedidos/notificar-envio; las demás
// APIs siguen con tokenValido (SYNC_TOKEN y CRON_SECRET), que no cambia.
// Los valores de acá son de mentira: no son claves reales.

const SYNC = "sync-de-prueba-0123456789";
const CRON = "cron-de-prueba-0123456789";
const AVISO = "aviso-de-prueba-0123456789";

const ANTES = {
  SYNC_TOKEN: process.env.SYNC_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
  AVISO_DESPACHO_TOKEN: process.env.AVISO_DESPACHO_TOKEN,
};

function poner(nombre: keyof typeof ANTES, valor: string | undefined) {
  if (valor === undefined) delete process.env[nombre];
  else process.env[nombre] = valor;
}

beforeEach(() => {
  poner("SYNC_TOKEN", SYNC);
  poner("CRON_SECRET", CRON);
  poner("AVISO_DESPACHO_TOKEN", AVISO);
});

after(() => {
  for (const [nombre, valor] of Object.entries(ANTES)) poner(nombre as keyof typeof ANTES, valor);
});

test("AVISO_DESPACHO_TOKEN abre el aviso de despacho", () => {
  assert.equal(tokenAvisoDespachoValido(AVISO), true);
});

test("AVISO_DESPACHO_TOKEN no abre ninguna otra API (tokenValido no lo acepta)", () => {
  assert.equal(tokenValido(AVISO), false);
});

test("el aviso de despacho sigue aceptando SYNC_TOKEN y CRON_SECRET, y las otras APIs también", () => {
  assert.equal(tokenAvisoDespachoValido(SYNC), true);
  assert.equal(tokenAvisoDespachoValido(CRON), true);
  assert.equal(tokenValido(SYNC), true);
  assert.equal(tokenValido(CRON), true);
});

test("rechaza tokens faltantes, vacíos, equivocados o parecidos", () => {
  for (const recibido of [null, "", " ", "otro", AVISO + "x", AVISO.slice(0, -1), AVISO.toUpperCase(), ` ${AVISO}`]) {
    assert.equal(tokenAvisoDespachoValido(recibido), false, `aceptó ${JSON.stringify(recibido)}`);
  }
});

test("sin AVISO_DESPACHO_TOKEN en Vercel, todo sigue igual que antes", () => {
  for (const sinCargar of [undefined, ""]) {
    poner("AVISO_DESPACHO_TOKEN", sinCargar);
    assert.equal(tokenAvisoDespachoValido(AVISO), false);
    assert.equal(tokenAvisoDespachoValido(""), false);
    assert.equal(tokenAvisoDespachoValido(null), false);
    assert.equal(tokenAvisoDespachoValido(SYNC), true);
    assert.equal(tokenAvisoDespachoValido(CRON), true);
  }
});

test("sin SYNC_TOKEN ni CRON_SECRET, el aviso de despacho acepta solo su secreto", () => {
  poner("SYNC_TOKEN", undefined);
  poner("CRON_SECRET", undefined);
  assert.equal(tokenAvisoDespachoValido(AVISO), true);
  assert.equal(tokenAvisoDespachoValido(SYNC), false);
  assert.equal(tokenAvisoDespachoValido(""), false);
  assert.equal(tokenValido(AVISO), false);
});

// ---------- Que el secreto quede atado a una sola ruta ----------

const RAIZ = path.resolve(__dirname, "..", "..");

function archivosDe(carpeta: string): string[] {
  return fs.readdirSync(path.join(RAIZ, carpeta), { withFileTypes: true }).flatMap((entrada) => {
    const relativo = path.posix.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(relativo);
    return /\.(ts|tsx)$/.test(entrada.name) ? [relativo] : [];
  });
}

const FUENTES = [...archivosDe("app"), ...archivosDe("lib")];
const leer = (archivo: string) => fs.readFileSync(path.join(RAIZ, archivo), "utf8");

test("solo /api/pedidos/notificar-envio usa tokenAvisoDespachoValido, y lo usa para autorizar", () => {
  const usan = FUENTES.filter((f) => f !== "lib/media.ts" && leer(f).includes("tokenAvisoDespachoValido"));
  assert.deepEqual(usan, ["app/api/pedidos/notificar-envio/route.ts"]);

  const ruta = leer("app/api/pedidos/notificar-envio/route.ts");
  assert.match(ruta, /if \(!tokenAvisoDespachoValido\(token\)\)/);
  assert.doesNotMatch(ruta, /\btokenValido\(/);
});

test("AVISO_DESPACHO_TOKEN se lee en un solo lugar (lib/media.ts)", () => {
  const leen = FUENTES.filter((f) => leer(f).includes("process.env.AVISO_DESPACHO_TOKEN"));
  assert.deepEqual(leen, ["lib/media.ts"]);
});
