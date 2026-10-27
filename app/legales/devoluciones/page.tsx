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
        Podés solicitar la devolución de tu compra dentro de los{" "}
        <strong style={{ fontWeight: 500 }}>{DIAS_ARREPENTIMIENTO} días corridos</strong> desde que
        recibís el pedido, sin necesidad de justificar el motivo. Harper se hace
        cargo del costo del envío de devolución. Te devolvemos el dinero por el
        mismo medio de pago, a través de Mercado Pago.
      </p>
      <p>
        Cuando recibamos el producto devuelto, verificaremos su estado general,
        integridad y accesorios incluidos. Podés abrir el paquete y probarte los
        anteojos normalmente. Si detectamos daños atribuibles a un uso indebido o
        faltantes imputables al comprador, evaluaremos la situación conforme a la
        legislación vigente.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Cambios</h2>
      <p>
        Para cambios de color o modelo, contás con {DIAS_CAMBIO} días desde que
        recibís el pedido, siempre que el producto esté sin uso, en buen estado y
        sujeto a disponibilidad.
      </p>
      <p>
        En los cambios voluntarios de color o modelo, los gastos de envío de
        devolución y del nuevo producto corren por cuenta del comprador. Si hubo
        un error de Harper o un defecto cubierto por la garantía, Harper asume los
        costos correspondientes.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Garantía</h2>
      <p>
        Todos nuestros productos cuentan con {MESES_GARANTIA} meses de garantía legal por
        defectos o fallas que afecten su funcionamiento, desde que los recibís,
        sin costo para vos.
      </p>

      <p style={{ marginTop: "1.5rem" }}>
        Para solicitar un cambio o devolución, contactanos por {whatsapp} o
        utilizá nuestro{" "}
        <Link href="/legales/arrepentimiento" style={{ textDecoration: "underline" }}>
          Botón de arrepentimiento
        </Link>
        . El Botón de arrepentimiento es para cancelar la compra dentro del plazo
        legal. Los cambios voluntarios se gestionan por WhatsApp.
      </p>
    </>
  );
}
