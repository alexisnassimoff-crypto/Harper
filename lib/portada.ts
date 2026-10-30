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
 * Las preguntas frecuentes de la portada. Cada respuesta sale de algo que ya
 * es cierto en la tienda (lib/confianza.ts, lib/cupones.ts, lib/dinero-mp.ts,
 * Config): lo que no está confirmado no se pregunta. Sin plazos de entrega.
 */
export function preguntasDePortada(datos: {
  /** Lo que incluye cada par, de Airtable. Vacío = no se pregunta. */
  incluye: string[];
  /** Las características confirmadas del modelo, o null. */
  caracteristicas: readonly string[] | null;
  cuotas: { cuotas: number; cftea: string } | null;
  nombreMarcas: string;
  envioGratisDesde: number;
  envioGratisTexto: string;
  /** El mínimo de envío gratis en AMBA, ya formateado; null si no hay uno más bajo que el de todo el país. */
  envioGratisAmbaTexto?: string | null;
  hayWhatsapp: boolean;
  diasArrepentimiento: number;
  diasCambio: number;
  mesesGarantia: number;
  /** El cupón de primera compra; null si no hay (desde el 30/10/2026). */
  cupon: { codigo: string; porcentaje: number } | null;
  /** La escala de anteojos, "llevá 3 y pagá 2, o llevá 5 y pagá 3"; null si no hay. */
  escala?: string | null;
  /** El precio de Socios Harper ("$ 159.900"), si está a la venta. */
  socios?: string | null;
  porcentajeDineroMP: number;
}): Pregunta[] {
  const preguntas: Pregunta[] = [];

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
      datos.cuotas
        ? `En anteojos tenés ${datos.cuotas.cuotas} cuotas sin interés con ${datos.nombreMarcas} (CFTEA ${datos.cuotas.cftea}); el valor de cada cuota está junto al precio.`
        : null,
      `Si en el checkout elegís «Dinero en Mercado Pago» y pagás con el saldo de tu cuenta, tenés ${datos.porcentajeDineroMP}% OFF extra.`,
    ]
      .filter(Boolean)
      .join(" "),
  });

  preguntas.push({
    pregunta: "¿Cuánto cuesta el envío?",
    respuesta: [
      datos.envioGratisAmbaTexto
        ? datos.envioGratisDesde > 0
          ? `Es gratis en AMBA en compras desde ${datos.envioGratisAmbaTexto} y en todo el país desde ${datos.envioGratisTexto}. Si no, el costo aparece en el checkout apenas ponés tu dirección, antes de pagar.`
          : `Es gratis en AMBA en compras desde ${datos.envioGratisAmbaTexto}. Al resto del país, el costo aparece en el checkout apenas ponés tu dirección, antes de pagar.`
        : datos.envioGratisDesde > 0
          ? `Es gratis en compras desde ${datos.envioGratisTexto}. Si no, el costo aparece en el checkout antes de pagar.`
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
    }, sin uso, completo y en su empaque. Además, ${datos.mesesGarantia} meses de garantía por defectos de fabricación.`,
    enlace: { href: "/legales/devoluciones", texto: "Ver la política de cambios" },
  });

  if (datos.cupon) {
    preguntas.push({
      pregunta: "¿Hay descuento en la primera compra?",
      respuesta: `Sí: con el código ${datos.cupon.codigo} tenés ${datos.cupon.porcentaje}% OFF en tu primera compra. No se suma a la promoción por cantidad: se aplica la que más te conviene. El ${datos.porcentajeDineroMP}% extra por pagar con dinero en Mercado Pago sí se suma.`,
    });
  } else if (datos.escala) {
    preguntas.push({
      pregunta: "¿Hay descuento por llevar más de un par?",
      respuesta: `Sí: ${datos.escala}. Podés mezclar modelos y colores, y se aplica solo en el carrito. El ${datos.porcentajeDineroMP}% extra por pagar con dinero en Mercado Pago también se suma.`,
    });
  }

  if (datos.socios) {
    preguntas.push({
      pregunta: TEXTOS.socios.pregunta,
      respuesta: TEXTOS.socios.respuesta(datos.socios),
      enlace: { href: "/socios", texto: TEXTOS.socios.enlace },
    });
  }

  return preguntas;
}

export type Paso = { titulo: string; texto: string };

/** "Cómo es comprar en Harper", en cuatro pasos. Sin plazos de entrega. */
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
        ? `Preparamos tu pedido de lunes a viernes. Envío gratis en AMBA desde ${datos.envioGratisAmbaTexto}${
            datos.envioGratisDesde > 0 ? ` y en todo el país desde ${datos.envioGratisTexto}` : ""
          }.`
        : datos.envioGratisDesde > 0
          ? `Preparamos tu pedido de lunes a viernes. Envío gratis desde ${datos.envioGratisTexto}.`
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
      clave: "envio",
      titulo: datos.envioGratisAmbaTexto
        ? `Envío gratis en AMBA desde ${datos.envioGratisAmbaTexto}`
        : datos.envioGratisDesde > 0
          ? `Envío gratis desde ${datos.envioGratisTexto}`
          : "Envío a domicilio",
      texto:
        datos.envioGratisAmbaTexto && datos.envioGratisDesde > 0
          ? `En todo el país, gratis desde ${datos.envioGratisTexto}. Despachamos de lunes a viernes.`
          : "Despachamos de lunes a viernes.",
    },
  ];
}
