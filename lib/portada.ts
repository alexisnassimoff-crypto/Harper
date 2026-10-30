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
  "Anteojos Harper en varios modelos y colores. Comprá online y pagá con Mercado Pago. También estuches rígidos y paños de microfibra.";

export const TITULO_SITIO = "Harper — Anteojos";

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
// La portada con un modelo estrella

/**
 * El modelo que protagoniza la portada, clave `portada_producto` de Config.
 * Vacío = el Citrino, el que eligió Ale el 26/10/2026. "ninguno" (o un slug
 * que no esté publicado o no tenga stock) = la portada de catálogo de antes.
 */
export const PRODUCTO_PORTADA_POR_DEFECTO = "citrino";

export function slugDePortada(delConfig: string): string | null {
  const valor = delConfig.trim().toLowerCase();
  if (!valor) return PRODUCTO_PORTADA_POR_DEFECTO;
  return valor === "ninguno" ? null : valor;
}

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
  cupon: { codigo: string; porcentaje: number };
  porcentajeDineroMP: number;
}): Pregunta[] {
  const preguntas: Pregunta[] = [];

  if (datos.incluye.length > 0) {
    preguntas.push({
      pregunta: "¿Qué incluye cada par?",
      respuesta: conPunto(`Cada par incluye ${enumerar(datos.incluye.map(minuscula))}`),
    });
  }

  if (datos.caracteristicas && datos.caracteristicas.length > 0) {
    const [primera, ...resto] = datos.caracteristicas;
    preguntas.push({
      pregunta: "¿Qué tienen estos anteojos?",
      respuesta: conPunto(enumerar([primera, ...resto.map(minuscula)])),
    });
    preguntas.push({
      pregunta: "¿Les puedo poner cristales con aumento?",
      respuesta: `Sí: el armazón es apto para colocar cristales con aumento. Harper no vende cristales graduados${
        datos.hayWhatsapp ? "; si tenés dudas, consultanos por WhatsApp y te asesoramos." : "."
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
    respuesta: `Tenés ${datos.diasArrepentimiento} días desde que recibís el pedido para devolverlo sin costo y ${datos.diasCambio} días para cambiar de color o modelo, sin uso. Además, ${datos.mesesGarantia} meses de garantía por defectos o fallas.`,
    enlace: { href: "/legales/devoluciones", texto: "Ver la política de cambios" },
  });

  preguntas.push({
    pregunta: "¿Hay descuento en la primera compra?",
    respuesta: `Sí: con el código ${datos.cupon.codigo} tenés ${datos.cupon.porcentaje}% OFF en tu primera compra. No se suma a la promoción por cantidad: se aplica la que más te conviene. El ${datos.porcentajeDineroMP}% extra por pagar con dinero en Mercado Pago sí se suma.`,
  });

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
      texto: `${datos.diasArrepentimiento} días para devolverlo sin costo, ${datos.diasCambio} para cambiarlo y ${datos.mesesGarantia} meses de garantía.`,
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
