import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import Link from "next/link";
import { NOMBRE_MARCAS } from "@/lib/cuotas";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { duoActivo, PORCENTAJE_DUO } from "@/lib/duo";
import { versionTerminosLegible } from "@/lib/legales";
import { precio as formatearPrecio } from "@/lib/formato";
import { CUOTAS_TODOS } from "@/lib/suscriptores";

/**
 * Los Términos y condiciones de harper.ar. Cada pedido guarda la versión que
 * la persona aceptó en el checkout (lib/legales.ts): si cambia este texto, se
 * cambia VERSION_TERMINOS en el mismo commit.
 *
 * Ale, 18/11/2026: los Términos dicen las condiciones de compra tal como las
 * cobra el servidor, las mismas para todos, con o sin cuenta:
 *
 *  - Cuotas: hasta CUOTAS_TODOS con tarjeta de crédito (el tope de la
 *    preferencia de Mercado Pago); sin interés solo cuando Mercado Pago lo
 *    confirma para ese importe (lib/cuotas.ts). Con dinero en Mercado Pago,
 *    un pago.
 *  - Dinero en Mercado Pago: PORCENTAJE_DINERO_MP sobre los productos, después
 *    de los descuentos vigentes y nunca sobre el envío (lib/dinero-mp.ts).
 *  - Envío gratis: los dos mínimos de Config, leídos acá en el servidor (el de
 *    AMBA vale 0 si la tienda no puede cotizar, lib/config.ts), contados con
 *    los anteojos a precio de lista (lib/pedidos.ts, `baseEnvioGratis`).
 *  - Dúo: su cláusula se arma SOLO si el servidor lo tiene prendido
 *    (HARPER_DUO_ACTIVO, `duoActivo()` de lib/duo.ts). Apagado, la página no
 *    lo nombra en ningún lado. No dice qué se reintegra si se devuelve un
 *    anteojo de un Dúo: Ale todavía no lo decidió.
 *
 * La sección «Suscriptores Harper» (cupón, saldo, envío sin cargo y cuotas
 * propias, que terminaron ese día) pasó a ser la de la cuenta y las
 * novedades, con el enlace a sus condiciones. Conserva el ancla #suscriptores
 * por los enlaces viejos.
 */

export const metadata: Metadata = {
  title: "Términos y condiciones",
  alternates: { canonical: "/legales/terminos" },
};

const h2 = { fontSize: "1.25rem", marginTop: "1.5rem" } as const;
const subrayado = { textDecoration: "underline" } as const;

export default async function Terminos() {
  const config = await getConfig();

  // El Dúo, solo si el servidor lo cobra: null no arma su cláusula.
  const duo = duoActivo() ? PORCENTAJE_DUO : null;

  // Los mínimos del envío gratis, como los mide el servidor (lib/envio-gratis.ts):
  // el de AMBA se nombra solo si existe y es más bajo que el de todo el país.
  const minimoPais = config.envioGratisDesde > 0 ? config.envioGratisDesde : 0;
  const minimoAmba =
    config.envioGratisAmbaDesde > 0 && (minimoPais === 0 || config.envioGratisAmbaDesde < minimoPais) ? config.envioGratisAmbaDesde : 0;

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

      <h2 style={h2}>Productos y precios</h2>
      <p>
        Los precios están expresados en pesos argentinos e incluyen IVA. Los
        precios y la disponibilidad pueden modificarse sin previo aviso; el
        precio aplicable es el vigente al momento de confirmar la compra. Las
        fotografías son ilustrativas y pueden presentar variaciones de color
        según la pantalla desde la que se las vea.
      </p>

      <h2 style={h2}>Compra y pago</h2>
      <p>
        Los pagos se procesan a través de Mercado Pago. No almacenamos datos de
        tarjetas: esa información es gestionada íntegramente por la plataforma de
        pago. La compra se considera confirmada cuando Mercado Pago acredita el
        pago, momento en el que enviamos un correo de confirmación.
      </p>
      <p>
        Con tarjeta de crédito se puede pagar en hasta {CUOTAS_TODOS} cuotas, las
        mismas para todos los compradores. Son sin interés solo cuando Mercado
        Pago lo confirma para el importe de esa compra con {NOMBRE_MARCAS};
        cuando las anunciamos sin interés, van junto con el precio de contado y
        el costo financiero total efectivo anual (CFTEA). Con dinero en Mercado
        Pago el pago es uno solo.
      </p>
      <p>
        Si se elige pagar con dinero en Mercado Pago, es decir, exclusivamente
        con el dinero disponible en la cuenta de Mercado Pago y en un pago, se
        aplica un {PORCENTAJE_DINERO_MP}% de descuento adicional. Ese{" "}
        {PORCENTAJE_DINERO_MP}% se calcula sobre el precio de los productos con
        los descuentos vigentes ya aplicados, y nunca sobre el costo de envío.
      </p>

      {/* El Dúo: solo con HARPER_DUO_ACTIVO=1. Apagado, ni el título. Sin regla de devolución (sin decidir). */}
      {duo !== null ? (
        <>
          <h2 id="duo" style={h2}>
            Dúo
          </h2>
          <p>
            Con el Dúo, quien lleva dos o más anteojos en la misma compra tiene{" "}
            {duo}% de descuento en los de menor precio, uno por cada dos
            anteojos: uno si lleva dos o tres, dos si lleva cuatro o cinco, y así
            sucesivamente.
          </p>
          <p>
            Cuentan todos los anteojos de la tienda, y se pueden combinar modelos
            y colores. Los estuches y los paños no cuentan ni tienen este
            descuento.
          </p>
          <p>
            El descuento se aplica automáticamente en el carrito, sin ningún
            código. El {PORCENTAJE_DINERO_MP}% por pagar con dinero en Mercado
            Pago se suma al Dúo: se calcula sobre lo que queda después de este
            descuento. El mínimo para el envío gratis se cuenta antes del
            descuento, con los anteojos a precio de lista.
          </p>
        </>
      ) : null}

      <h2 id="envios" style={h2}>
        Envíos
      </h2>
      <p>
        Realizamos envíos a domicilio dentro de la República Argentina. El
        pedido se despacha una vez acreditado el pago; el plazo de entrega
        depende del operador logístico y puede variar por demoras ajenas a
        nuestra gestión. Es responsabilidad del comprador aportar una dirección
        de entrega correcta y completa.
      </p>
      {minimoAmba > 0 || minimoPais > 0 ? (
        <p>
          {minimoAmba > 0 && minimoPais > 0 ? (
            <>
              El envío es gratis en AMBA en las compras desde {formatearPrecio(minimoAmba)}. Al
              resto del país, es gratis en las compras desde {formatearPrecio(minimoPais)}.
            </>
          ) : minimoAmba > 0 ? (
            <>El envío es gratis en AMBA en las compras desde {formatearPrecio(minimoAmba)}.</>
          ) : (
            <>El envío es gratis a todo el país en las compras desde {formatearPrecio(minimoPais)}.</>
          )}{" "}
          El mínimo se cuenta con los anteojos a precio de lista, antes de los
          descuentos. Si la compra no llega al mínimo, se paga el costo del
          envío a la dirección de entrega, que se informa antes de pagar.
        </p>
      ) : (
        <p>
          El costo del envío a la dirección de entrega se informa antes de
          pagar.
        </p>
      )}
      {minimoAmba > 0 ? (
        <p>
          Para estos envíos, AMBA es la Ciudad Autónoma de Buenos Aires y el
          Gran Buenos Aires. Al cargar la dirección de entrega se informa,
          antes de pagar, si el envío es gratis para esa dirección o cuánto
          cuesta.
        </p>
      ) : null}

      <h2 style={h2}>Disponibilidad</h2>
      <p>
        Si un producto no estuviera disponible luego de confirmada la compra, nos
        comunicaremos para ofrecer un reemplazo o reintegrar el importe abonado.
      </p>

      <h2 style={h2}>Garantía</h2>
      <p>
        Los productos cuentan con la garantía legal prevista en la Ley 24.240 de
        Defensa del Consumidor por defectos de fabricación. La garantía no cubre
        daños derivados del uso indebido, golpes, caídas o desgaste natural.
      </p>

      <h2 id="suscriptores" style={h2}>
        Cuenta Harper y novedades
      </h2>
      <p>
        La cuenta Harper es gratuita y se abre con un mail. Sirve para seguir
        las compras y guardar los favoritos, los datos y las direcciones; para
        comprar no hace falta tenerla. Quien la abre acepta recibir nuestros
        mails de novedades y puede dejar de recibirlos cuando quiera, sin costo
        y sin perder la cuenta. El detalle está en las{" "}
        <Link href="/legales/suscriptores" style={subrayado}>
          Condiciones de la cuenta Harper
        </Link>
        , que forman parte de estos términos.
      </p>

      <h2 style={h2}>Contacto</h2>
      <p>
        Cualquier consulta puede dirigirse a{" "}
        <a href={`mailto:${config.emailContacto}`} style={subrayado}>
          {config.emailContacto}
        </a>
        .
      </p>
    </>
  );
}
