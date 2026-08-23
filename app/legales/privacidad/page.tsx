import type { Metadata } from "next";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Política de privacidad" };

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

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Para qué los usamos</h2>
      <p>
        Los datos se utilizan para procesar el pago, preparar y despachar el
        pedido, emitir la documentación correspondiente y responder consultas.
        Si prestaste tu consentimiento marcando la casilla correspondiente,
        también podemos enviarte novedades y promociones. Podés revocar ese
        consentimiento en cualquier momento escribiéndonos.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Con quién los compartimos</h2>
      <p>
        Compartimos únicamente los datos necesarios con Mercado Pago (para
        procesar el cobro) y con el operador logístico que realiza la entrega. No
        vendemos ni cedemos datos personales a terceros con fines comerciales.
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
