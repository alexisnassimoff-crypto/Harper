import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO } from "@/lib/confianza";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { precio as formatearPrecio } from "@/lib/formato";
import { VERSION_CONDICIONES_SUSCRIPTORES, versionTerminosLegible } from "@/lib/legales";
import {
  CASHBACK_PORCENTAJE,
  CUOTAS_SUSCRIPTORES,
  CUOTAS_TODOS,
  CUPON_BIENVENIDA,
  DIAS_PARA_USAR_CASHBACK,
} from "@/lib/suscriptores";
import { DURACION_SESION_MS } from "@/lib/suscriptores-sesion";

/**
 * Las condiciones de Suscriptores Harper (Ale, 03/11/2026): gratis, con el
 * mail; el cupón de bienvenida de $ 10.000 en la primera compra, el 10% de
 * cashback como saldo (se usa a los 30 días y no vence), envío gratis
 * siempre y 6 cuotas sin interés. Los montos y plazos salen de
 * lib/suscriptores.ts, los mismos con los que cobra el servidor. Cada alta
 * guarda la versión que aceptó (lib/legales.ts): si cambian estas
 * condiciones, se cambia esa fecha en el mismo commit.
 */

export const metadata: Metadata = {
  title: "Condiciones de Suscriptores Harper",
  alternates: { canonical: "/legales/suscriptores" },
};

const h2 = { fontSize: "1.25rem", marginTop: "1.5rem" } as const;
const lista = { margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "0.5rem" } as const;
const subrayado = { textDecoration: "underline" } as const;

export default async function CondicionesSuscriptores() {
  const config = await getConfig();
  const cupon = formatearPrecio(CUPON_BIENVENIDA);
  const diasSesion = Math.round(DURACION_SESION_MS / (24 * 60 * 60_000));
  const correo = (
    <a href={`mailto:${config.emailContacto}`} style={subrayado}>
      {config.emailContacto}
    </a>
  );

  return (
    <>
      <h1 className="titulo">Condiciones de Suscriptores Harper</h1>
      <p className="apagado">
        Versión vigente: {versionTerminosLegible(VERSION_CONDICIONES_SUSCRIPTORES)}. Forman parte de los{" "}
        <Link href="/legales/terminos" style={subrayado}>
          Términos y condiciones
        </Link>{" "}
        de harper.ar.
      </p>

      <h2 style={h2}>1. Qué es</h2>
      <p>
        Suscriptores Harper es el programa de beneficios de harper.ar, a cargo de {config.razonSocial}, CUIT {config.cuit}. Es gratis: no hay
        que pagar nada ni comprar nada para suscribirse.
      </p>

      <h2 style={h2}>2. Quién puede suscribirse</h2>
      <p>
        Cualquier persona mayor de edad, o con autorización de su representante legal, con un mail propio. La suscripción es personal: una por
        mail.
      </p>

      <h2 style={h2}>3. Cómo suscribirse</h2>
      <p>
        Escribís tu mail en harper.ar, confirmás con el código de 6 números que te mandamos y aceptás recibir nuestros mails. Sin ese
        consentimiento no hay suscripción. El nombre es opcional.
      </p>

      <h2 style={h2}>4. Los beneficios</h2>
      <ul style={lista}>
        <li>
          <strong>Cupón de bienvenida de {cupon}.</strong> Es un descuento fijo de {cupon} en tu primera compra en harper.ar, sobre el precio de
          los productos (no sobre el envío). Se usa una sola vez. Es una sola vez por persona: no se aplica si ya hay una compra con pago
          acreditado hecha con ese mail o con ese DNI. No se cambia por dinero.
        </li>
        <li>
          <strong>{CASHBACK_PORCENTAJE}% de vuelta como saldo.</strong> De lo que pagás en productos (sin el envío, y después del cupón y del
          saldo que uses) te devolvemos el {CASHBACK_PORCENTAJE}% como saldo a favor para tus próximas compras en harper.ar. Se anota cuando se
          acredita el pago y lo podés usar desde los {DIAS_PARA_USAR_CASHBACK} días del pago, cuando termina el plazo para devolver la compra.
          El saldo no vence, puede cubrir una compra entera y en el checkout elegís si lo usás. No se cambia por dinero ni se transfiere a otra
          persona.
        </li>
        <li>
          <strong>Envío gratis siempre.</strong> En todas las compras que hagas como suscriptor, a cualquier dirección de la República
          Argentina a la que hagamos envíos, sin monto mínimo.
        </li>
        <li>
          <strong>Cuotas sin interés.</strong> Para cualquier comprador ofrecemos hasta {CUOTAS_TODOS} cuotas, y para suscriptores hasta{" "}
          {CUOTAS_SUSCRIPTORES}, con las tarjetas y los bancos que Mercado Pago tenga sin interés para ese monto. Las anunciamos solo cuando
          Mercado Pago las confirma, con el costo financiero total (CFTEA) al lado, y las ves antes de pagar.
        </li>
      </ul>

      <h2 style={h2}>5. Cómo se aplican</h2>
      <p>
        Para tener los beneficios, entrá con tu mail en harper.ar antes de comprar (te mandamos un código para confirmar que sos vos). Quedás
        reconocido en ese navegador por {diasSesion} días y los beneficios se aplican solos en el carrito. Se suman a las promociones vigentes:
        primero va la promoción, después el cupón y después el saldo. El {PORCENTAJE_DINERO_MP}% por pagar con dinero en Mercado Pago se
        calcula sobre lo que queda.
      </p>

      <h2 style={h2}>6. Si cancelás o devolvés una compra</h2>
      <p>
        Si ejercés el derecho de arrepentimiento ({DIAS_ARREPENTIMIENTO} días) o devolvés una compra, el cashback de esa compra se anula, aunque
        ya figure en tu cuenta. Por eso el cashback se puede usar recién a los {DIAS_PARA_USAR_CASHBACK} días del pago. El cupón de bienvenida
        ya usado no se repone. Lo que hayas pagado con saldo en esa compra vuelve a tu saldo.
      </p>

      <h2 style={h2}>7. Baja</h2>
      <p>
        Te podés dar de baja cuando quieras, sin costo: con el enlace que va al pie de cada mail o desde{" "}
        <Link href="/suscriptores/mi-cuenta" style={subrayado}>
          mi cuenta
        </Link>
        . Desde ese momento dejás de recibir nuestros mails y de tener los beneficios. Tu saldo queda guardado: si volvés a suscribirte con el
        mismo mail, lo recuperás.
      </p>

      <h2 style={h2}>8. Tus datos</h2>
      <p>
        {config.razonSocial} es responsable de los datos de la suscripción, conforme a la Ley 25.326 de Protección de los Datos Personales.
        Guardamos tu mail, tu nombre si lo diste, la fecha y desde dónde te suscribiste, tu consentimiento y los movimientos de tu saldo. Los
        usamos para reconocerte en harper.ar, aplicar tus beneficios, llevar tu saldo y mandarte mails con novedades, lanzamientos y
        promociones de Harper. No los vendemos ni los cedemos a terceros con fines comerciales; solo los procesan los proveedores que nos
        prestan los servicios de almacenamiento y de envío de mails, para esos fines.
      </p>
      <p>
        Podés acceder a tus datos, pedir que los corrijamos o que los borremos, y pedir que te saquemos de nuestra base de mails (art. 27 de la
        Ley 25.326) escribiéndonos a {correo}. El acceso es gratuito a intervalos no menores de seis meses, salvo que acredites un interés
        legítimo (art. 14, inc. 3). La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y
        reclamos por incumplimiento de las normas de protección de datos personales. Más detalle en la{" "}
        <Link href="/legales/privacidad" style={subrayado}>
          Política de privacidad
        </Link>
        .
      </p>

      <h2 style={h2}>9. Cambios</h2>
      <p>
        Si cambiamos estas condiciones, la versión nueva y su fecha se publican en esta página, y si te afecta te avisamos por mail antes de
        que rija. El saldo que ya tengas se respeta.
      </p>

      <h2 style={h2}>10. Contacto</h2>
      <p>Cualquier consulta, escribinos a {correo}.</p>
    </>
  );
}
