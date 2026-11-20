import { TEXTOS } from "./textos";

/**
 * Textos de la portada y de los metadatos del sitio.
 *
 * Todo lo que se afirma acá tiene que ser verificable. Las características de
 * los anteojos (filtro de luz azul, fotocromáticos) las confirmó Ale el
 * 25/10/2026 para los cuatro modelos publicados; ver lib/caracteristicas.ts.
 * Nada de certificaciones: no se publican sin documentación que las respalde.
 */

/** Descripción del sitio para buscadores y redes. Anteojos primero. */
export const DESCRIPCION_SITIO =
  "Anteojos fotocromáticos Harper con filtro de luz azul y UV400: se oscurecen solos al sol y se aclaran adentro. Varios modelos y colores.";

export const TITULO_SITIO = "Harper — Anteojos fotocromáticos con filtro de luz azul";

/**
 * El subtítulo del hero cuando Config.portada_subtitulo está vacío: qué
 * vendemos, en una frase. Texto aprobado por Ale el 25/10/2026.
 */
export const SUBTITULO_PORTADA =
  "Anteojos con filtro de luz azul y cristales fotocromáticos. Diseño para todos los días.";

/**
 * El subtítulo que va en el hero. Config.portada_subtitulo manda si se cargó.
 * Si no, la frase aprobada, que afirma filtro azul y fotocromáticos: solo
 * mientras todos los anteojos publicados tengan esas características
 * confirmadas. Si se publica uno que no (por ejemplo, unos de sol), el hero
 * queda sin subtítulo hasta definir uno nuevo, en vez de afirmar algo falso.
 */
export function subtituloDeLaPortada(
  delConfig: string,
  anteojosPublicados: { confirmado: boolean }[]
): string {
  if (delConfig.trim()) return delConfig.trim();
  const todos = anteojosPublicados.length > 0 && anteojosPublicados.every((a) => a.confirmado);
  return todos ? SUBTITULO_PORTADA : "";
}

// ---------------------------------------------------------------------------
// La portada con un modelo estrella (Config `portada_producto` con un slug;
// qué portada va según esa clave está en lib/vitrina.ts, modoDePortada)

/** El estuche que se ofrece sumar al pack, si está publicado y tiene stock. */
export const ESTUCHE_PORTADA = "m500";

export type Pregunta = {
  pregunta: string;
  respuesta: string;
  enlace?: { href: string; texto: string };
};

/** ["a", "b", "c"] → "a, b y c". */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);
const conPunto = (texto: string) => (/[.!?]$/.test(texto) ? texto : `${texto}.`);

/**
 * El Dúo para las preguntas, con lo que dijo el servidor: el porcentaje y, si
 * pudo resolver un carrito de dos anteojos, lo que cobra por los dos (con y
 * sin el 10 % de Mercado Pago) y su precio de lista, ya formateados. Null con
 * el Dúo apagado: no se pregunta ni se nombra.
 */
export type DuoParaPreguntas = {
  porcentaje: number;
  dos: { total: string; lista: string; totalDineroMP: string | null } | null;
};

/**
 * Las preguntas frecuentes de la portada. Cada respuesta sale de algo que ya
 * es cierto en la tienda (lib/confianza.ts, lib/dinero-mp.ts, lib/duo.ts,
 * Config): lo que no está confirmado no se pregunta. Sin plazos de entrega.
 *
 * Ale, 18/11/2026: las condiciones de compra son las mismas para todos. Las
 * cuotas son hasta 3 para cualquier comprador, el envío es gratis solo desde
 * los mínimos de Config (contados a precio de lista) y el 10 % por pagar con
 * el dinero de la cuenta de Mercado Pago se suma al Dúo. Tener cuenta no
 * cambia nada de eso: la cuenta es para seguir las compras y recibir las
 * novedades. Salieron la pregunta de la suscripción con beneficios y la del
 * cupón de primera compra.
 */
export function preguntasDePortada(datos: {
  /** Lo que incluye cada par, de Airtable. Vacío = no se pregunta. */
  incluye: string[];
  /** Las características confirmadas del modelo, o null. */
  caracteristicas: readonly string[] | null;
  /** Las cuotas sin interés que Mercado Pago confirmó (las mismas para todos); null no las nombra. */
  cuotas: { cuotas: number; cftea: string } | null;
  nombreMarcas: string;
  envioGratisDesde: number;
  envioGratisTexto: string;
  /** El mínimo de envío gratis en AMBA, ya formateado; null si no hay uno más bajo que el del resto del país. */
  envioGratisAmbaTexto?: string | null;
  hayWhatsapp: boolean;
  diasArrepentimiento: number;
  diasCambio: number;
  mesesGarantia: number;
  /** La escala de anteojos, "llevá 3 y pagá 2, o llevá 5 y pagá 3"; null si Airtable no tiene ninguna (hoy, ninguna). */
  escala?: string | null;
  porcentajeDineroMP: number;
  /** El Dúo, solo si el servidor lo tiene prendido; null o sin el dato, ni se nombra. */
  duo?: DuoParaPreguntas | null;
  /** La pregunta de la cuenta Harper y las novedades (en /preguntas-frecuentes). */
  cuenta?: boolean;
}): Pregunta[] {
  const preguntas: Pregunta[] = [];
  const P = TEXTOS.programa;
  const duo = datos.duo ?? null;

  // Lo que tienen y lo que viene en la caja, en una sola pregunta (menos texto, 30/10/2026).
  const tienen =
    datos.caracteristicas && datos.caracteristicas.length > 0
      ? conPunto(enumerar([datos.caracteristicas[0], ...datos.caracteristicas.slice(1).map(minuscula)]))
      : null;
  const caja = datos.incluye.length > 0 ? conPunto(`Cada par incluye ${enumerar(datos.incluye.map(minuscula))}`) : null;
  if (tienen || caja) {
    preguntas.push({ pregunta: "¿Qué trae cada par?", respuesta: [tienen, caja].filter(Boolean).join(" ") });
  }

  if (datos.caracteristicas && datos.caracteristicas.length > 0) {
    preguntas.push({
      pregunta: "¿Les puedo poner cristales con aumento?",
      respuesta: `Sí: el armazón es apto para cristales con aumento, y los cristales oftálmicos te los ponemos nosotros${
        datos.hayWhatsapp ? ": consultanos por WhatsApp con tu receta." : "."
      }`,
    });
  }

  preguntas.push({
    pregunta: "¿Cómo puedo pagar?",
    respuesta: [
      "Con Mercado Pago: tarjeta, débito o dinero en tu cuenta.",
      // Las cuotas, solo si Mercado Pago las confirmó. Son para cualquier comprador.
      datos.cuotas
        ? `En anteojos tenés ${P.cuotas.sinInteres(datos.cuotas.cuotas)} con ${datos.nombreMarcas} (CFTEA ${datos.cuotas.cftea}); el valor de cada cuota está junto al precio. ${P.cuotas.paraTodos}`
        : null,
      `Si en el checkout elegís «Dinero en Mercado Pago» y pagás con el dinero de tu cuenta, en un pago, tenés ${datos.porcentajeDineroMP}% OFF extra. No se aplica al envío.`,
      duo ? P.dineroMP.seSumaAlDuo : null,
    ]
      .filter(Boolean)
      .join(" "),
  });

  // El envío: gratis solo desde los mínimos de Config. Donde se dice un
  // mínimo, se aclara que se cuenta a precio de lista (el servidor lo mide
  // antes del Dúo y del 10 % de Mercado Pago).
  const hayMinimo = datos.envioGratisDesde > 0 || Boolean(datos.envioGratisAmbaTexto);
  preguntas.push({
    pregunta: "¿Cuánto cuesta el envío?",
    respuesta: [
      datos.envioGratisAmbaTexto
        ? datos.envioGratisDesde > 0
          ? `${P.envio.amba(datos.envioGratisAmbaTexto)}. ${P.envio.resto(datos.envioGratisTexto)}. ${P.envio.minimo} Si tu compra no llega al mínimo, el costo aparece en el checkout apenas ponés tu dirección, antes de pagar.`
          : `${P.envio.amba(datos.envioGratisAmbaTexto)}. ${P.envio.minimo} Al resto del país, el costo aparece en el checkout apenas ponés tu dirección, antes de pagar.`
        : datos.envioGratisDesde > 0
          ? `${P.envio.unico(datos.envioGratisTexto)}. ${P.envio.minimo} Si tu compra no llega al mínimo, el costo aparece en el checkout antes de pagar.`
          : "El costo aparece en el checkout antes de pagar.",
      "Despachamos de lunes a viernes.",
    ].join(" "),
  });

  preguntas.push({
    pregunta: "¿Puedo cambiarlos o devolverlos?",
    respuesta: `${
      datos.diasArrepentimiento === datos.diasCambio
        ? `Tenés ${datos.diasCambio} días desde que recibís el pedido para devolverlo sin costo o cambiarlo por otro color o modelo`
        : `Tenés ${datos.diasArrepentimiento} días desde que recibís el pedido para devolverlo sin costo y ${datos.diasCambio} días para cambiar de color o modelo`
    }. Te pedimos devolver el producto completo y cuidarlo durante la prueba. Además, ${datos.mesesGarantia} meses de garantía por defectos de fabricación.`,
    enlace: { href: "/legales/devoluciones", texto: "Ver la política de cambios" },
  });

  // El Dúo (Ale, 18/11/2026), solo prendido: qué es, que se combinan modelos
  // y colores, que el 10 % de Mercado Pago se suma y cómo se cuenta el envío
  // gratis. El porcentaje y los importes son los del servidor.
  if (duo) {
    preguntas.push({
      pregunta: P.duo.pregunta,
      respuesta: [
        P.duo.respuesta(duo.porcentaje),
        duo.dos ? P.duo.dosAnteojos(duo.dos.total, duo.dos.lista) : null,
        P.duo.conMas,
        P.duo.combinar,
        P.duo.conDineroMP(datos.porcentajeDineroMP, duo.dos?.totalDineroMP ?? null),
        hayMinimo ? `Para el envío gratis, ${minuscula(P.envio.minimo)}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      // La sección del Dúo de los Términos, que también existe solo con el Dúo prendido.
      enlace: { href: "/legales/terminos#duo", texto: "Ver las condiciones del Dúo" },
    });
  }

  // Solo si Airtable tuviera una escala activa (hoy no hay ninguna): el
  // servidor la aplicaría, así que se explica.
  if (datos.escala) {
    preguntas.push({
      pregunta: "¿Hay descuento por llevar más de un par?",
      respuesta: `Sí: ${datos.escala}. Podés mezclar modelos y colores, y se aplica solo en el carrito. El ${datos.porcentajeDineroMP}% extra por pagar con dinero en Mercado Pago también se suma.`,
    });
  }

  // La cuenta y las novedades, en lugar de la suscripción con beneficios
  // (Ale, 18/11/2026). Se dice claro que no cambia las cuotas ni el envío.
  if (datos.cuenta) {
    preguntas.push({
      pregunta: "¿Para qué sirve la cuenta Harper?",
      respuesta:
        "Es gratis. Dejás tu mail y te avisamos cuando salen modelos y colores nuevos. Con ese mismo mail entrás a tu cuenta, donde seguís tus compras y guardás tus favoritos, tus datos y tus direcciones. Las cuotas y el envío son los mismos para todos, con cuenta o sin cuenta. Si te das de baja, dejás de recibir nuestros mails de novedades. Tu cuenta sigue igual, y los mails de tus pedidos te siguen llegando.",
      enlace: { href: "/suscriptores", texto: "Conocer la cuenta Harper" },
    });
  }

  return preguntas;
}

export type Paso = { titulo: string; texto: string };

/**
 * "Cómo es comprar en Harper", en cuatro pasos. Sin plazos de entrega. Las
 * cuotas son las de cualquier comprador y los mínimos del envío, los de Config.
 */
export function pasosDeCompra(datos: {
  cuotas: { cuotas: number; cftea: string } | null;
  nombreMarcas: string;
  porcentajeDineroMP: number;
  envioGratisDesde: number;
  envioGratisTexto: string;
  /** El mínimo de envío gratis en AMBA, ya formateado; null si no hay uno más bajo que el de todo el país. */
  envioGratisAmbaTexto?: string | null;
  diasCambio: number;
}): Paso[] {
  return [
    {
      titulo: "Elegí tu pack",
      texto: "Uno, dos o cuatro pares, cada uno del color que quieras.",
    },
    {
      titulo: "Pagá con Mercado Pago",
      texto: datos.cuotas
        ? `En ${datos.cuotas.cuotas} cuotas sin interés con ${datos.nombreMarcas} (CFTEA ${datos.cuotas.cftea}), o con ${datos.porcentajeDineroMP}% OFF extra usando el dinero de tu cuenta.`
        : `Con tarjeta, débito, o con ${datos.porcentajeDineroMP}% OFF extra usando el dinero de tu cuenta.`,
    },
    {
      titulo: "Lo despachamos",
      texto: datos.envioGratisAmbaTexto
        ? `Preparamos tu pedido de lunes a viernes. ${TEXTOS.programa.envio.amba(datos.envioGratisAmbaTexto)}.${
            datos.envioGratisDesde > 0 ? ` ${TEXTOS.programa.envio.resto(datos.envioGratisTexto)}.` : ""
          }`
        : datos.envioGratisDesde > 0
          ? `Preparamos tu pedido de lunes a viernes. ${TEXTOS.programa.envio.unico(datos.envioGratisTexto)}.`
          : "Preparamos tu pedido y lo despachamos de lunes a viernes.",
    },
    {
      titulo: "Si no te convence, lo cambiás",
      texto: `Tenés ${datos.diasCambio} días para cambiarlo por otro color o modelo.`,
    },
  ];
}

export type Garantia = {
  clave: "cambios" | "pago" | "envio";
  titulo: string;
  texto: string;
  href?: string;
};

/** "Comprá seguro", debajo del botón de compra de la portada. */
export function garantiasDePortada(datos: {
  diasArrepentimiento: number;
  diasCambio: number;
  mesesGarantia: number;
  envioGratisDesde: number;
  envioGratisTexto: string;
  /** El mínimo de envío gratis en AMBA, ya formateado; null si no hay uno más bajo que el de todo el país. */
  envioGratisAmbaTexto?: string | null;
}): Garantia[] {
  return [
    {
      clave: "cambios",
      titulo: "Comprá seguro",
      texto:
        datos.diasArrepentimiento === datos.diasCambio
          ? `${datos.diasCambio} días para devolverlo sin costo o cambiarlo, y ${datos.mesesGarantia} meses de garantía por defectos de fabricación.`
          : `${datos.diasArrepentimiento} días para devolverlo sin costo, ${datos.diasCambio} para cambiarlo y ${datos.mesesGarantia} meses de garantía.`,
      href: "/legales/devoluciones",
    },
    {
      clave: "pago",
      titulo: "Pago seguro con Mercado Pago",
      texto: "Pagás en Mercado Pago: Harper nunca ve los datos de tu tarjeta.",
    },
    {
      // Los dos mínimos de Config y, donde se dice el del resto del país, que
      // se cuenta a precio de lista (Ale, 18/11/2026).
      clave: "envio",
      titulo: datos.envioGratisAmbaTexto
        ? TEXTOS.programa.envio.amba(datos.envioGratisAmbaTexto)
        : datos.envioGratisDesde > 0
          ? TEXTOS.programa.envio.unico(datos.envioGratisTexto)
          : "Envío a domicilio",
      texto: [
        datos.envioGratisAmbaTexto && datos.envioGratisDesde > 0 ? `${TEXTOS.programa.envio.resto(datos.envioGratisTexto)}.` : null,
        datos.envioGratisDesde > 0 ? TEXTOS.programa.envio.minimo : null,
        "Despachamos de lunes a viernes.",
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
}
