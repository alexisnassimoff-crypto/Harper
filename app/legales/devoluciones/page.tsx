import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Cambios y devoluciones" };

export default async function Devoluciones() {
  const config = await getConfig();

  return (
    <>
      <h1 className="titulo">Cambios y devoluciones</h1>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1rem" }}>
        Derecho de arrepentimiento
      </h2>
      <p>
        Si comprás a distancia, tenés derecho a arrepentirte dentro de los{" "}
        <strong style={{ fontWeight: 500 }}>10 días corridos</strong> contados a
        partir de la entrega del producto, sin necesidad de expresar motivo y sin
        costo alguno (art. 34 de la Ley 24.240). El producto debe estar sin uso y
        en su empaque original. El costo de devolución corre por nuestra cuenta.
      </p>
      <p>
        Para ejercerlo, completá el{" "}
        <Link href="/legales/arrepentimiento" style={{ textDecoration: "underline" }}>
          botón de arrepentimiento
        </Link>
        .
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Cambios</h2>
      <p>
        Aceptamos cambios por otro color o modelo dentro de los 30 días de
        recibido el pedido, siempre que el producto esté sin uso y en su empaque
        original. Escribinos a{" "}
        <a href={`mailto:${config.emailContacto}`} style={{ textDecoration: "underline" }}>
          {config.emailContacto}
        </a>{" "}
        indicando tu número de pedido y te coordinamos el cambio.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>
        Productos con defectos
      </h2>
      <p>
        Si el producto llegó dañado o presenta un defecto de fabricación,
        escribinos dentro de las 48 horas de recibido adjuntando fotos. Nos
        hacemos cargo del reemplazo y de todos los costos de logística.
      </p>

      <h2 style={{ fontSize: "1.25rem", marginTop: "1.5rem" }}>Reintegros</h2>
      <p>
        Los reintegros se realizan por el mismo medio de pago utilizado en la
        compra, dentro de los 10 días hábiles de recibido el producto devuelto y
        verificado su estado. Los plazos de acreditación dependen de la entidad
        emisora de la tarjeta.
      </p>
    </>
  );
}
