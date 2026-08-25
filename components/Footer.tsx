import Link from "next/link";
import type { ConfigTienda } from "@/lib/config";
import Logo from "./Logo";

const LEGALES = [
  { href: "/legales/terminos", texto: "Términos y condiciones" },
  { href: "/legales/privacidad", texto: "Política de privacidad" },
  { href: "/legales/devoluciones", texto: "Cambios y devoluciones" },
  { href: "/legales/arrepentimiento", texto: "Botón de arrepentimiento" },
];

export default function Footer({ config }: { config: ConfigTienda }) {
  return (
    <footer
      style={{
        marginTop: "6rem",
        borderTop: "1px solid var(--borde)",
        background: "var(--fondo-alt)",
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
          <Logo alto={54} lockup />
          <p className="apagado" style={{ fontSize: "0.875rem", maxWidth: "22rem" }}>
            Anteojos y estuches.
          </p>
        </div>

        <nav className="pila" style={{ gap: "0.6rem" }} aria-label="Legales">
          <span className="label">Legales</span>
          {LEGALES.map((l) => (
            <Link key={l.href} href={l.href} className="enlace-suave" style={{ fontSize: "0.875rem" }}>
              {l.texto}
            </Link>
          ))}
        </nav>

        <div className="pila" style={{ gap: "0.6rem" }}>
          <span className="label">Contacto</span>
          <a
            href={`mailto:${config.emailContacto}`}
            className="enlace-suave"
            style={{ fontSize: "0.875rem" }}
          >
            {config.emailContacto}
          </a>
          {config.whatsapp ? (
            <a
              href={`https://wa.me/${config.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="enlace-suave"
              style={{ fontSize: "0.875rem" }}
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
          borderTop: "1px solid var(--borde)",
          paddingBlock: "1.5rem",
          fontSize: "0.75rem",
          color: "var(--texto-suave)",
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
        >
          Defensa de las y los Consumidores
        </a>
      </div>
    </footer>
  );
}
