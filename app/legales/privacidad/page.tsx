import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { creditoActivo } from "@/lib/credito-harper";
import { DURACION_SESION_MS } from "@/lib/suscriptores-sesion";

/**
 * La Política de privacidad. Ale, 18/11/2026: los beneficios en plata de la
 * suscripción terminaron para todos (lib/suscriptores.ts), así que la página
 * ya no habla de «Suscriptores Harper», de beneficios ni de los movimientos
 * de un saldo: nombra la cuenta Harper y los mails de novedades, y dice que
 * darse de baja de esos mails no cierra la cuenta. Lo demás quedó igual. Los
 * días de la sesión salen de lib/suscriptores-sesion.ts.
 *
 * El Crédito Harper (Ale, 18/11/2026; revisión del 20/11/2026): solo con
 * HARPER_CREDITO_ACTIVO=1 (`creditoActivo()`), dos párrafos más. Uno, que
 * quien entra a Mi cuenta solo para ver o usar su crédito, sin abrir la
 * cuenta, también recibe la cookie de sesión (lib/credito-cuenta.ts,
 * entrarALaCuenta, y app/api/cuenta/entrar/route.ts). Otro, para qué se usan
 * los datos del crédito, que no son mails de novedades: esos necesitan la
 * casilla (Ley 25.326, arts. 5 y 6). Apagado, la página es la de siempre.
 */

export const metadata: Metadata = {
  title: "Política de privacidad",
  alternates: { canonical: "/legales/privacidad" },
};

export default async function Privacidad() {
  const config = await getConfig();
  const diasSesion = Math.round(DURACION_SESION_MS / (24 * 60 * 60_000));
  // El Crédito Harper, solo si el servidor lo tiene prendido.
  const conCredito = creditoActivo();

  return (
    <>
      <h1 className="titulo">Política de privacidad</h1>

      <p className="apagado">
        {config.razonSocial} (CUIT {config.cuit}) es responsable del tratamiento
        de los datos personales recolectados en harper.ar, conforme a la Ley
        25.326 de Protección de los Datos Personales.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Qué datos recolectamos</h2>
      <p>
        Para procesar una compra solicitamos nombre y apellido, correo
        electrónico, teléfono, DNI y domicilio de entrega. El DNI es requerido
        por la plataforma de pago a efectos de facturación, y el teléfono es
        exigido por el correo para coordinar la entrega. No solicitamos ni
        almacenamos datos de tarjetas de crédito o débito.
      </p>
      <p>
        Si abrís tu cuenta Harper, guardamos además tu mail, tu nombre si lo
        diste, la fecha y desde dónde la abriste y tu consentimiento para
        recibir mails. Para reconocerte en el sitio, al entrar con tu mail
        guardamos en tu navegador una cookie de sesión por {diasSesion} días;
        no se usa para publicidad.
      </p>
      {conCredito ? (
        <p>
          Si entrás a Mi cuenta con tu mail solo para ver o usar tu Crédito
          Harper, sin abrir la cuenta, también guardamos esa cookie de sesión en
          tu navegador por {diasSesion} días, solo para reconocerte. No se usa
          para publicidad.
        </p>
      ) : null}
      <p>
        Si elegís guardar en Mi cuenta tu teléfono, DNI, direcciones de entrega
        o anteojos favoritos, utilizamos esa información para facilitar tus
        próximas compras y personalizar tu experiencia en Harper. Podés
        actualizar tus datos personales y administrar tus direcciones y
        favoritos desde Mi cuenta. Los datos de compras anteriores se conservan
        por separado. Para ejercer tus derechos sobre otros datos personales,
        podés comunicarte con nosotros a través del correo de contacto indicado
        en esta política.
      </p>

      <p>
        Para saber cuántas personas visitan el sitio, qué páginas miran y qué
        tan rápido carga, usamos estadísticas sin cookies (Vercel Web Analytics
        y Speed Insights) y contamos, sin guardar quién sos, por qué tipo de
        sitio llegan las visitas (por ejemplo, Instagram o Google) y cuántas
        agregan algo al carrito, empiezan una compra o compran. Para no contar
        dos veces, tu navegador recuerda eso solo mientras dura la visita.
        Estas estadísticas no te identifican ni se usan para publicidad.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Para qué los usamos</h2>
      <p>
        Los datos se utilizan para procesar el pago, preparar y despachar el
        pedido, emitir la documentación correspondiente y responder consultas.
        Si prestaste tu consentimiento marcando la casilla correspondiente,
        también podemos enviarte novedades y promociones. Podés revocar ese
        consentimiento en cualquier momento escribiéndonos.
      </p>
      {conCredito ? (
        <p>
          Si ganás Crédito Harper, usamos tu mail y tus compras para llevar tu
          crédito: mostrártelo en Mi cuenta, descontarlo cuando lo usás,
          revisarlo si hay una devolución, un reclamo o un contracargo, y avisarte por mail
          cuando queda disponible y antes de que venza. Esos avisos no son
          mails de novedades: si no los aceptaste, no te mandamos novedades por
          tener crédito.
        </p>
      ) : null}

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Mails de novedades de Harper</h2>
      <p>
        Si abrís tu cuenta Harper, usamos tu mail para reconocerte cuando
        entrás y para mandarte novedades, lanzamientos y promociones de Harper.
        Esos mails te los mandamos solo porque lo aceptaste al abrir la cuenta,
        con una casilla que está sin marcar hasta que la marcás vos. Te podés
        dar de baja cuando quieras con el enlace de nuestros mails de bienvenida
        y de novedades, desde{" "}
        <Link href="/suscriptores/mi-cuenta" style={{ textDecoration: "underline" }}>
          mi cuenta
        </Link>{" "}
        o escribiéndonos, y también podés pedir que te saquemos de nuestra base
        de mails (art. 27 de la Ley 25.326). Si te das de baja, tu cuenta sigue
        igual y los mails de tus pedidos te siguen llegando. El detalle está en
        las{" "}
        <Link href="/legales/suscriptores" style={{ textDecoration: "underline" }}>
          Condiciones de la cuenta Harper
        </Link>
        .
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Con quién los compartimos</h2>
      <p>
        Compartimos únicamente los datos necesarios con Mercado Pago (para
        procesar el cobro), con el operador logístico que realiza la entrega y
        con los proveedores que nos prestan los servicios de almacenamiento y de
        envío de mails, solo para esos fines. No vendemos ni cedemos datos
        personales a terceros con fines comerciales.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Tus derechos</h2>
      <p>
        Tenés derecho a acceder, rectificar y suprimir tus datos personales.
        Para ejercerlo, escribinos a{" "}
        <a href={`mailto:${config.emailContacto}`} style={{ textDecoration: "underline" }}>
          {config.emailContacto}
        </a>
        . El titular de los datos personales tiene la facultad de ejercer el
        derecho de acceso en forma gratuita a intervalos no menores de seis
        meses, salvo que acredite un interés legítimo al efecto (art. 14, inc. 3
        de la Ley 25.326).
      </p>
      <p>
        La Agencia de Acceso a la Información Pública, órgano de control de la
        Ley 25.326, tiene la atribución de atender las denuncias y reclamos que
        interpongan quienes resulten afectados en sus derechos por incumplimiento
        de las normas vigentes en materia de protección de datos personales.
      </p>
    </>
  );
}
