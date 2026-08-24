"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useCarrito } from "./carrito/CarritoContexto";

const SECCIONES = [
  { href: "/anteojos", texto: "Anteojos" },
  { href: "/estuches", texto: "Estuches" },
  { href: "/panos", texto: "Paños" },
];

export default function Header({ banner }: { banner?: string }) {
  const { unidades, listo } = useCarrito();
  const pathname = usePathname();

  return (
    <>
      {banner ? (
        <div
          style={{
            background: "var(--verde)",
            color: "var(--hueso)",
            textAlign: "center",
            padding: "0.6rem 1rem",
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {banner}
        </div>
      ) : null}

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          // Translúcido de verdad: deja ver el contenido pasar por debajo.
          background: "color-mix(in srgb, var(--fondo) 62%, transparent)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
          borderBottom: "1px solid color-mix(in srgb, var(--borde) 70%, transparent)",
        }}
      >
        <div
          className="contenedor"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            minHeight: "4.25rem",
            gap: "1rem",
          }}
        >
          <nav
            aria-label="Categorías"
            style={{ display: "flex", gap: "1.5rem" }}
          >
            {SECCIONES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="label nav-enlace"
                data-activo={pathname === s.href}
              >
                {s.texto}
              </Link>
            ))}
          </nav>

          <Link
            href="/"
            aria-label="Harper — Inicio"
            className="logo-enlace"
            style={{ justifySelf: "center" }}
          >
            <Logo alto={22} />
          </Link>

          <div style={{ justifySelf: "end" }}>
            <Link
              href="/carrito"
              className="carrito-enlace"
              data-activo={pathname === "/carrito"}
              aria-label={
                listo && unidades > 0
                  ? `Carrito, ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`
                  : "Carrito"
              }
            >
              <CarritoIcono />
              {listo && unidades > 0 ? (
                <span className="carrito-globo" aria-hidden="true">
                  {unidades}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

/** Carrito de compras, trazado a mano para que herede el verde de la marca. */
function CarritoIcono() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 3h2.2l2.1 10.4a1.8 1.8 0 0 0 1.8 1.4h8.1a1.8 1.8 0 0 0 1.8-1.4l1.4-6.6H6" />
      <circle cx="9.5" cy="20" r="1.5" />
      <circle cx="17.5" cy="20" r="1.5" />
    </svg>
  );
}
