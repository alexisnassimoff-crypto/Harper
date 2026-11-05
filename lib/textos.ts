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
        "Buscá unos anteojos que te queden cómodos y mirá la parte de adentro de la patilla: vas a ver tres números, por ejemplo 52□18-140.",
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
  nosotros: {
    /** Ale, 04/11/2026: sin «Los anteojos también se eligen como la ropa» ni lo del accesorio. */
    titulo: "Quiénes somos",
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
      movimientos: "Movimientos",
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
