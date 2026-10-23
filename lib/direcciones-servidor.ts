import { modoFixtures } from "./airtable";
import { BASE_PLACES, type ConfiguracionDirecciones } from "./direcciones";
import { fetchPlacesFalso } from "./fixtures/direcciones";

/**
 * La parte de servidor del buscador de direcciones: la clave y con quién se
 * habla. Separada de `lib/direcciones.ts` para que el formulario (que corre
 * en el navegador) pueda importar los tipos y la normalización sin arrastrar
 * variables de entorno ni los datos de prueba.
 */

/** La clave y la base, o null si Google no está configurado. */
export function configuracionDirecciones(): ConfiguracionDirecciones | null {
  const clave = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!clave) return null;

  // La base solo cambia en una prueba local contra un Google de mentira;
  // en Vercel se ignora siempre, como MP_API_URL.
  const base =
    (!process.env.VERCEL && process.env.GOOGLE_PLACES_API_URL?.trim().replace(/\/$/, "")) ||
    BASE_PLACES;

  return { clave, base };
}

/**
 * Con quién habla /api/direcciones: Google con la clave real, o el Google de
 * mentira en modo de prueba (HARPER_FIXTURES=1 fuera de Vercel). Null si no
 * hay con quién: el checkout pide la dirección a mano.
 */
export function proveedorDirecciones(): { config: ConfiguracionDirecciones; fetchImpl: typeof fetch } | null {
  if (modoFixtures()) {
    return { config: { clave: "prueba", base: "http://places.prueba" }, fetchImpl: fetchPlacesFalso };
  }
  const config = configuracionDirecciones();
  return config ? { config, fetchImpl: fetch } : null;
}

/** Para la página del checkout: ¿se muestra el buscador o los campos de siempre? */
export function direccionesDisponibles() {
  return proveedorDirecciones() !== null;
}
