// Genera los recortes de la vitrina de la portada, una vez por foto nueva:
//   node scripts/recortes-anteojos.mjs
//
// Por cada color de anteojos con foto de frente (-1) y foto de portada
// (-portada), dos imágenes con el mismo encuadre, para que el interruptor
// «Al sol | Adentro» cambie sin saltos:
//   -frente.webp: el anteojo de frente, con los cristales claros (de la -1).
//   -sol.webp:    el mismo anteojo oscurecido al sol (la parte de arriba de la -portada).
// Fondo blanco, 1200 × 900, el armazón centrado y del mismo ancho en todos.
// Al final escribe lib/recortes-anteojos.ts con la lista de los que existen.
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = "public/productos/anteojos";
const ANCHO = 1200;
const ALTO = 900;
const ANCHO_ARMAZON = 980;
// La -portada lleva arriba el anteojo al sol; el claro empieza más abajo del 40 %.
const ALTO_SOL = 0.4;

async function encuadrar(entrada, salida) {
  const recortado = await sharp(entrada).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 18 }).toBuffer();
  const { width, height } = await sharp(recortado).metadata();
  const escala = ANCHO_ARMAZON / width;
  const alto = Math.min(Math.round(height * escala), ALTO - 80);
  const ancho = Math.round(width * (alto / Math.round(height * escala)) * escala);
  const pieza = await sharp(recortado).resize(ancho, alto).toBuffer();
  await sharp({ create: { width: ANCHO, height: ALTO, channels: 3, background: "#ffffff" } })
    .composite([{ input: pieza, left: Math.round((ANCHO - ancho) / 2), top: Math.round((ALTO - alto) / 2) }])
    .webp({ quality: 82 })
    .toFile(salida);
}

const archivos = await readdir(DIR);
const bases = archivos
  .filter((a) => a.endsWith("-portada.jpg"))
  .map((a) => a.replace(/-portada\.jpg$/, ""))
  .filter((b) => archivos.includes(`${b}-1.jpg`))
  .sort();

for (const base of bases) {
  await encuadrar(path.join(DIR, `${base}-1.jpg`), path.join(DIR, `${base}-frente.webp`));
  const portada = sharp(path.join(DIR, `${base}-portada.jpg`));
  const { width, height } = await portada.metadata();
  const arriba = await portada.extract({ left: 0, top: 0, width, height: Math.round(height * ALTO_SOL) }).toBuffer();
  await encuadrar(arriba, path.join(DIR, `${base}-sol.webp`));
  console.log("listo:", base);
}

await writeFile(
  "lib/recortes-anteojos.ts",
  `// Generado por scripts/recortes-anteojos.mjs: no editar a mano.\n` +
    `/** Los colores de anteojos con recortes -frente y -sol en ${DIR}. */\n` +
    `export const RECORTES_ANTEOJOS: ReadonlySet<string> = new Set(${JSON.stringify(bases, null, 2).replace(/"/g, '"')});\n`
);
console.log(`${bases.length} colores`);
