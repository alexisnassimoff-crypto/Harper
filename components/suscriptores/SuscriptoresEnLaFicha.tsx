import type { CuotasVerificadas } from "@/lib/cuotas";

/**
 * La caja de Suscriptores Harper de la ficha (Ale, 03/11/2026): mostraba los
 * beneficios de la suscripción (el cupón de bienvenida, el envío gratis
 * siempre, el saldo de vuelta y las cuotas propias) y abría el formulario.
 *
 * Ale, 18/11/2026: esos beneficios terminaron para todos, así que la caja no
 * muestra nada: en la ficha no queda ninguna promesa de la suscripción. La
 * cuenta y las novedades se ofrecen en la portada y en /suscriptores. El
 * archivo queda (con la propiedad `cuotas`, que ya no se lee) hasta que la
 * ficha deje de nombrarlo; después se borra.
 */
export default function SuscriptoresEnLaFicha(_props: { cuotas?: CuotasVerificadas | null }) {
  return null;
}
