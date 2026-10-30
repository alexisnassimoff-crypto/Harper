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
    titulo: "Del café al partido, con el mismo par.",
    cafe: "Adentro del café están claros. Salís a la vereda y se oscurecen.",
    oficina: "Toda la tarde frente a la compu, con filtro de luz azul.",
    futbol: "Para jugar quedan en el bolso. Para el tercer tiempo, te los ponés.",
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
};
