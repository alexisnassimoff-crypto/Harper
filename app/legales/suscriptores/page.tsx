import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import {
  creditoActivo,
  DIAS_PARA_LIBERAR_CREDITO,
  MESES_PARA_VENCER_CREDITO,
  PORCENTAJE_CREDITO_UN_ANTEOJO,
  PORCENTAJE_CREDITO_VARIOS,
} from "@/lib/credito-harper";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { VERSION_CONDICIONES_CREDITO, VERSION_CONDICIONES_SUSCRIPTORES, versionTerminosLegible } from "@/lib/legales";
import { VIGENCIA_CODIGO_MS } from "@/lib/reconocer-cliente";
import { DURACION_SESION_MS } from "@/lib/suscriptores-sesion";

/**
 * Las condiciones de la cuenta Harper y de los mails de novedades. La página
 * nació el 03/11/2026 como las condiciones de Suscriptores Harper, con sus
 * beneficios en plata (cupón de bienvenida, saldo de vuelta, envío gratis
 * siempre y cuotas propias).
 *
 * Ale, 18/11/2026: esos beneficios terminaron para todos (lib/suscriptores.ts,
 * BENEFICIOS_DE_SUSCRIPTOR). Lo que queda es la cuenta (compras, favoritos,
 * datos y direcciones) y los mails de novedades, y esta página dice solo eso:
 * qué es la cuenta, quién puede tenerla, cómo se abre y se entra, qué guarda,
 * los mails de novedades y su baja, los datos personales, los cambios y el
 * contacto. No describe ningún descuento, cuota ni envío: son los de
 * cualquier compra y están en los Términos (app/legales/terminos/page.tsx).
 * La dirección no cambió (/legales/suscriptores): la enlazan el formulario de
 * alta, /suscriptores, los Términos, la Privacidad y el sitemap.
 *
 * Los plazos salen del código con el que trabaja el servidor: la sesión
 * (lib/suscriptores-sesion.ts) y el código (lib/reconocer-cliente.ts). Cada
 * alta guarda la versión que aceptó (lib/legales.ts): si cambian estas
 * condiciones, se cambia esa fecha en el mismo commit.
 *
 * Ale, 18/11/2026: las condiciones del Crédito Harper van en su propia
 * sección («Crédito Harper», #credito, al final), que se arma SOLO si el
 * servidor tiene el crédito prendido (HARPER_CREDITO_ACTIVO, `creditoActivo()`
 * de lib/credito-harper.ts). Apagado, la página es la de siempre y no lo nombra
 * en ningún lado. La sección dice lo que hace el código: los porcentajes y los
 * días salen de lib/credito-harper.ts; la base, del cobro (lib/pedidos.ts y
 * lib/credito-uso.ts, `aplicarCreditoHarper`); las devoluciones, de
 * lib/credito-pagos.ts, lib/credito-persistencia.ts y lib/credito-uso.ts
 * (`revisarUsoPorReembolso`). No dice qué se reintegra si se devuelve un
 * anteojo de un Dúo: Ale todavía no lo decidió. Tiene su propia versión
 * (VERSION_CONDICIONES_CREDITO), que se muestra en la sección: el texto
 * publicado cambia cuando se prende el interruptor, y la versión de la cuenta
 * que guarda cada alta no cambia.
 */

/**
 * El ejemplo del vencimiento, armado con la misma regla: un crédito disponible
 * desde un 31 de octubre vence el mismo día, MESES_PARA_VENCER_CREDITO meses
 * después, o el último día de ese mes si no lo tiene (con 6: el 30 de abril).
 * Solo arma el texto; el vencimiento de verdad lo calcula el servidor.
 */
function ejemploDeVencimiento(meses: number): { desde: string; vence: string } {
  const legible = (fecha: Date) => fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });
  const [anio, mes, dia] = [2026, 9, 31];
  const ultimoDelMes = new Date(Date.UTC(anio, mes + meses + 1, 0, 12)).getUTCDate();
  return {
    desde: legible(new Date(Date.UTC(anio, mes, dia, 12))),
    vence: legible(new Date(Date.UTC(anio, mes + meses, Math.min(dia, ultimoDelMes), 12))),
  };
}

export const metadata: Metadata = {
  title: "Condiciones de la cuenta Harper",
  alternates: { canonical: "/legales/suscriptores" },
};


const h2 = { fontSize: "1.25rem", marginTop: "1.5rem" } as const;
const lista = { margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "0.5rem" } as const;
const subrayado = { textDecoration: "underline" } as const;

export default async function CondicionesCuenta() {
  const config = await getConfig();
  const diasSesion = Math.round(DURACION_SESION_MS / (24 * 60 * 60_000));
  const minutosCodigo = Math.round(VIGENCIA_CODIGO_MS / 60_000);
  const correo = (
    <a href={`mailto:${config.emailContacto}`} style={subrayado}>
      {config.emailContacto}
    </a>
  );
  const miCuenta = (
    <Link href="/suscriptores/mi-cuenta" style={subrayado}>
      Mi Cuenta
    </Link>
  );
  // El Crédito Harper (Ale, 18/11/2026): sus condiciones, solo si el servidor lo tiene prendido.
  const conCredito = creditoActivo();
  const ejemplo = ejemploDeVencimiento(MESES_PARA_VENCER_CREDITO);

  return (
    <>
      <h1 className="titulo">Condiciones de la cuenta Harper</h1>
      <p className="apagado">
        Versión vigente: {versionTerminosLegible(VERSION_CONDICIONES_SUSCRIPTORES)}. Forman parte de los{" "}
        <Link href="/legales/terminos" style={subrayado}>
          Términos y condiciones
        </Link>{" "}
        de harper.ar.
      </p>

      <h2 style={h2}>1. Qué es</h2>
      <p>
        La cuenta Harper es tu cuenta en harper.ar, a cargo de {config.razonSocial}, CUIT {config.cuit}. Con ella seguís tus compras, guardás
        tus favoritos, tus datos y tus direcciones, y recibís por mail las novedades de Harper. Es gratis: no hay que pagar nada ni comprar
        nada para tenerla, y para comprar en harper.ar no hace falta tener cuenta.
      </p>

      <h2 style={h2}>2. Quién puede tenerla</h2>
      <p>
        Cualquier persona mayor de edad, o con autorización de su representante legal, con un mail propio. La cuenta es personal: una por
        mail.
      </p>

      <h2 style={h2}>3. Cómo se abre y cómo se entra</h2>
      <p>
        Para abrirla escribís tu mail en harper.ar, lo confirmás con el código de 6 números que te mandamos y aceptás estas condiciones y
        recibir nuestros mails de novedades (punto 5). El nombre es opcional.
      </p>
      <p>
        Para entrar otra vez alcanza con tu mail y un código nuevo: la cuenta no tiene contraseña. Cada código vence a los {minutosCodigo}{" "}
        minutos. Quedás reconocido en ese navegador por hasta {diasSesion} días; si querés salir antes, lo hacés desde {miCuenta}.
      </p>

      <h2 style={h2}>4. Qué guarda</h2>
      <ul style={lista}>
        <li>
          <strong>Tus compras.</strong> Los pedidos hechos con el mail de la cuenta, con su estado y el seguimiento del envío cuando está
          cargado.
        </li>
        <li>
          <strong>Tus favoritos.</strong> Los anteojos que guardás con el corazón.
        </li>
        <li>
          <strong>Tus datos y direcciones.</strong> Tu nombre, tu teléfono, tu DNI y tus direcciones de entrega, si elegís guardarlos, para no
          cargarlos de nuevo en cada compra. Los actualizás desde {miCuenta}.
        </li>
        {/* Solo con HARPER_CREDITO_ACTIVO=1: apagado, la lista es la de siempre. */}
        {conCredito ? (
          <li>
            <strong>Tu Crédito Harper.</strong> El que ganás con tus compras de anteojos y cómo lo usás. Sus condiciones están más abajo, en{" "}
            <a href="#credito" style={subrayado}>
              Crédito Harper
            </a>
            .
          </li>
        ) : null}
      </ul>

      <h2 style={h2}>5. Mails de novedades</h2>
      <p>
        Al abrir la cuenta aceptás recibir nuestros mails con novedades, lanzamientos y promociones de Harper. Lo aceptás con una casilla que
        está sin marcar hasta que la marcás vos.
      </p>
      <p>
        Te podés dar de baja de esos mails cuando quieras, sin costo: con el enlace de nuestros mails de bienvenida y de novedades, desde{" "}
        {miCuenta} o escribiéndonos a {correo}. Si te das de baja, dejás de recibir nuestros mails de novedades. Tu cuenta sigue igual, y los
        mails de tus pedidos te siguen llegando. Si más adelante querés volver a recibirlos, te suscribís de nuevo con el mismo mail.
      </p>

      <h2 style={h2}>6. Tus datos</h2>
      <p>
        {config.razonSocial} es responsable de los datos de la cuenta, conforme a la Ley 25.326 de Protección de los Datos Personales.
        Guardamos tu mail, tu nombre si lo diste, la fecha y desde dónde abriste la cuenta, tu consentimiento para recibir mails, tus
        favoritos y los datos y las direcciones que elijas guardar. Los usamos para reconocerte en harper.ar, mostrarte tu cuenta, facilitar
        tus próximas compras y mandarte mails con novedades, lanzamientos y promociones de Harper. No los vendemos ni los cedemos a terceros
        con fines comerciales; solo los procesan los proveedores que nos prestan los servicios de almacenamiento y de envío de mails, para
        esos fines.
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

      <h2 style={h2}>7. Cambios</h2>
      <p>
        Si cambiamos estas condiciones, la versión nueva y su fecha se publican en esta página, y si el cambio te afecta te avisamos por mail
        antes de que rija.
      </p>
      {/* El saldo de antes del 18/11/2026: una sola cláusula. No se genera más; el que hubiera se puede seguir usando. */}
      <p>
        Si tu cuenta tiene saldo a favor de compras anteriores, lo podés seguir usando en tus compras, entrando con tu mail.
        Las compras nuevas ya no generan saldo.
      </p>

      <h2 style={h2}>8. Contacto</h2>
      <p>Cualquier consulta, escribinos a {correo}.</p>

      {/*
        El Crédito Harper (Ale, 18/11/2026): solo con HARPER_CREDITO_ACTIVO=1. Apagado, ni el título ni una mención.
        Dice lo que hace el código, nada más. Sin regla para la devolución de un anteojo de un Dúo (sin decidir).
      */}
      {conCredito ? (
        <>
          <h2 id="credito" style={h2}>
            Crédito Harper
          </h2>
          <p className="apagado">
            Versión vigente de las condiciones del Crédito Harper: {versionTerminosLegible(VERSION_CONDICIONES_CREDITO)}.
          </p>
          <p>
            Con tus compras de anteojos en harper.ar ganás Crédito Harper, para usar en tus próximas compras de anteojos. Para tenerlo no
            hace falta suscribirse a las novedades.
          </p>
          <ul style={lista}>
            <li>
              <strong>Cuánto ganás.</strong> El {PORCENTAJE_CREDITO_UN_ANTEOJO} % de lo que pagás por los anteojos si la compra tiene un
              anteojo, y el {PORCENTAJE_CREDITO_VARIOS} % si tiene dos o más (cuentan todos los anteojos de la compra, iguales o distintos).
              Se calcula sobre lo que pagás en dinero por los anteojos, después de los descuentos de la compra, incluido el{" "}
              {PORCENTAJE_DINERO_MP} % por pagar con dinero en Mercado Pago si lo elegís, y se redondea al peso. No se calcula sobre el
              envío, los estuches ni los paños, ni sobre lo que pagues con Crédito Harper o con saldo a favor.
            </li>
            <li>
              <strong>Cuándo queda disponible.</strong> Cuando se acredita el pago, el crédito queda pendiente a nombre del mail con el que
              hiciste la compra. Pasa a estar disponible {DIAS_PARA_LIBERAR_CREDITO} días después de que confirmamos la entrega del pedido,
              siempre que la compra no tenga abierta una devolución, un cambio, un reclamo o un contracargo: si tiene alguno, sigue
              pendiente hasta que se resuelva. Mientras está pendiente no se puede usar.
            </li>
            <li>
              <strong>Cuándo vence.</strong> A los {MESES_PARA_VENCER_CREDITO} meses del día en que quedó disponible, el mismo número de
              día; si ese mes no lo tiene, el último día del mes. Por ejemplo, el crédito disponible desde el {ejemplo.desde} vence el{" "}
              {ejemplo.vence}. Lo podés usar hasta el día del vencimiento inclusive, en hora de Argentina; lo que no uses hasta entonces se
              pierde. Si tenés créditos con distintos vencimientos, en cada compra se usa primero el que vence antes.
            </li>
            <li>
              <strong>Cómo se usa.</strong> Solo en anteojos de harper.ar: nunca paga el envío, los estuches ni los paños. Para usarlo
              entrás a {miCuenta} con el mail de la compra y el código que te mandamos a ese mail, y comprás con ese mismo mail. En el
              checkout elegís si lo usás: se descuenta lo que tengas disponible hasta cubrir lo que pagás por los anteojos, y lo que sobra
              queda para otra compra, con el mismo vencimiento. Si el pedido no se llega a pagar, el crédito que apartó vuelve a quedar
              disponible. No se puede cambiar por dinero ni pasar a otra persona o a otro mail.
            </li>
            <li>
              <strong>Devoluciones y contracargos.</strong> Si se reintegra entero el pago de la compra que generó el crédito, por una
              devolución o por un contracargo, ese crédito se anula; si para entonces ya estaba disponible, queda en revisión y no se puede
              usar mientras lo revisamos. Si se devuelve una compra que pagaste en parte con Crédito Harper, el crédito que usaste en ella no
              vuelve solo: queda en revisión, sigue descontado y Harper revisa cada caso para decidir si te lo devuelve.
            </li>
            <li>
              <strong>Avisos por mail.</strong> Te escribimos al mail de la compra cuando el crédito queda disponible y, si todavía te queda
              crédito sin usar, unos días antes de que venza.
            </li>
            <li>
              <strong>Dónde lo ves.</strong> En {miCuenta} ves tu crédito disponible, el pendiente y el que está en revisión, con cada
              movimiento. Para llevarlo guardamos, con el mail de la compra, el crédito de cada pedido, su estado y cómo lo usaste, y lo
              tratamos como dice el punto 6.
            </li>
          </ul>
        </>
      ) : null}
    </>
  );
}
