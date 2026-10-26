"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useCarrito } from "./carrito/CarritoContexto";

/** Si todavía no hay catálogo (Airtable caído al armar la página), las de siempre. */
const POR_DEFECTO = [
  { nombre: "Anteojos", slug: "anteojos" },
  { nombre: "Estuches", slug: "estuches" },
  { nombre: "Paños", slug: "panos" },
];

export default function Header({
  anuncios = [],
  categorias,
}: {
  /** Los mensajes de la barra verde (lib/anuncios.ts). Uno queda fijo; varios pasan. */
  anuncios?: string[];
  /** Las categorías con productos publicados, en orden (lib/categorias.ts). */
  categorias?: { nombre: string; slug: string }[];
}) {
  const secciones = (categorias && categorias.length > 0 ? categorias : POR_DEFECTO).map((c) => ({
    href: `/${c.slug}`,
    texto: c.nombre,
  }));
  const { unidades, listo } = useCarrito();
  const pathname = usePathname();

  return (
    <>
      {anuncios.length === 1 ? (
        <div className="anuncios">
          <p className="anuncios__fijo">{anuncios[0]}</p>
        </div>
      ) : anuncios.length > 1 ? (
        // Pasan de derecha a izquierda, en una cinta que se repite: la segunda
        // copia es solo para que la vuelta no tenga un hueco.
        <div className="anuncios" style={{ "--anuncios-duracion": `${anuncios.length * 7}s` } as React.CSSProperties}>
          <div className="anuncios__pista">
            <ul className="anuncios__grupo">
              {anuncios.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <ul className="anuncios__grupo" aria-hidden="true">
              {anuncios.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
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
        <div className="contenedor cabecera__barra">
          <nav aria-label="Categorías" className="cabecera__nav" data-muchas={secciones.length > 3 || undefined}>
            {secciones.map((s) => (
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

          <Link href="/" aria-label="Harper — Inicio" className="logo-enlace cabecera__marca">
            <Logo alto={22} prioridad />
          </Link>

          <div className="cabecera__carrito">
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
