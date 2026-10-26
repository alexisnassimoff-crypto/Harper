"use client";

import { useState } from "react";

/**
 * Los datos para transferir, después de confirmar el pedido: el importe y la
 * cuenta, con un botón para copiar lo que se pega en el home banking.
 */
export default function DatosTransferencia({
  total,
  importe,
  filas,
}: {
  /** El importe ya escrito: "$ 72.819". */
  total: string;
  /** El importe en números, como se pega en el home banking. */
  importe: number;
  filas: [string, string][];
}) {
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(clave: string, valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(clave);
      window.setTimeout(() => setCopiado((actual) => (actual === clave ? null : actual)), 2000);
    } catch {
      // Sin portapapeles, el dato igual está a la vista.
    }
  }

  const copiables = new Set(["CBU", "Alias"]);

  return (
    <div className="datos-transferencia">
      <div className="datos-transferencia__importe">
        <div>
          <span className="label">Importe a transferir</span>
          <strong>{total}</strong>
        </div>
        <BotonCopiar etiqueta="el importe" copiado={copiado === "Importe"} onClick={() => copiar("Importe", String(importe))} />
      </div>
      <dl className="datos-transferencia__lista">
        {filas.map(([clave, valor]) => (
          <div key={clave}>
            <dt>{clave}</dt>
            <dd>
              <span>{valor}</span>
              {copiables.has(clave) ? (
                <BotonCopiar etiqueta={`el ${clave}`} copiado={copiado === clave} onClick={() => copiar(clave, valor)} />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="visualmente-oculto" role="status" aria-live="polite">
        {copiado ? `${copiado} copiado.` : ""}
      </p>
    </div>
  );
}

function BotonCopiar({ etiqueta, copiado, onClick }: { etiqueta: string; copiado: boolean; onClick: () => void }) {
  return (
    <button type="button" className="datos-transferencia__copiar" onClick={onClick} aria-label={`Copiar ${etiqueta}`}>
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}
