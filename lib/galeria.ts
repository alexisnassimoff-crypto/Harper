/**
 * La galería de la ficha: fotos de la variante más el video del producto.
 *
 * Las fotos viven en la variante —cambian con el color— y el video vive en el
 * producto, así que la lista se arma acá y no en Airtable. El video ocupa
 * siempre el mismo lugar: es lo que hace que se sienta parte de la secuencia y
 * no un agregado al final.
 */

export type Medio =
  | { tipo: "foto"; src: string }
  | { tipo: "video"; src: string; poster: string | null };

/** Lugar del video dentro de la galería, contando desde 1. */
export const POSICION_VIDEO = 3;

/**
 * Contenedores que reproducen todos los navegadores.
 *
 * `.mov` queda afuera a propósito: es QuickTime, y salvo Safari ningún
 * navegador lo abre. En Chrome, Brave o Android el visitante ve un recuadro
 * negro roto, que es peor que no mostrar nada.
 */
// `video/x-m4v` es lo que declara Airtable para los .m4v que salen del
// conversor de Finder: es un MP4 con otro nombre y se reproduce igual.
const TIPOS_WEB = ["video/mp4", "video/x-m4v", "video/webm"];
const EXTENSIONES_WEB = [".mp4", ".m4v", ".webm"];

/**
 * Verdadero si el video se puede reproducir fuera de Safari.
 *
 * Cuando no hay ni tipo MIME ni extensión reconocible devuelve `true`: sin
 * datos preferimos intentar mostrarlo antes que esconder un video que anda.
 */
export function videoReproducible(datos: { url?: string | null; tipo?: string | null }) {
  const tipo = datos.tipo?.toLowerCase().trim();
  if (tipo) return TIPOS_WEB.some((t) => tipo.startsWith(t));

  const url = (datos.url ?? "").toLowerCase().split("?")[0];
  if (!/\.[a-z0-9]{2,4}$/.test(url)) return true;

  return EXTENSIONES_WEB.some((e) => url.endsWith(e));
}

/**
 * Arma la lista de medios con el video en tercer lugar.
 *
 * Con menos de dos fotos no existe un tercer lugar, así que el video va al
 * final: nunca antes de la primera foto, que es la que vende.
 *
 * Con varios videos van todos seguidos desde el tercer lugar, en el orden en
 * que estén cargados en Airtable.
 */
export function armarGaleria(
  fotos: string[],
  videos: string[],
  poster: string | null = null
): Medio[] {
  const medios: Medio[] = fotos.map((src) => ({ tipo: "foto", src }));

  if (videos.length === 0) return medios;

  medios.splice(
    Math.min(POSICION_VIDEO - 1, medios.length),
    0,
    ...videos.map((src): Medio => ({
      tipo: "video",
      src,
      poster: poster ?? fotos[0] ?? null,
    }))
  );

  return medios;
}

/**
 * Cuántas fotos hay antes de la posición `i`.
 *
 * El visor a pantalla completa solo maneja fotos, así que hay que traducir
 * entre el índice de la galería y el de la lista de fotos.
 */
export function indiceEntreFotos(medios: Medio[], i: number) {
  let vistas = 0;
  for (let n = 0; n < i && n < medios.length; n += 1) {
    if (medios[n].tipo === "foto") vistas += 1;
  }
  return vistas;
}

/** La traducción inversa: dónde cae en la galería la foto número `n`. */
export function posicionDeFoto(medios: Medio[], n: number) {
  let vistas = 0;
  for (let i = 0; i < medios.length; i += 1) {
    if (medios[i].tipo !== "foto") continue;
    if (vistas === n) return i;
    vistas += 1;
  }
  return 0;
}
