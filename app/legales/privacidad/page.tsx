import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Política de privacidad",
  alternates: { canonical: "/legales/privacidad" },
};

export default async function Privacidad() {
  const config = await getConfig();

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
        Si te suscribís a Suscriptores Harper, guardamos además tu mail, tu
        nombre si lo diste, la fecha y desde dónde te suscribiste, tu
        consentimiento para recibir mails y los movimientos de tu saldo. Para
        reconocerte en el sitio, al entrar con tu mail guardamos en tu
        navegador una cookie de sesión por 90 días; no se usa para publicidad.
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

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Mails de Suscriptores Harper</h2>
      <p>
        Si te suscribís, usamos tu mail para aplicarte los beneficios, llevar tu
        saldo y mandarte novedades, lanzamientos y promociones de Harper. Lo
        hacemos solo porque lo aceptaste al suscribirte, con una casilla que
        está sin marcar hasta que la marcás vos. Te podés dar de baja cuando
        quieras con el enlace de nuestros mails de bienvenida y de novedades, desde{" "}
        <Link href="/suscriptores/mi-cuenta" style={{ textDecoration: "underline" }}>
          mi cuenta
        </Link>{" "}
        o escribiéndonos, y también podés pedir que te saquemos de nuestra base
        de mails (art. 27 de la Ley 25.326). El detalle está en las{" "}
        <Link href="/legales/suscriptores" style={{ textDecoration: "underline" }}>
          Condiciones de Suscriptores Harper
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
