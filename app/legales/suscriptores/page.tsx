import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { VERSION_CONDICIONES_SUSCRIPTORES, versionTerminosLegible } from "@/lib/legales";
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
 */

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
    </>
  );
}
