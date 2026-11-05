import { preciosConDescuentoDuo } from "./duo";

/**
 * Motor de contribución comercial por pedido (Ale, 05/11/2026 · Tarea 01).
 *
 * Cuánto deja un pedido después de producto, preparación, envío, Mercado
 * Pago, financiación, IIBB, devoluciones, cashback y publicidad, sobre la
 * venta neta de IVA. Es puro: no lee Airtable, ni Mercado Pago, ni nada de
 * afuera, y no lo usa (todavía) ninguna página ni el checkout.
 *
 * Supuestos (todos en `ParametrosContribucion` o en el pedido, para poder
 * cambiarlos):
 *
 *  - Harper es Responsable Inscripto: el IVA de lo que vende es débito y el
 *    de lo que compra es crédito. Por eso todo se mide NETO de IVA:
 *      · la venta: lo cobrado con IVA ÷ 1,21;
 *      · el producto: el costo puesto ya viene sin IVA (el de la importación
 *        es crédito fiscal);
 *      · el envío: se puede informar con IVA (se le saca, porque es crédito)
 *        o sin IVA (`envioIncluyeIva`);
 *      · Mercado Pago y la financiación se cobran «+ IVA»: ese IVA es crédito,
 *        así que el costo es la tasa sola;
 *      · preparación y publicidad se cargan ya netas.
 *  - IIBB: un porcentaje de lo facturado neto. Devoluciones: un porcentaje de
 *    la venta neta.
 *  - Descuento Dúo: por cada dos pares, el de menor precio lleva el
 *    descuento. Con más de dos, se descuentan los ⌊n/2⌋ más baratos.
 *  - Bienvenida: un descuento fijo en pesos sobre los productos. NO se acumula
 *    con el Dúo salvo que se pida (`acumularBienvenidaConDuo`): si el pedido
 *    califica para los dos, se aplica el que más descuenta.
 *  - Cashback (el crédito Harper que se promete para la próxima compra): igual
 *    que en el sitio (lib/suscriptores.ts, cashbackDe), un porcentaje de lo
 *    efectivamente pagado en productos (sin envío, después de los descuentos y
 *    del saldo usado), redondeado al peso, sin tope salvo que se le ponga. Se
 *    cuenta como costo UNA sola vez, en el pedido que lo promete, neto de IVA
 *    (cuando se use va a bajar una venta futura con IVA incluido), por la parte
 *    que se espera que se use (`tasaDeUso`, 100 % de entrada: lo prudente).
 *  - Saldo aplicado en una recompra: ese crédito ya se contó como costo en la
 *    compra que lo prometió. En la recompra, el saldo es un medio de pago ya
 *    provisionado: la venta neta se mide antes del saldo (no se resta otra
 *    vez). Lo que sí baja de verdad es lo que se cobra por Mercado Pago y lo
 *    que se factura, así que la comisión, la financiación y los IIBB se
 *    calculan sobre eso. Ver `contribucionDelCliente`.
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
  /** Publicidad por pedido (CAC), sin IVA. Un pedido puede traer otra (`publicidad`). */
  cacPorPedido: number;
  /** Comisión de Mercado Pago sobre lo cobrado (la tasa «+ IVA»; el IVA es crédito). */
  comisionMercadoPago: number;
  /** Costo adicional de las cuotas sin interés, sobre lo cobrado, por cantidad de cuotas. */
  financiacion: Record<Cuotas, number>;
  /** Ingresos Brutos sobre lo facturado neto de IVA. */
  iibb: number;
  /** Reserva por devoluciones sobre la venta neta de IVA. */
  reservaDevoluciones: number;
  /** Si el costo de envío que se informa trae IVA (y es crédito) o ya es neto. */
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
  /** 0,10 = 10 %. */
  porcentaje: number;
  /** Tope en pesos por pedido; null = sin tope (lo que se evalúa: Ale, 05/11/2026). */
  tope: number | null;
  /** Qué parte del crédito prometido se espera que se use (1 = todo). */
  tasaDeUso?: number;
};

/** El cashback comercial que se evalúa: 10 % de lo pagado en productos, sin tope. */
export const CASHBACK_PRINCIPAL: Cashback = { porcentaje: 0.1, tope: null };
/** Alternativa experimental: 5 %, sin tope. */
export const CASHBACK_ALTERNATIVO: Cashback = { porcentaje: 0.05, tope: null };

export type PedidoModelo = {
  /** El precio de lista de cada par, con IVA. */
  pares: number[];
  /** Descuento Dúo (0,25 = 25 %), sobre el de menor precio de cada dos. */
  descuentoSegundo: number;
  /** Descuento fijo de bienvenida en pesos, con IVA (5.000, 10.000). */
  bienvenida?: number;
  /** Si la bienvenida se suma al Dúo. Sin esto, se aplica solo el que más descuenta. */
  acumularBienvenidaConDuo?: boolean;
  /** El crédito que promete este pedido para la próxima compra. Sin esto, ninguno. */
  cashback?: Cashback | null;
  cuotas: Cuotas;
  /** Lo que le cuesta el envío a Harper (con o sin IVA, según `envioIncluyeIva`). */
  costoEnvio: number;
  /** Lo que paga el comprador por el envío, con IVA. 0 = envío gratis (lo de entrada). */
  envioCobrado?: number;
  /** El saldo (crédito Harper de compras anteriores) que usa en este pedido, con IVA. */
  saldoAplicado?: number;
  /** La publicidad de este pedido, sin IVA. Sin esto, `cacPorPedido`. */
  publicidad?: number;
};

export type Promocion = "ninguna" | "duo" | "bienvenida" | "duo+bienvenida";

export type ResultadoContribucion = {
  /** Lo que se mueve con IVA, en pesos. */
  bruto: {
    lista: number;
    /** El descuento Dúo que se aplicó (0 si no se aplicó). */
    duo: number;
    /** La bienvenida que se aplicó (0 si no se aplicó). */
    bienvenida: number;
    /** Todos los descuentos aplicados. */
    descuento: number;
    /** Productos después de los descuentos. */
    productos: number;
    envioCobrado: number;
    saldoAplicado: number;
    /** Lo que se cobra por Mercado Pago: productos − saldo + envío. */
    cobrado: number;
    /** El crédito que se promete para la próxima compra. */
    cashbackComprometido: number;
  };
  /** Qué descuento quedó aplicado. */
  promocion: Promocion;
  /** La venta neta de IVA, antes del saldo (el saldo ya se provisionó en otra compra). Es la base del margen. */
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

/** El margen que cuenta como «llega» (con un margen de redondeo: 21,9999… por la división no es «no llega»). */
const llega = (margen: number, p: ParametrosContribucion) => margen >= p.contribucionMinima - 1e-9;

/**
 * El descuento Dúo: los ⌊n/2⌋ pares más baratos llevan `descuentoSegundo`.
 * Elige los pares con la misma regla que el motor del sitio (lib/duo.ts); acá
 * sin redondear, porque es el modelo financiero.
 */
export function descuentoDelSegundo(pares: number[], descuentoSegundo: number): number {
  return preciosConDescuentoDuo(pares).reduce((total, precio) => total + precio * descuentoSegundo, 0);
}

/**
 * Qué descuentos se aplican. El Dúo y la bienvenida no se acumulan salvo que
 * se pida: si el pedido califica para los dos, queda el que más descuenta (a
 * igual descuento, el Dúo). La bienvenida nunca deja los productos en menos de cero.
 */
export function descuentosAplicados(
  pares: number[],
  descuentoSegundo: number,
  bienvenida = 0,
  acumular = false
): { duo: number; bienvenida: number; promocion: Promocion } {
  const lista = pares.reduce((total, precio) => total + precio, 0);
  const duo = descuentoDelSegundo(pares, descuentoSegundo);
  if (acumular) {
    const fija = Math.min(bienvenida, lista - duo);
    return { duo, bienvenida: fija, promocion: duo > 0 && fija > 0 ? "duo+bienvenida" : duo > 0 ? "duo" : fija > 0 ? "bienvenida" : "ninguna" };
  }
  const fija = Math.min(bienvenida, lista);
  if (duo <= 0 && fija <= 0) return { duo: 0, bienvenida: 0, promocion: "ninguna" };
  return duo >= fija ? { duo, bienvenida: 0, promocion: "duo" } : { duo: 0, bienvenida: fija, promocion: "bienvenida" };
}

/** El cashback que se promete, como en el sitio: en pesos enteros, con tope si lo hay. */
export function cashbackComprometido(productosPagados: number, cashback: Cashback | null | undefined): number {
  if (!cashback || !(productosPagados > 0) || !(cashback.porcentaje > 0)) return 0;
  const sinTope = Math.round(productosPagados * cashback.porcentaje);
  return cashback.tope === null ? sinTope : Math.min(sinTope, cashback.tope);
}

/** El costo de envío neto de IVA, según se haya informado con IVA o sin IVA. */
export function costoEnvioNeto(costoEnvio: number, parametros: ParametrosContribucion = PARAMETROS_REFERENCIA): number {
  return parametros.envioIncluyeIva ? costoEnvio / (1 + parametros.alicuotaIva) : costoEnvio;
}

/** La contribución de un pedido. Tira `RangeError` si el pedido no tiene sentido. */
export function calcularContribucion(
  pedido: PedidoModelo,
  parametros: ParametrosContribucion = PARAMETROS_REFERENCIA
): ResultadoContribucion {
  const p = parametros;
  const envioCobrado = pedido.envioCobrado ?? 0;
  const saldoAplicado = pedido.saldoAplicado ?? 0;
  const bienvenidaPedida = pedido.bienvenida ?? 0;
  const publicidad = pedido.publicidad ?? p.cacPorPedido;

  exigir(pedido.pares.length > 0, "El pedido necesita al menos un par");
  exigir(pedido.pares.every((precio) => Number.isFinite(precio) && precio > 0), "Cada par necesita un precio mayor que cero");
  exigir(pedido.descuentoSegundo >= 0 && pedido.descuentoSegundo < 1, "El descuento del segundo par va de 0 a menos de 1");
  exigir(bienvenidaPedida >= 0, "La bienvenida no puede ser negativa");
  exigir(pedido.cuotas in p.financiacion, "Cuotas: 1, 3 o 6");
  exigir(pedido.costoEnvio >= 0 && envioCobrado >= 0, "El envío no puede ser negativo");
  exigir(publicidad >= 0, "La publicidad no puede ser negativa");
  const tasaDeUso = pedido.cashback?.tasaDeUso ?? 1;
  exigir(!pedido.cashback || (pedido.cashback.porcentaje >= 0 && pedido.cashback.porcentaje < 1), "El cashback va de 0 a menos de 1");
  exigir(!pedido.cashback || pedido.cashback.tope === null || pedido.cashback.tope >= 0, "El tope del cashback no puede ser negativo");
  exigir(tasaDeUso >= 0 && tasaDeUso <= 1, "La tasa de uso del cashback va de 0 a 1");

  const conIva = 1 + p.alicuotaIva;
  const lista = pedido.pares.reduce((total, precio) => total + precio, 0);
  const aplicados = descuentosAplicados(pedido.pares, pedido.descuentoSegundo, bienvenidaPedida, pedido.acumularBienvenidaConDuo);
  const descuento = aplicados.duo + aplicados.bienvenida;
  const productos = lista - descuento;
  exigir(saldoAplicado >= 0 && saldoAplicado <= productos, "El saldo aplicado va de 0 a lo que valen los productos");

  const cobrado = productos - saldoAplicado + envioCobrado;
  // La venta, antes del saldo: el saldo ya se contó como costo en la compra que lo prometió.
  const ventaNeta = (productos + envioCobrado) / conIva;
  const facturadoNeto = cobrado / conIva;
  // Lo efectivamente pagado en productos: después de los descuentos y del saldo, sin envío.
  const comprometido = cashbackComprometido(productos - saldoAplicado, pedido.cashback);

  const costos = {
    producto: pedido.pares.length * p.costoUnitarioNeto,
    preparacion: p.preparacionPorPedido,
    envio: costoEnvioNeto(pedido.costoEnvio, p),
    mercadoPago: cobrado * p.comisionMercadoPago,
    financiacion: cobrado * p.financiacion[pedido.cuotas],
    iibb: facturadoNeto * p.iibb,
    devoluciones: ventaNeta * p.reservaDevoluciones,
    // Cuando se use, baja una venta futura con IVA incluido: su costo es neto.
    cashback: (comprometido * tasaDeUso) / conIva,
    publicidad,
  };

  const { publicidad: _publicidad, ...antesDePublicidad } = costos;
  const contribucionAntesDePublicidad = ventaNeta - Object.values(antesDePublicidad).reduce((a, b) => a + b, 0);
  const contribucion = contribucionAntesDePublicidad - publicidad;
  const margen = ventaNeta > 0 ? contribucion / ventaNeta : 0;

  return {
    bruto: {
      lista: centavos(lista),
      duo: centavos(aplicados.duo),
      bienvenida: centavos(aplicados.bienvenida),
      descuento: centavos(descuento),
      productos: centavos(productos),
      envioCobrado: centavos(envioCobrado),
      saldoAplicado: centavos(saldoAplicado),
      cobrado: centavos(cobrado),
      cashbackComprometido: comprometido,
    },
    promocion: aplicados.promocion,
    ventaNeta: centavos(ventaNeta),
    facturadoNeto: centavos(facturadoNeto),
    costos: Object.fromEntries(Object.entries(costos).map(([k, v]) => [k, centavos(v)])) as ResultadoContribucion["costos"],
    contribucionAntesDePublicidad: centavos(contribucionAntesDePublicidad),
    contribucion: centavos(contribucion),
    margen,
    superaMinimo: llega(margen, p),
  };
}

// ---------- El cliente: primera compra, recompra con crédito y acumulado ----------

export type ResultadoCliente = {
  /** La primera compra, con el cashback que promete provisionado como costo. */
  primera: ResultadoContribucion;
  /** Lo que agrega la recompra: el crédito que usa no resta otra vez (ya está en la primera). */
  recompra: ResultadoContribucion;
  /** El crédito que prometió la primera compra. */
  creditoPrometido: number;
  /** El que usó la recompra. */
  creditoUsado: number;
  /** El que queda sin usar: sigue provisionado en la primera, no se libera acá. */
  creditoPendiente: number;
  /** Las dos compras juntas. */
  acumulada: { ventaNeta: number; contribucion: number; margen: number; superaMinimo: boolean };
};

/**
 * La contribución de un cliente en dos compras: la primera provisiona el
 * crédito que promete; la recompra lo usa como medio de pago (sin volver a
 * restarlo) y provisiona el que ella misma promete; el acumulado es la suma.
 * El mismo crédito pesa una sola vez. Tira `RangeError` si la recompra usa más
 * crédito del que prometió la primera.
 */
export function contribucionDelCliente(
  primera: PedidoModelo,
  recompra: PedidoModelo,
  parametros: ParametrosContribucion = PARAMETROS_REFERENCIA
): ResultadoCliente {
  const r1 = calcularContribucion({ ...primera, saldoAplicado: primera.saldoAplicado ?? 0 }, parametros);
  const creditoUsado = recompra.saldoAplicado ?? 0;
  exigir(creditoUsado <= r1.bruto.cashbackComprometido, "La recompra no puede usar más crédito del que prometió la primera compra");
  const r2 = calcularContribucion(recompra, parametros);
  const ventaNeta = r1.ventaNeta + r2.ventaNeta;
  const contribucion = r1.contribucion + r2.contribucion;
  const margen = ventaNeta > 0 ? contribucion / ventaNeta : 0;
  return {
    primera: r1,
    recompra: r2,
    creditoPrometido: r1.bruto.cashbackComprometido,
    creditoUsado,
    creditoPendiente: r1.bruto.cashbackComprometido - creditoUsado,
    acumulada: { ventaNeta: centavos(ventaNeta), contribucion: centavos(contribucion), margen, superaMinimo: llega(margen, parametros) },
  };
}

// ---------- Escenarios y matriz ----------

/** Envíos a probar (lo que le cuesta a Harper). */
export const ENVIOS_DE_PRUEBA = [5_500, 10_000, 15_000] as const;
export const CUOTAS_DE_PRUEBA: Cuotas[] = [1, 3, 6];

const par = (n: number, precio = PRECIO_REFERENCIA) => Array<number>(n).fill(precio);

/** Las estrategias de la matriz: precio completo, bienvenida fija y Dúo. */
export type Estrategia = { nombre: string; pares: number; descuentoSegundo: number; bienvenida: number };
export const ESTRATEGIAS: Estrategia[] = [
  { nombre: "1 par, precio completo", pares: 1, descuentoSegundo: 0, bienvenida: 0 },
  { nombre: "1 par, bienvenida $ 5.000", pares: 1, descuentoSegundo: 0, bienvenida: 5_000 },
  { nombre: "1 par, bienvenida $ 10.000", pares: 1, descuentoSegundo: 0, bienvenida: 10_000 },
  { nombre: "2 pares, Dúo −20 %", pares: 2, descuentoSegundo: 0.2, bienvenida: 0 },
  { nombre: "2 pares, Dúo −25 %", pares: 2, descuentoSegundo: 0.25, bienvenida: 0 },
  { nombre: "2 pares, Dúo −30 %", pares: 2, descuentoSegundo: 0.3, bienvenida: 0 },
];

/** Los cashback de la matriz: el principal (10 % sin tope), el experimental (5 % sin tope) y sin cashback, de referencia. */
export const CASHBACKS_DE_LA_MATRIZ: { nombre: string; cashback: Cashback | null }[] = [
  { nombre: "Cashback 10 % sin tope (principal)", cashback: CASHBACK_PRINCIPAL },
  { nombre: "Cashback 5 % sin tope (alternativa experimental)", cashback: CASHBACK_ALTERNATIVO },
  { nombre: "Sin cashback (referencia)", cashback: null },
];

export type Escenario = { estrategia: Estrategia; cashback: Cashback | null; cuotas: Cuotas; costoEnvio: number };

export function escenariosDeLaMatriz(): Escenario[] {
  return CASHBACKS_DE_LA_MATRIZ.flatMap(({ cashback }) =>
    ESTRATEGIAS.flatMap((estrategia) =>
      CUOTAS_DE_PRUEBA.flatMap((cuotas) => ENVIOS_DE_PRUEBA.map((costoEnvio) => ({ estrategia, cashback, cuotas, costoEnvio })))
    )
  );
}

export function calcularEscenario(e: Escenario, parametros: ParametrosContribucion = PARAMETROS_REFERENCIA) {
  return calcularContribucion(
    {
      pares: par(e.estrategia.pares),
      descuentoSegundo: e.estrategia.descuentoSegundo,
      bienvenida: e.estrategia.bienvenida,
      cashback: e.cashback,
      cuotas: e.cuotas,
      costoEnvio: e.costoEnvio,
    },
    parametros
  );
}

/**
 * Los escenarios obligatorios (Ale, 05/11/2026), con CAC de $ 20.000 y mínimo
 * del 22 %, para cada envío. La primera compra de dos pares (Dúo −25 %,
 * cashback 10 %) promete $ 15.733; la recompra es un par a precio completo que
 * usa ese crédito.
 */
export const CREDITO_DE_LA_RECOMPRA = 15_733;

export const primeraCompraDuo = (costoEnvio: number): PedidoModelo => ({
  pares: par(2),
  descuentoSegundo: 0.25,
  cashback: CASHBACK_PRINCIPAL,
  cuotas: 6,
  costoEnvio,
});

export const recompraConCredito = (costoEnvio: number, cuotas: Cuotas, publicidad?: number): PedidoModelo => ({
  pares: par(1),
  descuentoSegundo: 0,
  saldoAplicado: CREDITO_DE_LA_RECOMPRA,
  cashback: CASHBACK_PRINCIPAL,
  cuotas,
  costoEnvio,
  ...(publicidad === undefined ? {} : { publicidad }),
});

export function escenariosObligatorios(): { nombre: string; pedido: (costoEnvio: number) => PedidoModelo }[] {
  return [
    { nombre: "1 par a precio completo, 6 cuotas, sin cashback", pedido: (costoEnvio) => ({ pares: par(1), descuentoSegundo: 0, cuotas: 6, costoEnvio }) },
    { nombre: "1 par a precio completo, 6 cuotas, cashback 10 %", pedido: (costoEnvio) => ({ pares: par(1), descuentoSegundo: 0, cashback: CASHBACK_PRINCIPAL, cuotas: 6, costoEnvio }) },
    { nombre: "1 par con bienvenida $ 5.000, 6 cuotas, sin cashback", pedido: (costoEnvio) => ({ pares: par(1), descuentoSegundo: 0, bienvenida: 5_000, cuotas: 6, costoEnvio }) },
    { nombre: "1 par con bienvenida $ 5.000, 6 cuotas, cashback 10 %", pedido: (costoEnvio) => ({ pares: par(1), descuentoSegundo: 0, bienvenida: 5_000, cashback: CASHBACK_PRINCIPAL, cuotas: 6, costoEnvio }) },
    { nombre: "2 pares, Dúo −25 %, cashback 10 % sin tope, 6 cuotas", pedido: primeraCompraDuo },
    { nombre: "Recompra de 1 par con $ 15.733 de crédito, 3 cuotas", pedido: (costoEnvio) => recompraConCredito(costoEnvio, 3) },
    { nombre: "Recompra de 1 par con $ 15.733 de crédito, 6 cuotas", pedido: (costoEnvio) => recompraConCredito(costoEnvio, 6) },
  ];
}

// ---------- En Markdown ----------

const porcentaje = (x: number, decimales = 1) => `${(x * 100).toFixed(decimales).replace(".", ",")} %`;
const pesos = (x: number) => `${x < 0 ? "−" : ""}$ ${Math.round(Math.abs(x)).toLocaleString("es-AR")}`;
const nombreCuotas = (c: Cuotas) => (c === 1 ? "1 pago" : `${c} cuotas`);
const marca = (llega: boolean) => (llega ? "✓" : "✗");
const celda = (r: { margen: number; superaMinimo: boolean; contribucion: number }) => `${marca(r.superaMinimo)} ${porcentaje(r.margen)} · ${pesos(r.contribucion)}`;

/**
 * La matriz en Markdown: los escenarios obligatorios (con el envío con IVA y
 * sin IVA), el cliente en dos compras, el efecto del IVA del envío y la matriz
 * de estrategias para cada cashback. ✓ llega al mínimo; ✗ no llega.
 */
export function matrizEnMarkdown(parametros: ParametrosContribucion = PARAMETROS_REFERENCIA): string {
  const conIva = { ...parametros, envioIncluyeIva: true };
  const sinIva = { ...parametros, envioIncluyeIva: false };
  const minimo = porcentaje(parametros.contribucionMinima, 0);
  const columnasEnvio = ENVIOS_DE_PRUEBA.map((e) => `Envío ${pesos(e)}`).join(" | ");
  const separador = (n: number) => `|${Array(n).fill("---").join("|")}|`;

  const l: string[] = [
    "# Contribución por pedido: escenarios de referencia",
    "",
    "Generado por `lib/contribucion.ts` (Tarea 01). No editar a mano: lo vuelve a escribir",
    "`ACTUALIZAR_MATRIZ=1 npm test`.",
    "",
    `Precio ${pesos(PRECIO_REFERENCIA)} por par (con IVA). Costo ${pesos(parametros.costoUnitarioNeto)} por par (sin IVA). ` +
      `Preparación ${pesos(parametros.preparacionPorPedido)}. Publicidad (CAC) ${pesos(parametros.cacPorPedido)} por pedido. ` +
      `Mercado Pago ${porcentaje(parametros.comisionMercadoPago, 2)}; 3 cuotas +${porcentaje(parametros.financiacion[3], 2)}; ` +
      `6 cuotas +${porcentaje(parametros.financiacion[6], 2)}. IIBB ${porcentaje(parametros.iibb, 0)}. ` +
      `Devoluciones ${porcentaje(parametros.reservaDevoluciones, 0)}. Envío gratis para el comprador. ` +
      `Cashback: un porcentaje de lo pagado en productos (después de descuentos y saldo, sin envío), redondeado al peso, sin tope. ` +
      `La bienvenida no se acumula con el Dúo.`,
    "",
    `Cada celda: contribución sobre la venta neta de IVA, después de publicidad, y cuánto deja en pesos. ✓ llega al ${minimo}; ✗ no llega.`,
  ];

  // 1. Escenarios obligatorios.
  l.push("", "## Escenarios obligatorios", "", "Con el costo de envío informado **con IVA** (Harper recupera ese IVA) y **sin IVA** (ya neto).", "");
  l.push(`| Escenario | Envío informado | ${columnasEnvio} |`, separador(2 + ENVIOS_DE_PRUEBA.length));
  for (const { nombre, pedido } of escenariosObligatorios()) {
    for (const [etiqueta, p] of [["con IVA", conIva], ["sin IVA", sinIva]] as const) {
      l.push(`| ${etiqueta === "con IVA" ? nombre : ""} | ${etiqueta} | ${ENVIOS_DE_PRUEBA.map((e) => celda(calcularContribucion(pedido(e), p))).join(" | ")} |`);
    }
  }

  // 2. El cliente en dos compras.
  const ejemplo = calcularContribucion(primeraCompraDuo(ENVIOS_DE_PRUEBA[0]), conIva);
  l.push(
    "",
    "## El cliente en dos compras",
    "",
    `Primera compra: 2 pares con Dúo −25 % (productos ${pesos(ejemplo.bruto.productos)}), cashback 10 % sin tope ` +
      `(${pesos(ejemplo.bruto.cashbackComprometido)} de crédito, provisionado como costo en esta compra), 6 cuotas. ` +
      `Recompra: 1 par a precio completo que usa los ${pesos(CREDITO_DE_LA_RECOMPRA)} de crédito (paga ${pesos(PRECIO_REFERENCIA - CREDITO_DE_LA_RECOMPRA)}) ` +
      `y promete su propio cashback del 10 %. En la recompra el crédito no resta otra vez: ya se contó en la primera.`,
    "",
    "Envío informado con IVA. La recompra, con la misma publicidad que cualquier pedido y sin publicidad (si vuelve sola, por el mail o el crédito).",
    "",
    `| Cuotas de la recompra | Publicidad de la recompra | Qué | ${columnasEnvio} |`,
    separador(3 + ENVIOS_DE_PRUEBA.length)
  );
  for (const cuotas of [3, 6] as Cuotas[]) {
    for (const publicidad of [parametros.cacPorPedido, 0]) {
      const clientes = ENVIOS_DE_PRUEBA.map((e) => contribucionDelCliente(primeraCompraDuo(e), recompraConCredito(e, cuotas, publicidad), conIva));
      const encabezado = `| ${nombreCuotas(cuotas)} | ${pesos(publicidad)} |`;
      l.push(`${encabezado} Primera compra | ${clientes.map((c) => celda(c.primera)).join(" | ")} |`);
      l.push(`| | | Recompra (incremental) | ${clientes.map((c) => celda(c.recompra)).join(" | ")} |`);
      l.push(`| | | **Acumulado del cliente** | ${clientes.map((c) => `**${celda(c.acumulada)}**`).join(" | ")} |`);
    }
  }

  // 3. El IVA del envío.
  l.push("", "## Cuánto pesa el IVA del envío", "", `| Envío | Costo neto si viene con IVA | Costo neto si viene sin IVA | Diferencia por pedido |`, separador(4));
  for (const e of ENVIOS_DE_PRUEBA) {
    const a = costoEnvioNeto(e, conIva);
    const b = costoEnvioNeto(e, sinIva);
    l.push(`| ${pesos(e)} | ${pesos(a)} | ${pesos(b)} | ${pesos(b - a)} menos de contribución |`);
  }
  const cambian = escenariosDeLaMatriz().filter((e) => calcularEscenario(e, conIva).superaMinimo !== calcularEscenario(e, sinIva).superaMinimo);
  l.push("", `En la matriz de abajo, ${cambian.length} escenarios cambian de ✓ a ✗ si el envío viene sin IVA (están marcados con *).`);

  // 4. La matriz de estrategias, por cashback.
  const escenarios = escenariosDeLaMatriz();
  for (const { nombre, cashback } of CASHBACKS_DE_LA_MATRIZ) {
    const deEste = escenarios.filter((e) => e.cashback === cashback);
    const llegan = deEste.filter((e) => calcularEscenario(e, conIva).superaMinimo).length;
    const llegaSinIva = deEste.filter((e) => calcularEscenario(e, sinIva).superaMinimo).length;
    l.push(
      "",
      `## ${nombre}`,
      "",
      `Llegan al ${minimo}: **${llegan} de ${deEste.length}** con el envío con IVA; ${llegaSinIva} de ${deEste.length} si viene sin IVA.`,
      "",
      `| Estrategia | ${CUOTAS_DE_PRUEBA.flatMap((c) => ENVIOS_DE_PRUEBA.map((e) => `${nombreCuotas(c)} · ${pesos(e)}`)).join(" | ")} |`,
      separador(1 + CUOTAS_DE_PRUEBA.length * ENVIOS_DE_PRUEBA.length)
    );
    for (const estrategia of ESTRATEGIAS) {
      const celdas = deEste
        .filter((e) => e.estrategia === estrategia)
        .map((e) => {
          const r = calcularEscenario(e, conIva);
          const cambia = r.superaMinimo !== calcularEscenario(e, sinIva).superaMinimo;
          return `${marca(r.superaMinimo)} ${porcentaje(r.margen)}${cambia ? "*" : ""}`;
        });
      l.push(`| ${estrategia.nombre} | ${celdas.join(" | ")} |`);
    }
  }
  return `${l.join("\n")}\n`;
}
