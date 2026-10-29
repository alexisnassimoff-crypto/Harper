import { NextResponse } from "next/server";
import { isAirtableConfigured, modoFixtures } from "@/lib/airtable";
import { getProductos } from "@/lib/catalogo";
import { verificarRedis } from "@/lib/cerrojo";
import { getConfig } from "@/lib/config";
import { enviaConfigurado, entornoEnvia } from "@/lib/envia";
import { diagnosticarCuotas } from "@/lib/cuotas-servidor";
import { configuracionDirecciones } from "@/lib/direcciones-servidor";
import { blobConfigurado } from "@/lib/media";
import { mailsConfigurados } from "@/lib/mails";
import { mercadoPagoListo } from "@/lib/mercadopago";
import { leerIntentoML } from "@/lib/estado-ml";
import { mlConfigurado } from "@/lib/ml-auth";
import { metaCapiConfigurada } from "@/lib/meta";
import { esUrlPublica, urlDelSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

/**
 * Variables que el sitio necesita, con el detalle de cuál está cargada.
 *
 * Solo presencia, nunca el valor: saber que existe no es un secreto, y sin
 * esto la única forma de averiguar por qué no cobra es adivinar entre tres
 * variables y un redeploy que quizá no se hizo.
 *
 * `deUnaVez` marca las que se leen en tiempo de build: si se cargan después
 * del deploy, no alcanza con esperar, hay que volver a deployar.
 */
const VARIABLES = [
  { nombre: "NEXT_PUBLIC_SITE_URL", deUnaVez: true },
  { nombre: "MP_ACCESS_TOKEN", deUnaVez: false },
  { nombre: "MP_WEBHOOK_SECRET", deUnaVez: false },
  { nombre: "RESEND_API_KEY", deUnaVez: false },
  { nombre: "AIRTABLE_TOKEN", deUnaVez: false },
  { nombre: "AIRTABLE_BASE_ID", deUnaVez: false },
  // Para cotizar envíos con Envia. Sin él se cobra la tarifa plana.
  { nombre: "ENVIA_TOKEN", deUnaVez: false },
] as const;

/** Smoke test del deploy: muestra qué integraciones están conectadas. */
export async function GET() {
  const sitio = urlDelSitio();

  // Un PING real más un ciclo completo del cerrojo (tomar, ver ocupado,
  // soltar): distingue "faltan las variables", "están pero no sirven" y
  // "contesta pero el cerrojo no se comporta como se espera".
  const redis = await verificarRedis();

  // Las cuotas sin interés se anuncian solo si Mercado Pago las confirma:
  // acá se ve qué contesta para el anteojo más barato publicado.
  const anteojos = (await getProductos("Anteojos").catch(() => [])).map((p) => p.precio).filter((p) => p > 0);
  const cuotas = anteojos.length ? await diagnosticarCuotas(Math.min(...anteojos)) : { anunciadas: null };
  // La portada las verifica con lo más barato publicado de todo el catálogo.
  const todo = (await getProductos().catch(() => [])).map((p) => p.precio).filter((p) => p > 0);
  const cuotasPortada = todo.length ? await diagnosticarCuotas(Math.min(...todo)) : { anunciadas: null };
  // Las opiniones de Mercado Libre de la portada: si está configurado y qué
  // le pasó a la portada la última vez que preguntó (guardado en Redis).
  // Consultar a Mercado Libre desde acá sería otro consumidor del token (ver
  // lib/ml-resenas-servidor.ts).
  const mercadoLibre = { configurado: mlConfigurado(), ultimoIntento: await leerIntentoML() };
  // Envia: si hay token y si Config tiene lo que hace falta para cotizar.
  // Sin consultar a Envia: eso lo hace el checkout.
  const config = await getConfig();
  const envia = {
    configurado: enviaConfigurado(),
    entorno: entornoEnvia(),
    origenCompleto: config.envioOrigen !== null,
    transportistas: config.envioTransportistas,
    pesoMinimoKg: config.envioPesoMinimoKg,
  };

  const variables: Record<string, boolean> = {};
  for (const v of VARIABLES) {
    variables[v.nombre] = Boolean(process.env[v.nombre]?.trim());
  }

  // Un valor con espacios o saltos de línea al final entra en Vercel sin
  // aviso y después la firma del webhook no valida nunca. Es invisible salvo
  // que se lo busque a propósito.
  const conBasura = VARIABLES.map((v) => v.nombre).filter((nombre) => {
    const valor = process.env[nombre];
    return Boolean(valor) && valor !== valor!.trim();
  });

  return NextResponse.json({
    ok: true,
    servicio: "harper-web",
    sitio,
    // Con qué commit se armó este deploy: sirve para saber si el redeploy
    // realmente corrió.
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    // De dónde sale el catálogo: "airtable" en cualquier deploy; "fixtures"
    // solo en una máquina local con HARPER_FIXTURES=1.
    catalogo: modoFixtures() ? "fixtures" : "airtable",
    integraciones: {
      airtable: isAirtableConfigured(),
      // Exige el token Y el secreto del webhook: con uno solo se cobra la
      // plata y ningún pedido llega a confirmarse.
      mercadopago: mercadoPagoListo(),
      resend: mailsConfigurados(),
      blob: blobConfigurado(),
      // El píxel del navegador y la Conversions API del servidor, por separado:
      // con el píxel solo, las compras que no vuelven a /gracias se pierden.
      metaPixel: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      metaCapi: metaCapiConfigurada(),
      // El cerrojo del webhook (Upstash Redis): verdadero solo si Redis contesta
      // Y el ciclo tomar/ocupado/soltar funcionó. Sin él, el webhook NO confirma
      // pagos: contesta 503 y Mercado Pago reintenta.
      redis: redis.responde && redis.cerrojo,
      // El buscador de direcciones del checkout (Google Places, clave solo en
      // el servidor). Sin él la dirección se carga a mano: se vende igual.
      googlePlaces: configuracionDirecciones() !== null,
      // Cotización de envíos (token, origen y transportistas). Sin eso, tarifa plana.
      envia: envia.configurado && envia.origenCompleto && envia.transportistas.length > 0,
    },
    redis,
    cuotas,
    cuotasPortada,
    mercadoLibre,
    envia,
    variables,
    avisos: [
      !redis.configurado
        ? "FALTA Upstash Redis (KV_REST_API_URL/KV_REST_API_TOKEN): el webhook contesta 503 y NO confirma ningún pago hasta conectarlo (Vercel > Storage > Upstash, plan Free)"
        : !redis.responde
          ? `Redis está configurado pero no contesta (${redis.detalle}): el webhook contesta 500 y Mercado Pago reintenta`
          : !redis.cerrojo
            ? `Redis contesta pero el cerrojo no funciona como se espera (${redis.detalle}): el webhook contesta 500 y Mercado Pago reintenta`
            : null,
      variables.MP_ACCESS_TOKEN ? null : "Falta MP_ACCESS_TOKEN",
      variables.MP_WEBHOOK_SECRET
        ? null
        : "Falta MP_WEBHOOK_SECRET: sin esto se cobra pero ningún pedido se confirma",
      esUrlPublica(sitio) ? null : `El sitio no es una URL pública: ${sitio}`,
      variables.RESEND_API_KEY ? null : "Falta RESEND_API_KEY: no sale ningún mail",
      configuracionDirecciones()
        ? null
        : "Sin GOOGLE_PLACES_API_KEY el checkout pide la dirección con los campos manuales (se vende igual)",
      envia.configurado && !envia.origenCompleto
        ? "Envia: falta el origen en Config (envio_origen_nombre, telefono, calle, numero, ciudad, provincia —una de las 24, con el nombre del checkout— y cp): se cobra la tarifa plana"
        : null,
      envia.configurado && envia.transportistas.length === 0
        ? "Envia: falta envio_transportistas en Config: se cobra la tarifa plana"
        : null,
      conBasura.length > 0
        ? `Con espacios o saltos de línea al final: ${conBasura.join(", ")}`
        : null,
    ].filter(Boolean),
  });
}
