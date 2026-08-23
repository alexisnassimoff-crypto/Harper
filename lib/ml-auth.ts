import {
  createRecord,
  escaparFormula,
  listRecords,
  TABLAS,
  updateRecord,
} from "./airtable";

/**
 * Conexión OAuth con Mercado Libre.
 *
 * ML cerró su API pública de búsqueda: ahora todo pedido necesita un access
 * token de una aplicación autorizada por el vendedor. Los tokens viven en la
 * tabla Config de Airtable (no en variables de entorno) porque rotan: el
 * access token vence a las 6 horas y el refresh token se renueva en cada uso.
 */

const OAUTH_URL = "https://api.mercadolibre.com/oauth/token";

type FilaConfig = { Clave?: string; Valor?: string };

async function leerClave(clave: string): Promise<string> {
  const filas = await listRecords<FilaConfig>(TABLAS.config, {
    filterByFormula: `{Clave} = '${escaparFormula(clave)}'`,
    maxRecords: 1,
  });

  return filas[0]?.fields.Valor?.trim() ?? "";
}

async function escribirClave(clave: string, valor: string) {
  const filas = await listRecords<FilaConfig>(TABLAS.config, {
    filterByFormula: `{Clave} = '${escaparFormula(clave)}'`,
    maxRecords: 1,
  });

  if (filas[0]) {
    await updateRecord<FilaConfig>(TABLAS.config, filas[0].id, { Valor: valor });
    return;
  }

  await createRecord<FilaConfig>(TABLAS.config, {
    Clave: clave,
    Valor: valor,
    // @ts-expect-error el campo existe en la tabla aunque el tipo no lo declare
    Descripcion: "NO EDITAR. Token de Mercado Libre, se renueva solo",
  });
}

/**
 * Limpia una credencial pegada a mano: recorta espacios y saltos de línea y,
 * si el valor quedó duplicado (pegar dos veces con un Enter en el medio),
 * se queda con el primer término. Un client_id con un \n adentro hace que
 * Mercado Libre rechace la autorización con un error genérico.
 */
function limpiarCredencial(valor: string | undefined) {
  return (valor ?? "").trim().split(/\s+/)[0] ?? "";
}

function credenciales() {
  const appId = limpiarCredencial(process.env.ML_APP_ID);
  const secreto = limpiarCredencial(process.env.ML_APP_SECRET);

  if (!appId || !secreto) {
    throw new Error("Faltan las variables ML_APP_ID y ML_APP_SECRET");
  }

  return { appId, secreto };
}

export function mlConfigurado() {
  return Boolean(
    limpiarCredencial(process.env.ML_APP_ID) &&
      limpiarCredencial(process.env.ML_APP_SECRET)
  );
}

/** URL a la que se manda al usuario para autorizar la aplicación. */
export function urlDeAutorizacion(redirectUri: string) {
  const { appId } = credenciales();

  const url = new URL("https://auth.mercadolibre.com.ar/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);

  return url.toString();
}

type RespuestaToken = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

async function pedirToken(cuerpo: Record<string, string>): Promise<RespuestaToken> {
  const respuesta = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(cuerpo).toString(),
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Mercado Libre OAuth ${respuesta.status}: ${detalle}`);
  }

  return respuesta.json() as Promise<RespuestaToken>;
}

async function guardarTokens(t: RespuestaToken) {
  await escribirClave("ml_access_token", t.access_token);

  if (t.refresh_token) {
    await escribirClave("ml_refresh_token", t.refresh_token);
  }

  // Se guarda el vencimiento con 5 minutos de margen.
  const vence = Date.now() + (t.expires_in - 300) * 1000;
  await escribirClave("ml_token_vence", String(vence));
}

/** Canjea el código del callback por los tokens iniciales. */
export async function canjearCodigo(codigo: string, redirectUri: string) {
  const { appId, secreto } = credenciales();

  const tokens = await pedirToken({
    grant_type: "authorization_code",
    client_id: appId,
    client_secret: secreto,
    code: codigo,
    redirect_uri: redirectUri,
  });

  await guardarTokens(tokens);
  return tokens.access_token;
}

/**
 * Devuelve un access token vigente, renovándolo si hace falta.
 * Lanza con un mensaje claro si la cuenta todavía no se conectó.
 */
export async function tokenVigente(): Promise<string> {
  const actual = await leerClave("ml_access_token");
  const vence = Number(await leerClave("ml_token_vence")) || 0;

  if (actual && Date.now() < vence) return actual;

  const refresh = await leerClave("ml_refresh_token");

  if (!refresh) {
    throw new Error(
      "La cuenta de Mercado Libre no está conectada. Abrí /api/ml/conectar?token=<SYNC_TOKEN> para autorizarla."
    );
  }

  const { appId, secreto } = credenciales();

  const tokens = await pedirToken({
    grant_type: "refresh_token",
    client_id: appId,
    client_secret: secreto,
    refresh_token: refresh,
  });

  await guardarTokens(tokens);
  return tokens.access_token;
}
