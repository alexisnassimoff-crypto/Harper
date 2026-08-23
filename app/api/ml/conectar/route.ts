import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado, urlDeAutorizacion } from "@/lib/ml-auth";

export const dynamic = "force-dynamic";

/**
 * Inicia la conexión de la cuenta de Mercado Libre.
 *
 * Redirige al login de ML para autorizar la aplicación; ML vuelve a
 * /api/ml/callback con el código que se canjea por los tokens.
 */
export function GET(request: Request) {
  const url = new URL(request.url);

  if (!tokenValido(url.searchParams.get("token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!mlConfigurado()) {
    return NextResponse.json(
      {
        error: "Faltan ML_APP_ID y ML_APP_SECRET",
        ayuda:
          "Creá la aplicación en developers.mercadolibre.com.ar, cargá las dos variables en Vercel y redeployá.",
      },
      { status: 503 }
    );
  }

  const redirectUri = `${url.origin}/api/ml/callback`;

  return NextResponse.redirect(urlDeAutorizacion(redirectUri));
}
