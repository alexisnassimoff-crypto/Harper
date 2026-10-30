import { createHmac } from "node:crypto";
import { consumirCuota } from "./cuota";
import { codigoEnviaDeProvincia } from "./provincias-envia";
import type { DestinoEnvio, OpcionEnvio, OrigenEnvio, Paquete } from "./tipos";

/**
 * Cotización de envíos con Envia (envia.com), solo del lado del servidor.
 *
 * Lo único que hace este módulo es PREGUNTAR PRECIOS: `POST /ship/rate/`. No
 * crea etiquetas, envíos, retiros ni webhooks, y no conoce esas rutas (hay
 * una prueba que lo controla). El token (`ENVIA_TOKEN`) se lee acá y no sale
 * de acá: ni a los logs, ni a la página, ni al navegador.
 *
 * Como lib/correo.ts, **nunca tira**: sin token, sin origen, con Envia caído
 * o sin transportistas para ese destino, devuelve null y quien llama cobra la
 * tarifa plana de Config. Una falla de Envia no puede costar la venta.
 *
 * Envia cotiza un transportista por consulta: se consultan todos los
 * elegidos a la vez, cada uno con su tiempo máximo, y se junta lo que
 * contestó. Solo se ofrecen entregas a domicilio, que es lo que dicen los
 * Términos (sin sucursales).
 */

const PRODUCCION = "https://api.envia.com";
const PRUEBA = "https://api-test.envia.com";

/** La única ruta de Envia que usa la tienda. */
export const RUTA_COTIZAR = "/ship/rate/";

/** Por transportista. Mejor la tarifa plana que el comprador mirando un spinner. */
const TIMEOUT_MS = 8_000;

/** Una cotización igual (mismo destino y paquete) se reusa unos minutos. */
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 300;

/**
 * Consultas nuevas a Envia por minuto, para toda la tienda (cada una le
 * pregunta a todos los transportistas). Lo que sale del cache no cuenta.
 * Pasado el tope, la tarifa plana, como con Envia caído: la venta sigue.
 * Los topes por IP están en las rutas, antes de llegar acá: una sola IP no
 * puede gastar este.
 */
const CONSULTAS_POR_MINUTO = 200;

/**
 * El transportista con el que Harper reparte en AMBA, en 24 h. Si cotiza un
 * destino, ese destino es AMBA: la zona sale de la cobertura real del
 * reparto, no de una lista de códigos postales. El comprador no lo ve.
 */
export const REPARTO_AMBA = "rueddo";

/** Los nombres de cada transportista (para Harper: el comprador no los ve). */
const NOMBRES: Record<string, string> = {
  andreani: "Andreani",
  correoargentino: "Correo Argentino",
  rueddo: "Rueddo",
  oca: "OCA",
  urbano: "Urbano",
};

export function enviaConfigurado() {
  return Boolean(process.env.ENVIA_TOKEN?.trim());
}

/**
 * Si con esta Config se puede cotizar: token, origen completo y
 * transportistas. Sin eso, el checkout ni lo intenta y se ve como siempre.
 */
export function puedeCotizar(config: { envioOrigen: OrigenEnvio | null; envioTransportistas: string[] }) {
  return enviaConfigurado() && config.envioOrigen !== null && config.envioTransportistas.length > 0;
}

/** El token de Harper es de producción; `ENVIA_ENTORNO=prueba` usa el sandbox. */
export function entornoEnvia(): "produccion" | "prueba" {
  return process.env.ENVIA_ENTORNO?.trim().toLowerCase() === "prueba" ? "prueba" : "produccion";
}

function base() {
  // Solo fuera de Vercel, para la prueba de punta a punta contra un Envia de
  // mentira (como MP_API_URL).
  const local = !process.env.VERCEL && process.env.ENVIA_API_URL?.trim().replace(/\/$/, "");
  return local || (entornoEnvia() === "prueba" ? PRUEBA : PRODUCCION);
}

/**
 * La clave para firmar los comprobantes de cotización (lib/cotizacion-envio.ts).
 * Se deriva del token de Envia para no sumar otra variable secreta: vive
 * solo en el servidor, y si se rota el token, los comprobantes viejos dejan
 * de valer (duran media hora igual).
 */
export function claveDeComprobantes(): Buffer | null {
  const token = process.env.ENVIA_TOKEN?.trim();
  if (!token) return null;
  return createHmac("sha256", token).update("harper:comprobante-envio:v1").digest();
}

// ---------------------------------------------------------------------------
// El paquete
// ---------------------------------------------------------------------------

export type PaqueteEnvia = { pesoKg: number; largoCm: number; anchoCm: number; altoCm: number };

/**
 * El paquete para Envia, en kg y cm. Las medidas salen de Airtable (ver
 * lib/paquete.ts); el peso es el calculado o el mínimo de Config
 * (`envio_peso_kg`), el mayor. Sin paquete (falta el peso o las medidas de
 * algún producto) no se cotiza.
 */
export function paqueteParaEnvia(paquete: Paquete | null, pesoMinimoKg: number): PaqueteEnvia | null {
  if (!paquete) return null;
  const calculado = paquete.pesoG / 1000;
  const pesoKg = Math.round(Math.max(calculado, pesoMinimoKg > 0 ? pesoMinimoKg : 0) * 100) / 100;
  if (!(pesoKg >= 0.01)) return null;
  return { pesoKg, largoCm: paquete.largoCm, anchoCm: paquete.anchoCm, altoCm: paquete.altoCm };
}

// ---------------------------------------------------------------------------
// La consulta
// ---------------------------------------------------------------------------

export type PedidoDeCotizacion = {
  origen: OrigenEnvio;
  destino: DestinoEnvio;
  paquete: PaqueteEnvia;
  /** El valor de la mercadería (no es un seguro: Harper no contrata seguro adicional). */
  valorDeclarado: number;
  transportistas: string[];
};

/** Lo que se cotizó, listo para la copia que queda en el pedido. */
export type TarifaEnvia = {
  opcion: Omit<OpcionEnvio, "comprobante">;
  /** Los datos de Envia que hacen falta para la etiqueta: lo mismo que se cotizó. */
  detalle: Record<string, unknown>;
};

export type ResultadoEnvia = {
  tarifas: TarifaEnvia[];
  /** Lo que se le preguntó a Envia, sin datos de la persona: para la copia en el pedido. */
  consulta: Record<string, unknown>;
  /** Transportistas que no contestaron o contestaron error (para el log). */
  fallas: string[];
  /** Cuándo contestó Envia (ISO): del cache sale con la hora real de la consulta. */
  cotizadoEn: string;
};

/** Solo dígitos, los cuatro del código postal ("C1426ABC" → "1426"). */
export function cuatroDigitos(cp: string) {
  return (cp.match(/\d{4}/) ?? [""])[0];
}

/**
 * El cuerpo de `POST /ship/rate/` para un transportista. El destinatario va
 * sin datos personales: al cotizar todavía no compró, y el precio depende
 * del lugar, no de quién recibe. El nombre y el teléfono son los de Harper
 * (Envia los exige en el formato); los reales van recién en la etiqueta.
 */
export function cuerpoDeCotizacion(p: PedidoDeCotizacion, transportista: string) {
  const { origen, destino, paquete } = p;
  return {
    origin: {
      name: origen.nombre,
      company: "Harper",
      phone: origen.telefono,
      street: origen.calle,
      number: origen.numero,
      ...(origen.piso ? { reference: `Piso ${origen.piso}`.slice(0, 50) } : {}),
      city: origen.ciudad,
      state: codigoEnviaDeProvincia(origen.provincia) ?? "",
      country: "AR",
      postalCode: cuatroDigitos(origen.cp),
    },
    destination: {
      name: "Cliente Harper",
      phone: origen.telefono,
      street: destino.calle.slice(0, 100),
      number: destino.numero.slice(0, 20),
      city: destino.ciudad.slice(0, 50),
      state: codigoEnviaDeProvincia(destino.provincia) ?? "",
      country: "AR",
      postalCode: cuatroDigitos(destino.cp),
    },
    packages: [
      {
        type: "box",
        content: "Anteojos y accesorios",
        amount: 1,
        declaredValue: Math.max(0, Math.round(p.valorDeclarado)),
        insurance: 0,
        weightUnit: "KG",
        lengthUnit: "CM",
        weight: paquete.pesoKg,
        dimensions: { length: paquete.largoCm, width: paquete.anchoCm, height: paquete.altoCm },
      },
    ],
    shipment: { type: 1, carrier: transportista },
    settings: { currency: "ARS" },
  };
}

type TarifaAPI = {
  carrier?: unknown;
  carrierId?: unknown;
  carrierDescription?: unknown;
  service?: unknown;
  serviceId?: unknown;
  serviceDescription?: unknown;
  dropOffDescription?: unknown;
  deliveryEstimate?: unknown;
  deliveryDate?: { date?: unknown } | null;
  totalPrice?: unknown;
  currency?: unknown;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * "7350.25" o 7350.25: Envia manda los precios de las dos formas. Cualquier
 * otra escritura ("7.350,25") no se adivina: esa tarifa se descarta, para no
 * leer $ 7,35 donde decía $ 7.350.
 */
function aPrecio(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim()) : Number.NaN;
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Entrega a domicilio. Afuera: retiro en sucursal del transportista
 * (`_suc`, "sucursal", OCA puerta-sucursal) y Mercado Libre Flex, que no es
 * para una tienda propia.
 */
export function esADomicilio(t: { service?: unknown; dropOffDescription?: unknown }) {
  const servicio = texto(t.service).toLowerCase();
  if (/(_suc$|^sucursal$|meli_flex|^oca_(ps|ss)$|_do$)/.test(servicio)) return false;
  return !/-\s*branch$/i.test(texto(t.dropOffDescription));
}

/**
 * Las tarifas a domicilio de una respuesta de Envia. Ignora lo que no sea
 * ARS, lo que no tenga precio y las respuestas de error (Envia a veces
 * contesta 200 con `meta: "error"`).
 */
export function leerTarifas(cuerpo: unknown, transportista: string): TarifaEnvia[] {
  const datos = cuerpo as { meta?: unknown; data?: unknown } | null;
  if (!datos || datos.meta === "error" || !Array.isArray(datos.data)) return [];

  const mejores = new Map<string, TarifaEnvia>();
  for (const t of datos.data as TarifaAPI[]) {
    if (!t || typeof t !== "object" || !esADomicilio(t)) continue;
    const costo = aPrecio(t.totalPrice);
    const moneda = texto(t.currency).toUpperCase();
    if (!(costo > 0) || (moneda && moneda !== "ARS")) continue;

    const carrier = texto(t.carrier) || transportista;
    const servicio = texto(t.service);
    if (!servicio) continue;
    const id = `${carrier}:${servicio}`;
    const plazo = texto(t.deliveryEstimate) || null;

    const tarifa: TarifaEnvia = {
      opcion: {
        id,
        transportista: carrier,
        transportistaNombre: NOMBRES[carrier.toLowerCase()] ?? (texto(t.carrierDescription) || carrier),
        servicio,
        servicioNombre: texto(t.serviceDescription) || servicio,
        costo: Math.round(costo * 100) / 100,
        // Pesos enteros, hacia arriba: nunca se cobra menos de lo que sale.
        precio: Math.ceil(costo - 1e-9),
        plazo,
      },
      detalle: {
        carrier,
        carrierId: t.carrierId ?? null,
        service: servicio,
        serviceId: t.serviceId ?? null,
        serviceDescription: texto(t.serviceDescription) || null,
        dropOffDescription: texto(t.dropOffDescription) || null,
        deliveryEstimate: plazo,
        deliveryDate: texto(t.deliveryDate?.date) || null,
        totalPrice: costo,
        currency: moneda || "ARS",
      },
    };

    // Si el mismo servicio vuelve dos veces (por ejemplo, retirando en el
    // depósito o llevándolo Harper a la sucursal), queda el más barato.
    const previa = mejores.get(id);
    if (!previa || tarifa.opcion.costo < previa.opcion.costo) mejores.set(id, tarifa);
  }
  return [...mejores.values()];
}

/**
 * Lo que se le pregunta a Envia, sin calle ni datos de la persona: es lo que
 * queda en el pedido para cotizar y generar la etiqueta con lo mismo.
 */
export function resumenDeConsulta(p: PedidoDeCotizacion): Record<string, unknown> {
  return {
    entorno: entornoEnvia(),
    origen: { cp: cuatroDigitos(p.origen.cp), provincia: codigoEnviaDeProvincia(p.origen.provincia) },
    destino: { cp: cuatroDigitos(p.destino.cp), provincia: codigoEnviaDeProvincia(p.destino.provincia), ciudad: p.destino.ciudad },
    paquete: p.paquete,
    valorDeclarado: Math.round(p.valorDeclarado),
    transportistas: p.transportistas,
  };
}

const cache = new Map<string, { vence: number; resultado: ResultadoEnvia }>();

/**
 * Cotiza con todos los transportistas elegidos a la vez. Null si no hay
 * token, el origen o el destino están incompletos, o nadie devolvió una
 * tarifa a domicilio.
 */
export async function cotizarEnvia(
  p: PedidoDeCotizacion,
  opciones: { fetchImpl?: typeof fetch; ahora?: number; consumir?: typeof consumirCuota } = {}
): Promise<ResultadoEnvia | null> {
  const token = process.env.ENVIA_TOKEN?.trim();
  if (!token || p.transportistas.length === 0) return null;
  if (!codigoEnviaDeProvincia(p.origen.provincia)) {
    console.warn("[envia] la provincia de origen de Config no es una de las 24: tarifa plana");
    return null;
  }
  if (!codigoEnviaDeProvincia(p.destino.provincia)) return null;
  if (!cuatroDigitos(p.destino.cp) || !p.destino.ciudad || !p.destino.calle) return null;

  const ahora = opciones.ahora ?? Date.now();
  const consulta = resumenDeConsulta(p);
  // El precio depende del CP, la provincia y la localidad, no de la calle ni
  // del número (por eso el comprobante tampoco los firma): la misma consulta
  // para otra calle sale del cache.
  const clave = JSON.stringify(consulta);
  const guardado = cache.get(clave);
  if (guardado && guardado.vence > ahora) return guardado.resultado;

  const cuota = await (opciones.consumir ?? consumirCuota)([
    { clave: "envia-consultas", ventanaMs: 60_000, limite: CONSULTAS_POR_MINUTO },
  ]);
  if (cuota.excedida) {
    console.warn("[envia] tope de consultas por minuto de la tienda: tarifa plana");
    return null;
  }

  const fetchImpl = opciones.fetchImpl ?? fetch;
  const respuestas = await Promise.allSettled(
    p.transportistas.map(async (transportista) => {
      const respuesta = await fetchImpl(`${base()}${RUTA_COTIZAR}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(cuerpoDeCotizacion(p, transportista)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const cuerpo = (await respuesta.json().catch(() => null)) as { meta?: unknown; error?: { code?: unknown; message?: unknown; description?: unknown } } | null;
      if (!respuesta.ok || !cuerpo || cuerpo.meta === "error") {
        // Solo el código y el mensaje de Envia: nunca el token ni lo enviado.
        const motivo = [cuerpo?.error?.code, texto(cuerpo?.error?.message) || texto(cuerpo?.error?.description)].filter(Boolean).join(" ");
        // Un 200 con `meta: "error"` es una respuesta ("no llega a ese CP");
        // lo demás (5xx, 429, cuerpo ilegible) puede andar en un rato.
        const definitiva = respuesta.ok && cuerpo?.meta === "error";
        throw Object.assign(new Error(`HTTP ${respuesta.status}${motivo ? ` ${motivo}`.slice(0, 160) : ""}`), { definitiva });
      }
      return leerTarifas(cuerpo, transportista);
    })
  );

  const tarifas: TarifaEnvia[] = [];
  const fallas: string[] = [];
  // Sin respuesta (red, tiempo, 5xx): el resultado está incompleto y no se
  // guarda, para que la próxima consulta le vuelva a preguntar a ese
  // transportista (con envío gratis se ofrece la más barata de todas).
  let incompleto = false;
  respuestas.forEach((r, i) => {
    if (r.status === "fulfilled") tarifas.push(...r.value);
    else {
      if (!(r.reason as { definitiva?: boolean })?.definitiva) incompleto = true;
      fallas.push(`${p.transportistas[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  if (fallas.length > 0) console.warn("[envia] no cotizaron:", fallas.join(" | "));

  if (tarifas.length === 0) return null;
  tarifas.sort((a, b) => a.opcion.costo - b.opcion.costo);

  const resultado: ResultadoEnvia = { tarifas, consulta, fallas, cotizadoEn: new Date(ahora).toISOString() };
  if (!incompleto) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(clave, { vence: ahora + CACHE_MS, resultado });
  }
  return resultado;
}

/** Para las pruebas: vacía el cache entre casos. */
export function vaciarCacheEnvia() {
  cache.clear();
}
