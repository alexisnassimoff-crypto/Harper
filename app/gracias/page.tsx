import type { Metadata } from "next";
import Link from "next/link";
import VaciarCarrito from "@/components/carrito/VaciarCarrito";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Gracias por tu compra",
  robots: { index: false, follow: false },
};

export default async function Gracias({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido } = await searchParams;
  const config = await getConfig();

  return (
    <section
      className="contenedor pila"
      style={{
        paddingBlock: "6rem",
        gap: "1.5rem",
        alignItems: "flex-start",
        maxWidth: "38rem",
      }}
    >
      {/* El carrito se vacía recién acá, cuando la compra terminó. */}
      <VaciarCarrito />

      <h1 className="titulo">Gracias por tu compra</h1>

      {pedido ? (
        <p>
          Tu pedido es <strong style={{ fontWeight: 500 }}>{pedido}</strong>.
        </p>
      ) : null}

      <p className="apagado">
        Te mandamos la confirmación por mail con el detalle. Preparamos el envío
        y llega en {config.plazoEntrega}.
      </p>

      <p className="apagado" style={{ fontSize: "0.875rem" }}>
        Si no ves el mail en unos minutos, revisá la carpeta de spam o
        escribinos a{" "}
        <a href={`mailto:${config.emailContacto}`} style={{ textDecoration: "underline" }}>
          {config.emailContacto}
        </a>
        .
      </p>

      <Link href="/" className="boton" style={{ marginTop: "1rem" }}>
        Volver a la tienda
      </Link>
    </section>
  );
}
