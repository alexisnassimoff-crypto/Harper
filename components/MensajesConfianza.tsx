import Link from "next/link";
import type { Confianza } from "@/lib/confianza";

/**
 * Los mensajes de confianza, en dos formas:
 *
 *  - `tira`: una franja horizontal debajo del hero de la portada.
 *  - `lista`: renglones apilados debajo del botón de compra de la ficha.
 *
 * Los textos los arma `mensajesDeConfianza` en el servidor a partir de Config
 * y de la política de cambios; acá solo se dibujan.
 */
export default function MensajesConfianza({
  mensajes,
  variante = "lista",
}: {
  mensajes: Confianza[];
  variante?: "tira" | "lista";
}) {
  if (mensajes.length === 0) return null;

  return (
    <ul className={`confianza confianza--${variante}`} aria-label="Condiciones de compra">
      {mensajes.map((m) => {
        const contenido = (
          <>
            <span className="confianza__icono" aria-hidden="true">
              <Icono clave={m.clave} />
            </span>
            <span className="confianza__texto">
              <span>{m.texto}</span>
              {m.detalle ? <small>{m.detalle}</small> : null}
            </span>
          </>
        );

        return (
          <li key={m.clave} className="confianza__item">
            {m.href ? (
              <Link href={m.href} className="confianza__enlace">
                {contenido}
              </Link>
            ) : (
              contenido
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Íconos de línea, trazados a mano para heredar el verde de la marca. */
function Icono({ clave }: { clave: Confianza["clave"] }) {
  const base = {
    viewBox: "0 0 24 24",
    width: 22,
    height: 22,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (clave) {
    case "pago":
      return (
        <svg {...base}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19M6.5 15h3" />
        </svg>
      );
    case "cuotas":
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M8.5 15.5l7-7M9 9.5h.01M15 14.5h.01" />
        </svg>
      );
    case "envio":
      return (
        <svg {...base}>
          <path d="M2.5 7h11v9h-11zM13.5 10h4.2l3.8 3.4V16h-8z" />
          <circle cx="6.5" cy="17.5" r="1.6" />
          <circle cx="17" cy="17.5" r="1.6" />
        </svg>
      );
    case "cambios":
      return (
        <svg {...base}>
          <path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5M20 4v4.5h-4.5" />
          <path d="M20 12a8 8 0 0 1-13.6 5.7L4 15.5M4 20v-4.5h4.5" />
        </svg>
      );
  }
}
