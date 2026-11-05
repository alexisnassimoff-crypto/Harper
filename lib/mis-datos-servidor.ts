import { modoFixtures, TABLAS, updateRecord } from "./airtable";
import { cerrojoDesdeEntorno, ErrorCerrojo, ErrorCerrojoOcupado, soltarSinFallar, tomarConEspera, type Cerrojo } from "./cerrojo";
import { cerrojoEnMemoria } from "./fixtures/redis";
import {
  cambiarDirecciones,
  escribirDirecciones,
  leerDireccion,
  type CambioDireccion,
  type DatosPersonales,
  type DireccionGuardada,
  type DireccionNueva,
  type ResultadoCambio,
} from "./mis-datos";
import { clienteQueCompro, datosDeLaUltimaCompra, type DatosRecordados } from "./reconocer-cliente";
import { suscriptorPorId, type CuentaSuscriptor, type FilaSuscriptor } from "./suscriptores-cuenta";
import { RELOJ_REAL, type Reloj } from "./webhook-lock";

/**
 * «Mis datos» y «Mis direcciones» del lado del servidor (Ale, 05/11/2026).
 * Siempre con la cuenta de la sesión verificada (suscriptorDeLaPeticion o
 * suscriptorDeLaSesion: la cookie firmada, releída de Airtable): nunca por un
 * mail que alguien escribe. Solo escriben en la fila de Suscriptores de esa
 * cuenta; los pedidos y la ficha de Clientes no se tocan.
 */

export type VistaMisDatos = {
  datos: DatosPersonales;
  /** Lo que se muestra pero no está guardado en la cuenta: sale de su última compra con ese mail. */
  deLaUltimaCompra: ("nombre" | "telefono" | "dni")[];
  direcciones: DireccionGuardada[];
  /** Sin direcciones guardadas: la de su última compra, para guardarla con un toque. */
  sugerida: DireccionNueva | null;
};

type LeerUltimaCompra = (email: string) => Promise<DatosRecordados | null>;

/** Lo de la última compra confirmada de ese mail (lib/reconocer-cliente.ts, lo mismo que completa el checkout con el código). */
async function ultimaCompra(email: string): Promise<DatosRecordados | null> {
  const cliente = await clienteQueCompro(email);
  return cliente ? datosDeLaUltimaCompra(cliente) : null;
}

/**
 * Lo que ve la cuenta. Lo guardado en la cuenta manda; lo que falta se
 * completa con la última compra de ese mail (verificado: es el de la sesión),
 * marcado como tal. Si Airtable no deja leer la compra, sin completar.
 */
export async function misDatos(cuenta: CuentaSuscriptor, leer: LeerUltimaCompra = ultimaCompra): Promise<VistaMisDatos> {
  const guardados: DatosPersonales = { nombre: cuenta.nombre, email: cuenta.email, telefono: cuenta.telefono, dni: cuenta.dni };
  const falta = !guardados.nombre || !guardados.telefono || !guardados.dni || cuenta.direcciones.length === 0;
  const compra = falta
    ? await leer(cuenta.email).catch((error) => {
        console.error("[mis-datos] no se pudo leer la última compra:", error instanceof Error ? error.message : error);
        return null;
      })
    : null;

  const datos = { ...guardados };
  const deLaUltimaCompra: VistaMisDatos["deLaUltimaCompra"] = [];
  for (const campo of ["nombre", "telefono", "dni"] as const) {
    const deCompra = campo === "dni" ? (compra?.dni ?? "").replace(/\D/g, "") : (compra?.[campo] ?? "").trim();
    if (!datos[campo] && deCompra) {
      datos[campo] = deCompra;
      deLaUltimaCompra.push(campo);
    }
  }

  let sugerida: DireccionNueva | null = null;
  if (cuenta.direcciones.length === 0 && compra?.direccion) {
    const leida = leerDireccion({ direccion: compra.direccion, ciudad: compra.ciudad, provincia: compra.provincia, cp: compra.cp });
    if ("direccion" in leida) sugerida = leida.direccion;
  }

  return { datos, deLaUltimaCompra, direcciones: cuenta.direcciones, sugerida };
}

/** Guarda nombre, teléfono y DNI en la fila de la cuenta. Un error de Airtable sube tal cual. */
export async function guardarDatosPersonales(cuenta: CuentaSuscriptor, datos: Omit<DatosPersonales, "email">): Promise<DatosPersonales> {
  await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, cuenta.id, { Nombre: datos.nombre, Telefono: datos.telefono, DNI: datos.dni });
  return { ...datos, email: cuenta.email };
}

/** La llave de las direcciones de una cuenta: un cambio a la vez, aunque lleguen de dos dispositivos. */
export const claveDirecciones = (suscriptorId: string) => `harper:direcciones:${suscriptorId}`;

/** Leer, cambiar y escribir tarda ~1 s; si la instancia muere, la llave vence sola. */
export const TTL_DIRECCIONES_MS = 15_000;
/** Cuánto espera un cambio a que termine el otro antes de pedir que se reintente. */
export const ESPERA_DIRECCIONES_MS = 5_000;

/** El cerrojo de Redis de Vercel; en el modo de prueba local, uno en memoria. */
function cerrojoDeDirecciones(): Cerrojo | null {
  return cerrojoDesdeEntorno() ?? (modoFixtures() ? cerrojoEnMemoria() : null);
}

export type OpcionesCambioDireccion = {
  /** Sin pasarlo, el de Redis. null = sin Redis: no se guarda (ErrorCerrojo). */
  cerrojo?: Cerrojo | null;
  reloj?: Reloj;
  esperaMaxMs?: number;
};

/**
 * Agrega, edita, elimina o marca como principal una dirección de la cuenta.
 *
 * Dos cambios a la vez (dos dispositivos, dos pestañas) no se pisan: cada uno
 * toma la llave de la cuenta en Redis, RELEE la fila adentro de la llave y
 * aplica su cambio sobre lo que de verdad está guardado. Así, si uno agrega
 * una dirección y otro elimina otra, quedan los dos cambios. Sin Redis (o si
 * no contesta) no se guarda nada: `ErrorCerrojo`, y la ruta pide reintentar.
 * Si la llave sigue tomada después de la espera: `ErrorCerrojoOcupado`.
 * Solo escribe el campo «Direcciones».
 */
export async function guardarCambioDeDireccion(
  cuenta: CuentaSuscriptor,
  cambio: CambioDireccion,
  opciones: OpcionesCambioDireccion = {}
): Promise<ResultadoCambio & { actuales: DireccionGuardada[] }> {
  const cerrojo = opciones.cerrojo === undefined ? cerrojoDeDirecciones() : opciones.cerrojo;
  if (!cerrojo) throw new ErrorCerrojo("Redis sin configurar: no se guardan direcciones sin la llave");

  const clave = claveDirecciones(cuenta.id);
  const nonce = await tomarConEspera(cerrojo, clave, TTL_DIRECCIONES_MS, {
    esperaMaxMs: opciones.esperaMaxMs ?? ESPERA_DIRECCIONES_MS,
    reloj: opciones.reloj ?? RELOJ_REAL,
  });
  if (!nonce) throw new ErrorCerrojoOcupado(clave);

  try {
    // Lo guardado ahora, no lo que se leyó al llegar el pedido.
    const fresca = await suscriptorPorId(cuenta.id);
    if (!fresca || fresca.email !== cuenta.email) return { estado: "no-existe", actuales: [] };
    const resultado = cambiarDirecciones(fresca.direcciones, cambio);
    if (resultado.estado !== "ok") return { ...resultado, actuales: fresca.direcciones };
    await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, cuenta.id, { Direcciones: escribirDirecciones(resultado.direcciones) });
    return { ...resultado, actuales: resultado.direcciones };
  } finally {
    await soltarSinFallar(cerrojo, clave, nonce);
  }
}
