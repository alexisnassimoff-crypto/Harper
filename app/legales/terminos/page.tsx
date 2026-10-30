import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { versionTerminosLegible } from "@/lib/legales";

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
        importe con el cupón o la promoción que corresponda ya aplicados, y no
        se aplica al costo de envío ni a la membresía Socios Harper.
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

      <h2 id="socios" style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>
        Socios Harper
      </h2>
      <p>
        Socios Harper es una membresía de doce (12) meses que se paga una sola
        vez. Rige desde el día en que Mercado Pago acredita el pago y no se
        renueva automáticamente. Es personal e intransferible. Incluye:
      </p>
      <ul>
        <li>
          Dos pares de anteojos. El primero se elige al contratar la membresía y
          se envía con ese pedido. El segundo se pide por WhatsApp o por correo,
          con el número de socio, en cualquier momento de los doce meses. Puede
          ser de cualquier línea disponible; si su precio es mayor que el de un
          anteojo fotocromático, se paga la diferencia.
        </li>
        <li>Envío sin cargo en los pedidos del socio durante la vigencia.</li>
        <li>
          Una reposición durante la vigencia: un par igual al recibido, por
          rotura o pérdida, sujeta a stock. Si no hubiera stock, se ofrece un
          modelo equivalente.
        </li>
        <li>
          Precio congelado: los pares adicionales que el socio compre durante la
          vigencia se cobran al precio de lista del día del alta.
        </li>
        <li>Acceso anticipado de 72 horas a los lanzamientos de productos nuevos.</li>
        <li>
          En el plan Socio con aumento, además, los cristales oftálmicos
          orgánicos con filtro de luz azul de los dos pares, según la receta que
          envíe el socio. Los cristales los prepara un laboratorio, en general
          en 24 horas; ese plazo se suma al del envío y se confirma al recibir
          la receta.
        </li>
      </ul>
      <p>
        Los beneficios que no se usen durante la vigencia vencen y no se cambian
        por dinero. Los lugares son limitados y numerados: cuando se completan,
        la inscripción se cierra. El derecho de arrepentimiento de diez (10)
        días corridos se aplica a la membresía como a cualquier compra: si se
        ejerce, se reintegra lo pagado y se devuelve el par recibido, sin uso y
        en su empaque.
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
