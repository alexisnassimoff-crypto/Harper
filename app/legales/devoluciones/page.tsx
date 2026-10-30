import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA } from "@/lib/confianza";

export const metadata: Metadata = {
  title: "Cambios y devoluciones",
  alternates: { canonical: "/legales/devoluciones" },
};

export default async function Devoluciones() {
  const config = await getConfig();
  const whatsapp = config.whatsapp ? (
    <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
      WhatsApp
    </a>
  ) : (
    "WhatsApp"
  );

  return (
    <>
      <h1 className="titulo">Cambios y devoluciones</h1>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1rem" }}>Devoluciones</h2>
      <p>
        Podés devolver tu compra dentro de los{" "}
        <strong style={{ fontWeight: 500 }}>{DIAS_ARREPENTIMIENTO} días corridos</strong> desde que
        la recibís, sin necesidad de explicar el motivo. Harper se hace cargo del
        envío de la devolución y te reintegramos el dinero por el mismo medio de
        pago, a través de Mercado Pago.
      </p>
      <p>El producto tiene que volver en las mismas condiciones en que lo recibiste:</p>
      <ul className="lista-legal">
        <li>
          <strong style={{ fontWeight: 500 }}>Sin uso.</strong> Podés abrirlo y probártelo para ver
          cómo te queda, como en un local, pero no usarlo.
        </li>
        <li>
          <strong style={{ fontWeight: 500 }}>Sin daños:</strong> sin rayaduras, marcas, golpes ni
          piezas flojas.
        </li>
        <li>
          <strong style={{ fontWeight: 500 }}>Completo:</strong> con el estuche, el paño y todo lo
          que venía en la caja.
        </li>
        <li>
          <strong style={{ fontWeight: 500 }}>En su empaque original</strong>, sin daños.
        </li>
      </ul>
      <p>
        Cuando nos llega, lo revisamos. Si tiene señales de uso, daños o le falta
        algo, no podemos aceptar la devolución: te lo avisamos y te lo enviamos de
        vuelta.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Cambios</h2>
      <p>
        Para cambiarlo por otro color o modelo también tenés {DIAS_CAMBIO} días desde
        que recibís el pedido, con las mismas condiciones (sin uso, sin daños,
        completo y en su empaque) y según el stock disponible.
      </p>
      <p>
        En los cambios de color o modelo, el envío de ida y vuelta lo paga quien
        compra. Si el error fue nuestro o el producto tiene un defecto de
        fabricación, lo pagamos nosotros.
      </p>

      <h2 id="garantia" style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>
        Garantía
      </h2>
      <p>
        Todos nuestros productos tienen {MESES_GARANTIA} meses de garantía legal por{" "}
        <strong style={{ fontWeight: 500 }}>defectos de fabricación</strong>, desde que los recibís.
        Si tu producto tiene un defecto de fabricación, lo reparamos o lo cambiamos
        sin costo para vos.
      </p>
      <p>La garantía no cubre:</p>
      <ul className="lista-legal">
        <li>el uso indebido, descuidado o distinto del normal;</li>
        <li>golpes, caídas, aplastamientos, torceduras o rayaduras;</li>
        <li>daños por calor, humedad, productos químicos o una limpieza inadecuada;</li>
        <li>el desgaste natural por el uso;</li>
        <li>
          cambios o arreglos hechos por terceros, incluidos los daños al colocar
          cristales con aumento en una óptica.
        </li>
      </ul>

      <p style={{ marginTop: "1.5rem" }}>
        Para una devolución, usá el{" "}
        <Link href="/legales/arrepentimiento" style={{ textDecoration: "underline" }}>
          Botón de arrepentimiento
        </Link>
        . Para un cambio o una consulta por garantía, escribinos por {whatsapp}.
      </p>
    </>
  );
}
