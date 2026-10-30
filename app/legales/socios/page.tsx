import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { versionTerminosLegible } from "@/lib/legales";
import { MESES_SOCIO, planesDeSocio } from "@/lib/socios";

/**
 * Las condiciones de Socios Harper (Ale, 30/10/2026: 12 meses, no se renueva
 * sola, precio congelado en los pares extra, sin el 10% de dinero en Mercado
 * Pago). Forman parte de los Términos y condiciones: el checkout guarda la
 * misma versión (lib/legales.ts). Los precios y los lugares salen de Airtable.
 */

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Condiciones de Socios Harper",
  alternates: { canonical: "/legales/socios" },
};

const h2 = { fontSize: "1.25rem", marginTop: "1.5rem" } as const;

export default async function CondicionesSocios() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);
  const planes = planesDeSocio(productos, config.sociosCupos);
  if (!planes) notFound();

  const contacto = (
    <>
      por WhatsApp{config.whatsapp ? <> (+{config.whatsapp})</> : null} o por correo a{" "}
      <a href={`mailto:${config.emailContacto}`}>{config.emailContacto}</a>
    </>
  );

  return (
    <>
      <h1 className="titulo">Condiciones de Socios Harper</h1>
      <p className="apagado">
        Versión vigente: {versionTerminosLegible()}. Forman parte de los <Link href="/legales/terminos">Términos y condiciones</Link> de
        harper.ar.
      </p>

      <h2 style={h2}>1. Qué es</h2>
      <p>
        Socios Harper es una membresía de doce ({MESES_SOCIO}) meses que ofrece {config.razonSocial}, CUIT {config.cuit}, en harper.ar. Se
        contrata en el sitio y se paga una sola vez.
      </p>

      <h2 style={h2}>2. Planes y precio</h2>
      <p>
        Hay dos planes: Socio ({planes.socio.precioTexto}){planes.aumento ? <> y Socio con aumento ({planes.aumento.totalTexto})</> : null}.
        Los precios están en pesos argentinos, incluyen IVA y son los publicados en harper.ar al momento de contratar. El descuento por pagar
        con Dinero en Mercado Pago no se aplica a la membresía.
      </p>

      <h2 style={h2}>3. Lugares</h2>
      <p>
        Los lugares son limitados ({planes.cupos} en esta temporada) y se numeran en el orden en que Mercado Pago acredita los pagos. Cuando
        se ocupan todos, no se pueden contratar nuevas membresías hasta que se abra otra temporada.
      </p>

      <h2 style={h2}>4. Vigencia</h2>
      <p>
        La membresía empieza el día en que Mercado Pago acredita el pago y dura doce ({MESES_SOCIO}) meses. No se renueva sola ni genera
        cobros posteriores. Es personal e intransferible: los beneficios son para quien la contrató, identificado con su número de socio y
        el correo con el que la pagó.
      </p>

      <h2 style={h2}>5. Beneficios del plan Socio</h2>
      <ol>
        <li>
          <strong>Dos pares de anteojos.</strong> El primero se elige al contratar y se envía con ese pedido. El segundo se canjea durante
          la vigencia en <Link href="/socios/mi-cuenta">harper.ar/socios/mi-cuenta</Link>, entrando con el correo de la membresía y el
          código que se le envía, o se pide {contacto}, con el número de socio. Puede ser de cualquier línea disponible en harper.ar; si su
          precio es mayor que el de un anteojo fotocromático, el socio paga la diferencia.
        </li>
        <li>
          <strong>Envío gratis</strong> en todos los pedidos del socio durante la vigencia, a domicilio dentro de la República Argentina. En
          harper.ar se aplica al comprar con la sesión de socio iniciada.
        </li>
        <li>
          <strong>Una reposición</strong> durante la vigencia: un par igual a uno de los recibidos con la membresía, por rotura o pérdida.
          Se pide {contacto}, con el número de socio. Está sujeta a stock; si no lo hubiera, se ofrece un modelo equivalente.
        </li>
        <li>
          <strong>Precio congelado:</strong> los pares extra que el socio compre durante la vigencia se cobran al precio de lista del día
          del alta. Si ese precio aumentara, el socio los pide {contacto}, con el número de socio, y se le cobra el precio congelado.
        </li>
        <li>
          <strong>Antes que nadie:</strong> en cada lanzamiento de productos nuevos durante la vigencia, el socio puede comprar setenta y
          dos (72) horas antes de la venta al público. Harper avisa por correo.
        </li>
      </ol>

      {planes.aumento ? (
        <>
          <h2 style={h2}>6. Lo que suma el plan Socio con aumento</h2>
          <p>
            Además de lo anterior, incluye los cristales oftálmicos orgánicos con filtro de luz azul de los dos pares de la membresía y de
            la reposición, según la receta vigente que envíe el socio, emitida por un profesional de la salud visual. Harper no realiza
            exámenes de la vista. Los cristales los prepara un laboratorio; en general demora 24 horas, plazo que se suma al del envío y
            que se confirma al recibir la receta. Si la receta no pudiera hacerse con cristales orgánicos, Harper lo avisa antes de
            prepararlos y ofrece una alternativa o el reintegro de la diferencia entre los dos planes.
          </p>
        </>
      ) : null}

      <h2 style={h2}>{planes.aumento ? "7" : "6"}. Beneficios que no se usan</h2>
      <p>
        Los beneficios se usan durante la vigencia. Los que no se usen vencen al terminar la membresía y no se reintegran ni se cambian por
        dinero, crédito u otros productos.
      </p>

      <h2 style={h2}>{planes.aumento ? "8" : "7"}. Arrepentimiento y baja</h2>
      <p>
        Como en cualquier compra a distancia, el socio puede arrepentirse dentro de los diez (10) días corridos desde que recibe el primer
        par, con el <Link href="/legales/arrepentimiento">Botón de arrepentimiento</Link>, sin costo. Devuelve lo recibido como lo
        recibió, y puede probarse los anteojos para ver cómo le quedan, como en un local. Harper coordina el retiro sin cargo y le
        reintegra lo pagado. Como la membresía no se renueva sola, no hay cobros futuros que cancelar; pasado ese plazo, el socio puede
        dejar de usarla cuando quiera, sin reintegro.
      </p>

      <h2 style={h2}>{planes.aumento ? "9" : "8"}. Garantía</h2>
      <p>
        Los anteojos de la membresía tienen la misma garantía que cualquier compra en harper.ar, según los{" "}
        <Link href="/legales/terminos">Términos y condiciones</Link>.
      </p>

      <h2 style={h2}>{planes.aumento ? "10" : "9"}. Cambios en estas condiciones</h2>
      <p>
        Harper puede cambiar estas condiciones para las membresías que se contraten después. Cada membresía se rige por las condiciones
        vigentes el día en que se pagó.
      </p>

      <h2 style={h2}>{planes.aumento ? "11" : "10"}. Datos personales</h2>
      <p>
        Los datos del socio se usan para administrar la membresía y sus beneficios, según la{" "}
        <Link href="/legales/privacidad">Política de privacidad</Link>.
      </p>
    </>
  );
}
