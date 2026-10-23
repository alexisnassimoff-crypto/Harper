import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
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

/**
 * Topes de uso, de menor a mayor. Un comprador real hace unas diez consultas
 * por compra; un bucle, miles. Los totales están por debajo de lo que vale la
 * pena pagar: pasado el tope, el checkout pide la dirección a mano y la venta
 * sigue.
 */
const MINUTO = 60_000;
const DIA = 86_400_000;
/** Por IP (o prefijo /64 en IPv6) por minuto. Pasado: 429, el comprador espera. */
const LIMITE_POR_IP_MINUTO = 60;
/** Entre todos, por minuto. Pasado: 503, campos manuales. */
const LIMITE_TOTAL_MINUTO = 600;
/** Entre todos, por día (UTC). Pasado: 503, campos manuales hasta mañana. */
const LIMITE_TOTAL_DIA = 2_500;

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
 *
 * Solo atiende al propio sitio: una página ajena no puede hacer que los
 * navegadores de sus visitantes gasten consultas pagas acá (`Sec-Fetch-Site`
 * lo pone el navegador y no se puede falsificar desde una página).
 */
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }

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

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([
    { clave: `ip:${ip}`, ventanaMs: MINUTO, limite: LIMITE_POR_IP_MINUTO },
    { clave: "total", ventanaMs: MINUTO, limite: LIMITE_TOTAL_MINUTO },
    { clave: "dia", ventanaMs: DIA, limite: LIMITE_TOTAL_DIA },
  ]);

  if (cuota.excedida?.startsWith("ip:")) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas seguidas. Esperá un momento." },
      { status: 429, headers: { ...sinCache, "Retry-After": "60" } }
    );
  }
  if (cuota.excedida) {
    // El tope de toda la tienda: se avisa una vez por minuto en el log y el
    // checkout sigue con los campos manuales.
    if (cuota.cuentas.some((c) => c === LIMITE_TOTAL_MINUTO + 1 || c === LIMITE_TOTAL_DIA + 1)) {
      console.error(`[direcciones] tope ${cuota.excedida} alcanzado: el checkout pide la dirección a mano`);
    }
    return NextResponse.json({ disponible: false }, { status: 503, headers: sinCache });
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
