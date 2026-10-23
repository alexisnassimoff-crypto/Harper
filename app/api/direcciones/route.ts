import { NextResponse } from "next/server";
import { contarEnVentana } from "@/lib/cuota";
import {
  detallarDireccion,
  ErrorDirecciones,
  faltantes,
  MINIMO_CARACTERES,
  placeIdValido,
  sesionValida,
  sugerirDirecciones,
} from "@/lib/direcciones";
import { proveedorDirecciones } from "@/lib/direcciones-servidor";

export const dynamic = "force-dynamic";

/** Búsquedas por IP por minuto. Un comprador real hace diez; un bucle, miles. */
const LIMITE_POR_MINUTO = 60;

const sinCache = { "Cache-Control": "private, no-store" };

/**
 * El buscador de direcciones del checkout, por delante de Google Places.
 *
 *   GET /api/direcciones?q=cabildo%2012&sesion=<uuid>   → { sugerencias }
 *   GET /api/direcciones?id=<placeId>&sesion=<uuid>     → { direccion, faltan }
 *
 * La clave de Google no sale de acá. Cuando Google no está configurado o
 * contesta un error definitivo (clave mal, API sin habilitar, cuota agotada)
 * devuelve 503 con `disponible: false` y el formulario cae a los campos de
 * siempre: la dirección se puede cargar igual y la venta no se pierde.
 */
export async function GET(request: Request) {
  const proveedor = proveedorDirecciones();
  if (!proveedor) {
    return NextResponse.json({ disponible: false }, { status: 503, headers: sinCache });
  }

  const url = new URL(request.url);
  const sesion = url.searchParams.get("sesion");
  const q = url.searchParams.get("q");
  const id = url.searchParams.get("id");

  if (!sesionValida(sesion)) {
    return NextResponse.json({ error: "Falta la sesión de búsqueda" }, { status: 400, headers: sinCache });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "sin-ip";
  const vistas = await contarEnVentana(`harper:direcciones:${ip}`, 60_000);
  if (vistas > LIMITE_POR_MINUTO) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas seguidas. Esperá un momento." },
      { status: 429, headers: { ...sinCache, "Retry-After": "60" } }
    );
  }

  try {
    if (id !== null) {
      if (!placeIdValido(id)) {
        return NextResponse.json({ error: "Dirección inválida" }, { status: 400, headers: sinCache });
      }
      const direccion = await detallarDireccion(id, sesion, proveedor.config, proveedor.fetchImpl);
      return NextResponse.json({ direccion, faltan: faltantes(direccion) }, { headers: sinCache });
    }

    const texto = (q ?? "").trim();
    if (texto.length < MINIMO_CARACTERES) {
      return NextResponse.json({ sugerencias: [] }, { headers: sinCache });
    }

    const sugerencias = await sugerirDirecciones(texto, sesion, proveedor.config, proveedor.fetchImpl);
    return NextResponse.json({ sugerencias }, { headers: sinCache });
  } catch (error) {
    if (error instanceof ErrorDirecciones && error.permanente) {
      // Clave mal, API sin habilitar o cuota agotada: con reintentar no se
      // arregla. Queda en el log de Vercel y el checkout pide la dirección a mano.
      console.error("[direcciones] Google no disponible:", error.message);
      return NextResponse.json({ disponible: false }, { status: 503, headers: sinCache });
    }

    console.error("[direcciones]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "No pudimos buscar la dirección. Probá de nuevo." },
      { status: 502, headers: sinCache }
    );
  }
}
