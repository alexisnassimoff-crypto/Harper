import { TABLAS, updateRecord } from "./airtable";
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
import type { CuentaSuscriptor, FilaSuscriptor } from "./suscriptores-cuenta";

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

/**
 * Agrega, edita, elimina o marca como principal una dirección de la cuenta.
 * `cuenta` es la fila recién leída: el cambio parte de lo que de verdad está
 * guardado. Solo escribe el campo «Direcciones».
 */
export async function guardarCambioDeDireccion(cuenta: CuentaSuscriptor, cambio: CambioDireccion): Promise<ResultadoCambio> {
  const resultado = cambiarDirecciones(cuenta.direcciones, cambio);
  if (resultado.estado !== "ok") return resultado;
  await updateRecord<FilaSuscriptor>(TABLAS.suscriptores, cuenta.id, { Direcciones: escribirDirecciones(resultado.direcciones) });
  return resultado;
}
