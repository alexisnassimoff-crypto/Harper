"use client";

import { renglonesDeDireccion, type DireccionGuardada } from "@/lib/mis-datos";
import { TEXTOS } from "@/lib/textos";

const TD = TEXTOS.suscriptores.cuenta.misDatos.direcciones;

/**
 * Las direcciones guardadas en Mi cuenta, en el checkout (Ale, 05/11/2026):
 * con la sesión de suscriptor abierta, se elige una con un toque y el
 * formulario queda completo. El envío se cotiza igual que con cualquier
 * dirección: el servidor no confía en nada de esto.
 */
export default function DireccionesGuardadas({
  lista,
  enUso,
  onUsar,
  bloqueado,
}: {
  lista: DireccionGuardada[];
  /** La que está puesta en el formulario, si es una de estas. */
  enUso: string | null;
  onUsar: (direccion: DireccionGuardada) => void;
  bloqueado: boolean;
}) {
  return (
    <fieldset className="direcciones-checkout">
      <legend className="direcciones-checkout__titulo">{TD.checkout}</legend>
      <ul className="direcciones-checkout__lista">
        {lista.map((d) => {
          const [uno, dos] = renglonesDeDireccion(d);
          const elegida = enUso === d.id;
          return (
            <li key={d.id}>
              <button
                type="button"
                className="direcciones-checkout__opcion"
                aria-pressed={elegida}
                disabled={bloqueado}
                onClick={() => onUsar(d)}
              >
                <span className="direcciones-checkout__marca" aria-hidden="true">
                  {elegida ? "✓" : ""}
                </span>
                <span className="direcciones-checkout__texto">
                  <strong>
                    {d.alias || uno}
                    {d.principal ? <span className="direccion-guardada__principal">{TD.principal}</span> : null}
                  </strong>
                  {d.alias ? <span>{uno}</span> : null}
                  <span className="apagado">{dos}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
