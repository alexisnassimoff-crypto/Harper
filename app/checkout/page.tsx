import type { Metadata } from "next";
import FormularioCheckout from "@/components/checkout/FormularioCheckout";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default function PaginaCheckout() {
  return (
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "2.5rem" }}>
        Finalizar compra
      </h1>
      <FormularioCheckout />
    </section>
  );
}
