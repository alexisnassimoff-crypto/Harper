import type { ModoEnvio, OpcionEnvio, Paquete, ServicioEnvio } from "./tipos";

/**
 * Cliente de la API MiCorreo de Correo Argentino.
 *
 * Es lo que hace que el comprador pague el envío real a su código postal en
 * lugar de un precio plano inventado.
 *
 * La regla que gobierna todo este módulo: **nunca tira**. Si no hay
 * credenciales, si Correo Argentino no responde, o si el pedido no entra en un
 * bulto, las funciones devuelven `null` y quien llame cae al precio plano de
 * `Config`. Una caída de Correo Argentino puede costar unos pesos de diferencia
 * en un envío; no puede costar la venta entera.
 *
 * Autenticación en dos pasos:
 *   POST /token          con Basic Auth  -> JWT
 *   POST /users/validate con el JWT      -> customerId, obligatorio en todo lo demás
 */

const PRODUCCION = "https://api.correoargentino.com.ar/micorreo/v1";
const TEST = "https://apitest.correoargentino.com.ar/micorreo/v1";

/** Margen antes del vencimiento del JWT, para no usarlo justo cuando expira. */
const MARGEN_MS = 60_000;

/** Techo de espera: mejor cobrar el plano que dejar al comprador mirando un spinner. */
const TIMEOUT_MS = 6_000;

function base() {
  return process.env.CORREO_MODO === "test" ? TEST : PRODUCCION;
}

export function correoConfigurado() {
  return Boolean(
    process.env.CORREO_USER_TOKEN &&
      process.env.CORREO_PASSWORD_TOKEN &&
      process.env.CORREO_EMAIL &&
      process.env.CORREO_PASSWORD
  );
}

// ---------------------------------------------------------------------------
// Sesión: el JWT y el customerId se piden una vez y se reusan.
// ---------------------------------------------------------------------------

type Sesion = { jwt: string; customerId: string; vence: number };

let sesion: Sesion | null = null;
/** Evita que dos cotizaciones simultáneas pidan dos tokens. */
let pidiendoSesion: Promise<Sesion | null> | null = null;

async function obtenerSesion(): Promise<Sesion | null> {
  if (sesion && Date.now() < sesion.vence - MARGEN_MS) return sesion;
  if (pidiendoSesion) return pidiendoSesion;

  pidiendoSesion = crearSesion().finally(() => {
    pidiendoSesion = null;
  });

  return pidiendoSesion;
}

async function crearSesion(): Promise<Sesion | null> {
  if (!correoConfigurado()) return null;

  try {
    const basic = Buffer.from(
      `${process.env.CORREO_USER_TOKEN}:${process.env.CORREO_PASSWORD_TOKEN}`
    ).toString("base64");

    const respuestaToken = await pedir(`${base()}/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    });

    if (!respuestaToken) return null;

    const datos = (await respuestaToken.json()) as { token?: string; expires?: string };
    const jwt = datos.token;
    if (!jwt) return null;

    const respuestaCliente = await pedir(`${base()}/users/validate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: process.env.CORREO_EMAIL,
        password: process.env.CORREO_PASSWORD,
      }),
    });

    if (!respuestaCliente) return null;

    const cliente = (await respuestaCliente.json()) as { customerId?: string };
    if (!cliente.customerId) return null;

    const vence = datos.expires ? Date.parse(datos.expires) : Number.NaN;

    sesion = {
      jwt,
      customerId: cliente.customerId,
      // Si el vencimiento no viene o no se entiende, se asume media hora.
      vence: Number.isFinite(vence) ? vence : Date.now() + 30 * 60_000,
    };

    return sesion;
  } catch (error) {
    console.error("[correo] no se pudo abrir sesión:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cotización
// ---------------------------------------------------------------------------

type TarifaAPI = {
  deliveredType?: string;
  productType?: string;
  productName?: string;
  price?: number;
};

const NOMBRES: Record<string, string> = {
  "D-CP": "A domicilio · Clásico",
  "D-EP": "A domicilio · Expreso",
  "S-CP": "Retiro en sucursal · Clásico",
  "S-EP": "Retiro en sucursal · Expreso",
};

/**
 * Precios reales para llevar el paquete a un código postal.
 *
 * Devuelve `null` —y el sitio cae al precio plano— si no hay credenciales o si
 * Correo Argentino no contesta.
 */
export async function cotizar(opciones: {
  cpOrigen: string;
  cpDestino: string;
  paquete: Paquete;
}): Promise<OpcionEnvio[] | null> {
  const activa = await obtenerSesion();
  if (!activa) return null;

  try {
    const respuesta = await pedir(`${base()}/rates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${activa.jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerId: activa.customerId,
        postalCodeOrigin: opciones.cpOrigen,
        postalCodeDestination: opciones.cpDestino,
        dimensions: [
          {
            weight: opciones.paquete.pesoG,
            height: opciones.paquete.altoCm,
            width: opciones.paquete.anchoCm,
            length: opciones.paquete.largoCm,
          },
        ],
      }),
    });

    if (!respuesta) return null;

    const datos = (await respuesta.json()) as { rates?: TarifaAPI[] };
    const opcionesEnvio = (datos.rates ?? []).flatMap(mapearTarifa);

    // Una respuesta sin tarifas es tan inservible como un error.
    return opcionesEnvio.length > 0 ? opcionesEnvio : null;
  } catch (error) {
    console.error("[correo] falló la cotización:", error);
    return null;
  }
}

function mapearTarifa(tarifa: TarifaAPI): OpcionEnvio[] {
  const modo = tarifa.deliveredType as ModoEnvio | undefined;
  const servicio = tarifa.productType as ServicioEnvio | undefined;
  const precio = tarifa.price;

  if (modo !== "D" && modo !== "S") return [];
  if (servicio !== "CP" && servicio !== "EP") return [];
  if (typeof precio !== "number" || !Number.isFinite(precio) || precio < 0) return [];

  return [
    {
      modo,
      servicio,
      nombre: tarifa.productName?.trim() || NOMBRES[`${modo}-${servicio}`] || "Envío",
      precio: Math.round(precio),
    },
  ];
}

/**
 * Busca en una cotización la opción que eligió el comprador.
 *
 * Es la pieza que impide manipular el precio: el navegador dice QUÉ eligió y
 * acá se busca CUÁNTO sale, contra la cotización que acaba de hacer el
 * servidor. Un precio que venga del navegador no se mira nunca.
 */
export function buscarOpcion(
  opciones: OpcionEnvio[],
  modo: ModoEnvio,
  servicio: ServicioEnvio
): OpcionEnvio | null {
  return opciones.find((o) => o.modo === modo && o.servicio === servicio) ?? null;
}

// ---------------------------------------------------------------------------
// Sucursales
// ---------------------------------------------------------------------------

export type Sucursal = {
  id: string;
  nombre: string;
  direccion: string;
  localidad: string;
};

type AgenciaAPI = {
  code?: string;
  name?: string;
  location?: { address?: { streetName?: string; streetNumber?: string; locality?: string } };
};

/** Sucursales donde se puede retirar, por provincia. */
export async function sucursales(provincia: string): Promise<Sucursal[] | null> {
  const activa = await obtenerSesion();
  if (!activa) return null;

  try {
    const url = `${base()}/agencies?province=${encodeURIComponent(provincia)}`;

    const respuesta = await pedir(url, {
      headers: { Authorization: `Bearer ${activa.jwt}` },
    });

    if (!respuesta) return null;

    const datos = (await respuesta.json()) as AgenciaAPI[] | { agencies?: AgenciaAPI[] };
    const lista = Array.isArray(datos) ? datos : (datos.agencies ?? []);

    return lista.flatMap((a): Sucursal[] => {
      if (!a.code || !a.name) return [];

      const dir = a.location?.address;
      const calle = [dir?.streetName, dir?.streetNumber].filter(Boolean).join(" ");

      return [
        {
          id: a.code,
          nombre: a.name.trim(),
          direccion: calle,
          localidad: dir?.locality?.trim() ?? "",
        },
      ];
    });
  } catch (error) {
    console.error("[correo] no se pudieron leer las sucursales:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Importar un envío (la "etiqueta")
// ---------------------------------------------------------------------------

export type EnvioAImportar = {
  /** Identificador externo único: el record ID del pedido en Airtable. */
  extOrderId: string;
  /** El número que ve el cliente (HARPER-XXXXX). */
  orderNumber: string;
  destinatario: {
    nombre: string;
    email: string;
    telefono: string;
  };
  modo: ModoEnvio;
  /** Código de sucursal, solo cuando `modo` es "S". */
  sucursal?: string;
  direccion: {
    calle: string;
    numero: string;
    ciudad: string;
    provinciaCodigo: string;
    cp: string;
  };
  remitente: {
    nombre: string;
    email: string;
    cpOrigen: string;
  };
  paquete: Paquete;
  /** Lo que vale la mercadería, para el seguro de Correo Argentino. */
  valorDeclarado: number;
};

export type ResultadoImportar =
  | { ok: true; id: string | null; tracking: string | null }
  | { ok: false; error: string };

/**
 * Carga el envío en MiCorreo con todos los datos del pedido.
 *
 * Es la "etiqueta automática": después de esto el envío aparece en el panel
 * de MiCorreo listo para imprimir, sin tipear nada. La etiqueta en sí se
 * imprime desde el panel: la API no devuelve el PDF.
 *
 * A diferencia del resto del módulo, acá los errores SE INFORMAN en lugar de
 * degradar en silencio: quien despacha necesita saber por qué no salió.
 *
 * OJO: los nombres de campo del payload siguen la documentación pública de
 * MiCorreo y todavía no se validaron contra la API real (faltan las
 * credenciales). El primer uso va con CORREO_MODO=test y un pedido de prueba.
 */
export async function importarEnvio(envio: EnvioAImportar): Promise<ResultadoImportar> {
  if (!correoConfigurado()) {
    return { ok: false, error: "Faltan las credenciales de MiCorreo en Vercel" };
  }

  const activa = await obtenerSesion();
  if (!activa) {
    return { ok: false, error: "No se pudo abrir sesión con MiCorreo" };
  }

  const domicilio = {
    streetName: envio.direccion.calle,
    streetNumber: envio.direccion.numero,
    city: envio.direccion.ciudad,
    provinceCode: envio.direccion.provinciaCodigo,
    postalCode: envio.direccion.cp,
  };

  const cuerpo = {
    customerId: activa.customerId,
    extOrderId: envio.extOrderId,
    orderNumber: envio.orderNumber,
    sender: {
      name: envio.remitente.nombre,
      email: envio.remitente.email,
      originAddress: {
        streetName: "Núñez",
        streetNumber: "2422",
        city: "Ciudad Autónoma de Buenos Aires",
        provinceCode: "C",
        postalCode: envio.remitente.cpOrigen,
      },
    },
    recipient: {
      name: envio.destinatario.nombre,
      email: envio.destinatario.email,
      phone: envio.destinatario.telefono,
      cellPhone: envio.destinatario.telefono,
    },
    shipping: {
      deliveryType: envio.modo,
      ...(envio.modo === "S" && envio.sucursal ? { agency: envio.sucursal } : {}),
      address: domicilio,
      weight: envio.paquete.pesoG,
      declaredValue: envio.valorDeclarado,
      height: envio.paquete.altoCm,
      length: envio.paquete.largoCm,
      width: envio.paquete.anchoCm,
    },
  };

  try {
    const respuesta = await pedir(`${base()}/shipping/import`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${activa.jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
    });

    if (!respuesta) {
      return { ok: false, error: "MiCorreo no aceptó el envío (revisar logs de Vercel)" };
    }

    const datos = (await respuesta.json().catch(() => ({}))) as {
      id?: string | number;
      shipmentId?: string | number;
      trackingNumber?: string;
      tracking?: string;
    };

    return {
      ok: true,
      id: String(datos.id ?? datos.shipmentId ?? "") || null,
      tracking: datos.trackingNumber ?? datos.tracking ?? null,
    };
  } catch (error) {
    console.error("[correo] falló la importación del envío:", error);
    return { ok: false, error: "Error inesperado importando el envío" };
  }
}

// ---------------------------------------------------------------------------

/**
 * `fetch` con timeout que devuelve `null` en vez de tirar.
 *
 * Cualquier fallo acá termina en el precio plano, que es exactamente lo que
 * queremos: degradar, no romper.
 */
async function pedir(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const respuesta = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      console.error(`[correo] ${respuesta.status} en ${url}: ${detalle.slice(0, 300)}`);

      // Un 401 suele ser el token vencido antes de lo que decía: se descarta
      // la sesión para que el próximo intento pida una nueva.
      if (respuesta.status === 401) sesion = null;

      return null;
    }

    return respuesta;
  } catch (error) {
    console.error(`[correo] no se pudo llamar a ${url}:`, error);
    return null;
  }
}
