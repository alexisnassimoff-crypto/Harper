// Relativos (no "@/…") para que las pruebas, que compilan a CommonJS, los resuelvan.
import { PROVINCIAS } from "../components/checkout/provincias";
import { componerDireccion, placeIdValido } from "./direcciones";
import { validarCliente } from "./validacion";

/**
 * «Mis datos» y «Mis direcciones» de Mi cuenta Harper (Ale, 05/11/2026).
 *
 * Viven en la fila de Suscriptores de la cuenta (Nombre, Telefono, DNI y
 * Direcciones) y los escribe solo la sesión verificada de esa cuenta
 * (lib/mis-datos-servidor.ts). No tocan los pedidos ya hechos ni la ficha de
 * Clientes: sirven para completar el checkout de las próximas compras.
 *
 * Este módulo es puro: lo usan la ruta, la página y el checkout.
 */

/** Hasta cinco direcciones por cuenta: casa, trabajo, la de la familia… */
export const MAXIMO_DIRECCIONES = 5;

export type DatosPersonales = {
  nombre: string;
  /** El mail verificado de la cuenta: no se edita (es con el que entra). */
  email: string;
  telefono: string;
  /** Solo números. Vacío = sin cargar (el checkout lo pide igual). */
  dni: string;
};

/** Lo que el buscador de Google trajo de la dirección: el checkout la usa sin buscarla otra vez. */
export type LugarDeGoogle = {
  /** El placeId. */
  id: string;
  calle: string;
  numero: string;
  barrio: string;
  /** El partido (la zona del reparto de AMBA). */
  partido: string;
  texto: string;
};

export type DireccionGuardada = {
  /** «d» y ocho letras o números: con esto se edita o se elimina. */
  id: string;
  /** «Casa», «Trabajo». Opcional. */
  alias: string;
  principal: boolean;
  /** Calle y número, como van en el pedido: «Av. Cabildo 1234». */
  direccion: string;
  /** «5° B». Opcional. */
  piso: string;
  ciudad: string;
  /** Una de las 24 provincias. */
  provincia: string;
  cp: string;
  /** Si se eligió de la lista de Google. Sin esto, es una dirección cargada a mano. */
  lugar?: LugarDeGoogle;
};

/** Una dirección nueva o editada, antes de tener id. */
export type DireccionNueva = Omit<DireccionGuardada, "id" | "principal">;

/** Un texto de un renglón: sin caracteres de control ni espacios de más, y con tope. */
function renglon(valor: unknown, maximo: number): string {
  if (typeof valor !== "string") return "";
  return valor
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo);
}

const ID_DIRECCION = /^d[a-z0-9]{8}$/;

export function idDireccionValido(valor: unknown): valor is string {
  return typeof valor === "string" && ID_DIRECCION.test(valor);
}

export function nuevoIdDireccion(azar: () => number = Math.random): string {
  const letras = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "d";
  for (let i = 0; i < 8; i++) id += letras[Math.floor(azar() * letras.length) % letras.length];
  return id;
}

// ---------- Datos personales ----------

export type ErroresDatos = Partial<Record<"nombre" | "telefono" | "dni", string>>;

/**
 * El pedido de «Guardar mis datos»: nombre y apellido (obligatorios, como en
 * el checkout), teléfono y DNI (opcionales; si están, con las mismas reglas
 * que el checkout). El mail no viaja: es el de la sesión.
 */
export function leerDatosPersonales(cuerpo: unknown): { datos: Omit<DatosPersonales, "email"> } | { errores: ErroresDatos } {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const nombre = renglon(c.nombre, 80);
  const telefono = renglon(c.telefono, 30);
  const dni = renglon(c.dni, 12).replace(/\D/g, "");
  const reglas = validarCliente({ nombre, telefono, dni });
  const errores: ErroresDatos = {};

  if (reglas.nombre) errores.nombre = reglas.nombre;
  if (telefono && (reglas.telefono || !/^[\d\s()+-]+$/.test(telefono))) errores.telefono = "Revisá el teléfono: con característica, por ejemplo 11 5555 1234";
  if (dni && reglas.dni) errores.dni = reglas.dni;

  return Object.keys(errores).length > 0 ? { errores } : { datos: { nombre, telefono, dni } };
}

// ---------- Direcciones ----------

export type ErroresDireccion = Partial<Record<"direccion" | "ciudad" | "provincia" | "cp" | "alias" | "piso", string>>;

/**
 * Una dirección que llega del navegador (o de la fila guardada): con las
 * mismas reglas que el checkout para calle y número, localidad, provincia y
 * código postal. Si viene del buscador de Google, la calle y el número salen
 * de lo que Google trajo (y del número que la persona completó).
 */
export function leerDireccion(cuerpo: unknown): { direccion: DireccionNueva } | { errores: ErroresDireccion } {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const l = (c.lugar && typeof c.lugar === "object" ? c.lugar : null) as Record<string, unknown> | null;
  const lugar: LugarDeGoogle | undefined =
    l && placeIdValido(l.id) && renglon(l.calle, 120)
      ? {
          id: l.id as string,
          calle: renglon(l.calle, 120),
          numero: renglon(l.numero, 10),
          barrio: renglon(l.barrio, 60),
          partido: renglon(l.partido, 80),
          texto: renglon(l.texto, 200),
        }
      : undefined;

  const direccion = lugar ? componerDireccion(lugar) : renglon(c.direccion, 120);
  const nueva: DireccionNueva = {
    alias: renglon(c.alias, 30),
    direccion,
    piso: renglon(c.piso, 30),
    ciudad: renglon(c.ciudad, 80),
    provincia: renglon(c.provincia, 40),
    cp: renglon(c.cp, 8).toUpperCase(),
    ...(lugar ? { lugar } : {}),
  };

  const reglas = validarCliente(nueva);
  const errores: ErroresDireccion = {};
  if (reglas.direccion) errores.direccion = reglas.direccion;
  // Del buscador sin número (una avenida elegida sin altura): lo tiene que completar.
  else if (lugar && !lugar.numero) errores.direccion = "Completá el número de la calle";
  if (reglas.ciudad) errores.ciudad = reglas.ciudad;
  if (reglas.provincia || !(PROVINCIAS as readonly string[]).includes(nueva.provincia)) errores.provincia = "Elegí la provincia";
  if (reglas.cp) errores.cp = reglas.cp;

  return Object.keys(errores).length > 0 ? { errores } : { direccion: nueva };
}

/** Exactamente una principal (si hay alguna), y la principal primero. */
function ordenar(lista: DireccionGuardada[]): DireccionGuardada[] {
  if (lista.length === 0) return lista;
  const indice = Math.max(0, lista.findIndex((d) => d.principal));
  const marcadas = lista.map((d, i) => ({ ...d, principal: i === indice }));
  return [marcadas[indice], ...marcadas.filter((_, i) => i !== indice)];
}

/** Las direcciones guardadas en la fila (JSON). Lo que no se entiende se descarta, sin romper la cuenta. */
export function leerDirecciones(valor: unknown): DireccionGuardada[] {
  if (typeof valor !== "string" || !valor.trim()) return [];
  let crudas: unknown;
  try {
    crudas = JSON.parse(valor);
  } catch {
    return [];
  }
  if (!Array.isArray(crudas)) return [];

  const lista: DireccionGuardada[] = [];
  for (const cruda of crudas) {
    if (lista.length >= MAXIMO_DIRECCIONES) break;
    const c = (cruda && typeof cruda === "object" ? cruda : {}) as Record<string, unknown>;
    if (!idDireccionValido(c.id) || lista.some((d) => d.id === c.id)) continue;
    const leida = leerDireccion(c);
    if ("errores" in leida) continue;
    lista.push({ id: c.id, principal: c.principal === true, ...leida.direccion });
  }
  return ordenar(lista);
}

export function escribirDirecciones(lista: DireccionGuardada[]): string {
  return JSON.stringify(ordenar(lista));
}

/** La misma dirección (para no guardarla dos veces): calle y número, piso y código postal. */
function misma(a: DireccionNueva, b: DireccionNueva) {
  const clave = (d: DireccionNueva) => [d.direccion, d.piso, d.cp].map((x) => x.toLowerCase().replace(/\s+/g, " ")).join("|");
  return clave(a) === clave(b);
}

export type CambioDireccion =
  | { accion: "agregar"; direccion: DireccionNueva; principal: boolean }
  | { accion: "editar"; id: string; direccion: DireccionNueva; principal: boolean }
  | { accion: "eliminar"; id: string }
  | { accion: "principal"; id: string };

export type ResultadoCambio =
  | { estado: "ok"; direcciones: DireccionGuardada[] }
  | { estado: "no-existe" }
  | { estado: "tope" }
  | { estado: "repetida" };

/**
 * Aplica el cambio a la lista. La primera dirección es la principal; si se
 * elimina la principal, pasa a serlo la que sigue. Nunca más de
 * MAXIMO_DIRECCIONES ni dos veces la misma.
 */
export function cambiarDirecciones(
  lista: DireccionGuardada[],
  cambio: CambioDireccion,
  nuevoId: () => string = nuevoIdDireccion
): ResultadoCambio {
  const actual = ordenar(lista);

  if (cambio.accion === "agregar") {
    if (actual.length >= MAXIMO_DIRECCIONES) return { estado: "tope" };
    if (actual.some((d) => misma(d, cambio.direccion))) return { estado: "repetida" };
    let id = nuevoId();
    while (actual.some((d) => d.id === id)) id = nuevoId();
    const nueva: DireccionGuardada = { id, principal: cambio.principal || actual.length === 0, ...cambio.direccion };
    const todas = nueva.principal ? [nueva, ...actual.map((d) => ({ ...d, principal: false }))] : [...actual, nueva];
    return { estado: "ok", direcciones: ordenar(todas) };
  }

  const existe = actual.find((d) => d.id === cambio.id);
  if (!existe) return { estado: "no-existe" };

  if (cambio.accion === "eliminar") {
    return { estado: "ok", direcciones: ordenar(actual.filter((d) => d.id !== cambio.id)) };
  }

  if (cambio.accion === "principal") {
    return { estado: "ok", direcciones: ordenar(actual.map((d) => ({ ...d, principal: d.id === cambio.id }))) };
  }

  if (actual.some((d) => d.id !== cambio.id && misma(d, cambio.direccion))) return { estado: "repetida" };
  // La principal sigue siéndolo aunque se destilde: siempre hay una.
  const principal = cambio.principal || existe.principal;
  const editada: DireccionGuardada = { id: existe.id, principal, ...cambio.direccion };
  return {
    estado: "ok",
    direcciones: ordenar(actual.map((d) => (d.id === cambio.id ? editada : principal ? { ...d, principal: false } : d))),
  };
}

/** El pedido de la ruta: `{ accion, id?, direccion?, principal? }`. Null si no se entiende. */
export function leerCambioDeDireccion(cuerpo: unknown): CambioDireccion | { errores: ErroresDireccion } | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const c = cuerpo as Record<string, unknown>;
  const principal = c.principal === true;

  if (c.accion === "eliminar" || c.accion === "principal") {
    return idDireccionValido(c.id) ? { accion: c.accion, id: c.id } : null;
  }
  if (c.accion === "agregar" || c.accion === "editar") {
    if (c.accion === "editar" && !idDireccionValido(c.id)) return null;
    const leida = leerDireccion(c.direccion);
    if ("errores" in leida) return leida;
    return c.accion === "agregar"
      ? { accion: "agregar", direccion: leida.direccion, principal }
      : { accion: "editar", id: c.id as string, direccion: leida.direccion, principal };
  }
  return null;
}

// ---------- Para mostrar y para el checkout ----------

/** "Ciudad Autónoma de Buenos Aires" no entra en una línea de celular. */
export function provinciaCorta(provincia: string) {
  return provincia === "Ciudad Autónoma de Buenos Aires" ? "CABA" : provincia;
}

/** Los dos renglones de la tarjeta: «Av. Cabildo 1234, 5° B» y «Núñez, CABA · CP 1426». */
export function renglonesDeDireccion(d: DireccionNueva): [string, string] {
  // En la Ciudad, «Buenos Aires, CABA» dice lo mismo dos veces: queda CABA.
  const ciudad = d.provincia === "Ciudad Autónoma de Buenos Aires" && /buenos aires/i.test(d.ciudad) ? "" : d.ciudad;
  const lugar = [d.lugar?.barrio, ciudad, provinciaCorta(d.provincia)].filter((x, i, todos) => x && todos.indexOf(x) === i).join(", ");
  return [d.piso ? `${d.direccion}, ${d.piso}` : d.direccion, `${lugar} · CP ${d.cp}`];
}

/**
 * Cómo la usa el checkout: si vino de Google, como la dirección elegida en el
 * buscador (con su piso aparte, sin volver a buscarla ni a pagar la consulta);
 * si se cargó a mano, en los campos manuales, con el piso en la calle.
 */
export function direccionParaElCheckout(d: DireccionNueva):
  | {
      modo: "buscador";
      elegida: { id: string; calle: string; numero: string; localidad: string; barrio: string; provincia: string; cp: string; partido?: string; texto: string };
      piso: string;
    }
  | { modo: "manual"; direccion: string; ciudad: string; provincia: string; cp: string } {
  if (d.lugar) {
    return {
      modo: "buscador",
      elegida: {
        id: d.lugar.id,
        calle: d.lugar.calle,
        numero: d.lugar.numero,
        localidad: d.ciudad,
        barrio: d.lugar.barrio,
        provincia: d.provincia,
        cp: d.cp,
        ...(d.lugar.partido ? { partido: d.lugar.partido } : {}),
        texto: d.lugar.texto,
      },
      piso: d.piso,
    };
  }
  return { modo: "manual", direccion: d.piso ? `${d.direccion}, ${d.piso}` : d.direccion, ciudad: d.ciudad, provincia: d.provincia, cp: d.cp };
}
