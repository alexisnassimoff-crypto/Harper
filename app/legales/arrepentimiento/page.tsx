import type { Metadata } from "next";
import Link from "next/link";
import FormularioArrepentimiento from "@/components/FormularioArrepentimiento";
import { getConfig } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO } from "@/lib/confianza";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento",
  alternates: { canonical: "/legales/arrepentimiento" },
};

/**
 * Obligatorio por la Resolución 424/2020 de la Secretaría de Comercio Interior.
 * Tiene que estar accesible desde la portada, en el primer nivel de navegación.
 * El código de recepción se da en el momento, también fines de semana y
 * feriados (Disp. SSDCyLC 954/2025): ver lib/arrepentimiento.ts.
 */
export default async function Arrepentimiento() {
  const config = await getConfig();

  return (
    <>
      <h1 className="titulo">Botón de arrepentimiento</h1>

      <p>
        Si te arrepentiste de tu compra, tenés{" "}
        <strong style={{ fontWeight: 500 }}>{DIAS_ARREPENTIMIENTO} días corridos</strong> desde que
        recibiste el producto para revocarla, sin costo y sin necesidad de dar
        explicaciones.
      </p>

      <p className="apagado">
        El producto tiene que volver como lo recibiste: sin uso, sin daños,
        completo y en su empaque original. Podés abrirlo y probártelo para ver
        cómo te queda, como en un local. Ver las{" "}
        <Link href="/legales/devoluciones" style={{ textDecoration: "underline" }}>
          condiciones de devolución
        </Link>
        .
      </p>

      <p className="apagado">
        Al enviar la solicitud te damos un código de recepción en el momento, en
        pantalla y por email, también los fines de semana y feriados. Atendemos
        de lunes a viernes: el siguiente día hábil te contactamos para coordinar
        el retiro sin cargo y el reintegro del importe abonado.
      </p>

      <p className="apagado">
        Este botón es para cancelar la compra dentro de esos {DIAS_ARREPENTIMIENTO} días. Los cambios
        voluntarios de color o modelo se gestionan por WhatsApp.
      </p>

      <div
        className="pila"
        style={{
          gap: "1rem",
          marginTop: "1.5rem",
          paddingTop: "1.75rem",
          borderTop: "1px solid var(--borde)",
          alignItems: "flex-start",
        }}
      >
        <FormularioArrepentimiento emailContacto={config.emailContacto} whatsapp={config.whatsapp} />

        <p className="apagado" style={{ fontSize: "0.8125rem" }}>
          También podés escribirnos directamente a {config.emailContacto}
          {config.whatsapp ? " o por WhatsApp." : "."}
        </p>
      </div>

    </>
  );
}
