import type { Metadata } from "next";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Botón de arrepentimiento" };

/**
 * Obligatorio por la Resolución 424/2020 de la Secretaría de Comercio Interior.
 * Tiene que estar accesible desde la portada, en el primer nivel de navegación.
 */
export default async function Arrepentimiento() {
  const config = await getConfig();

  const asunto = encodeURIComponent("Botón de arrepentimiento");
  const cuerpo = encodeURIComponent(
    [
      "Solicito ejercer mi derecho de arrepentimiento (art. 34 Ley 24.240).",
      "",
      "Número de pedido:",
      "Nombre y apellido:",
      "DNI:",
      "Producto a devolver:",
      "Motivo (opcional):",
      "",
    ].join("\n")
  );

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
        El producto debe estar sin uso y en su empaque original. Una vez recibida
        tu solicitud te contactamos dentro de las 48 horas hábiles para coordinar
        el retiro sin cargo y el reintegro del importe abonado.
      </p>

      <div
        className="pila"
        style={{
          gap: "1rem",
          marginTop: "1rem",
          padding: "1.75rem",
          border: "1px solid var(--borde)",
          borderRadius: "var(--radio)",
          background: "var(--fondo-alt)",
          alignItems: "flex-start",
        }}
      >
        <p style={{ fontSize: "0.9375rem" }}>
          Enviá tu solicitud con el número de pedido y tus datos. El mensaje ya
          viene precargado con lo que necesitamos.
        </p>

        <a href={`mailto:${config.emailContacto}?subject=${asunto}&body=${cuerpo}`} className="boton">
          Ejercer el arrepentimiento
        </a>

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
