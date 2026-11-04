// La letra de los títulos: Melodrama, de Fontshare (Indian Type Foundry), con
// la ITF Free Font License 2.0 (Ale, 04/11/2026: «otra lo más parecida posible
// a Safira March y que sea gratis»). La licencia deja usarla gratis en la tienda
// y alojarla en el propio sitio, pero no repartirla en un repositorio público
// ni modificar el archivo. Por eso el .woff2 no está en el repo: se baja de
// Fontshare al compilar, tal cual lo entrega Fontshare, a app/fuentes/ (que
// git ignora), y next/font/local lo sirve desde harper.ar.
//
// Si no se puede bajar, la compilación se corta con un mensaje claro: mejor
// que publicar el sitio con otra letra en los títulos.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const DESTINO = new URL("../app/fuentes/melodrama.woff2", import.meta.url);
const CSS = "https://api.fontshare.com/v2/css?f[]=melodrama@1&display=swap";

const esWoff2 = (datos) => datos.length > 10_000 && datos.subarray(0, 4).toString("latin1") === "wOF2";

if (existsSync(DESTINO) && esWoff2(readFileSync(DESTINO))) process.exit(0);

async function bajar() {
  const css = await (await fetch(CSS, { signal: AbortSignal.timeout(15_000) })).text();
  const ruta = css.match(/url\('(\/\/cdn\.fontshare\.com\/[^']+\.woff2)'\)/)?.[1];
  if (!ruta) throw new Error("Fontshare no devolvió la dirección del .woff2");
  const respuesta = await fetch(`https:${ruta}`, { signal: AbortSignal.timeout(30_000) });
  if (!respuesta.ok) throw new Error(`Fontshare respondió ${respuesta.status}`);
  const datos = Buffer.from(await respuesta.arrayBuffer());
  if (!esWoff2(datos)) throw new Error("lo que bajó no es un .woff2");
  return datos;
}

let ultimo;
for (let intento = 1; intento <= 3; intento++) {
  try {
    const datos = await bajar();
    mkdirSync(new URL(".", DESTINO), { recursive: true });
    const temporal = new URL("melodrama.woff2.tmp", DESTINO);
    writeFileSync(temporal, datos);
    renameSync(temporal, DESTINO);
    console.log(`Melodrama bajada de Fontshare (${datos.length} bytes).`);
    process.exit(0);
  } catch (error) {
    ultimo = error;
    await new Promise((r) => setTimeout(r, 2000 * intento));
  }
}
console.error(`No se pudo bajar Melodrama de Fontshare: ${ultimo?.message ?? ultimo}`);
process.exit(1);
