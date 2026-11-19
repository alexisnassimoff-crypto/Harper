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
    /**
     * Ale, 05/11/2026: la primera pantalla vende los anteojos, no la
     * suscripción (que tiene su sección más abajo). Solo con las
     * características confirmadas en lib/caracteristicas.ts.
     */
    titulo: "Anteojos de diseño que se oscurecen solos.",
    tituloSinConfirmar: "Anteojos de diseño.",
    descripcion:
      "Fotocromáticos con filtro de luz azul y UV400: al sol se oscurecen y adentro vuelven a aclararse.",
    /**
     * La acción secundaria de la portada de antes, que bajaba al bloque de la
     * cuenta. Sin uso (PortadaColor no está en ninguna página); la clave se
     * llama así desde antes del 18/11/2026.
     */
    beneficios: "Abrir mi cuenta",
    /** La frase de antes de la portada; ahora abre «Un mismo par». */
    sensacion: "Salís a la calle y se oscurecen solos.",
    etiqueta: "Harper · Colección fotocromática",
    /** «Anteojos fotocromáticos con filtro de luz azul, a $ 89.900 el par.» Solo con las características confirmadas. */
    bajada: (precio: string | null) => `Anteojos fotocromáticos con filtro de luz azul${precio ? `, a ${precio} el par` : ""}.`,
    bajadaSinConfirmar: (precio: string | null) => `Anteojos Harper${precio ? `, a ${precio} el par` : ""}.`,
    /** «Si te llevás 3, pagás 2: $ 179.800 en 6 cuotas sin interés de $ 29.966,67.» */
    promo: (lleva: number, paga: number, total: string, cuotas: number, cuota: string) =>
      `Si te llevás ${lleva}, pagás ${paga}: ${total} en ${cuotas} cuotas sin interés de ${cuota}.`,
    nota: "Tocá «Al sol» o «Adentro» para ver cómo cambian. El tono final depende de la luz.",
    boton: "Ver anteojos",
  },
  /**
   * La portada simplificada (Ale, 05/11/2026): presentación de la marca,
   * comprar por categoría, confianza, suscripción y opiniones. Nada más.
   * La primera pantalla presenta a Harper como marca de anteojos de diseño,
   * sin atarla a los fotocromáticos (de sol, receta y clip-on vienen después).
   */
  inicio: {
    /** La identificación del producto, arriba del titular: siempre visible. */
    producto: "Anteojos de diseño",
    /** El titular es la frase de la marca (TEXTOS.nosotros.frase), en dos tiempos. */
    bajada: "Formas simples y colores para combinar con lo que ya tenés en el placard.",
    boton: "Explorar anteojos",
    /** Qué muestra el video del hero, para quien no lo ve. */
    video: "Anteojos Harper con cristales fotocromáticos: se oscurecen al sol y se aclaran adentro.",
    comprar: {
      etiqueta: "Comprar",
      titulo: "Elegí tus anteojos.",
      verTodos: "Ver todos",
      agregar: "Agregar",
      agregado: "Agregado",
      sinStock: "Sin stock",
      tambien: "También",
    },
    confianza: {
      titulo: "Comprá tranquilo",
      envio: "Envíos a todo el país",
      envioDetalle: "A domicilio",
      whatsapp: "Te asesoramos por WhatsApp",
      whatsappDetalle: "Modelo, talle o cristales con aumento",
    },
    /**
     * La cuenta Harper y las novedades (Ale, 18/11/2026: los beneficios en
     * plata de la suscripción terminaron para todos; quedan la cuenta y los
     * mails de novedades). Breve: título, una bajada y el formulario a mano;
     * qué trae la cuenta y sus condiciones, a un enlace (/suscriptores). Nada
     * técnico: lo del código aparece recién cuando se manda.
     */
    suscripcion: {
      etiqueta: "Cuenta Harper · Es gratis",
      titulo: "Enterate antes que nadie.",
      bajada:
        "Dejanos tu mail y te avisamos cuando salen modelos y colores nuevos. Con ese mismo mail entrás a tu cuenta, donde seguís tus compras y guardás tus favoritos.",
      /** El enlace secundario, a /suscriptores (la clave se llama así desde antes del 18/11/2026). */
      beneficios: "Conocé la cuenta Harper y sus condiciones",
      /** La caja de la ficha, que desde el 18/11/2026 no se muestra. */
      boton: "Abrir mi cuenta gratis",
      condiciones: "Ver las condiciones completas",
    },
  },
  /** Por qué Harper (Ale, 05/11/2026): cómo es comprar, sin repetir las promociones. */
  tranquilo: {
    etiqueta: "Comprá tranquilo",
    titulo: "Comprar online, sin vueltas.",
    envio: { texto: "Envíos a domicilio a todo el país", detalle: "Lo despachamos cuando se acredita el pago." },
    whatsapp: { texto: "Te asesoramos por WhatsApp", detalle: "Para elegir modelo, color o talle, o consultar por cristales con aumento.", enlace: "Escribinos" },
  },
  /**
   * Anterior al 18/11/2026 y sin uso: el bloque «Promociones» que salió de la
   * portada el 05/11/2026. Lo que hoy se dice de las condiciones de compra
   * está en `programa`, acá abajo. No usar en nada nuevo.
   */
  promos: {
    etiqueta: "Promociones vigentes",
    titulo: "Condiciones de compra.",
    dineroMP: "OFF extra pagando con dinero en tu cuenta de Mercado Pago.",
    envioGratis: "Envío gratis",
  },
  /**
   * Las condiciones de compra (Ale, 18/11/2026), dichas igual en todos lados:
   * la barra de anuncios, la portada, la ficha, las tarjetas y las preguntas
   * frecuentes. Son cuatro y no hay otra: el Dúo, el 10 % por pagar con el
   * dinero de la cuenta de Mercado Pago, las cuotas sin interés y el envío
   * gratis por zona. Tener cuenta no cambia ninguna.
   *
   * Acá no se escribe ningún importe, porcentaje ni cantidad de cuotas: llegan
   * siempre como parámetro, del servidor (lib/pedidos.ts, lib/duo.ts,
   * lib/dinero-mp.ts), de Mercado Pago (las cuotas verificadas) o de Config
   * (los mínimos del envío). El Dúo se nombra solo cuando el servidor dice que
   * está prendido (HARPER_DUO_ACTIVO): apagado, ninguna de sus frases se usa.
   */
  programa: {
    duo: {
      /** «Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF». Sin punto final: va en la barra y, con punto, de título. */
      regla: (porcentaje: number) => `Dúo: llevá dos anteojos y el de menor precio tiene ${porcentaje}% OFF`,
      /**
       * «Dos anteojos: $ 157.325 en lugar de $ 179.800.» Los dos importes son
       * los del carrito del servidor. Nunca «antes»: ese precio no existió.
       */
      dosAnteojos: (total: string, lista: string) => `Dos anteojos: ${total} en lugar de ${lista}.`,
      /** Lo mismo en la ficha, donde el importe es el de dos de ese modelo. */
      dosDeEsteModelo: (total: string, lista: string) => `Dos de este modelo: ${total} en lugar de ${lista}.`,
      combinar: "Podés combinar modelos y colores. Se aplica solo en el carrito.",
      /** La etiqueta junto al precio de cada anteojo: «Dúo: 25% OFF llevando dos». */
      etiqueta: (porcentaje: number) => `Dúo: ${porcentaje}% OFF llevando dos`,
      /** Las preguntas frecuentes. */
      pregunta: "¿Qué es el Dúo?",
      /** «Si llevás dos anteojos, el de menor precio tiene 25% OFF.» */
      respuesta: (porcentaje: number) => `Si llevás dos anteojos, el de menor precio tiene ${porcentaje}% OFF.`,
      /** Con tres, uno; con cuatro, dos: el servidor descuenta la mitad de los anteojos, los de menor precio (lib/duo.ts). */
      conMas: "Con más anteojos, el descuento va en uno de cada dos, siempre en los de menor precio.",
      /** «El 10% OFF extra por pagar con dinero en Mercado Pago se suma al Dúo: dos anteojos quedan en $ 141.593.» El importe, del servidor; sin él, sin la cuenta. */
      conDineroMP: (porcentaje: number, dosAnteojos: string | null) =>
        `El ${porcentaje}% OFF extra por pagar con dinero en Mercado Pago se suma al Dúo${dosAnteojos ? `: dos anteojos quedan en ${dosAnteojos}` : ""}.`,
    },
    dineroMP: {
      /** La barra de anuncios y los títulos: «10% OFF extra pagando con dinero en Mercado Pago». */
      barra: (porcentaje: number) => `${porcentaje}% OFF extra pagando con dinero en Mercado Pago`,
      detalle: "Pagando con el dinero de tu cuenta de Mercado Pago, en un pago. No se aplica al envío.",
      /** Solo con el Dúo prendido. */
      seSumaAlDuo: "Se suma al Dúo.",
      /** Debajo del precio: «o $ 80.910 con dinero en Mercado Pago». El importe lo calcula el servidor. */
      precio: (monto: string) => `o ${monto} con dinero en Mercado Pago`,
    },
    cuotas: {
      /** «3 cuotas sin interés»: solo las que Mercado Pago confirmó para ese importe. */
      sinInteres: (cuotas: number) => `${cuotas} cuotas sin interés`,
      /** «Visa y Mastercard · CFTEA 0,00 %»: las condiciones, siempre al lado de las cuotas. */
      condiciones: (marcas: string, cftea: string) => `${marcas} · CFTEA ${cftea}`,
      /**
       * Las condiciones de las cuotas de las tarjetas de la portada, una vez
       * para todas: «Cuotas sin interés con Visa y Mastercard · CFTEA 0,00 % ·
       * Precio de contado $ 89.900». Si los modelos no cuestan lo mismo, sin
       * el importe: el precio de contado es el de cada uno.
       */
      deLaSeccion: (marcas: string, cftea: string, contado: string | null) =>
        `Cuotas sin interés con ${marcas} · CFTEA ${cftea} · ${contado ? `Precio de contado ${contado}` : "El precio de contado es el de cada anteojo"}`,
      /** Las cuotas son de cualquier comprador (Ale, 18/11/2026: nadie tiene más). */
      paraTodos: "Son las mismas para todos: no hace falta tener cuenta.",
    },
    envio: {
      /** «Envío gratis en AMBA desde $ 60.000». El mínimo, de Config (envio_gratis_amba_desde). */
      amba: (monto: string) => `Envío gratis en AMBA desde ${monto}`,
      /** «Al resto del país, gratis desde $ 250.000». El mínimo, de Config (envio_gratis_desde). */
      resto: (monto: string) => `Al resto del país, gratis desde ${monto}`,
      /** Sin un mínimo propio para AMBA hay uno solo: «Envío gratis desde $ 250.000». */
      unico: (monto: string) => `Envío gratis desde ${monto}`,
      /** Va donde se dice el mínimo: el servidor lo mide antes del Dúo y del 10 % de Mercado Pago. */
      minimo: "El mínimo se cuenta con los anteojos a precio de lista, antes de los descuentos.",
    },
  },
  lineas: {
    titulo: "Un par para cada ocasión.",
  },
  modelos: {
    titulo: "¿Con cuál salís hoy?",
    tituloSinPrecio: "¿Con cuál salís hoy?",
    /** Solo si todos los modelos cuestan lo mismo (precioUnico). */
    mismoPrecio: "Todos cuestan lo mismo.",
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
    /** La misma frase en dos partes, para poner el precio en otra letra. */
    todoEso: "Todo eso por",
    preparate: "Y preparate, porque te van a preguntar dónde los compraste.",
    aumento: "¿Usás aumento? Te ponemos los cristales oftálmicos.",
  },
  pack: {
    /** Sin uso desde que salió el descuento por cantidad: no promete ninguno (Ale, 18/11/2026). */
    bajada: "Uno para la semana y otro para el finde. Podés combinar modelos y colores.",
  },
  viene: {
    titulo: "Esto recién empieza.",
    /** «Se vienen anteojos de sol polarizados, de receta y clip-on: 25 modelos nuevos en 95 colores.» */
    bajada: (lineas: string, modelos: number, colores: number) =>
      `Se vienen anteojos ${lineas}: ${modelos} modelos nuevos en ${colores} colores.`,
    boton: "Enterate primero en Instagram",
    /** Los suscriptores reciben los lanzamientos por mail. */
    suscribite: "Suscribite y te avisamos por mail",
  },
  unDia: {
    etiqueta: "Un día cualquiera",
    titulo: "Un mismo par, de la mañana a la noche.",
    /** Ale, 04/11/2026: para qué sirven, sin horarios ni lugares que segmenten. */
    usos: [
      { titulo: "Compu y celu", texto: "Filtran parte de la luz azul de las pantallas." },
      { titulo: "De día, al sol", texto: "Se oscurecen solos al salir y te protegen de los rayos UV." },
      { titulo: "Adentro", texto: "Vuelven a aclararse cuando entrás: no tenés que sacártelos." },
      { titulo: "De noche", texto: "Quedan claros y los seguís usando para salir." },
    ],
  },
  /**
   * La ficha de producto (Plan Maestro, 04/11/2026): medidas, talle y cómo
   * funcionan los cristales. Solo lo confirmado en lib/caracteristicas.ts y
   * cómo se comporta cualquier cristal fotocromático; nada médico.
   */
  ficha: {
    talle: {
      titulo: "Medidas y talle",
      verMedidas: "Ver medidas y talle",
      sinMedidas: "Estamos cargando las medidas de este modelo. Si querés saberlas ya, escribinos y te las pasamos.",
      dibujo: "Dibujo de un anteojo de frente con las medidas marcadas",
      guiaTitulo: "Cómo saber si te va a quedar bien",
      guia: [
        "Buscá unos anteojos que te queden cómodos y mirá la parte de adentro de la patilla: vas a ver tres números, por ejemplo 52-18-140.",
        "El primero es el calibre (el ancho de cada cristal), el segundo es el puente (la parte que apoya en la nariz) y el tercero es el largo de la patilla, en milímetros.",
        "Si el calibre y el puente de este modelo están a 2 o 3 mm de los tuyos, lo más probable es que te quede parecido. La patilla influye menos.",
      ],
      tallesTitulo: "Talles, por el ancho total del frente",
      orientativo: "Los talles son una orientación, no una garantía de ajuste: la forma de la cara y cómo te gusta llevarlos también cuentan.",
      etiqueta: "Talle orientativo",
      consultar: "¿Dudas con el talle? Escribinos",
    },
    cristales: {
      titulo: "Cristales fotocromáticos",
      /** El acceso desde las características, que abre la sección. */
      comoFuncionan: "Cómo funcionan los cristales",
      bajada: "Cambian solos según la luz: al sol se oscurecen y adentro vuelven a aclararse. Así usás el mismo par todo el día.",
      puntos: [
        { titulo: "Cómo funcionan", texto: "Reaccionan a los rayos UV del sol. Por eso se oscurecen al aire libre y no con la luz de una lámpara." },
        { titulo: "En el auto", texto: "El parabrisas frena gran parte de los rayos UV, así que ahí adentro se oscurecen menos." },
        { titulo: "Con frío y con calor", texto: "El frío los oscurece un poco más y el calor, un poco menos." },
        { titulo: "Además", texto: "Filtran parte de la luz azul de las pantallas y tienen protección UV400 contra los rayos UVA y UVB." },
      ],
    },
    condiciones: {
      titulo: "Envío, devoluciones y garantía",
    },
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
  /** El carrito y el checkout (recorrido móvil, Ale, 08/11/2026). */
  checkout: {
    /** Cuando el pedido no llega al servidor (sin conexión): en vez del «Failed to fetch» del navegador. */
    sinConexion: "No pudimos conectarnos. Revisá tu conexión y tocá Pagar de nuevo: tu carrito y tus datos siguen acá.",
    /** Después de un pago rechazado, para que sepa que no tiene que empezar de cero. */
    siguenAca: "Tu carrito y tus datos siguen acá.",
    dudas: "¿Dudas antes de pagar?",
    escribinos: "Escribinos por WhatsApp",
    /**
     * Con el Dúo aplicado y sin llegar todavía al mínimo del envío gratis (Ale,
     * 18/11/2026), junto a «Te faltan…», «gratis desde…» y «Agregá $ X más…»:
     * el servidor mide el mínimo antes del descuento del Dúo, y sin decirlo la
     * cuenta no le cierra a quien mira el total. Se muestra solo si algún
     * renglón trae el Dúo del servidor (lib/envio-gratis.ts): con el Dúo
     * apagado, nunca.
     */
    minimoAntesDelDuo: "El mínimo se cuenta con los anteojos a precio de lista, antes del descuento del Dúo.",
  },
  /**
   * Quiénes somos (Ale, 04/11/2026: sin «Los anteojos también se eligen como
   * la ropa» ni lo del accesorio; 08/11/2026: página editorial de marca). Sin
   * historia de la empresa, fabricación, materiales ni certificaciones: lo que
   * se dice del producto es lo confirmado en lib/caracteristicas.ts, y lo de
   * comprar sale de las mismas condiciones que la ficha (lib/ficha.ts).
   */
  nosotros: {
    titulo: "Quiénes somos",
    etiqueta: "Quiénes somos · Buenos Aires, Argentina",
    /** La frase de la marca, en dos tiempos (también abre la portada). */
    frase: ["Para ver bien.", "Y para que te vean."],
    bajada:
      "Harper es una marca de anteojos de Buenos Aires. Nos ocupamos de dos cosas: la forma y el color. Que te queden bien y que combinen con lo que te ponés.",
    ideas: {
      etiqueta: "Cómo pensamos los anteojos",
      titulo: "Lo primero que se ve de vos.",
      bajada:
        "Los anteojos se usan todo el día y están siempre a la vista. Por eso no los pensamos solo para ver mejor: también tienen que ir con tu estilo.",
    },
    manifiesto: [
      {
        titulo: "Color, primero.",
        texto: "Colores pensados para combinar con lo que ya tenés en el placard: el jean de siempre, la camisa blanca, el buzo del domingo.",
      },
      {
        titulo: "Formas con carácter.",
        texto: "Cada modelo tiene la suya: del rectangular que nunca falla al geométrico que se hace notar. Líneas simples, sin nada recargado.",
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
    coleccion: {
      etiqueta: "La colección",
      titulo: "Cada forma, en sus colores.",
      bajada: "Tocá un color para ver el modelo de cerca.",
      /** «Ver el Citrino». */
      verModelo: (nombre: string) => `Ver el ${nombre}`,
    },
    compra: {
      etiqueta: "Comprar en Harper",
      titulo: "Comprar online, sin vueltas.",
      bajada: "Las condiciones son las mismas en toda la tienda y las tenés por escrito.",
      whatsapp: "Te asesoramos por WhatsApp",
      whatsappDetalle: "Para elegir modelo, color o talle, o consultar por cristales con aumento.",
      whatsappEnlace: "Escribinos",
    },
    cierre: {
      titulo: "¿Con cuál salís hoy?",
      texto: "Mirá todos los modelos y sus colores, y elegí el tuyo.",
      boton: "Explorar anteojos",
    },
    /** «Se vienen más anteojos: de sol polarizados, de receta y clip-on.» */
    viene: (lineas: string) => `Se vienen más anteojos: ${lineas}.`,
  },
  /** El corazón de los anteojos (Ale, 05/11/2026): se guardan en la cuenta Harper. `que` es «CITRINO Carey». */
  favoritos: {
    guardar: (que: string) => `Guardar ${que} en favoritos`,
    quitar: (que: string) => `Quitar ${que} de favoritos`,
    guardado: (que: string) => `Guardaste ${que} en tus favoritos.`,
    quitado: (que: string) => `Quitaste ${que} de tus favoritos.`,
    verMisFavoritos: "Ver mis favoritos",
    entrarTitulo: "Guardá tus favoritos en tu cuenta Harper.",
    entrarTexto: "Entrá con tu mail y los encontrás desde cualquier dispositivo.",
    entrar: "Entrar y guardar",
    cerrar: "Cerrar",
    error: "No pudimos guardar tu favorito. Probá de nuevo en un rato.",
    /** En «Mi cuenta», cuando llegó desde un corazón sin haber entrado. */
    pendiente: (que: string) => `Entrá con tu mail y guardamos ${que} en tus favoritos.`,
  },
  /**
   * La cuenta Harper y los mails de novedades (lo que nació el 03/11/2026
   * como Suscriptores Harper, lib/suscriptores.ts). Ale, 18/11/2026: los
   * beneficios en plata terminaron para todos (cupón de bienvenida, saldo de
   * vuelta, envío gratis siempre y cuotas propias). Quedan la cuenta (compras,
   * favoritos, datos y direcciones) y los mails de novedades, y así se dice:
   * «tu cuenta Harper», «las novedades de Harper»; el nombre del programa ya
   * no se le muestra a nadie. Los montos, porcentajes y días los pone el
   * código, nunca el texto.
   *
   * Las claves que hablan de cupón, cashback, envío gratis o cuotas de
   * suscriptor son de antes de ese día: ninguna página de la cuenta las usa y
   * se borran en la limpieza. No usarlas en nada nuevo.
   */
  suscriptores: {
    etiqueta: "Cuenta Harper",
    /**
     * Anterior al 18/11/2026: los cuatro beneficios, uno por renglón. Hoy solo
     * los lee el mail de bienvenida (lib/mails.ts), que se reescribe aparte.
     */
    beneficios: {
      /** «$ 10.000 de descuento en tu primera compra.» */
      cupon: (monto: string) => `${monto} de descuento en tu primera compra.`,
      cashback: (porcentaje: number, dias: number) =>
        `Te devolvemos el ${porcentaje}% de lo que pagás en productos como saldo para tus próximas compras. Lo podés usar a los ${dias} días y no vence.`,
      envio: "Envío gratis siempre, a todo el país.",
      /** «6 cuotas sin interés con Visa y Mastercard · CFTEA 0,00 %.» Solo verificadas. */
      cuotas: (cuotas: number, marcas: string, cftea: string) => `${cuotas} cuotas sin interés con ${marcas} · CFTEA ${cftea}.`,
    },
    comoUsarlos: "Entrá con tu mail en harper.ar antes de comprar: los beneficios se aplican solos en el carrito.",
    /**
     * Sin uso desde el 18/11/2026: la cuenta ya no tiene envío gratis, y el
     * carrito y el checkout muestran la nota de envío de cualquier compra
     * (lib/envio-gratis.ts). Antes decía que el envío era gratis por estar suscripto.
     */
    envioGratis: "El envío es gratis desde el mínimo de cada zona, con cuenta o sin cuenta.",
    /**
     * En el checkout, con la cuenta abierta (Ale, 18/11/2026): solo con qué
     * mail compra, seguido de «¿No sos vos? Salir» (checkoutCaja.salir). La
     * cuenta no cambia el precio, el envío ni las cuotas.
     */
    checkout: (email: string) => `Comprás con tu cuenta ${email}.`,
    /** Sin uso desde el 18/11/2026: quien se dio de baja de las novedades ve la misma línea que cualquier cuenta. */
    checkoutBaja: (email: string) => `Comprás con tu cuenta ${email}.`,
    /**
     * El pedido que queda en $ 0 (Ale, 18/11/2026): no pasa por Mercado Pago,
     * el servidor lo confirma solo. El checkout dice con qué quedó cubierto,
     * según lo que contesta el servidor: el saldo a favor de antes del
     * 18/11/2026 (`sinPago`), el Crédito Harper (solo con su interruptor
     * prendido), los dos, o sin decir con qué si el servidor no informa ninguno.
     */
    sinPago: "No tenés que pagar nada: lo cubre tu saldo a favor.",
    sinPagoCredito: "No tenés que pagar nada: lo cubre tu Crédito Harper.",
    sinPagoSaldoYCredito: "No tenés que pagar nada: lo cubren tu saldo a favor y tu Crédito Harper.",
    sinPagoSinMas: "No tenés que pagar nada por este pedido.",
    /** El botón de ese pedido, en lugar de «Pago seguro». */
    confirmar: "Confirmar pedido",
    /**
     * Anterior al 18/11/2026: el cupón de bienvenida terminó y el servidor ya
     * no llega a este aviso (app/api/checkout/route.ts conserva la rama, que
     * hoy no se alcanza). Se borra en la limpieza, junto con esa rama.
     */
    cuponRechazado: "El cupón de bienvenida es para la primera compra, y ya hay una compra con este mail o DNI.",
    /** El saldo a favor de antes del 18/11/2026 cambió entre que vio el total y confirmó. */
    saldoCambio: "Tu saldo a favor cambió mientras comprabas. Revisá el total antes de confirmar.",
    /** Anterior al 18/11/2026, como `cuponRechazado`: el servidor ya no llega a este aviso. */
    cuponOtroMail: (email: string) => `El cupón de bienvenida es para comprar con el mail con el que te suscribiste (${email}).`,
    /** Otro pago de la misma cuenta se está creando en este momento (otra pestaña). */
    otroPagoEnCurso: "Ya estamos preparando otro pago tuyo. Esperá unos segundos y probá de nuevo.",
    /** El saldo a favor de antes del 18/11/2026 que aparta un pedido sin pagar. */
    saldoReservado: (monto: string, minutos: number) =>
      `Tenés ${monto} apartados en un pedido que todavía no pagaste: si no lo pagás, vuelven a tu saldo a favor en ${minutos} minutos.`,
    /** Entró o salió de su cuenta entre que vio el total y apretó pagar (Ale, 18/11/2026: sin «suscriptor» ni «beneficios»). */
    sesionCambio: "Entraste o saliste de tu cuenta mientras comprabas. Revisá el total antes de pagar.",

    /**
     * Anterior al 18/11/2026: los mismos beneficios con un título corto. Ya no
     * los muestra ninguna página (/suscriptores muestra `cuentaDa`).
     */
    tarjetas: {
      cupon: (monto: string) => ({ titulo: `${monto} de bienvenida`, detalle: "De descuento en tu primera compra. Una sola vez por persona." }),
      cashback: (porcentaje: number, dias: number) => ({
        titulo: `${porcentaje}% de vuelta`,
        detalle: `De lo que pagás en productos, como saldo a favor. Lo usás desde los ${dias} días del pago, no vence y puede pagar la compra entera.`,
      }),
      envio: { titulo: "Envío gratis siempre", detalle: "En todas tus compras, a todo el país y sin mínimo." },
      /** «6 cuotas sin interés» · «Con Visa y Mastercard · CFTEA 0,00 %. Sin suscribirte, 3.» */
      cuotas: (cuotas: number, marcas: string, cftea: string, todos: number | null) => ({
        titulo: `${cuotas} cuotas sin interés`,
        detalle: `Con ${marcas} · CFTEA ${cftea}.${todos ? ` Sin suscribirte,\u00a0${todos}.` : ""}`,
      }),
    },
    /**
     * La página /suscriptores (Ale, 18/11/2026): las novedades por mail y la
     * cuenta, con las mismas palabras que la portada (TEXTOS.inicio.suscripcion).
     */
    titulo: "Enterate antes que nadie.",
    bajada:
      "Dejanos tu mail y te avisamos cuando salen modelos y colores nuevos. Con ese mismo mail entrás a tu cuenta, donde seguís tus compras y guardás tus favoritos.",
    /** El título de la página en el navegador y su resumen para los buscadores. */
    paginaTitulo: "Tu cuenta y las novedades",
    paginaDescripcion:
      "Dejanos tu mail y te avisamos cuando salen modelos y colores nuevos de Harper. Con ese mismo mail entrás a tu cuenta, donde seguís tus compras y guardás tus favoritos. Es gratis.",
    /** Lo que da la cuenta, en /suscriptores: donde antes iban los beneficios. */
    cuentaDa: [
      { titulo: "Novedades por mail", detalle: "Te avisamos cuando salen modelos y colores nuevos." },
      { titulo: "Tus compras", detalle: "Ves tus pedidos y seguís cada envío." },
      { titulo: "Tus favoritos", detalle: "Guardás con el corazón los anteojos que te gustan." },
      { titulo: "Tus datos y direcciones", detalle: "Los guardás una vez y no los cargás de nuevo en cada compra." },
    ],
    pasosTitulo: "Cómo funciona",
    /** El último dice que la baja es solo de los mails de novedades. */
    pasos: [
      "Dejás tu mail y lo confirmás con el código que te mandamos.",
      "Desde ese momento te avisamos por mail cuando salen modelos y colores nuevos.",
      "Con ese mismo mail entrás a tu cuenta cuando quieras: ahí están tus compras, tus favoritos, tus datos y tus direcciones.",
      "Si no querés recibir más los mails de novedades, te das de baja cuando quieras. Tu cuenta sigue igual.",
    ],
    condicionesCuenta: "Condiciones de la cuenta Harper",
    /** Anterior al 18/11/2026, sin uso. El enlace de la portada, debajo del botón de comprar. */
    enlacePortada: (monto: string) => `Suscribite gratis y desbloqueá ${monto} de bienvenida`,
    /** La barra de anuncios. */
    anuncio: (monto: string) => `Suscribite gratis y desbloqueá ${monto} de bienvenida y envío gratis siempre`,
    /** La cuota de suscriptor junto a la de todos (barra, ficha): «6 si sos suscriptor». */
    cuotasSuscriptor: (cuotas: number) => `${cuotas} si sos suscriptor`,
    /**
     * Las cuotas de suscriptor como beneficio exclusivo (Ale, 05/11/2026), en
     * la ficha y el carrito, junto a las del comprador.
     */
    cuotasBeneficio: {
      /** A quien no es suscriptor: «O 6 cuotas sin interés de $ 14.983,33, exclusivo para suscriptores Harper.» */
      exclusivo: "exclusivo para suscriptores Harper",
      /** Al suscriptor con la sesión abierta, junto a sus 6. */
      tuyo: "Beneficio de suscriptor",
    },
    condiciones: "Ver las condiciones",
    /** Anterior al 18/11/2026, sin uso (components/suscriptores/IrAlFormulario.tsx no está en ninguna página). */
    portada: {
      cta: "Suscribirme gratis",
      beneficios: "Tus beneficios",
      formTitulo: "Suscribite con tu mail",
    },
    /**
     * El formulario para suscribirse o entrar (components/suscriptores/FormularioSuscripcion.tsx).
     * Suscribirse es aceptar los mails de novedades y abre la cuenta; entrar
     * no pide nada más que el mail y el código.
     */
    form: {
      email: "Tu mail",
      nombre: "Tu nombre (opcional)",
      acepto: "Acepto las condiciones de la cuenta Harper y recibir sus mails con novedades, lanzamientos y promociones.",
      faltaAcepto: "Para suscribirte, marcá que aceptás recibir nuestros mails.",
      suscribirme: "Suscribirme gratis",
      pedirCodigo: "Mandame el código",
      codigoEnviado: (email: string) => `Te mandamos un código a ${email}. Escribilo acá: vence en 10 minutos.`,
      codigo: "Código",
      confirmar: "Confirmar",
      otroMail: "Usar otro mail",
      /** Quiso entrar con un mail que todavía no tiene cuenta: el mismo código la abre, con la casilla. */
      noSuscripto: "Todavía no hay una cuenta con ese mail. Para abrirla, marcá que aceptás recibir nuestros mails y confirmá.",
      yaSos: "¿Ya tenés cuenta?",
      entrar: "Entrá con tu mail",
      quieroSuscribirme: "Todavía no: quiero suscribirme",
      /** Después de confirmar el código (Ale, 18/11/2026): sin cupón, envío, saldo ni beneficios. */
      listo: {
        nueva: "¡Listo! Ya estás suscripto y tu cuenta quedó abierta.",
        reactivada: "¡Listo! Ya estás suscripto otra vez a las novedades de Harper.",
        ya: "Ya estabas suscripto: entraste a tu cuenta.",
        baja: "Entraste a tu cuenta. Como te diste de baja, no te mandamos los mails de novedades.",
      },
      /** Anteriores al 18/11/2026, sin uso: lo que decía el formulario del cupón y de los beneficios. */
      listoCupon: (monto: string) => `Tu cupón de ${monto} y el envío gratis se aplican solos en el carrito.`,
      listoSinCupon: "Tus beneficios se aplican solos en el carrito.",
    },
    elegir: "Elegir mis anteojos",
    verCuenta: "Ver mi cuenta",
    /** «Mi cuenta» (/suscriptores/mi-cuenta). Arriba de la página va `etiquetaCuenta`: «Mi Cuenta Harper». */
    cuenta: {
      titulo: "Mi cuenta",
      hola: (nombre: string) => `Hola, ${nombre}.`,
      entrarTitulo: "Entrá a tu cuenta",
      entrarBajada: "Escribí tu mail y te mandamos un código para entrar.",
      /** Debajo del formulario de entrada, con el enlace a /suscriptores (Ale, 18/11/2026: sin «beneficios»). */
      noSuscripto: "¿Todavía no tenés cuenta?",
      verBeneficios: "Mirá qué incluye y abrila gratis",
      /**
       * El saldo de antes del 18/11/2026 (lo que volvía de cada compra). Ya no
       * se genera: estos textos salen solo en la cuenta que de verdad tiene
       * saldo o movimientos, y ese día no había ninguna.
       */
      disponible: "Saldo disponible",
      disponibleDetalle: "Se descuenta solo en el checkout. No vence.",
      enCamino: "En camino",
      /** «$ 7.191 desde el 23/11/2026». */
      enCaminoDesde: (monto: string, fecha: string) => `${monto} desde el ${fecha}`,
      /** Con un solo saldo en camino. */
      enCaminoFecha: (fecha: string) => `Lo podés usar desde el ${fecha}.`,
      enCaminoDetalle: (dias: number) => `Viene de compras anteriores: se puede usar a los ${dias} días del pago.`,
      sinEnCamino: "Nada por ahora.",
      /** Anteriores al 18/11/2026, sin uso: el cupón de bienvenida terminó y Mi cuenta ya no lo muestra. */
      cupon: "Cupón de bienvenida",
      cuponDisponible: (monto: string) => `${monto} de descuento en tu primera compra. Se aplica solo en el carrito.`,
      cuponUsado: (pedido: string) => (pedido ? `Ya lo usaste, en el pedido ${pedido}.` : "Ya lo usaste."),
      cuponYaCompro: "Es para la primera compra en harper.ar, y con este mail ya compraste.",
      /** «Mis compras» (Ale, 05/11/2026): los pedidos hechos con el mail de la cuenta. */
      compras: {
        titulo: "Mis compras",
        bajada: (email: string) => `Las compras hechas con ${email}.`,
        vacio: "Todavía no hay compras con este mail. Cuando compres, tus pedidos aparecen acá.",
        error: "No pudimos traer tus compras ahora. Probá de nuevo en un rato.",
        total: "Total",
        envio: (monto: string) => `Envío ${monto}`,
        envioSinCargo: "Envío sin cargo",
        seguimiento: "Número de seguimiento",
        /** El recorrido de un pedido pagado, con los estados reales de Airtable (Ale, 05/11/2026). */
        etapas: {
          pagado: "Pago confirmado",
          preparando: "En preparación",
          enviado: "Enviado",
          entregado: "Entregado",
        },
        revision: "Mercado Pago está revisando el pago. Cuando lo confirme, empezamos a prepararlo.",
        cancelado: "Este pedido está cancelado.",
        copiar: "Copiar",
        copiado: "Copiado",
        seguir: "Seguir mi envío",
        consultar: "Consultar por WhatsApp",
        /** El mensaje de WhatsApp de un pedido: «Hola, Harper. Quiero consultar por el pedido HARPER-12345AB.» */
        consultarMensaje: (numero: string) => (numero ? `Hola, Harper. Quiero consultar por el pedido ${numero}.` : "Hola, Harper. Quiero consultar por un pedido."),
        estados: {
          "en-revision": "Pago en revisión",
          pagado: "Pago confirmado",
          preparando: "En preparación",
          enviado: "Enviado",
          entregado: "Entregado",
          cancelado: "Cancelado",
        },
        ayuda: "¿Necesitás algo de un pedido? Escribinos por WhatsApp con su número.",
      },
      /** «Mis favoritos» (Ale, 05/11/2026): los anteojos guardados con el corazón. */
      favoritos: {
        titulo: "Mis favoritos",
        bajada: "Los anteojos que guardaste con el corazón.",
        vacio: "Todavía no guardaste ninguno. Tocá el corazón en los anteojos que te gusten y aparecen acá.",
        error: "No pudimos traer tus favoritos ahora. Probá de nuevo en un rato.",
        agotado: "Sin stock",
        quitar: "Quitar",
      },
      /** «Mis datos» y «Mis direcciones» (Ale, 05/11/2026): solo para la sesión verificada. */
      misDatos: {
        titulo: "Mis datos",
        bajada: "Los usamos para completar tus próximas compras. Tus pedidos anteriores no cambian.",
        nombre: "Nombre y apellido",
        email: "Email",
        verificado: "Verificado",
        emailNota: "Es el mail de tu cuenta: con él entrás y te llegan los avisos de tus pedidos.",
        telefono: "Teléfono",
        dni: "DNI",
        dniNota: "Lo pide el correo para entregar el paquete.",
        sinCargar: "Sin cargar",
        deLaUltimaCompra: "Lo marcado con * sale de tu última compra. Guardalo para tenerlo en tu cuenta.",
        editar: "Editar mis datos",
        guardar: "Guardar",
        guardando: "Guardando…",
        cancelar: "Cancelar",
        guardado: "Listo, guardamos tus datos.",
        error: "No pudimos guardar ahora. Probá de nuevo en un rato.",
        direcciones: {
          titulo: "Mis direcciones",
          bajada: "Elegí una en el checkout y no la cargás de nuevo.",
          vacio: "Todavía no guardaste ninguna dirección.",
          principal: "Principal",
          sinNombre: "Dirección",
          hacerPrincipal: "Usar como principal",
          editar: "Editar",
          eliminar: "Eliminar",
          eliminarConfirmar: "¿Eliminar esta dirección?",
          siEliminar: "Sí, eliminar",
          noEliminar: "No",
          agregar: "Agregar una dirección",
          nueva: "Nueva dirección",
          editando: "Editar dirección",
          alias: "Nombre (opcional)",
          aliasEjemplo: "Casa, Trabajo…",
          piso: "Piso / depto (opcional)",
          numero: "Número",
          calle: "Calle y número",
          localidad: "Localidad",
          cp: "Código postal",
          provincia: "Provincia",
          marcarPrincipal: "Usarla como principal",
          guardar: "Guardar dirección",
          sugerida: "¿Guardamos la dirección de tu última compra?",
          guardarSugerida: "Guardarla",
          tope: (n: number) => `Podés guardar hasta ${n} direcciones. Eliminá una para sumar otra.`,
          repetida: "Esa dirección ya está guardada.",
          guardada: "Listo, guardamos la dirección.",
          eliminada: "Eliminamos la dirección.",
          error: "No pudimos guardar la dirección ahora. Probá de nuevo en un rato.",
          ocupado: "Estamos guardando otro cambio de tus direcciones. Probá de nuevo en unos segundos.",
          /** En el checkout, con la sesión abierta. */
          checkout: "Tus direcciones guardadas",
          otra: "Usar otra dirección",
        },
      },
      movimientos: "Movimientos",
      /** Las pestañas de Mi cuenta (Ale, 05/11/2026). «Movimientos», solo en la cuenta con saldo de antes del 18/11/2026. */
      pestanas: { compras: "Compras", favoritos: "Favoritos", movimientos: "Movimientos", datos: "Mis datos", credito: "Crédito Harper" },
      /** La etiqueta de Mi cuenta, para todos y con o sin sesión (Ale, 18/11/2026). */
      etiquetaCuenta: "Mi Cuenta Harper",
      /** Arriba del saldo de antes del 18/11/2026, solo en la cuenta que lo tiene: no es el Crédito Harper. */
      saldoAnterior: "Saldo a favor de compras anteriores",
      /**
       * Crédito Harper, paso 3: solo con HARPER_CREDITO_ACTIVO=1. Apagado,
       * ni `entrarBajadaCuenta` ni los textos de `credito` se muestran.
       */
      entrarBajadaCuenta: "Escribí el mail con el que compraste y te mandamos un código. No hace falta suscribirse.",
      credito: {
        titulo: "Mi Crédito Harper",
        bajada: "Lo ganás con tus compras de anteojos. Se usa solo en anteojos y no vence.",
        disponible: "Disponible",
        disponibleDetalle: "Para tu próxima compra de anteojos.",
        pendiente: "Pendiente",
        pendienteDetalle: "Se libera 30 días después de que recibís el pedido.",
        enRevision: "En revisión",
        enRevisionDetalle: "Lo estamos revisando. Mientras tanto no se puede usar.",
        movimientos: "Movimientos",
        vacio: "Todavía no tenés Crédito Harper. Lo vas a ver acá después de tu próxima compra de anteojos.",
        error: "No pudimos traer tu Crédito Harper ahora. Probá de nuevo en un rato.",
        /** «Pedido HARPER-12345AB · 10 %». */
        concepto: (pedido: string, porcentaje: number) => `Pedido ${pedido} · ${porcentaje} %`,
        estado: {
          disponible: "Disponible",
          pendiente: "Pendiente",
          "en-revision": "En revisión",
          anulado: "Anulado",
          usado: "Usado",
          reservado: "Apartado",
        },
        /** Paso 4: lo que se usó en una compra. «Usado en el pedido HARPER-12345AB». */
        usadoEn: (pedido: string) => `Usado en el pedido ${pedido}`,
        /** Paso 4: en el checkout (solo con HARPER_CREDITO_ACTIVO=1). */
        usar: (monto: string) => `Usar mi Crédito Harper (${monto} disponible)`,
        usarDetalle: "Solo en anteojos: no paga envío, estuches ni paños.",
        usado: (monto: string) => `Crédito Harper: −${monto}`,
        sinSesion: "Para usar tu Crédito Harper, entrá a tu cuenta con tu mail.",
        otroMail: (email: string) => `Tu Crédito Harper es de ${email}: comprá con ese mail o seguí sin el crédito.`,
        noDisponible: "No podemos usar tu Crédito Harper en este momento. Probá en un rato o seguí sin él.",
        otraCompra: "Ya estamos procesando otra compra con tu Crédito Harper. Esperá un momento y probá de nuevo.",
        cambio: "Tu Crédito Harper disponible cambió. Revisá el total antes de pagar.",
        reservadoNota: "Apartado mientras se paga ese pedido. Si no se paga, vuelve solo.",
        usoEnRevision: "Ese pedido tuvo una devolución: lo estamos revisando.",
        desde: (fecha: string) => `Se libera el ${fecha}.`,
        liberado: (fecha: string) => `Se liberó el ${fecha}.`,
        sinEntrega: "Se libera 30 días después de la entrega.",
        conGestion: "Hay una gestión abierta sobre este pedido: se libera cuando se resuelva.",
        anulado: "El pedido se canceló o se devolvió.",
        enRevisionNota: "Lo estamos revisando.",
      },
      /** Sin uso desde el 18/11/2026: la pestaña «Movimientos» sale solo si hay alguno. */
      sinMovimientos: "Todavía no hay movimientos.",
      /** Los movimientos del saldo de antes del 18/11/2026 (las claves son los tipos de la tabla Saldos). */
      movimiento: {
        Cashback: (pedido: string) => (pedido ? `Saldo a favor por el pedido ${pedido}` : "Saldo a favor"),
        Uso: (pedido: string) => (pedido ? `Usado en el pedido ${pedido}` : "Saldo usado"),
        Ajuste: "Ajuste de Harper",
      },
      /** Junto a un saldo que todavía no se puede usar. */
      desde: (fecha: string) => `desde el ${fecha}`,
      salir: "Salir",
      /**
       * La baja (Ale, 18/11/2026): es solo de los mails de novedades. La cuenta
       * sigue y los mails de los pedidos también.
       */
      bajaTitulo: "Mails de novedades",
      bajaTexto: "Si te das de baja, dejás de recibir nuestros mails de novedades. Tu cuenta sigue igual, y los mails de tus pedidos te siguen llegando.",
      /** Mi cuenta de alguien que se dio de baja. */
      deBaja: "Te diste de baja de los mails de novedades. Tu cuenta sigue igual, y los mails de tus pedidos te siguen llegando.",
      volver: "Volver a suscribirme",
      baja: "Darme de baja",
      bajaConfirmar: "Sí, darme de baja",
      cancelar: "No, seguir suscripto",
      /** Después de darse de baja desde Mi cuenta. */
      volverACuenta: "Volver a mi cuenta",
    },
    /** La página del enlace de baja de los mails (/suscriptores/baja): la baja es solo de las novedades. */
    baja: {
      etiqueta: "Novedades de Harper",
      titulo: "Darte de baja",
      texto: "Si te das de baja, dejás de recibir nuestros mails de novedades. Tu cuenta sigue igual, y los mails de tus pedidos te siguen llegando.",
      boton: "Darme de baja",
      listo: "Listo, te diste de baja.",
      listoDetalle: "Ya no te mandamos mails de novedades. Si cambiás de idea, te podés volver a suscribir con el mismo mail.",
      invalido: "El enlace no es válido. Escribinos y te damos de baja.",
      sinEnlace: "Para darte de baja, usá el enlace de nuestros mails de bienvenida y de novedades, o entrá a tu cuenta.",
    },
    /** A quien ya está suscripto y entró en este navegador, en lugar del formulario (la portada y /suscriptores). */
    ficha: {
      suscripto: "Ya estás suscripto a las novedades de Harper.",
      /** Anterior al 18/11/2026, sin uso. */
      saldo: (monto: string) => `Tenés ${monto} de saldo para usar.`,
    },
    /**
     * La cuenta en el checkout (components/checkout/SuscriptorEnCheckout.tsx).
     * Ale, 18/11/2026: ya no se invita a suscribirse a cambio de un descuento
     * ni se promete nada por tener cuenta. Queda una línea que dice con qué
     * cuenta se compra (`checkout`, más arriba, y `salir`) y, solo en la
     * cuenta que de verdad tiene saldo a favor de antes de ese día, la casilla
     * para usarlo y su renglón en el resumen (`usarSaldo`, `saldo`).
     */
    checkoutCaja: {
      /**
       * Anteriores al 18/11/2026, sin uso: la invitación a suscribirse por el
       * cupón, el envío sin cargo y las cuotas, que el checkout ya no muestra.
       * Se borran en la limpieza. No usarlas en nada nuevo.
       */
      invitacion: (monto: string, cuotas: number | null) =>
        cuotas
          ? `Suscribite gratis con este mail y desbloqueá ${monto} de descuento en esta compra, envío sin cargo y ${cuotas} cuotas sin interés.`
          : `Suscribite gratis con este mail y desbloqueá ${monto} de descuento en esta compra y envío sin cargo.`,
      nota: "Es gratis. El cupón es para tu primera compra en Harper.",
      escribiMail: "Escribí tu mail arriba y te mandamos el código.",
      abrir: "Quiero suscribirme",
      suscribirme: "Suscribirme con este mail",
      /** Solo en la cuenta con saldo a favor de antes del 18/11/2026. */
      usarSaldo: (monto: string) => `Usar mi saldo a favor (${monto})`,
      /** Anterior al 18/11/2026, sin uso: ninguna compra devuelve saldo. Se borra en la limpieza. */
      cashback: (monto: string, dias: number) => `Con esta compra te vuelven ${monto} de saldo, para usar desde los ${dias} días del pago.`,
      /** Anterior al 18/11/2026, sin uso: el cupón de bienvenida terminó y no tiene renglón en el resumen. */
      cupon: "Cupón de bienvenida",
      /** El renglón del resumen, solo si se usó saldo a favor de antes del 18/11/2026. */
      saldo: "Pagado con tu saldo a favor",
      salir: "¿No sos vos? Salir",
    },
  },
};
