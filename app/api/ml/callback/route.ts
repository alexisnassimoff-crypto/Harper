import { NextResponse } from "next/server";
import { canjearCodigo } from "@/lib/ml-auth";

export const dynamic = "force-dynamic";

/**
 * Vuelta del login de Mercado Libre.
 *
 * ML redirige acá con ?code=...; se canjea por los tokens y quedan
 * guardados en Airtable. El code de ML es de un solo uso y vence al
 * minuto, así que esta ruta no necesita el SYNC_TOKEN: sin un code
 * recién emitido por ML no hace nada.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");

  if (!codigo) {
    return NextResponse.json(
      { error: "Falta el código de autorización de Mercado Libre" },
      { status: 400 }
    );
  }

  try {
    const accessToken = await canjearCodigo(codigo, `${url.origin}/api/ml/callback`);

    // Se verifica contra /users/me que el token realmente funciona.
    const yo = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }).then((r) => (r.ok ? r.json() : null));

    return NextResponse.json({
      ok: true,
      conectado: yo?.nickname ?? "cuenta de Mercado Libre",
      siguiente:
        "Listo. Ahora abrí /api/importar-ml?token=<SYNC_TOKEN> para traer las publicaciones.",
    });
  } catch (error) {
    console.error("[ml/callback] falló el canje:", error);

    return NextResponse.json(
      { error: (error as Error).message },
      { status: 502 }
    );
  }
}
