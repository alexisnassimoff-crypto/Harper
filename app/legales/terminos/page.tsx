import type { Metadata } from "next";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default async function Terminos() {
  const config = await getConfig();

  return (
    <>
      <h1 className="titulo">Términos y condiciones</h1>

      <p className="apagado">
        Estos términos regulan la compra de productos en harper.ar, operado por{" "}
        {config.razonSocial}, CUIT {config.cuit}.
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

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Envíos</h2>
      <p>
        Realizamos envíos a todo el territorio argentino. El plazo
        estimado de entrega es de {config.plazoEntrega} desde la acreditación del
        pago, y puede variar por demoras del correo ajenas a nuestra gestión. El costo de
        envío se informa antes de finalizar la compra. Es responsabilidad del
        comprador aportar una dirección de entrega correcta y completa.
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
