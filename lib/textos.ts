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
    /** La acción secundaria: baja a Suscriptores Harper. */
    beneficios: "Conocer mis beneficios",
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
     * Suscriptores (Ale, 05/11/2026): breve, para dar curiosidad. Título,
     * una bajada y el formulario a mano; los beneficios y sus condiciones, a
     * un enlace (/suscriptores). Nada técnico: lo del código aparece recién
     * cuando se manda.
     */
    suscripcion: {
      etiqueta: "Suscriptores Harper · Es gratis",
      titulo: "Ser parte tiene sus ventajas.",
      bajada: "Unite gratis y descubrí los beneficios que preparamos para vos.",
      /** El enlace secundario, a /suscriptores. */
      beneficios: "Conocé los beneficios y sus condiciones",
      /** La caja de la ficha. */
      boton: "Descubrir mis beneficios",
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
  /** Las promociones de compra vigentes, en un solo lugar. */
  promos: {
    etiqueta: "Promociones vigentes",
    titulo: "Beneficios al comprar.",
    dineroMP: "OFF extra pagando con dinero en tu cuenta de Mercado Pago.",
    envioGratis: "Envío gratis",
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
    bajada: "Uno para la semana, otro para el finde y otro para regalar. Podés mezclar modelos y colores, y el descuento se aplica solo.",
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
  /** El checkout (recorrido móvil, Ale, 08/11/2026). */
  checkout: {
    /** Cuando el pedido no llega al servidor (sin conexión): en vez del «Failed to fetch» del navegador. */
    sinConexion: "No pudimos conectarnos. Revisá tu conexión y tocá Pagar de nuevo: tu carrito y tus datos siguen acá.",
    /** Después de un pago rechazado, para que sepa que no tiene que empezar de cero. */
    siguenAca: "Tu carrito y tus datos siguen acá.",
    dudas: "¿Dudas antes de pagar?",
    escribinos: "Escribinos por WhatsApp",
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
   * Suscriptores Harper (Ale, 03/11/2026, lib/suscriptores.ts). Los montos,
   * el porcentaje, los días y las cuotas los pone el código; las cuotas, solo
   * si Mercado Pago las confirmó y con el CFTEA al lado.
   */
  suscriptores: {
    etiqueta: "Suscriptores Harper",
    /** Los beneficios, uno por renglón y en este orden: la web y el mail de bienvenida dicen lo mismo. */
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
    envioGratis: "Por ser suscriptor, el envío es gratis a todo el país.",
    /** En el checkout, con la sesión abierta. */
    checkout: (email: string) => `Comprás como suscriptor con ${email}.`,
    /** Entró alguien que se dio de baja: solo su saldo. */
    checkoutBaja: (email: string) => `Entraste con ${email}. Te diste de baja, así que no tenés beneficios nuevos, pero podés usar tu saldo.`,
    /** El pedido que se paga entero con saldo: no pasa por Mercado Pago. */
    sinPago: "No tenés que pagar nada: lo cubre tu saldo.",
    confirmar: "Confirmar pedido",
    /** El checkout rechazó el cupón (ya hay una compra confirmada con ese mail o DNI). */
    cuponRechazado: "El cupón de bienvenida es para la primera compra, y ya hay una compra con este mail o DNI.",
    saldoCambio: "Tu saldo cambió mientras comprabas. Revisá el total antes de confirmar.",
    /** El cupón de bienvenida se usa comprando con el mail con el que se suscribió. */
    cuponOtroMail: (email: string) => `El cupón de bienvenida es para comprar con el mail con el que te suscribiste (${email}).`,
    /** Otro pago del mismo suscriptor se está creando en este momento (otra pestaña). */
    otroPagoEnCurso: "Ya estamos preparando otro pago tuyo. Esperá unos segundos y probá de nuevo.",
    /** El saldo que aparta un pedido sin pagar. */
    saldoReservado: (monto: string, minutos: number) =>
      `Tenés ${monto} apartados en un pedido que todavía no pagaste: si no lo pagás, vuelven a tu saldo en ${minutos} minutos.`,
    /** La sesión de suscriptor cambió entre que vio el total y apretó pagar. */
    sesionCambio: "Tu sesión de suscriptor cambió mientras comprabas. Revisá el total y tus beneficios antes de pagar.",

    /**
     * Los mismos cuatro beneficios con un título corto, para la web (la
     * portada, /suscriptores y la ficha). Las reglas son las de
     * lib/suscriptores.ts, dichas simple.
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
    /** La sección de la portada y la página /suscriptores. */
    // Como «One free account. Endless member rewards.» de On (Ale, 04/11/2026):
    // una suscripción gratis que desbloquea beneficios.
    titulo: "Suscribite gratis y desbloqueá tus beneficios.",
    bajada: "Solo necesitás tu mail. Los beneficios se desbloquean apenas te suscribís, y te das de baja cuando quieras.",
    /** El enlace de la portada, debajo del botón de comprar. */
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
    /** El formulario de suscripción (components/suscriptores/FormularioSuscripcion.tsx). */
    /** La sección de la portada (Ale, 04/11/2026): un botón que lleva al formulario y el registro separado de los beneficios. */
    portada: {
      cta: "Suscribirme gratis",
      beneficios: "Tus beneficios",
      formTitulo: "Suscribite con tu mail",
    },
    form: {
      email: "Tu mail",
      nombre: "Tu nombre (opcional)",
      acepto: "Acepto las condiciones de Suscriptores Harper y recibir sus mails con novedades, lanzamientos y promociones.",
      faltaAcepto: "Para suscribirte, marcá que aceptás recibir nuestros mails.",
      suscribirme: "Suscribirme gratis",
      pedirCodigo: "Mandame el código",
      codigoEnviado: (email: string) => `Te mandamos un código a ${email}. Escribilo acá: vence en 10 minutos.`,
      codigo: "Código",
      confirmar: "Confirmar",
      otroMail: "Usar otro mail",
      /** Quiso entrar con un mail que no está suscripto (o se dio de baja). */
      noSuscripto: "Ese mail no está suscripto. Para suscribirte, aceptá recibir nuestros mails y confirmá.",
      yaSos: "¿Ya sos suscriptor?",
      entrar: "Entrá con tu mail",
      quieroSuscribirme: "Todavía no: quiero suscribirme",
      listo: {
        nueva: "¡Listo! Desbloqueaste tus beneficios.",
        reactivada: "¡Volviste! Tus beneficios están desbloqueados otra vez.",
        ya: "Ya sos suscriptor: entraste con tu mail.",
        baja: "Entraste con tu mail. Como te diste de baja, no tenés beneficios nuevos, pero el saldo que ganaste lo podés seguir usando.",
      },
      /** «Tu cupón de $ 10.000 se aplica solo en el carrito.» */
      listoCupon: (monto: string) => `Tu cupón de ${monto} y el envío gratis se aplican solos en el carrito.`,
      listoSinCupon: "Tus beneficios se aplican solos en el carrito.",
    },
    elegir: "Elegir mis anteojos",
    verCuenta: "Ver mi cuenta",
    /** «Mi cuenta» (/suscriptores/mi-cuenta). */
    cuenta: {
      titulo: "Mi cuenta",
      hola: (nombre: string) => `Hola, ${nombre}.`,
      entrarTitulo: "Entrá a tu cuenta",
      entrarBajada: "Escribí el mail con el que te suscribiste y te mandamos un código.",
      noSuscripto: "¿Todavía no sos suscriptor?",
      verBeneficios: "Desbloqueá tus beneficios",
      disponible: "Saldo disponible",
      disponibleDetalle: "Se descuenta solo en el checkout. No vence.",
      enCamino: "En camino",
      /** «$ 7.191 desde el 23/11/2026». */
      enCaminoDesde: (monto: string, fecha: string) => `${monto} desde el ${fecha}`,
      /** Con un solo cashback en camino. */
      enCaminoFecha: (fecha: string) => `Lo podés usar desde el ${fecha}.`,
      enCaminoDetalle: (dias: number) => `Es el cashback de tus compras: se usa a los ${dias} días del pago.`,
      sinEnCamino: "Nada por ahora.",
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
      /** Las pestañas de Mi cuenta (Ale, 05/11/2026). */
      pestanas: { compras: "Compras", favoritos: "Favoritos", movimientos: "Movimientos", datos: "Mis datos", credito: "Crédito Harper" },
      /**
       * Crédito Harper, paso 3: solo con HARPER_CREDITO_ACTIVO=1. Apagado,
       * ninguno de estos textos se muestra.
       */
      /** La etiqueta de la cuenta de quien no es suscriptor. */
      etiquetaCuenta: "Mi Cuenta Harper",
      entrarBajadaCuenta: "Escribí el mail con el que compraste y te mandamos un código. No hace falta suscribirse.",
      /** Arriba del saldo de siempre, para no confundirlo con el Crédito Harper. */
      saldoAnterior: "Saldo de Suscriptores Harper",
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
      sinMovimientos: "Todavía no hay movimientos. Con tu primera compra empieza a volver el 10%.",
      movimiento: {
        Cashback: (pedido: string) => (pedido ? `Cashback del pedido ${pedido}` : "Cashback"),
        Uso: (pedido: string) => (pedido ? `Usado en el pedido ${pedido}` : "Saldo usado"),
        Ajuste: "Ajuste de Harper",
      },
      /** Junto a un cashback que todavía no se puede usar. */
      desde: (fecha: string) => `desde el ${fecha}`,
      salir: "Salir",
      bajaTitulo: "Mails y baja",
      bajaTexto:
        "Si te das de baja, dejás de recibir nuestros mails y de sumar beneficios nuevos (cupón, envío gratis y cashback). El saldo que ya ganaste no se pierde: lo seguís pudiendo usar entrando con este mail.",
      /** Mi cuenta de alguien que se dio de baja. */
      deBaja: "Te diste de baja: no recibís nuestros mails ni beneficios nuevos. El saldo que ya ganaste lo podés seguir usando en tus compras.",
      volver: "Volver a suscribirme",
      baja: "Darme de baja",
      bajaConfirmar: "Sí, darme de baja",
      cancelar: "No, seguir suscripto",
    },
    /** La página del enlace de baja de los mails (/suscriptores/baja). */
    baja: {
      titulo: "Darte de baja",
      texto: "Vas a dejar de recibir nuestros mails y de sumar beneficios nuevos. El saldo que ya ganaste no se pierde: lo seguís pudiendo usar entrando con tu mail.",
      boton: "Darme de baja",
      listo: "Listo, te diste de baja.",
      listoDetalle: "No vas a recibir más mails de Harper. Si cambiás de idea, te podés volver a suscribir con el mismo mail.",
      invalido: "El enlace no es válido. Escribinos y te damos de baja.",
      sinEnlace: "Para darte de baja, usá el enlace de nuestros mails de bienvenida y de novedades, o entrá a tu cuenta.",
    },
    /** La caja de la ficha. */
    ficha: {
      suscripto: "Sos suscriptor: tus beneficios se aplican solos en el carrito.",
      /** «Tenés $ 2.181 de saldo para usar.» */
      saldo: (monto: string) => `Tenés ${monto} de saldo para usar.`,
    },
    /** El checkout. */
    checkoutCaja: {
      /** «Suscribite gratis con este mail y desbloqueá $ 10.000 de descuento en esta compra, envío sin cargo y 6 cuotas sin interés.» */
      invitacion: (monto: string, cuotas: number | null) =>
        cuotas
          ? `Suscribite gratis con este mail y desbloqueá ${monto} de descuento en esta compra, envío sin cargo y ${cuotas} cuotas sin interés.`
          : `Suscribite gratis con este mail y desbloqueá ${monto} de descuento en esta compra y envío sin cargo.`,
      nota: "Es gratis. El cupón es para tu primera compra en Harper.",
      escribiMail: "Escribí tu mail arriba y te mandamos el código.",
      /** Lo que abre la invitación plegada. */
      abrir: "Quiero suscribirme",
      suscribirme: "Suscribirme con este mail",
      usarSaldo: (monto: string) => `Usar mi saldo a favor (${monto})`,
      /** «Con esta compra te vuelven $ 7.990 de saldo, para usar desde los 30 días del pago.» */
      cashback: (monto: string, dias: number) => `Con esta compra te vuelven ${monto} de saldo, para usar desde los ${dias} días del pago.`,
      cupon: "Cupón de bienvenida",
      saldo: "Pagado con tu saldo",
      salir: "¿No sos vos? Salir",
    },
  },
};
