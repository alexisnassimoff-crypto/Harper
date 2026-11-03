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
    titulo: "Los anteojos también se eligen como la ropa.",
    /** La frase de antes de la portada; ahora abre «Un mismo par». */
    sensacion: "Salís a la calle y se oscurecen solos.",
    etiqueta: "Filtro de luz azul · Fotocromáticos · UV400",
    bajadaMarca: "Hoy vuelven a ser un accesorio: los elegís por el color, por la forma y por cómo los combinás con lo que te ponés.",
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
    /** El pedido que se paga entero con saldo: no pasa por Mercado Pago. */
    sinPago: "No tenés que pagar nada: lo cubre tu saldo.",
    confirmar: "Confirmar pedido",
    /** El checkout rechazó el cupón (ya hay una compra confirmada con ese mail o DNI). */
    cuponRechazado: "El cupón de bienvenida es para la primera compra, y ya hay una compra con este mail o DNI.",
    saldoCambio: "Tu saldo cambió mientras comprabas. Revisá el total antes de confirmar.",

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
    titulo: "Suscribite gratis y ahorrá en cada compra.",
    bajada: "Solo con tu mail. No cuesta nada y te das de baja cuando quieras.",
    /** El enlace de la portada, debajo del botón de comprar. */
    enlacePortada: (monto: string) => `Suscribite: ${monto} de bienvenida`,
    /** La barra de anuncios. */
    anuncio: (monto: string) => `Suscribite gratis: ${monto} de bienvenida y envío gratis siempre`,
    /** La cuota de suscriptor junto a la de todos (barra, ficha): «6 si sos suscriptor». */
    cuotasSuscriptor: (cuotas: number) => `${cuotas} si sos suscriptor`,
    condiciones: "Ver las condiciones",
    /** El formulario de suscripción (components/suscriptores/FormularioSuscripcion.tsx). */
    form: {
      email: "Tu mail",
      nombre: "Tu nombre (opcional)",
      acepto: "Acepto recibir mails de Harper.",
      faltaAcepto: "Para suscribirte, marcá que aceptás recibir nuestros mails.",
      suscribirme: "Suscribirme",
      pedirCodigo: "Mandame el código",
      notaCodigo: "Te mandamos un código de 6 números para confirmar que el mail es tuyo.",
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
        nueva: "¡Listo! Ya sos suscriptor.",
        reactivada: "¡Volviste! Ya sos suscriptor otra vez.",
        ya: "Ya sos suscriptor: entraste con tu mail.",
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
      verBeneficios: "Mirá los beneficios",
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
        "Si te das de baja, dejás de recibir nuestros mails y de tener los beneficios. Tu saldo queda guardado: si volvés a suscribirte con este mail, lo recuperás.",
      baja: "Darme de baja",
      bajaConfirmar: "Sí, darme de baja",
      cancelar: "No, seguir suscripto",
    },
    /** La página del enlace de baja de los mails (/suscriptores/baja). */
    baja: {
      titulo: "Darte de baja",
      texto: "Vas a dejar de recibir nuestros mails y de tener los beneficios de suscriptor. Tu saldo queda guardado por si volvés.",
      boton: "Darme de baja",
      listo: "Listo, te diste de baja.",
      listoDetalle: "No vas a recibir más mails de Harper. Si cambiás de idea, te podés volver a suscribir con el mismo mail.",
      invalido: "El enlace no es válido. Escribinos y te damos de baja.",
      sinEnlace: "Para darte de baja, usá el enlace de cualquiera de nuestros mails o entrá a tu cuenta.",
    },
    /** La caja de la ficha. */
    ficha: {
      titulo: (monto: string) => `Suscribite gratis: ${monto} menos en tu primera compra.`,
      suscripto: "Sos suscriptor: tus beneficios se aplican solos en el carrito.",
      /** «Tenés $ 2.181 de saldo para usar.» */
      saldo: (monto: string) => `Tenés ${monto} de saldo para usar.`,
      suscribirme: "Suscribirme gratis",
    },
    /** El checkout. */
    checkoutCaja: {
      /** «Suscribite con este mail y ahorrá $ 10.000 en esta compra, con envío sin cargo y 6 cuotas sin interés.» */
      invitacion: (monto: string, cuotas: number | null) =>
        `Suscribite con este mail y ahorrá ${monto} en esta compra, con envío sin cargo${cuotas ? ` y ${cuotas} cuotas sin interés` : ""}.`,
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
