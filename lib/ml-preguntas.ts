import crypto from "node:crypto";

/**
 * Las piezas sin red del agente de preguntas de Mercado Libre (el flujo
 * completo está en lib/ml-preguntas-servidor.ts).
 *
 * La regla que gobierna todo: el agente publica solo cuando la respuesta sale
 * entera de los datos de la publicación. Todo lo demás llega como borrador al
 * mail de pedidos, para aprobarlo con un click o responderlo a mano. Una
 * respuesta mal dada queda pública para siempre; una respuesta tarde, no.
 */

/** Mercado Libre corta las respuestas en 2.000 caracteres. */
export const LARGO_MAXIMO = 2_000;

/** El id de la pregunta de una notificación, o null si no es de preguntas. */
export function preguntaDeNotificacion(cuerpo: unknown, appId: string): string | null {
  const n = cuerpo as { topic?: unknown; resource?: unknown; application_id?: unknown } | null;
  if (!n || n.topic !== "questions" || typeof n.resource !== "string") return null;
  // Una notificación de otra aplicación no es nuestra: se ignora.
  if (appId && String(n.application_id ?? "") !== appId) return null;
  const id = /^\/questions\/(\d+)$/.exec(n.resource)?.[1];
  return id ?? null;
}

// ---------------------------------------------------------------------------
// La pregunta y la publicación, tal como las da la API
// ---------------------------------------------------------------------------

export type Pregunta = {
  id: string;
  texto: string;
  estado: string;
  itemId: string;
  vendedor: number | null;
  creada: string;
  respuesta: string | null;
};

export function leerPregunta(respuesta: unknown): Pregunta | null {
  const q = respuesta as {
    id?: unknown;
    text?: unknown;
    status?: unknown;
    item_id?: unknown;
    seller_id?: unknown;
    date_created?: unknown;
    answer?: { text?: unknown } | null;
  } | null;
  if (!q || (typeof q.id !== "number" && typeof q.id !== "string") || typeof q.item_id !== "string") return null;
  return {
    id: String(q.id),
    texto: typeof q.text === "string" ? q.text : "",
    estado: typeof q.status === "string" ? q.status : "",
    itemId: q.item_id,
    vendedor: typeof q.seller_id === "number" ? q.seller_id : null,
    creada: typeof q.date_created === "string" ? q.date_created : new Date().toISOString(),
    respuesta: typeof q.answer?.text === "string" && q.answer.text ? q.answer.text : null,
  };
}

/**
 * La ficha de la publicación en texto, que es TODO lo que el agente sabe.
 * Se arma de la respuesta de /items/{id} y de /items/{id}/description.
 */
export function fichaDePublicacion(item: unknown, descripcion: unknown): { titulo: string; permalink: string; ficha: string } {
  const i = (item ?? {}) as Record<string, unknown>;
  const titulo = typeof i.title === "string" ? i.title : "";
  const permalink = typeof i.permalink === "string" ? i.permalink : "";
  const lineas: string[] = [`Título: ${titulo}`];

  if (typeof i.price === "number") lineas.push(`Precio: $ ${i.price.toLocaleString("es-AR")} ${String(i.currency_id ?? "")}`.trim());
  if (typeof i.available_quantity === "number") {
    // ML muestra la cantidad en rangos; acá solo importa si hay o no.
    lineas.push(i.available_quantity > 0 ? "Stock: hay stock disponible" : "Stock: sin stock");
  }
  if (typeof i.condition === "string") lineas.push(`Condición: ${i.condition === "new" ? "nuevo" : i.condition}`);

  const envio = i.shipping as { free_shipping?: unknown; mode?: unknown; logistic_type?: unknown } | undefined;
  if (envio) {
    const partes = [envio.free_shipping === true ? "envío gratis" : "envío con costo según destino"];
    if (envio.logistic_type === "fulfillment") partes.push("despacha Mercado Libre (Full)");
    lineas.push(`Envío: ${partes.join(", ")}`);
  }

  const atributos = Array.isArray(i.attributes) ? i.attributes : [];
  const valores = atributos.flatMap((a) => {
    const x = a as { name?: unknown; value_name?: unknown };
    return typeof x.name === "string" && typeof x.value_name === "string" && x.value_name
      ? [`- ${x.name}: ${x.value_name}`]
      : [];
  });
  if (valores.length) lineas.push("Características:", ...valores);

  const variaciones = Array.isArray(i.variations) ? i.variations : [];
  const opciones = variaciones.flatMap((v) => {
    const x = v as { attribute_combinations?: { name?: unknown; value_name?: unknown }[]; available_quantity?: unknown };
    const nombre = (x.attribute_combinations ?? [])
      .map((c) => (typeof c.value_name === "string" ? c.value_name : ""))
      .filter(Boolean)
      .join(" / ");
    if (!nombre) return [];
    const hay = typeof x.available_quantity === "number" ? (x.available_quantity > 0 ? "con stock" : "sin stock") : "";
    return [`- ${nombre}${hay ? ` (${hay})` : ""}`];
  });
  if (opciones.length) lineas.push("Variantes:", ...opciones);

  const garantia = (Array.isArray(i.sale_terms) ? i.sale_terms : []).flatMap((t) => {
    const x = t as { id?: unknown; value_name?: unknown };
    return (x.id === "WARRANTY_TYPE" || x.id === "WARRANTY_TIME") && typeof x.value_name === "string" ? [x.value_name] : [];
  });
  if (garantia.length) lineas.push(`Garantía: ${garantia.join(", ")}`);

  const texto = (descripcion as { plain_text?: unknown } | null)?.plain_text;
  if (typeof texto === "string" && texto.trim()) lineas.push("Descripción:", texto.trim().slice(0, 6_000));

  return { titulo, permalink, ficha: lineas.join("\n") };
}

// ---------------------------------------------------------------------------
// La decisión del agente
// ---------------------------------------------------------------------------

export type Decision = {
  accion: "responder" | "derivar";
  respuesta: string;
  motivo: string;
};

/** El esquema que el modelo tiene que respetar (structured outputs). */
export const ESQUEMA_DECISION = {
  type: "object",
  properties: {
    accion: { type: "string", enum: ["responder", "derivar"] },
    respuesta: { type: "string" },
    motivo: { type: "string" },
  },
  required: ["accion", "respuesta", "motivo"],
  additionalProperties: false,
} as const;

export function leerDecision(texto: string): Decision | null {
  try {
    const d = JSON.parse(texto) as Partial<Decision>;
    if ((d.accion !== "responder" && d.accion !== "derivar") || typeof d.respuesta !== "string" || typeof d.motivo !== "string") {
      return null;
    }
    return { accion: d.accion, respuesta: d.respuesta.trim(), motivo: d.motivo.trim() };
  } catch {
    return null;
  }
}

/**
 * Lo que una respuesta no puede tener para salir publicada. Mercado Libre
 * prohíbe pasar datos de contacto o sacar la venta de la plataforma, y lo
 * castiga en la reputación. Se revisa también en un borrador aprobado: una
 * aprobación apurada no puede publicar un teléfono.
 */
export function problemaDeRespuesta(texto: string): string | null {
  const t = texto.trim();
  if (!t) return "la respuesta está vacía";
  if (t.length > LARGO_MAXIMO) return `tiene ${t.length} caracteres y Mercado Libre acepta hasta ${LARGO_MAXIMO}`;
  if (/\[COMPLETAR/i.test(t)) return "tiene partes marcadas para completar";
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return "tiene una dirección de mail";
  if (/(https?:\/\/|www\.|\.com\b|\.ar\b)/i.test(t)) return "tiene un link";
  if (/(\d[\s.-]?){8,}/.test(t)) return "tiene algo que parece un teléfono";
  if (/\b(whats\s?app|wsp|instagram|telegram|facebook|tel[eé]fono|llamanos|escribinos al)\b/i.test(t)) {
    return "menciona un canal de contacto fuera de Mercado Libre";
  }
  return null;
}

/** El prompt del agente. Fijo, para que quede en cache entre preguntas. */
export const INSTRUCCIONES = `Respondés preguntas de compradores en las publicaciones de Mercado Libre de Harper, una marca argentina de anteojos y estuches.

Te paso la ficha de la publicación y la pregunta. La ficha es TODO lo que sabés: no tenés acceso al depósito, a los plazos de envío reales, al historial del comprador ni a nada más.

Decidí una de dos cosas:

"responder": SOLO si cada dato de tu respuesta está escrito en la ficha. Casos típicos: si hay stock, qué colores o variantes hay, medidas y materiales que figuran en las características, si el envío es gratis, qué incluye según la descripción.

"derivar": en cualquier otro caso. Por ejemplo: el dato no está en la ficha; piden un plazo de entrega, un descuento, un precio por cantidad, una factura, un cambio o una devolución; es un reclamo o una pregunta de posventa; la pregunta es ambigua; o dudás. Ante la duda, siempre derivar. Al derivar, igual escribí el mejor borrador posible, y donde falte un dato poné [COMPLETAR: qué dato falta] para que la persona de Harper lo complete.

Cómo escribir la respuesta:
- Castellano rioplatense, con voseo, cálido y breve: una a tres oraciones.
- Empezá con "¡Hola!" y terminá con "Saludos, Harper."
- Nunca inventes datos, plazos, stock ni compatibilidades.
- Nunca pongas teléfonos, mails, links, redes sociales ni otros canales: Mercado Libre lo prohíbe.
- Nunca prometas descuentos ni cambios de precio.
- Si la pregunta no tiene que ver con el producto o es una ofensa, derivá con la respuesta vacía.

En "motivo" explicá en una oración, para la persona de Harper, por qué respondiste o derivaste y qué dato de la ficha usaste.`;

/** El mensaje con los datos variables, después del prompt fijo. */
export function mensajeParaElAgente(ficha: string, pregunta: string): string {
  return `<ficha_de_la_publicacion>\n${ficha}\n</ficha_de_la_publicacion>\n\n<pregunta_del_comprador>\n${pregunta}\n</pregunta_del_comprador>`;
}

// ---------------------------------------------------------------------------
// El link de aprobación
// ---------------------------------------------------------------------------

/** Firma el id de la pregunta: el link del mail no sirve para otra. */
export function firmaDeAprobacion(preguntaId: string, secreto: string): string {
  return crypto.createHmac("sha256", secreto).update(`ml-pregunta:${preguntaId}`).digest("hex").slice(0, 32);
}

export function firmaValida(preguntaId: string, firma: string | null, secreto: string): boolean {
  if (!firma || !secreto) return false;
  const esperada = Buffer.from(firmaDeAprobacion(preguntaId, secreto));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}
