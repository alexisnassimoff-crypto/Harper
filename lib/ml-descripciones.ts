/**
 * Corregir afirmaciones falsas en las descripciones de las publicaciones: se
 * saca la línea entera que las menciona. Funciones puras; los pedidos están en
 * lib/ml-descripciones-servidor.ts.
 *
 * Nació el 8/11/2026: las descripciones de los anteojos Harper decían
 * «Tratamiento Antirreflex» y no lo tienen, y el agente de preguntas lo
 * contestaba como cierto.
 */

/**
 * Lo que se puede sacar. Una lista cerrada: la ruta no acepta expresiones
 * desde el link, así nadie puede borrar otra cosa por error.
 */
export const QUE_SE_PUEDE_SACAR = {
  antirreflex: { nombre: "antirreflex", patron: /anti[\s-]?r+efle(x|j)/i },
  uv400: { nombre: "UV400", patron: /uv\s*-?\s*400/i },
} as const;

export type QueSacar = keyof typeof QUE_SE_PUEDE_SACAR;

export function esQueSacar(valor: string | null): valor is QueSacar {
  return valor !== null && Object.prototype.hasOwnProperty.call(QUE_SE_PUEDE_SACAR, valor);
}

/** Más de esto y no se toca: algo raro pasa con esa descripción. */
export const MAXIMO_LINEAS = 3;

/**
 * Saca las líneas que mencionan el patrón y deja como mucho una línea en
 * blanco seguida donde quedó el hueco.
 */
export function quitarLineas(texto: string, patron: RegExp): { nuevo: string; quitadas: string[] } {
  const quitadas: string[] = [];
  const quedan = texto.split("\n").filter((linea) => {
    if (patron.test(linea)) {
      quitadas.push(linea.trim());
      return false;
    }
    return true;
  });
  const nuevo = quedan
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { nuevo: quitadas.length ? nuevo : texto, quitadas };
}

/** Las características (atributos) de la publicación que mencionan el patrón: se corrigen a mano. */
export function atributosQueMencionan(item: unknown, patron: RegExp): string[] {
  const atributos = (item as { attributes?: unknown } | null)?.attributes;
  return (Array.isArray(atributos) ? atributos : []).flatMap((a) => {
    const x = a as { name?: unknown; value_name?: unknown };
    const nombre = typeof x.name === "string" ? x.name : "";
    const valor = typeof x.value_name === "string" ? x.value_name : "";
    return patron.test(`${nombre} ${valor}`) ? [`${nombre}: ${valor}`] : [];
  });
}

export type Cambio = {
  id: string;
  titulo: string;
  /** Las líneas que se sacan (o se sacaron) de la descripción. */
  quitadas: string[];
  /** Características que también lo mencionan: hay que corregirlas en ML. */
  atributos: string[];
  /** sin cambios, para revisar (demasiadas líneas), listo para aplicar, aplicado, o el error. */
  estado: "sin cambios" | "demasiadas líneas" | "para aplicar" | "aplicado" | "error";
  detalle?: string;
};

/** Qué se va a hacer con una publicación, según lo que se encontró. */
export function estadoDelCambio(quitadas: string[], aplicar: boolean): Cambio["estado"] {
  if (!quitadas.length) return "sin cambios";
  if (quitadas.length > MAXIMO_LINEAS) return "demasiadas líneas";
  return aplicar ? "aplicado" : "para aplicar";
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** La página para el celular: qué se saca de cada publicación, y el botón para aplicarlo. */
export function paginaDeCambios(d: { que: string; cambios: Cambio[]; aplicar: boolean; linkAplicar: string | null }): string {
  const gris = "color:#78756c";
  const conCambios = d.cambios.filter((c) => c.estado !== "sin cambios");
  const partes = [
    `<h1 style="font-size:20px;margin:0 0 4px">Sacar «${escapar(d.que)}» de las descripciones</h1>`,
    `<p style="${gris};margin:0 0 16px">${d.cambios.length} publicaciones revisadas · ${conCambios.length} con cambios${d.aplicar ? "" : " · todavía no se cambió nada"}</p>`,
  ];
  for (const c of conCambios) {
    const color = c.estado === "aplicado" ? "#2f6b3a" : c.estado === "para aplicar" ? "#1f1e1b" : "#a3341f";
    partes.push(
      `<div style="border-top:1px solid #e4e1d8;padding:12px 0"><p style="margin:0 0 4px"><strong>${escapar(c.titulo)}</strong> <span style="${gris};font-size:12px">${escapar(c.id)}</span></p>`,
      `<p style="margin:0 0 6px;color:${color};font-size:13px">${escapar(c.estado)}${c.detalle ? `: ${escapar(c.detalle)}` : ""}</p>`,
      c.quitadas.length
        ? `<ul style="margin:0;padding-left:20px;font-size:13px">${c.quitadas.map((l) => `<li><s>${escapar(l)}</s></li>`).join("")}</ul>`
        : "",
      c.atributos.length
        ? `<p style="margin:6px 0 0;font-size:13px;color:#a3341f">También figura en las características (corregir a mano en ML): ${escapar(c.atributos.join(" · "))}</p>`
        : "",
      `</div>`
    );
  }
  if (!conCambios.length) partes.push(`<p>Ninguna descripción menciona «${escapar(d.que)}».</p>`);
  if (!d.aplicar && d.linkAplicar && conCambios.some((c) => c.estado === "para aplicar")) {
    partes.push(
      `<p style="margin:24px 0 8px">Si está bien, tocá el botón. Solo se sacan las líneas tachadas; el resto de cada descripción queda igual.</p>`,
      `<a href="${escapar(d.linkAplicar)}" style="display:inline-block;background:#1f1e1b;color:#faf9f6;padding:12px 18px;border-radius:8px;text-decoration:none">Sacar estas líneas en Mercado Libre</a>`
    );
  }
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#1f1e1b;font-size:14px;line-height:1.45;max-width:760px;margin:0 auto">${partes.join("")}</div>`;
}
