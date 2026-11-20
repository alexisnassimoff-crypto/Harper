import { NextResponse } from "next/server";
import { saldoDe } from "@/lib/suscriptores";
import { cuponVigente, estaActivo, movimientosDe, suscriptorDeLaPeticion } from "@/lib/suscriptores-cuenta";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };

/**
 * ¿Quién está en este navegador? (Ale, 03/11/2026). Las páginas con cache (la
 * portada, la ficha, /suscriptores) son iguales para todos: con esto, la caja
 * de suscripción le dice a quien ya entró a su cuenta que ya está, en vez de
 * invitarlo, el encabezado sabe si hay sesión y cada corazón sabe si está
 * lleno.
 *
 *   GET /api/suscriptores/sesion
 *     → 200 { suscriptor: { email, nombre, cupon, saldoDisponible, activo, favoritos } | null }
 *
 * `favoritos` son los SKU guardados con el corazón (lib/favoritos.ts).
 * `activo` es falso si se dio de baja de los mails de novedades.
 *
 * Ale, 18/11/2026: los beneficios en plata de la suscripción terminaron. La
 * respuesta conserva su forma para lo que ya la lee, pero:
 *  - `cupon` es siempre "Usado": sale de `cuponVigente`
 *    (lib/suscriptores-cuenta.ts), que contesta que no mientras
 *    BENEFICIOS_DE_SUSCRIPTOR (lib/suscriptores.ts) sea falso, aunque la fila
 *    diga «Disponible». Nunca anuncia un cupón que el carrito no aplica.
 *  - `saldoDisponible` es el saldo de verdad de la tabla Saldos (el de antes
 *    de ese día, si lo hubiera; no se genera más). Ninguna página lo muestra
 *    ya con este dato: Mi cuenta lo lee por su lado, y solo si existe.
 *
 * Solo lee la cookie de este navegador (httpOnly, firmada): nunca dice nada
 * de otro mail. Sin cookie no toca Airtable. Si Airtable falla, null: la
 * página sigue igual, con la invitación.
 */
export async function GET(request: Request) {
  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return NextResponse.json({ suscriptor: null }, { headers: sinCache });
  const [saldoDisponible, vigente] = await Promise.all([
    movimientosDe(cuenta.id)
      .then((m) => saldoDe(m, new Date()).disponible)
      .catch(() => 0),
    cuponVigente(cuenta).catch(() => false),
  ]);
  return NextResponse.json(
    {
      suscriptor: {
        email: cuenta.email,
        nombre: cuenta.nombre,
        cupon: vigente ? "Disponible" : "Usado",
        saldoDisponible,
        activo: estaActivo(cuenta),
        favoritos: cuenta.favoritos,
      },
    },
    { headers: sinCache }
  );
}
