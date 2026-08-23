"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useCarrito } from "./carrito/CarritoContexto";

const SECCIONES = [
  { href: "/anteojos", texto: "Anteojos" },
  { href: "/estuches", texto: "Estuches" },
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
          background: "color-mix(in srgb, var(--fondo) 88%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--borde)",
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
                className="label"
                style={{
                  color: pathname === s.href ? "var(--verde)" : undefined,
                  borderBottom:
                    pathname === s.href
                      ? "1px solid var(--verde)"
                      : "1px solid transparent",
                  paddingBottom: "2px",
                }}
              >
                {s.texto}
              </Link>
            ))}
          </nav>

          <Link href="/" aria-label="Harper — Inicio">
            <Logo alto={22} />
          </Link>

          <div style={{ justifySelf: "end" }}>
            <Link href="/carrito" className="label" style={{ color: "var(--verde)" }}>
              Carrito
              {listo && unidades > 0 ? ` (${unidades})` : ""}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
