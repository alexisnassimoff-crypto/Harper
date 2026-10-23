import { NextResponse } from "next/server";
import { isAirtableConfigured, modoFixtures } from "@/lib/airtable";
import { verificarRedis } from "@/lib/cerrojo";
import { blobConfigurado } from "@/lib/media";
import { mailsConfigurados } from "@/lib/mails";
import { mercadoPagoListo } from "@/lib/mercadopago";
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
] as const;

/** Smoke test del deploy: muestra qué integraciones están conectadas. */
export async function GET() {
  const sitio = urlDelSitio();

  // Un PING real más un ciclo completo del cerrojo (tomar, ver ocupado,
  // soltar): distingue "faltan las variables", "están pero no sirven" y
  // "contesta pero el cerrojo no se comporta como se espera".
  const redis = await verificarRedis();

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
    },
    redis,
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
      conBasura.length > 0
        ? `Con espacios o saltos de línea al final: ${conBasura.join(", ")}`
        : null,
    ].filter(Boolean),
  });
}
