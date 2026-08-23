import type { Metadata } from "next";
import VistaCarrito from "@/components/carrito/VistaCarrito";

export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false, follow: false },
};

export default function PaginaCarrito() {
  return (
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "2.5rem" }}>
        Carrito
      </h1>
      <VistaCarrito />
    </section>
  );
}
