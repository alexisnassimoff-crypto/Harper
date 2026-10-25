import type { Metadata } from "next";
import FormularioArrepentimiento from "@/components/FormularioArrepentimiento";
import { getConfig } from "@/lib/config";

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
        <strong style={{ fontWeight: 500 }}>10 días corridos</strong> desde que
        recibiste el producto para revocarla, sin costo y sin necesidad de dar
        explicaciones.
      </p>

      <p className="apagado">
        Podés abrir el paquete y probarte los anteojos normalmente, y no hace
        falta conservar el empaque original.
      </p>

      <p className="apagado">
        Al enviar la solicitud te damos un código de recepción en el momento, en
        pantalla y por email, también los fines de semana y feriados. Atendemos
        de lunes a viernes: el siguiente día hábil te contactamos para coordinar
        el retiro sin cargo y el reintegro del importe abonado.
      </p>

      <p className="apagado">
        Este botón es para cancelar la compra dentro del plazo legal. Los cambios
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

      <p className="apagado" style={{ fontSize: "0.8125rem", marginTop: "1rem" }}>
        {config.razonSocial} — CUIT {config.cuit}
        {config.domicilio ? ` — ${config.domicilio}` : ""}
      </p>
    </>
  );
}
