import { categoriasConProductos, esCategoriaDeAnteojos, rutaDeCategoria, type Categoria } from "./categorias";
import type { OfertaDeEscala } from "./descuentos";
import { LINEAS } from "./lineas";
import { paresDisponibles } from "./packs";
import { RECORTES_ANTEOJOS } from "./recortes-anteojos";
import type { DuoDelCarrito, Producto, Variante } from "./tipos";

/**
 * La portada vitrina (pedido de Ale, 30/10/2026): los cuatro modelos sobre
 * color, que pasan de claros a oscuros con un toque («Al sol | Adentro»), y
 * se suman al carrito sin salir de la portada. Acá, lo que no depende de
 * React: los tintes, las fotos de cada estado y el modo de la portada.
 *
 * Los tintes son un código de color por modelo, sin relato detrás (Ale no
 * quiere historia de las piedras). Son claros a propósito: las fotos son de
 * fondo blanco y se funden con `mix-blend-mode: multiply`.
 */

/** El tinte de cada modelo; los que no están acá toman uno de la lista, en orden. */
const TINTES: Record<string, string> = {
  citrino: "#f2e4bc",
  amatista: "#e4deec",
  obsidiana: "#dce5dd",
  cuarzo: "#efdcd3",
};
const TINTES_DE_RESERVA = ["#efe6d6", "#d6e6ea", "#f0d9a8", "#e7e2d8"];

export function tinteDe(slug: string, indice: number): string {
  return TINTES[slug] ?? TINTES_DE_RESERVA[indice % TINTES_DE_RESERVA.length];
}

/** El fondo del negro cuando el tinte del modelo ya lo usa otro de sus colores. */
const TINTE_NEUTRO = "#e8e6e1";

/**
 * El fondo de cada color (la portada y las tarjetas lo cambian al tocar un
 * color): cada color, uno que acompaña al armazón, y el negro, el tinte del
 * modelo. Si ese tinte ya es el de otro color del modelo (el carey del
 * Citrino, el gris del Amatista, el ámbar del Cuarzo), el negro va sobre uno
 * neutro. Así dos colores del mismo modelo no comparten fondo.
 */
export function tinteDeColor(slug: string, color: string, indice: number): string {
  const c = color.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const carey = "#f2e4bc";
  const ambar = slug === "cuarzo" ? "#efdcd3" : "#eedfca";
  const gris = slug === "amatista" ? "#e4deec" : "#e2e6ec";
  if (c.startsWith("carey")) return carey;
  if (c.startsWith("ambar")) return ambar;
  if (c.startsWith("gris")) return gris;
  const propio = tinteDe(slug, indice);
  return [carey, ambar, gris].includes(propio) ? TINTE_NEUTRO : propio;
}

/**
 * La forma de cada modelo, en una línea, para la vitrina. Se ve en las fotos;
 * no afirma materiales ni nada que no esté confirmado. Un modelo nuevo va sin
 * línea hasta que alguien la escriba.
 */
export const FORMAS: Record<string, string> = {
  citrino: "Cuadrado, de bordes suaves y con dos remaches al frente. Combina con todo.",
  amatista: "Geométrico, con un quiebre en las esquinas. Es el que más se hace notar.",
  obsidiana: "Rectangular, de esquinas redondeadas. Clásico y discreto: nunca falla.",
  cuarzo: "Cuadrado, con la línea de arriba recta. Tiene mucha presencia.",
};

/** "/productos/anteojos/citrino-carey-1.webp" → "citrino-carey"; null si no es una foto de anteojos de la tienda. */
export function baseDeFoto(src: string | null | undefined): string | null {
  const m = /\/productos\/anteojos\/([a-z0-9-]+?)-(?:\d+|portada)\.(?:webp|jpe?g|png)$/i.exec(src ?? "");
  return m ? m[1].toLowerCase() : null;
}

export type FotosVitrina = {
  /** Con los cristales claros, de frente. */
  adentro: string;
  /** El mismo encuadre, oscurecido al sol. Null si no hay foto al sol. */
  alSol: string | null;
};

/**
 * Las dos fotos de un color para la vitrina. Con recortes generados
 * (scripts/recortes-anteojos.mjs), los dos tienen el mismo encuadre; sin
 * ellos, la primera foto del color y nada al sol (el interruptor deja ese
 * color como está, en vez de mostrar una foto que no corresponde).
 */
export function fotosDeVitrina(variante: Pick<Variante, "fotos" | "fotoPortada">, respaldo: string): FotosVitrina {
  const base = baseDeFoto(variante.fotos[0]) ?? baseDeFoto(variante.fotoPortada);
  if (base && RECORTES_ANTEOJOS.has(base)) {
    return { adentro: `/productos/anteojos/${base}-frente.webp`, alSol: `/productos/anteojos/${base}-sol.webp` };
  }
  return { adentro: variante.fotos[0] ?? respaldo, alSol: null };
}

/** El precio de todos los modelos si es el mismo; null si alguno cuesta distinto. */
export function precioUnico(modelos: Pick<Producto, "precio">[]): number | null {
  if (modelos.length === 0) return null;
  const precio = modelos[0].precio;
  return modelos.every((m) => m.precio === precio) ? precio : null;
}

/** Cuántos colores con stock hay entre todos los modelos. */
export function coloresConStock(modelos: Pick<Producto, "variantes">[]): number {
  return modelos.reduce((n, m) => n + m.variantes.filter((v) => !v.agotada).length, 0);
}

/** "cuatro", "doce": los números chicos con letras, como en un texto. */
export function enLetras(n: number): string {
  const nombres = [
    "cero",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
  ];
  return nombres[n] ?? String(n);
}

/**
 * Qué portada se muestra, según Config `portada_producto`:
 *  - vacío: la vitrina (desde el 30/10/2026);
 *  - "ninguno" o "catalogo": la portada de catálogo de antes;
 *  - el slug de un anteojo: la portada de ese modelo en packs, la de antes.
 */
export type ModoPortada = { tipo: "vitrina" } | { tipo: "catalogo" } | { tipo: "estrella"; slug: string };

export function modoDePortada(delConfig: string): ModoPortada {
  const valor = delConfig.trim().toLowerCase();
  if (!valor || valor === "vitrina") return { tipo: "vitrina" };
  if (valor === "ninguno" || valor === "catalogo" || valor === "catálogo") return { tipo: "catalogo" };
  return { tipo: "estrella", slug: valor };
}

/**
 * La línea de arriba de la barra «Tus pares»: qué gana con el próximo par, o
 * qué ya tiene. Sale del carrito resuelto por el servidor (tramos, cupón,
 * envío gratis), nunca de una cuenta propia: si el cupón ya da más que el
 * próximo tramo, no se promete ese descuento (nunca se suman los dos).
 */
export function empujeDeLaBarra(datos: {
  pares: number;
  /** El % por cantidad que aplica hoy y el del próximo tramo (lib/descuentos.ts). */
  actual: number;
  proximo: { faltan: number; porcentaje: number } | null;
  /** El % del cupón si está aplicado; 0 si no. */
  cupon: number;
  subtotalSinCupon: number;
  precioPar: number;
  envioGratisDesde: number;
  /** Dónde está en la escala «llevá 3, pagá 2 · llevá 5, pagá 3»; null sin escala. */
  escala?: OfertaDeEscala | null;
  /**
   * El Dúo del carrito, del servidor (solo con el Dúo prendido; Tarea 07).
   * Null o ausente: la barra de siempre.
   */
  duo?: DuoDelCarrito | null;
}): string | null {
  const { pares, actual, proximo, cupon, subtotalSinCupon, precioPar, envioGratisDesde, escala = null, duo = null } = datos;
  if (pares <= 0) return null;
  const gratisPais = envioGratisDesde > 0 && subtotalSinCupon >= envioGratisDesde;
  const gratisConUnoMas = envioGratisDesde > 0 && !gratisPais && subtotalSinCupon + precioPar >= envioGratisDesde;

  // Con el Dúo (Tarea 07): lo que dice el servidor. Si con otro par conviene
  // un tramo de Airtable, la barra de siempre cuenta el tramo.
  if (duo && cupon === 0 && duo.siguiente !== "tramos") {
    const pct = `${duo.porcentaje}% OFF`;
    if (duo.siguiente === "duo") {
      const envio = gratisConUnoMas ? " y envío gratis a todo el país" : "";
      return duo.ahorro > 0
        ? `Dúo aplicado. Uno más: ${pct} en otro par${envio}.`
        : `${pares === 1 ? "Sumá otro" : "Uno más"}: ${pct} en el de menor precio${envio}.`;
    }
    if (duo.ahorro > 0) return `Dúo aplicado: ${pct}${gratisPais ? " y envío gratis a todo el país" : ""}.`;
    return gratisPais ? "Envío gratis a todo el país." : null;
  }
  const yaConDuo = duo && duo.ahorro > 0 ? "Dúo aplicado. " : "";

  if (escala && cupon === 0) {
    const { actual: escalon, siguiente } = escala;
    const aplicado = escalon ? `Llevá ${escalon.lleva}, pagá ${escalon.paga} aplicado` : null;
    if (siguiente) {
      const gratis = siguiente.lleva - siguiente.paga;
      const premio =
        gratis === 1 ? (siguiente.faltan === 1 ? "te lo llevás gratis" : "uno te sale gratis") : `te llevás ${gratis} gratis`;
      const envio = siguiente.faltan === 1 && gratisConUnoMas ? " y el envío es gratis a todo el país" : "";
      const sumar = siguiente.faltan === 1 ? (pares === 1 ? "Sumá otro" : "Uno más") : `Sumá ${siguiente.faltan} más`;
      return `${yaConDuo}${aplicado ? `${aplicado}. ` : ""}${sumar} y ${premio}${envio}.`;
    }
    if (aplicado) return `${aplicado}${gratisPais ? " y envío gratis a todo el país" : ""}.`;
  }

  if (proximo && proximo.faltan === 1) {
    const ganancias = [
      proximo.porcentaje > cupon ? `${proximo.porcentaje} % OFF` : null,
      gratisConUnoMas ? "envío gratis a todo el país" : null,
    ].filter(Boolean);
    if (ganancias.length > 0) return `${yaConDuo}${pares === 1 ? "Sumá otro" : "Uno más"}: ${ganancias.join(" y ")}.`;
  }
  // Con el Dúo aplicado, el porcentaje del tramo no es el que tiene.
  if (yaConDuo) return `Dúo aplicado${gratisPais ? " y envío gratis a todo el país" : ""}.`;
  if (actual > 0 && actual >= cupon) return `${actual} % OFF aplicado${gratisPais ? " y envío gratis a todo el país" : ""}.`;
  if (gratisPais) return "Envío gratis a todo el país.";
  return null;
}

/**
 * «Comprar» en la portada (Ale, 05/11/2026): una categoría de anteojos por
 * bloque, solo las que tienen algún modelo con stock y en el orden de
 * lib/categorias.ts. Hoy son los fotocromáticos; cuando se carguen de sol,
 * de receta o clip-on con stock en Airtable, aparecen solas, sin tocar la
 * portada. Una categoría sin stock no se muestra como disponible.
 */
export type CategoriaParaComprar<P> = {
  nombre: Categoria;
  slug: string;
  /** El nombre de la línea ("Fotocromáticos") o, si no hay línea, el de la categoría. */
  titulo: string;
  /** Material y cristales de la línea, en una línea corta; null si no hay. */
  detalle: string | null;
  /** La página de la categoría ("/anteojos"). */
  enlace: string;
  productos: P[];
};

export function categoriasParaComprar<P extends Pick<Producto, "categoria" | "variantes">>(productos: P[]): CategoriaParaComprar<P>[] {
  const conStock = productos.filter((p) => esCategoriaDeAnteojos(p.categoria) && paresDisponibles(p.variantes) > 0);
  return categoriasConProductos(conStock).map((c) => {
    const linea = LINEAS.find((l) => l.categoria === c.nombre);
    return {
      nombre: c.nombre,
      slug: c.slug,
      titulo: linea?.nombre ?? c.nombre,
      // Sin repetir el nombre: «Filtro de luz azul · UV400» debajo de «Fotocromáticos».
      detalle: linea ? linea.ficha.replace(new RegExp(`^${linea.nombre}\\s*·\\s*`), "") || null : null,
      enlace: rutaDeCategoria(c.nombre),
      productos: conStock.filter((p) => p.categoria === c.nombre),
    };
  });
}

/**
 * La foto de la primera pantalla: un anteojo real entero, de tres cuartos y
 * con el logo en la patilla (la segunda foto de cada color, «-2»), para que se
 * aprecie la forma. Primero el carey con stock, el color más vistoso; si no
 * hay, el primer color con stock. Sin caras: los protagonistas son los anteojos.
 */
export function fotoDeLaPortada(modelos: Pick<Producto, "nombre" | "variantes">[]): { src: string; alt: string } | null {
  const opciones = modelos.flatMap((m) => m.variantes.filter((v) => !v.agotada && v.fotos.length > 0).map((v) => ({ m, v })));
  const plano = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const elegida = opciones.find((o) => plano(o.v.color).startsWith("carey")) ?? opciones[0];
  if (!elegida) return null;
  const { m, v } = elegida;
  const nombre = m.nombre.charAt(0) + m.nombre.slice(1).toLowerCase();
  const deTresCuartos = v.fotos.find((f) => baseDeFoto(f) !== null && /-2\.(?:webp|jpe?g|png)$/i.test(f));
  return { src: deTresCuartos ?? v.fotos[0], alt: `${nombre} en ${plano(v.color)}` };
}

/**
 * Los modelos destacados de la portada (Ale, 05/11/2026): cuatro como mucho,
 * en total. Se toman de a uno por categoría, en ronda (el primero de cada una,
 * después el segundo...), así cuando haya de sol, receta o clip-on cada una
 * tiene su lugar sin alargar la portada. El resto, en la página de cada categoría.
 */
export function destacadosDeLaPortada<P>(categorias: { productos: P[] }[], maximo = 4): P[] {
  const elegidos: P[] = [];
  for (let vuelta = 0; elegidos.length < maximo; vuelta++) {
    const deEstaVuelta = categorias.map((c) => c.productos[vuelta]).filter((p): p is P => p !== undefined);
    if (deEstaVuelta.length === 0) break;
    elegidos.push(...deEstaVuelta.slice(0, maximo - elegidos.length));
  }
  return elegidos;
}
