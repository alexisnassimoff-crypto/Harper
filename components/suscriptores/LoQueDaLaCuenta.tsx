import { TEXTOS } from "@/lib/textos";

/**
 * Lo que da la cuenta Harper, en /suscriptores (Ale, 18/11/2026). Va donde
 * estaban los beneficios de la suscripción, que ese día terminaron para todos
 * (el cupón de bienvenida, el saldo de vuelta, el envío gratis siempre y las
 * cuotas propias): quedan las novedades por mail, las compras, los favoritos
 * y los datos con las direcciones. No nombra montos, porcentajes ni cuotas.
 *
 * Las clases se siguen llamando «beneficios-suscriptor» (app/globals.css).
 */
export default function LoQueDaLaCuenta() {
  return (
    <ul className="beneficios-suscriptor">
      {TEXTOS.suscriptores.cuentaDa.map((punto) => (
        <li key={punto.titulo} className="beneficios-suscriptor__item">
          <strong className="beneficios-suscriptor__titulo">{punto.titulo}</strong>
          <span className="beneficios-suscriptor__detalle">{punto.detalle}</span>
        </li>
      ))}
    </ul>
  );
}
