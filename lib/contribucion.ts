/**
 * Motor de contribución comercial por pedido (Ale, 05/11/2026 · Tarea 01).
 *
 * Cuánto deja un pedido después de producto, preparación, envío, Mercado
 * Pago, financiación, IIBB, devoluciones, cashback y publicidad, sobre la
 * venta neta de IVA. Es puro: no lee Airtable, ni Mercado Pago, ni nada de
 * afuera, y no lo usa (todavía) ninguna página ni el checkout.
 *
 * Supuestos (todos en `ParametrosContribucion`, para poder cambiarlos):
 *
 *  - Harper es Responsable Inscripto: el IVA de lo que vende es débito y el
 *    de lo que compra es crédito. Por eso todo se mide NETO de IVA:
 *      · la venta: lo cobrado con IVA ÷ 1,21;
 *      · el producto: el costo puesto ya viene sin IVA (el de la importación
 *        es crédito fiscal);
 *      · el envío: la tarifa del transportista viene con IVA y se le saca
 *        (`envioIncluyeIva`);
 *      · Mercado Pago y la financiación se cobran «+ IVA»: ese IVA es crédito,
 *        así que el costo es la tasa sola;
 *      · preparación y publicidad se cargan ya netas.
 *  - IIBB y la reserva por devoluciones son un porcentaje de lo facturado
 *    neto.
 *  - Descuento en el segundo par: por cada dos pares, el de menor precio
 *    lleva el descuento. Con más de dos, se descuentan los ⌊n/2⌋ más baratos.
 *  - Cashback, el crédito que se promete para la próxima compra: igual que en
 *    el sitio (lib/suscriptores.ts, cashbackDe), es un porcentaje de lo pagado
 *    en productos (sin envío, después del descuento y del saldo usado), en
 *    pesos enteros, con un tope por pedido si lo hay. Se cuenta como costo UNA
 *    sola vez, en el pedido que lo promete, neto de IVA (cuando se use va a
 *    bajar una venta futura con IVA incluido), por la parte que se espera que
 *    se use (`tasaDeUso`, 100 % de entrada: lo prudente).
 *  - Saldo aplicado en una recompra: ese crédito ya se contó como costo en el
 *    pedido que lo prometió. En el pedido que lo usa, el saldo es un medio de
 *    pago ya provisionado: la venta neta se mide antes del saldo (no se resta
 *    otra vez). Lo que sí baja de verdad es lo que se cobra por Mercado Pago y
 *    lo que se factura, así que la comisión, la financiación y los IIBB se
 *    calculan sobre eso.
 *
 * La contribución mínima objetivo es un porcentaje de la venta neta de IVA.
 */

export type Cuotas = 1 | 3 | 6;

export type ParametrosContribucion = {
  /** 0,21. */
  alicuotaIva: number;
  /** Costo de un par puesto en Argentina, con su estuche, sin IVA. */
  costoUnitarioNeto: number;
  /** Armar y despachar un pedido, sin IVA. */
  preparacionPorPedido: number;
  /** Publicidad por pedido (CAC), sin IVA. */
  cacPorPedido: number;
  /** Comisión de Mercado Pago sobre lo cobrado (la tasa «+ IVA»; el IVA es crédito). */
  comisionMercadoPago: number;
  /** Costo adicional de las cuotas sin interés, sobre lo cobrado, por cantidad de cuotas. */
  financiacion: Record<Cuotas, number>;
  /** Ingresos Brutos sobre lo facturado neto de IVA. */
  iibb: number;
  /** Reserva por devoluciones sobre la venta neta de IVA. */
  reservaDevoluciones: number;
  /** Si el costo de envío que se informa trae IVA (y es crédito). */
  envioIncluyeIva: boolean;
  /** La contribución mínima que se busca, sobre la venta neta de IVA. */
  contribucionMinima: number;
};

/** Los parámetros de referencia que pasó Ale (05/11/2026). */
export const PARAMETROS_REFERENCIA: ParametrosContribucion = {
  alicuotaIva: 0.21,
  costoUnitarioNeto: 9_570,
  preparacionPorPedido: 2_000,
  cacPorPedido: 20_000,
  comisionMercadoPago: 0.0339,
  financiacion: { 1: 0, 3: 0.045, 6: 0.103 },
  iibb: 0.03,
  reservaDevoluciones: 0.03,
  envioIncluyeIva: true,
  contribucionMinima: 0.22,
};

/** El precio de referencia de un par, con IVA. */
export const PRECIO_REFERENCIA = 89_900;

export type Cashback = {
  /** 0,05 = 5 %. */
  porcentaje: number;
  /** Tope en pesos por pedido; null = sin tope. */
  tope: number | null;
  /** Qué parte del crédito prometido se espera que se use (1 = todo). */
  tasaDeUso?: number;
};

export type PedidoModelo = {
  /** El precio de lista de cada par, con IVA. */
  pares: number[];
  /** Descuento del segundo par (0,2 = 20 %), sobre el de menor precio de cada dos. */
  descuentoSegundo: number;
  /** El crédito que promete este pedido para la próxima compra. Sin esto, ninguno. */
  cashback?: Cashback | null;
  cuotas: Cuotas;
  /** Lo que le cuesta el envío a Harper (con IVA si `envioIncluyeIva`). */
  costoEnvio: number;
  /** Lo que paga el comprador por el envío, con IVA. 0 = envío gratis (lo de entrada). */
  envioCobrado?: number;
  /** El saldo de compras anteriores que usa en este pedido, con IVA. */
  saldoAplicado?: number;
};

export type ResultadoContribucion = {
  /** Lo que se mueve con IVA, en pesos. */
  bruto: {
    lista: number;
    descuento: number;
    /** Productos después del descuento. */
    productos: number;
    envioCobrado: number;
    saldoAplicado: number;
    /** Lo que se cobra por Mercado Pago: productos − saldo + envío. */
    cobrado: number;
    /** El crédito que se promete para la próxima compra. */
    cashbackComprometido: number;
  };
  /** La venta neta de IVA, antes del saldo (el saldo ya se provisionó en otro pedido). Es la base del margen. */
  ventaNeta: number;
  /** Lo facturado neto de IVA: lo cobrado ÷ (1 + IVA). Base de IIBB. */
  facturadoNeto: number;
  costos: {
    producto: number;
    preparacion: number;
    envio: number;
    mercadoPago: number;
    financiacion: number;
    iibb: number;
    devoluciones: number;
    cashback: number;
    publicidad: number;
  };
  contribucionAntesDePublicidad: number;
  contribucion: number;
  /** Contribución ÷ venta neta (0,22 = 22 %). */
  margen: number;
  superaMinimo: boolean;
};

const centavos = (x: number) => Math.round(x * 100) / 100;

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) throw new RangeError(mensaje);
}

/** Los descuentos de cada par: los ⌊n/2⌋ más baratos llevan `descuentoSegundo`. */
export function descuentoDelSegundo(pares: number[], descuentoSegundo: number): number {
  const conDescuento = Math.floor(pares.length / 2);
  return [...pares]
    .sort((a, b) => a - b)
    .slice(0, conDescuento)
    .reduce((total, precio) => total + precio * descuentoSegundo, 0);
}

/** El cashback que se promete, como en el sitio: en pesos enteros, con tope si lo hay. */
export function cashbackComprometido(productosPagados: number, cashback: Cashback | null | undefined): number {
  if (!cashback || !(productosPagados > 0) || !(cashback.porcentaje > 0)) return 0;
  const sinTope = Math.round(productosPagados * cashback.porcentaje);
  return cashback.tope === null ? sinTope : Math.min(sinTope, cashback.tope);
}

/** La contribución de un pedido. Tira `RangeError` si el pedido no tiene sentido. */
export function calcularContribucion(
  pedido: PedidoModelo,
  parametros: ParametrosContribucion = PARAMETROS_REFERENCIA
): ResultadoContribucion {
  const p = parametros;
  const envioCobrado = pedido.envioCobrado ?? 0;
  const saldoAplicado = pedido.saldoAplicado ?? 0;

  exigir(pedido.pares.length > 0, "El pedido necesita al menos un par");
  exigir(pedido.pares.every((precio) => Number.isFinite(precio) && precio > 0), "Cada par necesita un precio mayor que cero");
  exigir(pedido.descuentoSegundo >= 0 && pedido.descuentoSegundo < 1, "El descuento del segundo par va de 0 a menos de 1");
  exigir(pedido.cuotas in p.financiacion, "Cuotas: 1, 3 o 6");
  exigir(pedido.costoEnvio >= 0 && envioCobrado >= 0, "El envío no puede ser negativo");
  const tasaDeUso = pedido.cashback?.tasaDeUso ?? 1;
  exigir(!pedido.cashback || (pedido.cashback.porcentaje >= 0 && pedido.cashback.porcentaje < 1), "El cashback va de 0 a menos de 1");
  exigir(!pedido.cashback || pedido.cashback.tope === null || pedido.cashback.tope >= 0, "El tope del cashback no puede ser negativo");
  exigir(tasaDeUso >= 0 && tasaDeUso <= 1, "La tasa de uso del cashback va de 0 a 1");

  const conIva = 1 + p.alicuotaIva;
  const lista = pedido.pares.reduce((total, precio) => total + precio, 0);
  const descuento = descuentoDelSegundo(pedido.pares, pedido.descuentoSegundo);
  const productos = lista - descuento;
  exigir(saldoAplicado >= 0 && saldoAplicado <= productos, "El saldo aplicado va de 0 a lo que valen los productos");

  const cobrado = productos - saldoAplicado + envioCobrado;
  // La venta, antes del saldo: el saldo ya se contó como costo en el pedido que lo prometió.
  const ventaNeta = (productos + envioCobrado) / conIva;
  const facturadoNeto = cobrado / conIva;
  const comprometido = cashbackComprometido(productos - saldoAplicado, pedido.cashback);

  const costos = {
    producto: pedido.pares.length * p.costoUnitarioNeto,
    preparacion: p.preparacionPorPedido,
    envio: p.envioIncluyeIva ? pedido.costoEnvio / conIva : pedido.costoEnvio,
    mercadoPago: cobrado * p.comisionMercadoPago,
    financiacion: cobrado * p.financiacion[pedido.cuotas],
    iibb: facturadoNeto * p.iibb,
    devoluciones: ventaNeta * p.reservaDevoluciones,
    // Cuando se use, baja una venta futura con IVA incluido: su costo es neto.
    cashback: (comprometido * tasaDeUso) / conIva,
    publicidad: p.cacPorPedido,
  };

  const { publicidad, ...antesDePublicidad } = costos;
  const contribucionAntesDePublicidad = ventaNeta - Object.values(antesDePublicidad).reduce((a, b) => a + b, 0);
  const contribucion = contribucionAntesDePublicidad - publicidad;
  const margen = ventaNeta > 0 ? contribucion / ventaNeta : 0;

  return {
    bruto: {
      lista: centavos(lista),
      descuento: centavos(descuento),
      productos: centavos(productos),
      envioCobrado: centavos(envioCobrado),
      saldoAplicado: centavos(saldoAplicado),
      cobrado: centavos(cobrado),
      cashbackComprometido: comprometido,
    },
    ventaNeta: centavos(ventaNeta),
    facturadoNeto: centavos(facturadoNeto),
    costos: Object.fromEntries(Object.entries(costos).map(([k, v]) => [k, centavos(v)])) as ResultadoContribucion["costos"],
    contribucionAntesDePublicidad: centavos(contribucionAntesDePublicidad),
    contribucion: centavos(contribucion),
    margen,
    // Con un margen de redondeo: 21,9999… por la división no cuenta como «no llega».
    superaMinimo: margen >= p.contribucionMinima - 1e-9,
  };
}

// ---------- La matriz de escenarios de referencia ----------

export type Escenario = {
  pares: 1 | 2;
  descuentoSegundo: number;
  /** null = sin cashback. */
  cashback: Cashback | null;
  cuotas: Cuotas;
  costoEnvio: number;
};

/** Envíos a probar (lo que le cuesta a Harper, con IVA). */
export const ENVIOS_DE_PRUEBA = [5_500, 10_000, 15_000] as const;
export const CUOTAS_DE_PRUEBA: Cuotas[] = [1, 3, 6];
export const DESCUENTOS_SEGUNDO_DE_PRUEBA = [0.2, 0.25, 0.3] as const;
/**
 * Cashback a probar. Los topes son un supuesto para la prueba (no están en el
 * sitio, que hoy da 10 % sin tope): $ 5.000 para el 5 % y $ 10.000 para el 10 %.
 */
export const CASHBACKS_DE_PRUEBA: (Cashback | null)[] = [
  null,
  { porcentaje: 0.05, tope: 5_000 },
  { porcentaje: 0.1, tope: 10_000 },
];

/** Las combinaciones de referencia: 1 par sin descuento y 2 pares con 20, 25 y 30 % en el segundo. */
export function escenariosDeReferencia(): Escenario[] {
  const combinaciones: { pares: 1 | 2; descuentoSegundo: number }[] = [
    { pares: 1, descuentoSegundo: 0 },
    ...DESCUENTOS_SEGUNDO_DE_PRUEBA.map((descuentoSegundo) => ({ pares: 2 as const, descuentoSegundo })),
  ];
  return combinaciones.flatMap((c) =>
    CASHBACKS_DE_PRUEBA.flatMap((cashback) =>
      CUOTAS_DE_PRUEBA.flatMap((cuotas) => ENVIOS_DE_PRUEBA.map((costoEnvio) => ({ ...c, cashback, cuotas, costoEnvio })))
    )
  );
}

export function calcularEscenario(e: Escenario, parametros: ParametrosContribucion = PARAMETROS_REFERENCIA, precio = PRECIO_REFERENCIA) {
  return calcularContribucion(
    { pares: Array(e.pares).fill(precio), descuentoSegundo: e.descuentoSegundo, cashback: e.cashback, cuotas: e.cuotas, costoEnvio: e.costoEnvio },
    parametros
  );
}

const porcentaje = (x: number, decimales = 1) => `${(x * 100).toFixed(decimales).replace(".", ",")} %`;
const pesos = (x: number) => `$ ${Math.round(x).toLocaleString("es-AR")}`;
const nombreCashback = (c: Cashback | null) => (c ? `${porcentaje(c.porcentaje, 0)}${c.tope === null ? "" : ` (tope ${pesos(c.tope)})`}` : "sin cashback");
const nombreCuotas = (c: Cuotas) => (c === 1 ? "1 pago" : `${c} cuotas`);

/**
 * La matriz en Markdown: una tabla por cantidad de cuotas; cada fila es
 * pares, descuento y cashback, y cada columna un costo de envío. ✓ supera el
 * mínimo; ✗ no llega.
 */
export function matrizEnMarkdown(parametros: ParametrosContribucion = PARAMETROS_REFERENCIA, precio = PRECIO_REFERENCIA): string {
  const escenarios = escenariosDeReferencia();
  const resultados = escenarios.map((e) => ({ e, r: calcularEscenario(e, parametros, precio) }));
  const superan = resultados.filter((x) => x.r.superaMinimo).length;
  const filas = [...new Set(escenarios.map((e) => `${e.pares}|${e.descuentoSegundo}|${nombreCashback(e.cashback)}`))];

  const lineas: string[] = [
    "# Contribución por pedido: escenarios de referencia",
    "",
    "Generado por `lib/contribucion.ts` (Tarea 01). No editar a mano: lo vuelve a escribir",
    "`ACTUALIZAR_MATRIZ=1 npm test`.",
    "",
    `Precio ${pesos(precio)} por par (con IVA). Costo ${pesos(parametros.costoUnitarioNeto)} por par (sin IVA). ` +
      `Preparación ${pesos(parametros.preparacionPorPedido)}. Publicidad ${pesos(parametros.cacPorPedido)} por pedido. ` +
      `Mercado Pago ${porcentaje(parametros.comisionMercadoPago, 2)}; 3 cuotas +${porcentaje(parametros.financiacion[3], 2)}; ` +
      `6 cuotas +${porcentaje(parametros.financiacion[6], 2)}. IIBB ${porcentaje(parametros.iibb, 0)}. ` +
      `Devoluciones ${porcentaje(parametros.reservaDevoluciones, 0)}. Envío gratis para el comprador; el costo de envío, ` +
      `${parametros.envioIncluyeIva ? "con IVA (se recupera)" : "sin IVA"}. Cashback como en el sitio: sobre lo pagado en productos.`,
    "",
    `Cada celda: contribución sobre la venta neta de IVA, después de publicidad, y cuánto deja en pesos. ` +
      `✓ llega al ${porcentaje(parametros.contribucionMinima, 0)}; ✗ no llega.`,
    "",
    `**${superan} de ${resultados.length} escenarios llegan al ${porcentaje(parametros.contribucionMinima, 0)}.**`,
  ];

  for (const cuotas of CUOTAS_DE_PRUEBA) {
    lineas.push("", `## ${nombreCuotas(cuotas)}`, "", `| Pares | 2.º par | Cashback | ${ENVIOS_DE_PRUEBA.map((e) => `Envío ${pesos(e)}`).join(" | ")} |`);
    lineas.push(`|---|---|---|${ENVIOS_DE_PRUEBA.map(() => "---").join("|")}|`);
    for (const fila of filas) {
      const celdas = resultados.filter((x) => x.e.cuotas === cuotas && `${x.e.pares}|${x.e.descuentoSegundo}|${nombreCashback(x.e.cashback)}` === fila);
      const { e } = celdas[0];
      lineas.push(
        `| ${e.pares} | ${e.pares === 1 ? "—" : `−${porcentaje(e.descuentoSegundo, 0)}`} | ${nombreCashback(e.cashback)} | ` +
          celdas.map(({ r }) => `${r.superaMinimo ? "✓" : "✗"} ${porcentaje(r.margen)} · ${pesos(r.contribucion)}`).join(" | ") +
          " |"
      );
    }
  }
  return `${lineas.join("\n")}\n`;
}
