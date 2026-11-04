/**
 * Los números de un título, en Raleway. Melodrama, la letra de los títulos,
 * tiene el cero tachado («1Ø%»), y los precios y las cifras van siempre en
 * Raleway (Ale, 03/11/2026). «$ 10.000 de bienvenida» → la cifra en Raleway y
 * el resto en Melodrama. Sin nada de cliente: sirve en el servidor y en el
 * navegador.
 */
const CIFRA = /(\$\s?\d[\d.,]*|\d[\d.,:]*\s?%?)/;

export default function Cifras({ children }: { children: string }) {
  return (
    <>
      {children.split(CIFRA).map((parte, i) =>
        i % 2 === 1 ? (
          <span key={i} className="cifra">
            {parte}
          </span>
        ) : (
          parte
        )
      )}
    </>
  );
}
