/**
 * Los textos de la marca, en un solo lugar.
 *
 * Ale, 30/10/2026: «no quiero vender el producto, sino la sensación que tenés
 * cuando los usás». La idea rectora es el momento de salir a la calle: el sol
 * los oscurece solos, vos seguís con lo tuyo y te miran. Se eligió entre cinco
 * estilos (escalera de beneficios, micro-escenas, manifiesto, anuncios e
 * identidad) puntuados por tres criterios: deseo, anuncios de Meta y marca.
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
    titulo: "Salís. Se oscurecen solos. Te miran.",
    /** Solo si todos los modelos tienen las características confirmadas. */
    bajada: "Anteojos fotocromáticos con filtro de luz azul.",
    /** Va seguida del precio del par y, si hay, de la promoción con sus cuotas. */
    precio: "Un par para todo el día:",
    nota: "Probalos al sol y adentro. El tono final depende de la luz.",
    boton: "Quiero los míos",
  },
  lineas: {
    titulo: "Un par para cada luz.",
  },
  modelos: {
    titulo: "Un precio. Tu forma.",
    tituloSinPrecio: "Elegí tu forma.",
    bajada: "Tocá un color.",
    bajadaConSol: "Tocá un color. Pasalo al sol.",
    todos: "¿Para qué elegir uno?",
    todosBoton: "Sumá uno de cada",
  },
  asiLlega: {
    etiqueta: "Qué trae cada par",
    titulo: "No cambiás de anteojos. Cambian ellos.",
    texto: "Son fotocromáticos: el sol los oscurece solos y, cuando volvés a entrar, se aclaran. Vos seguís con lo tuyo.",
    alSol: "Al sol, se oscurecen solos.",
    adentro: "Adentro, claros y con filtro de luz azul.",
    /** Va después del precio: «Todo eso, $ 89.900. …». */
    cierre: "De esas compras que dan ganas de mostrar.",
  },
  pack: {
    bajada: "Uno para la semana. Otro para el finde. Otro porque sí. Mezclá modelos y colores: el descuento se aplica solo.",
  },
  viene: {
    titulo: "Esto recién empieza.",
    /** Va después de las líneas y de cuántos modelos y colores llegan. */
    cierre: "Andá haciendo lugar.",
    boton: "Enterate primero en Instagram",
  },
  unDia: {
    etiqueta: "Un día cualquiera",
    titulo: "Del cortado al partido, siempre a tono.",
    cafe: "Pedís adentro, claros. Salís con el vaso a la vereda: oscuros.",
    oficina: "Pantalla toda la tarde, filtro de luz azul. Y cara de tenerla clara.",
    futbol: "Ganes o pierdas, el tercer tiempo es con ellos puestos.",
    brunch: "Mesa afuera, sol de mediodía. Los del lunes, ahora oscuros.",
  },
  cierre: {
    titulo: "¿Cuál te llevás? ¿O cuáles?",
    /** «El que elijas, $ 89.900.» */
    precio: "El que elijas,",
    boton: "Elegir los míos",
  },
  pie: {
    lema: "Para ver bien. Y para que te vean.",
  },
  nosotros: {
    titulo: "Antes de salir, elegís los anteojos.",
    bajada:
      "Durante años fueron algo que había que usar. Hoy vuelven a ser un accesorio: se eligen como una campera o un reloj, por el color, la forma y con qué los combinás.",
    frase: ["Para ver la calle.", "Y que la calle te vea."],
    manifiesto: [
      {
        titulo: "Color, primero.",
        texto: "Abrís el placard: el jean de siempre, la camisa blanca, el buzo del domingo. Los colores están pensados para eso.",
      },
      {
        titulo: "Formas de ahora.",
        texto: "Te cruzás con tu reflejo en una vidriera y te gusta lo que ves. Líneas limpias, contemporáneas, nada de más.",
      },
      {
        titulo: "Lindos, y además funcionan.",
        texto: "Se oscurecen solos al sol, filtran parte de la luz azul y tienen UV400. Te los ponés por cómo quedan; te quedás por todo lo demás.",
      },
      {
        titulo: "Sin caras famosas.",
        texto: "Ni celebridades ni campañas con modelos. Acá la única cara que importa es la tuya.",
      },
    ],
    paleta: "¿Con cuál salís hoy?",
    paletaBajada: "Tocá un color y miralo de cerca, como frente al espejo.",
    viene: "Lo que viene es más grande:",
    vieneBoton: "Ver lo que viene",
    cierre: "Para cada luz de la ciudad. Buenos Aires, Argentina.",
  },
} as const;

