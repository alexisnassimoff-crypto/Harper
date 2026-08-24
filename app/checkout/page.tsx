import type { Metadata } from "next";
import FormularioCheckout from "@/components/checkout/FormularioCheckout";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default async function PaginaCheckout({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "2.5rem" }}>
        Finalizar compra
      </h1>

      {/* Es a donde vuelve el cliente cuando Mercado Pago rechaza el pago.
          Sin este aviso se encontraba con un formulario en blanco y ninguna
          explicación de qué había pasado. */}
      {error === "pago" ? (
        <p
          role="alert"
          style={{
            marginBottom: "2rem",
            maxWidth: "38rem",
            color: "var(--alerta)",
            fontSize: "0.875rem",
          }}
        >
          El pago no se pudo completar y no te cobramos nada. Revisá los datos
          de la tarjeta o probá con otro medio de pago.
        </p>
      ) : null}

      <FormularioCheckout />
    </section>
  );
}
