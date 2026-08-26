import { PROVINCIAS } from "@/components/checkout/provincias";

/**
 * Código ISO 3166-2:AR de cada provincia, que es el que pide MiCorreo.
 *
 * El checkout guarda el nombre completo ("Ciudad Autónoma de Buenos Aires");
 * la API de Correo Argentino habla en códigos de una letra ("C").
 */
const CODIGOS: Record<(typeof PROVINCIAS)[number], string> = {
  "Buenos Aires": "B",
  "Ciudad Autónoma de Buenos Aires": "C",
  Catamarca: "K",
  Chaco: "H",
  Chubut: "U",
  Córdoba: "X",
  Corrientes: "W",
  "Entre Ríos": "E",
  Formosa: "P",
  Jujuy: "Y",
  "La Pampa": "L",
  "La Rioja": "F",
  Mendoza: "M",
  Misiones: "N",
  Neuquén: "Q",
  "Río Negro": "R",
  Salta: "A",
  "San Juan": "J",
  "San Luis": "D",
  "Santa Cruz": "Z",
  "Santa Fe": "S",
  "Santiago del Estero": "G",
  "Tierra del Fuego": "V",
  Tucumán: "T",
};

/** El código de la provincia, o `null` si el nombre no se reconoce. */
export function codigoDeProvincia(nombre: string): string | null {
  const limpio = nombre.trim();

  const directo = CODIGOS[limpio as (typeof PROVINCIAS)[number]];
  if (directo) return directo;

  // Tolera mayúsculas y variantes sin tilde ("Cordoba", "NEUQUEN").
  const normalizar = (texto: string) =>
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const buscado = normalizar(limpio);

  for (const [nombreOficial, codigo] of Object.entries(CODIGOS)) {
    if (normalizar(nombreOficial) === buscado) return codigo;
  }

  // Alias frecuentes que no son el nombre oficial.
  if (buscado === "caba" || buscado === "capital federal") return "C";

  return null;
}
