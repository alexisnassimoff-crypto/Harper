/**
 * Los textos de la marca, en un solo lugar.
 *
 * Ale, 30/10/2026: «no quiero vender el producto, sino la sensación que tenés
 * cuando los usás». La idea es el momento de salir a la calle y que se
 * oscurezcan solos. Y escrito como habla la gente de acá: oraciones enteras,
 * nada de frases sueltas ni metáforas que suenan a traducción (Ale: «parece
 * que las escribió alguien que no sabe castellano»).
 *
 * Reglas que siguen valiendo para cualquier cambio:
 * - Solo se afirma lo confirmado (lib/caracteristicas.ts, lib/lineas.ts):
 *   fotocromáticos, filtro de luz azul (filtra parte), UV400, liviano, apto
 *   para aumento. Nada médico ni prueba social inventada.
 * - No se cuentan los modelos ni los colores de hoy: la colección crece.
 * - Los precios, cuotas y promociones los pone el código, nunca el texto.
 */

export const TEXTOS = {
  portada: {
    titulo: "Salís a la calle y se oscurecen solos.",
    /** «Anteojos fotocromáticos con filtro de luz azul, a $ 89.900 el par.» Solo con las características confirmadas. */
    bajada: (precio: string | null) => `Anteojos fotocromáticos con filtro de luz azul${precio ? `, a ${precio} el par` : ""}.`,
    bajadaSinConfirmar: (precio: string | null) => `Anteojos Harper${precio ? `, a ${precio} el par` : ""}.`,
    /** «Si te llevás 3, pagás 2: $ 179.800 en 6 cuotas sin interés de $ 29.966,67.» */
    promo: (lleva: number, paga: number, total: string, cuotas: number, cuota: string) =>
      `Si te llevás ${lleva}, pagás ${paga}: ${total} en ${cuotas} cuotas sin interés de ${cuota}.`,
    nota: "Tocá «Al sol» o «Adentro» para ver cómo cambian. El tono final depende de la luz.",
    boton: "Quiero los míos",
  },
  lineas: {
    titulo: "Un par para cada ocasión.",
  },
  modelos: {
    titulo: "Todos cuestan lo mismo. Elegí el que más te guste.",
    tituloSinPrecio: "Elegí el que más te guste.",
    bajada: "Tocá un color para verlo.",
    bajadaConSol: "Tocá un color para verlo, al sol o adentro.",
    todos: "¿No te decidís?",
    todosBoton: "Llevate uno de cada modelo",
  },
  asiLlega: {
    etiqueta: "Qué trae cada par",
    titulo: "No tenés que cambiar de anteojos: cambian solos.",
    texto: "Son fotocromáticos: con el sol se oscurecen y, cuando entrás, se vuelven a aclarar.",
    alSol: "Al sol, se oscurecen solos.",
    adentro: "Adentro, claros y con filtro de luz azul.",
    /** «Vienen con estuche rígido Harper y paño de microfibra.» */
    incluye: (lista: string) => `Vienen con ${lista}.`,
    cierre: (precio: string) => `Todo eso por ${precio}. Y preparate, porque te van a preguntar dónde los compraste.`,
  },
  pack: {
    bajada: "Uno para la semana, otro para el finde y otro para regalar. Podés mezclar modelos y colores, y el descuento se aplica solo.",
  },
  viene: {
    titulo: "Esto recién empieza.",
    /** «Se vienen anteojos de sol polarizados, de receta y clip-on: 25 modelos nuevos en 95 colores.» */
    bajada: (lineas: string, modelos: number, colores: number) =>
      `Se vienen anteojos ${lineas}: ${modelos} modelos nuevos en ${colores} colores.`,
    boton: "Enterate primero en Instagram",
  },
  unDia: {
    etiqueta: "Un día cualquiera",
    titulo: "Un mismo par, de la mañana a la noche.",
    cafe: "Adentro del café están claros. Salís a la vereda y se oscurecen.",
    oficina: "Toda la tarde frente a la compu, con filtro de luz azul.",
    futbol: "Después del partido ya es de noche: quedan claros y los podés seguir usando.",
    brunch: "Mesa afuera al mediodía, con los mismos anteojos de toda la semana.",
  },
  cierre: {
    titulo: "¿Cuál te llevás? ¿O cuáles?",
    precio: (precio: string) => `Cada par cuesta ${precio}.`,
    /** « Y si te llevás tres, pagás dos.» */
    escala: (lleva: string, paga: string) => ` Y si te llevás ${lleva}, pagás ${paga}.`,
    boton: "Elegir los míos",
  },
  pie: {
    lema: "Diseño para todos los días.",
  },
  nosotros: {
    titulo: "Los anteojos también se eligen como la ropa.",
    bajada:
      "Durante años fueron algo que había que usar. Hoy vuelven a ser un accesorio: los elegís por el color, por la forma y por cómo los combinás con lo que te ponés.",
    frase: ["Para ver bien.", "Y para que te vean."],
    manifiesto: [
      {
        titulo: "Color, primero.",
        texto: "Colores pensados para combinar con lo que ya tenés en el placard: el jean de siempre, la camisa blanca, el buzo del domingo.",
      },
      {
        titulo: "Formas de ahora.",
        texto: "Líneas simples y actuales, sin nada recargado. Diseño de hoy para usar todos los días.",
      },
      {
        titulo: "Lindos, y además funcionan.",
        texto: "Se oscurecen solos al sol, filtran parte de la luz azul de las pantallas y tienen protección UV400.",
      },
      {
        titulo: "Sin caras famosas.",
        texto: "Ni celebridades ni campañas con modelos. Acá los protagonistas son los anteojos, y el estilo lo ponés vos.",
      },
    ],
    paleta: "¿Con cuál salís hoy?",
    paletaBajada: "Tocá un color para verlo de cerca.",
    /** «Se vienen más anteojos: de sol polarizados, de receta y clip-on.» */
    viene: (lineas: string) => `Se vienen más anteojos: ${lineas}.`,
    vieneBoton: "Ver lo que viene",
    cierre: "Anteojos para combinar. Buenos Aires, Argentina.",
  },
  /** Socios Harper (lib/socios.ts). Lo que se promete acá es lo que Ale aprobó para la membresía. */
  socios: {
    etiqueta: "Socios Harper",
    cupos: (quedan: number, cupos: number) => (quedan > 0 ? `Quedan ${quedan} de ${cupos} lugares` : `Los ${cupos} lugares ya están ocupados`),
    titulo: "Tus anteojos, resueltos por un año.",
    bajada:
      "Te hacés socio una vez y durante 12 meses tenés dos pares, envío gratis y reposición si se rompen o los perdés. Son pocos lugares y van numerados.",
    periodo: "por 12 meses",
    boton: "Hacerme socio",
    lleno: "Sin lugares",
    hojaTitulo: "Elegí tu primer par",
    planSocio: {
      apodo: "12 meses",
      titulo: "Socio",
      detalle: ["2 pares en el año: uno ahora y otro cuando quieras", "Envío gratis siempre", "Reposición si se rompen o los perdés"],
    },
    planAumento: {
      apodo: "Con tus cristales",
      titulo: "Socio con aumento",
      detalle: ["Todo lo del plan Socio", "Los cristales con aumento de los 2 pares, orgánicos y con filtro de luz azul"],
    },
    beneficios: [
      {
        titulo: "Dos pares en el año",
        texto:
          "Uno lo elegís cuando te hacés socio. El otro, cuando quieras durante los 12 meses, también de los modelos que lleguen después. Si el que elegís cuesta más, pagás solo la diferencia.",
      },
      { titulo: "Envío gratis, siempre", texto: "Todo lo que pidas como socio te llega sin costo de envío, a cualquier parte del país." },
      { titulo: "Si se rompen o los perdés", texto: "Te mandamos otro par igual, una vez en el año. No te preocupás más por tus anteojos." },
      { titulo: "Precio congelado", texto: "Si querés más pares durante el año, los pagás al precio del día en que te hiciste socio." },
      { titulo: "Antes que nadie", texto: "Cada vez que lancemos algo nuevo, los socios eligen 72 horas antes, cuando todavía están todos los colores." },
    ],
    beneficioAumento: {
      titulo: "Con aumento",
      texto: "En el plan con aumento, los cristales de los dos pares van incluidos: orgánicos y con filtro de luz azul. Nos mandás tu receta por WhatsApp y te los preparamos.",
    },
    pasosTitulo: "Cómo funciona",
    pasos: [
      "Elegís el plan y tu primer par.",
      "Pagás con Mercado Pago y te llega un mail con tu número de socio.",
      "El segundo par, la reposición y los cristales los pedís por WhatsApp con ese número.",
    ],
    condicionesTitulo: "Las condiciones",
    condiciones: [
      "La membresía dura 12 meses desde el día del pago y no se renueva sola.",
      "El segundo par y la reposición se piden una vez cada uno durante esos 12 meses. Si no los usás, vencen.",
      "Tenés 10 días para arrepentirte, como en cualquier compra online.",
      "Los lugares son pocos y van numerados. Cuando se ocupan todos, la inscripción se cierra.",
    ],
    enlace: "Ver todos los beneficios",
    ficha: {
      titulo: "Hacete socio con este par",
      texto: "Este par va incluido. Durante 12 meses tenés otro par más, envío gratis y reposición si se rompen o los perdés.",
    },
    /** Al final de la portada, después del precio del par. */
    cierre: " O hacete socio y tenés dos pares en el año.",
    anuncio: (quedan: number) => `Socios Harper: quedan ${quedan} lugares`,
    pregunta: "¿Qué es Socios Harper?",
    respuesta: (precio: string) =>
      `Una membresía de 12 meses: pagás ${precio} una vez y tenés dos pares en el año, envío gratis siempre, una reposición si se rompen o los perdés y precio congelado para los pares extra. Los lugares son pocos y van numerados.`,
  },
};
