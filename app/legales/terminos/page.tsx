import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import Link from "next/link";
import { versionTerminosLegible } from "@/lib/legales";
import { precio as formatearPrecio } from "@/lib/formato";
import { CASHBACK_PORCENTAJE, CUOTAS_SON_BENEFICIO, CUOTAS_SUSCRIPTORES, CUPON_BIENVENIDA, DIAS_PARA_USAR_CASHBACK } from "@/lib/suscriptores";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  alternates: { canonical: "/legales/terminos" },
};

export default async function Terminos() {
  const config = await getConfig();

  return (
    <>
      <h1 className="titulo">Términos y condiciones</h1>

      <p className="apagado">Versión vigente: {versionTerminosLegible()}.</p>

      <p className="apagado">
        Estos términos regulan la compra de productos en harper.ar, operado por{" "}
        {config.razonSocial}, CUIT {config.cuit}
        {config.domicilio ? <>, con domicilio en {config.domicilio}</> : null}. Correo de
        contacto: <a href={`mailto:${config.emailContacto}`}>{config.emailContacto}</a>.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Productos y precios</h2>
      <p>
        Los precios están expresados en pesos argentinos e incluyen IVA. Los
        precios y la disponibilidad pueden modificarse sin previo aviso; el
        precio aplicable es el vigente al momento de confirmar la compra. Las
        fotografías son ilustrativas y pueden presentar variaciones de color
        según la pantalla desde la que se las vea.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Compra y pago</h2>
      <p>
        Los pagos se procesan a través de Mercado Pago. No almacenamos datos de
        tarjetas: esa información es gestionada íntegramente por la plataforma de
        pago. La compra se considera confirmada cuando Mercado Pago acredita el
        pago, momento en el que enviamos un correo de confirmación.
      </p>
      <p>
        Si se elige pagar con Dinero en Mercado Pago, es decir, exclusivamente
        con el saldo de la cuenta de Mercado Pago, se aplica un 10% de descuento
        adicional sobre el precio de los productos. Ese 10% se calcula sobre el
        importe con la promoción, el cupón y el saldo de suscriptor que
        correspondan ya aplicados, y no se aplica al costo de envío.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Envíos</h2>
      <p>
        Realizamos envíos a domicilio dentro de la República Argentina. El
        pedido se despacha una vez acreditado el pago; el plazo de entrega
        depende del operador logístico y puede variar por demoras ajenas a
        nuestra gestión. El costo de envío se informa antes de finalizar la
        compra. Es responsabilidad del comprador aportar una dirección de
        entrega correcta y completa.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Disponibilidad</h2>
      <p>
        Si un producto no estuviera disponible luego de confirmada la compra, nos
        comunicaremos para ofrecer un reemplazo o reintegrar el importe abonado.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Garantía</h2>
      <p>
        Los productos cuentan con la garantía legal prevista en la Ley 24.240 de
        Defensa del Consumidor por defectos de fabricación. La garantía no cubre
        daños derivados del uso indebido, golpes, caídas o desgaste natural.
      </p>

      <h2 id="suscriptores" style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>
        Suscriptores Harper
      </h2>
      <p>
        Suscriptores Harper es un programa gratuito de beneficios para quien se
        suscribe con su mail y acepta recibir nuestros correos. El detalle está
        en las{" "}
        <Link href="/legales/suscriptores" style={{ textDecoration: "underline" }}>
          Condiciones de Suscriptores Harper
        </Link>
        , que forman parte de estos términos. En resumen: un cupón de
        bienvenida de {formatearPrecio(CUPON_BIENVENIDA)} en la primera compra,
        el {CASHBACK_PORCENTAJE}% de lo pagado en productos como saldo a favor
        (se puede usar desde los {DIAS_PARA_USAR_CASHBACK} días del pago y no
        vence)
        {CUOTAS_SON_BENEFICIO
          ? `, envío sin cargo en todas las compras y hasta ${CUOTAS_SUSCRIPTORES} cuotas sin interés cuando Mercado Pago las ofrece.`
          : " y envío sin cargo en todas las compras."}{" "}
        La baja se pide en cualquier momento, sin costo.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Contacto</h2>
      <p>
        Cualquier consulta puede dirigirse a{" "}
        <a href={`mailto:${config.emailContacto}`} style={{ textDecoration: "underline" }}>
          {config.emailContacto}
        </a>
        .
      </p>
    </>
  );
}
