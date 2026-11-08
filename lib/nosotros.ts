import type { Producto, Variante } from "./tipos";
import { indiceVarianteInicial, rutaDeVariante } from "./variantes";
import { baseDeFoto, FORMAS, fotosDeVitrina, tinteDeColor } from "./vitrina";

/**
 * Quiénes somos, página editorial (Ale, 08/11/2026): lo que no depende de
 * React. Todo sale del catálogo: los modelos, los colores con stock, sus
 * fotos reales y sus enlaces. Lo que se ve, se puede comprar.
 */

/** "CITRINO" → "Citrino". */
export const nombreDeModelo = (nombre: string) => nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();

/** La foto de un color con ese número al final («-3»), si es una foto de anteojos de la tienda. */
function fotoNumero(variante: Pick<Variante, "fotos">, numero: number): string | null {
  const patron = new RegExp(`-${numero}\\.(?:webp|jpe?g|png)$`, "i");
  return variante.fotos.find((f) => baseDeFoto(f) !== null && patron.test(f)) ?? null;
}

export type PiezaDelMosaico = {
  clave: string;
  src: string;
  alt: string;
  /** «Citrino · Carey»: el pie de la foto. */
  pie: string;
  enlace: string;
  tinte: string;
  /** La primera es la grande: un detalle de cerca (la patilla con el logo). */
  detalle: boolean;
};

/**
 * Las fotos de la apertura: una grande y dos chicas, todas de colores con
 * stock y de modelos distintos.
 *
 *  - La grande: el carey con stock (el color más vistoso), de cerca («-3»:
 *    la bisagra y el logo en la patilla). Sin carey, el primer color con stock.
 *  - Las chicas: otros dos modelos, en el color con el que abre su ficha, de
 *    tres cuartos («-2»), para que se vea la forma entera.
 *
 * Sin la foto de cerca o la de tres cuartos, va la primera foto del color.
 */
export function mosaicoDeNosotros(modelos: Producto[]): PiezaDelMosaico[] {
  const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const conFoto = (v: Variante) => !v.agotada && v.fotos.length > 0;

  const opciones = modelos.flatMap((m, i) => m.variantes.map((v, j) => ({ m, i, v, j }))).filter((o) => conFoto(o.v));
  const principal = opciones.find((o) => plano(o.v.color).startsWith("carey")) ?? opciones[0];
  if (!principal) return [];

  const pieza = (o: (typeof opciones)[number], detalle: boolean): PiezaDelMosaico => {
    const nombre = nombreDeModelo(o.m.nombre);
    const src = (detalle ? (fotoNumero(o.v, 3) ?? fotoNumero(o.v, 2)) : fotoNumero(o.v, 2)) ?? o.v.fotos[0];
    return {
      clave: o.v.id,
      src,
      alt: detalle ? `${nombre} en ${o.v.color.toLowerCase()}, de cerca` : `${nombre} en ${o.v.color.toLowerCase()}`,
      pie: `${nombre} · ${o.v.color}`,
      enlace: rutaDeVariante(o.m, o.j),
      tinte: tinteDeColor(o.m.slug, o.v.color, o.i),
      detalle,
    };
  };

  const chicas = modelos
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.id !== principal.m.id)
    .flatMap(({ m, i }) => {
      const inicial = indiceVarianteInicial(m);
      const j = conFoto(m.variantes[inicial]) ? inicial : m.variantes.findIndex(conFoto);
      return j >= 0 ? [{ m, i, v: m.variantes[j], j }] : [];
    })
    .slice(0, 2);

  return [pieza(principal, true), ...chicas.map((o) => pieza(o, false))];
}

export type ColorDeLaColeccion = {
  clave: string;
  color: string;
  colorHex: string;
  foto: string;
  tinte: string;
  enlace: string;
};

export type ModeloDeLaColeccion = {
  clave: string;
  nombre: string;
  /** La forma, en una línea (lib/vitrina.ts, FORMAS); null si nadie la escribió. */
  forma: string | null;
  /** La ficha, en el color con el que abre. */
  enlace: string;
  colores: ColorDeLaColeccion[];
};

/**
 * La colección: cada modelo con su forma y sus colores con stock, de frente
 * y sobre el fondo de cada color. Cada color lleva a su ficha. Los modelos sin
 * ningún color con stock no aparecen.
 */
export function coleccionDeNosotros(modelos: Producto[]): ModeloDeLaColeccion[] {
  return modelos
    .map((m, i) => ({
      clave: m.id,
      nombre: nombreDeModelo(m.nombre),
      forma: FORMAS[m.slug] ?? null,
      enlace: rutaDeVariante(m, indiceVarianteInicial(m)),
      colores: m.variantes.flatMap((v, j) =>
        v.agotada
          ? []
          : [
              {
                clave: v.id,
                color: v.color,
                colorHex: v.colorHex,
                foto: fotosDeVitrina(v, m.fotoPrincipal ?? "").adentro,
                tinte: tinteDeColor(m.slug, v.color, i),
                enlace: rutaDeVariante(m, j),
              },
            ],
      ),
    }))
    .filter((m) => m.colores.length > 0);
}
