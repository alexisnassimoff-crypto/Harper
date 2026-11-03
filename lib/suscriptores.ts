import { precio as formatearPrecio } from "./formato";
import type { ItemResuelto } from "./tipos";

/**
 * Suscriptores Harper (Ale, 03/11/2026): reemplaza a la membresía paga de
 * Socios Harper («nadie va a comprar eso»). La idea es armar la base de datos
 * de compradores: la suscripción es gratis, con el mail confirmado por un
 * código de 6 números, y trae:
 *
 *  - Un cupón de bienvenida de $ 10.000 fijos, una sola vez, en la primera
 *    compra. Sobre los productos, nunca sobre el envío.
 *  - Cashback: el 10% de lo que paga en productos (sin el envío, después del
 *    cupón y del saldo usado) vuelve como saldo a favor en harper.ar. Se puede
 *    usar a los 30 días del pago, pasado el plazo de devolución. No vence y
 *    puede cubrir la compra entera.
 *  - Envío gratis siempre.
 *  - Cuotas: 3 sin interés para todos, 6 para suscriptores (el tope de la
 *    preferencia de Mercado Pago; se anuncian solo si Mercado Pago las
 *    confirma, ver lib/cuotas.ts).
 *
 * Este archivo son las cuentas, sin nada de servidor: lo usan el carrito, el
 * checkout, el webhook y también el navegador. Los montos los decide siempre
 * el servidor con lo que dice Airtable (lib/suscriptores-cuenta.ts); el
 * navegador solo pide usar o no el saldo.
 */

/** Pesos fijos del cupón de bienvenida. */
export const CUPON_BIENVENIDA = 10_000;
/** Lo que vuelve como saldo, sobre lo pagado en productos. */
export const CASHBACK_PORCENTAJE = 10;
/** Días desde el pago hasta que el cashback se puede usar: el plazo de devolución. */
export const DIAS_PARA_USAR_CASHBACK = 30;
/** Cuotas sin interés para cualquier comprador (tope de la preferencia). */
export const CUOTAS_TODOS = 3;
/** Cuotas sin interés para un suscriptor. */
export const CUOTAS_SUSCRIPTORES = 6;

/** Lo que el carrito sabe del suscriptor reconocido por su sesión (lib/suscriptores-cuenta.ts). */
export type SuscriptorDelCarrito = {
  id: string;
  email: string;
  /** Tiene el cupón sin usar y ese mail todavía no compró. */
  cuponDisponible: boolean;
  /** Saldo a favor que ya se puede usar, en pesos. */
  saldoDisponible: number;
};

/**
 * Lo que el carrito y el checkout muestran de los beneficios (va en
 * CarritoResuelto y en la respuesta de /api/carrito/resolver).
 */
export type ResumenSuscriptor = {
  /** El mail con el que entró (es su propia sesión). */
  email: string;
  /** Pesos del cupón de bienvenida aplicados en este carrito; 0 si no. */
  cupon: number;
  /** Todavía tiene el cupón, aunque este carrito no lo use (vacío, o lo sacó). */
  cuponDisponible: boolean;
  /** Pesos pagados con saldo en este carrito. */
  saldoUsado: number;
  /** El saldo que ya se puede usar, antes de este carrito. */
  saldoDisponible: number;
  /** Lo que le vuelve como saldo si paga con Mercado Pago como está. */
  cashbackPrevisto: number;
  /** Lo mismo pagando con dinero en Mercado Pago (10% menos en productos). Null sin esa opción. */
  cashbackDineroMP: number | null;
  /** Tope de cuotas de su preferencia de Mercado Pago. */
  cuotas: number;
};

/** El tope de cuotas de la preferencia de Mercado Pago para este comprador. */
export function cuotasMaximas(esSuscriptor: boolean): number {
  return esSuscriptor ? CUOTAS_SUSCRIPTORES : CUOTAS_TODOS;
}

/**
 * Reparte un monto fijo entre los renglones, en proporción a lo que vale cada
 * uno. Se redondea hacia abajo en cada renglón y lo que sobra lo absorbe el
 * más grande (como el 10% de dinero en Mercado Pago, lib/dinero-mp.ts). Nunca
 * deja un renglón por debajo de 0: si el más grande no alcanza, sigue el
 * siguiente.
 */
export function repartir(valores: number[], monto: number): number[] {
  const base = valores.reduce((total, v) => total + Math.max(0, v), 0);
  const total = Math.min(Math.max(0, monto), base);
  if (!(total > 0)) return valores.map(() => 0);

  const partes = valores.map((v) => Math.min(Math.max(0, v), Math.floor((total * Math.max(0, v)) / base)));
  let resto = total - partes.reduce((suma, p) => suma + p, 0);
  const deMayorAMenor = valores.map((_, n) => n).sort((a, b) => valores[b] - valores[a] || a - b);
  for (const n of deMayorAMenor) {
    if (resto <= 0) break;
    const entra = Math.min(resto, Math.max(0, valores[n]) - partes[n]);
    partes[n] += entra;
    resto -= entra;
  }
  return partes;
}

/**
 * El cupón de bienvenida y después el saldo, sobre los ítems ya resueltos
 * (con sus promociones). Cada uno es un monto fijo repartido entre los
 * renglones (`repartir`): el cupón nunca pasa del subtotal de productos y el
 * saldo cubre como mucho lo que queda. Devuelve ítems nuevos (no toca los que
 * recibe) y cuánto se usó de cada uno, en pesos enteros.
 */
export function aplicarBeneficios(
  items: ItemResuelto[],
  beneficios: { cupon: number; saldo: number }
): { items: ItemResuelto[]; cupon: number; saldo: number } {
  const subtotales = items.map((i) => Math.max(0, i.subtotal));
  const base = subtotales.reduce((total, s) => total + s, 0);

  const cupon = Math.min(Math.floor(Math.max(0, beneficios.cupon)), Math.floor(base));
  const partesCupon = repartir(subtotales, cupon);
  const trasCupon = subtotales.map((s, n) => s - partesCupon[n]);

  const saldo = Math.min(Math.floor(Math.max(0, beneficios.saldo)), Math.floor(base - cupon));
  const partesSaldo = repartir(trasCupon, saldo);

  if (cupon === 0 && saldo === 0) return { items: items.map((i) => ({ ...i })), cupon: 0, saldo: 0 };

  return {
    items: items.map((item, n) => {
      const subtotal = trasCupon[n] - partesSaldo[n];
      return {
        ...item,
        ...(partesCupon[n] > 0 ? { cupon: partesCupon[n] } : {}),
        ...(partesSaldo[n] > 0 ? { saldo: partesSaldo[n] } : {}),
        subtotal,
        precioUnitario: subtotal / item.cantidad,
      };
    }),
    cupon,
    saldo,
  };
}

/** El cashback de lo pagado en productos (sin envío), en pesos enteros. */
export function cashbackDe(productosPagados: number): number {
  if (!(productosPagados > 0)) return 0;
  return Math.round((productosPagados * CASHBACK_PORCENTAJE) / 100);
}

/** "2026-11-03" en Buenos Aires, aunque el servidor esté en otro huso. */
export function fechaArgentina(momento: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(momento);
}

/** "2026-11-03" + 30 → "2026-12-03". */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Desde qué día (en Buenos Aires) se puede usar el cashback de un pago. */
export function cashbackDisponibleDesde(fechaPago: Date): string {
  return sumarDias(fechaArgentina(fechaPago), DIAS_PARA_USAR_CASHBACK);
}

/** "2026-12-03" → "03/12/2026", para los mails y la cuenta. */
export function fechaLegible(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : iso;
}

export type TipoMovimiento = "Cashback" | "Uso" | "Ajuste";

/** Un renglón de la tabla Saldos, ya leído (lib/suscriptores-cuenta.ts). */
export type MovimientoSaldo = {
  id: string;
  tipo: TipoMovimiento;
  /** Positivo suma, negativo usa. */
  monto: number;
  pedido: string;
  /** ISO, el momento del movimiento. */
  fecha: string;
  /** "2026-12-03": desde ese día cuenta. Null cuenta desde ya. */
  disponibleDesde: string | null;
  anulado: boolean;
};

/**
 * El saldo de un suscriptor a una fecha (en Buenos Aires):
 *  - disponible: la suma de lo no anulado que ya se puede usar (sin
 *    `disponibleDesde`, o con ese día ya llegado). Nunca menos de 0 para
 *    mostrar ni para usar; la suma de verdad sigue en la tabla.
 *  - en camino: el cashback no anulado que todavía no se puede usar.
 */
export function saldoDe(movimientos: MovimientoSaldo[], hoy: Date | string): { disponible: number; enCamino: number } {
  const dia = typeof hoy === "string" ? hoy : fechaArgentina(hoy);
  let disponible = 0;
  let enCamino = 0;
  for (const m of movimientos) {
    if (m.anulado || !Number.isFinite(m.monto)) continue;
    if (!m.disponibleDesde || m.disponibleDesde <= dia) disponible += m.monto;
    else if (m.tipo === "Cashback") enCamino += m.monto;
  }
  return { disponible: Math.max(0, disponible), enCamino: Math.max(0, enCamino) };
}

/** De dónde vino la suscripción (campo Origen de Suscriptores). */
export const ORIGENES_SUSCRIPCION = ["Portada", "Checkout", "Ficha", "Suscriptores", "Otro"] as const;
export type OrigenSuscripcion = (typeof ORIGENES_SUSCRIPCION)[number];

export function normalizarOrigenSuscripcion(crudo: unknown): OrigenSuscripcion {
  return ORIGENES_SUSCRIPCION.find((o) => typeof crudo === "string" && o.toLowerCase() === crudo.trim().toLowerCase()) ?? "Otro";
}

/**
 * Lo que el pedido guarda de los beneficios, en Notas (Ale, 03/11/2026: el
 * esquema de Pedidos no se toca). El webhook lo lee de ahí después del pago
 * para anotar el cupón, el saldo usado y el cashback (lib/webhook-proceso.ts).
 */
export type BeneficiosDelPedido = {
  suscriptorId: string;
  email: string;
  cupon: number;
  saldoUsado: number;
  cashback: number;
};

const SUSCRIPTOR = "Suscriptor: ";
const CUPON = "Cupón de bienvenida: ";
const SALDO = "Saldo usado: ";
const CASHBACK = "Cashback a acreditar: ";

/** Las líneas para Notas: «Suscriptor: ana@… (rec…)», «Cupón de bienvenida: −$ 10.000»… */
export function notasDeBeneficios(b: BeneficiosDelPedido): string[] {
  return [
    `${SUSCRIPTOR}${b.email} (${b.suscriptorId})`,
    b.cupon > 0 ? `${CUPON}−${formatearPrecio(b.cupon)}` : null,
    b.saldoUsado > 0 ? `${SALDO}−${formatearPrecio(b.saldoUsado)}` : null,
    b.cashback > 0 ? `${CASHBACK}${formatearPrecio(b.cashback)}` : null,
  ].filter((l): l is string => l !== null);
}

/** Lo contrario: los beneficios que dejó el checkout en Notas. Null si el pedido no es de un suscriptor. */
export function beneficiosDeNotas(notas: unknown): BeneficiosDelPedido | null {
  if (typeof notas !== "string") return null;
  const lineas = notas.split("\n").map((l) => l.trim());
  const quien = lineas.find((l) => l.startsWith(SUSCRIPTOR));
  const m = quien ? /^Suscriptor: (\S+) \((rec[A-Za-z0-9]{14})\)$/.exec(quien) : null;
  if (!m) return null;
  const pesos = (prefijo: string) => {
    const linea = lineas.find((l) => l.startsWith(prefijo));
    const n = linea ? Number(linea.slice(prefijo.length).replace(/\D/g, "")) : 0;
    return Number.isFinite(n) ? n : 0;
  };
  return { email: m[1], suscriptorId: m[2], cupon: pesos(CUPON), saldoUsado: pesos(SALDO), cashback: pesos(CASHBACK) };
}

/** Para el campo Cupon del pedido y el aviso interno: «Bienvenida suscriptor (−$ 10.000)». */
export function constanciaDelCuponDeBienvenida(cupon: number): string {
  return `Bienvenida suscriptor (−${formatearPrecio(cupon)})`;
}
