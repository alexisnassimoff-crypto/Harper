import Link from "next/link";
import type { ConfigTienda } from "@/lib/config";
import Logo from "./Logo";

const LEGALES = [
  { href: "/legales/terminos", texto: "Términos y condiciones" },
  { href: "/legales/privacidad", texto: "Política de privacidad" },
  { href: "/legales/devoluciones", texto: "Cambios y devoluciones" },
  { href: "/legales/arrepentimiento", texto: "Botón de arrepentimiento" },
];

/* El pie va en el verde de la marca, como pidió Ale: cierra la página con la
   identidad en lugar de apagarse en gris. Todo el texto pasa a claro. */
const SUAVE = "rgb(255 255 255 / 0.72)";
const LINEA_CLARA = "rgb(255 255 255 / 0.18)";

export default function Footer({ config }: { config: ConfigTienda }) {
  return (
    <footer
      style={{
        marginTop: "6rem",
        background: "var(--verde)",
        color: "#fff",
      }}
    >
      <div
        className="contenedor"
        style={{
          display: "grid",
          gap: "2.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          paddingBlock: "3.5rem",
        }}
      >
        <div className="pila" style={{ gap: "1rem" }}>
          <Logo alto={54} lockup claro />
          <p style={{ fontSize: "0.875rem", maxWidth: "22rem", color: SUAVE }}>
            Estuches rígidos de ecocuero premium y anteojos con filtro de luz
            azul. Comprá online y pagá con Mercado Pago.
          </p>
        </div>

        <nav className="pila" style={{ gap: "0.6rem" }} aria-label="Legales">
          <span className="label" style={{ color: SUAVE }}>
            Legales
          </span>
          {LEGALES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="enlace-suave"
              style={{ fontSize: "0.875rem", color: "#fff" }}
            >
              {l.texto}
            </Link>
          ))}
        </nav>

        <div className="pila" style={{ gap: "0.6rem" }}>
          <span className="label" style={{ color: SUAVE }}>
            Contacto
          </span>
          <a
            href={`mailto:${config.emailContacto}`}
            className="enlace-suave"
            style={{ fontSize: "0.875rem", color: "#fff" }}
          >
            {config.emailContacto}
          </a>
          {config.whatsapp ? (
            <a
              href={`https://wa.me/${config.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="enlace-suave"
              style={{ fontSize: "0.875rem", color: "#fff" }}
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </div>

      {/* Datos del vendedor: obligatorios por la normativa argentina. */}
      <div
        className="contenedor"
        style={{
          borderTop: `1px solid ${LINEA_CLARA}`,
          paddingBlock: "1.5rem",
          fontSize: "0.75rem",
          color: SUAVE,
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem 1.5rem",
        }}
      >
        <span>
          {config.razonSocial} — CUIT {config.cuit}
        </span>
        {config.domicilio ? <span>{config.domicilio}</span> : null}
        <a
          href="https://autogestion.produccion.gob.ar/consumidores"
          target="_blank"
          rel="noopener noreferrer"
          className="enlace-suave"
          style={{ color: SUAVE }}
        >
          Defensa de las y los Consumidores
        </a>
      </div>
    </footer>
  );
}
