// Relativo (no "@/…") para que las pruebas, que compilan a CommonJS, lo resuelvan.
import { PROVINCIAS } from "../components/checkout/provincias";

/**
 * El código de cada provincia para Envia.
 *
 * Envia usa sus propios códigos de dos letras, que no son los ISO de
 * lib/provincias-codigo.ts (MiCorreo): la Ciudad de Buenos Aires es "DF", no
 * "C". Tomados de su API (`/state?country_code=AR`) y de Geocodes el
 * 28/10/2026; coinciden en las 24.
 */
const CODIGOS: Record<(typeof PROVINCIAS)[number], string> = {
  "Buenos Aires": "BA",
  "Ciudad Autónoma de Buenos Aires": "DF",
  Catamarca: "CT",
  Chaco: "CC",
  Chubut: "CH",
  Córdoba: "CB",
  Corrientes: "CN",
  "Entre Ríos": "ER",
  Formosa: "FM",
  Jujuy: "JY",
  "La Pampa": "LP",
  "La Rioja": "LR",
  Mendoza: "MZ",
  Misiones: "MN",
  Neuquén: "NQ",
  "Río Negro": "RN",
  Salta: "SA",
  "San Juan": "SJ",
  "San Luis": "SL",
  "Santa Cruz": "SC",
  "Santa Fe": "SF",
  "Santiago del Estero": "SE",
  "Tierra del Fuego": "TF",
  Tucumán: "TM",
};

/** Sin tildes ni mayúsculas, para comparar nombres de provincia. */
function plano(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** El código de Envia de una provincia (por su nombre), o null si no se reconoce. */
export function codigoEnviaDeProvincia(nombre: string): string | null {
  const buscado = plano(nombre);
  if (!buscado) return null;
  const encontrada = PROVINCIAS.find((p) => plano(p) === buscado);
  if (encontrada) return CODIGOS[encontrada];
  // "CABA" o "Capital Federal", como a veces la escribe la gente.
  if (["caba", "capital federal", "ciudad de buenos aires"].includes(buscado)) return CODIGOS["Ciudad Autónoma de Buenos Aires"];
  return null;
}
