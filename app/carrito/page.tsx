import type { Metadata } from "next";
import VistaCarrito from "@/components/carrito/VistaCarrito";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false, follow: false },
};

export default async function PaginaCarrito() {
  // El WhatsApp de Config (el mismo pedido que hace el layout), para la
  // consulta junto a «Finalizar compra» en celular.
  const config = await getConfig();
  return (
    <section className="contenedor" style={{ paddingBlock: "3.5rem" }}>
      <h1 className="titulo" style={{ marginBottom: "2.5rem" }}>
        Carrito
      </h1>
      <VistaCarrito whatsapp={config.whatsapp ?? ""} />
    </section>
  );
}
