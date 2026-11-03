import { NextResponse } from "next/server";
import { saldoDe } from "@/lib/suscriptores";
import { movimientosDe, suscriptorDeLaPeticion, tieneCupon } from "@/lib/suscriptores-cuenta";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };

/**
 * ¿Quién está en este navegador? (Ale, 03/11/2026). Las páginas con cache (la
 * portada, la ficha, /suscriptores) son iguales para todos: con esto, la caja
 * de suscripción le dice a un suscriptor que ya lo es, en vez de invitarlo.
 *
 *   GET /api/suscriptores/sesion
 *     → 200 { suscriptor: { email, nombre, cupon, saldoDisponible } | null }
 *
 * Solo lee la cookie de este navegador (httpOnly, firmada): nunca dice nada
 * de otro mail. Sin cookie no toca Airtable. Si Airtable falla, null: la
 * página sigue igual, con la invitación.
 */
export async function GET(request: Request) {
  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return NextResponse.json({ suscriptor: null }, { headers: sinCache });
  const saldoDisponible = await movimientosDe(cuenta.id)
    .then((m) => saldoDe(m, new Date()).disponible)
    .catch(() => 0);
  return NextResponse.json(
    {
      suscriptor: {
        email: cuenta.email,
        nombre: cuenta.nombre,
        cupon: tieneCupon(cuenta) ? "Disponible" : "Usado",
        saldoDisponible,
      },
    },
    { headers: sinCache }
  );
}
