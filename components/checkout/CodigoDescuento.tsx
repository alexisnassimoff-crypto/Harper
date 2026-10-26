"use client";

import { useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { buscarCupon, mensajeDelCupon, type CuponResuelto } from "@/lib/cupones";

/**
 * El código de descuento del checkout: discreto, en el resumen.
 *
 * Si el cupón ya se aplicó en la ficha, aparece aplicado. Va dentro del
 * formulario de compra, así que no es un <form>: Enter aplica el código y no
 * envía el pedido.
 */
export default function CodigoDescuento({ estado }: { estado: CuponResuelto | null }) {
  const { cupon, aplicarCupon, quitarCupon } = useCarrito();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function aplicar() {
    const encontrado = buscarCupon(codigo);
    if (!encontrado) {
      setError(codigo.trim() ? "Ese código no es válido." : "Escribí el código.");
      return;
    }
    setError(null);
    setCodigo("");
    aplicarCupon(encontrado.codigo);
  }

  if (cupon) {
    const aviso = estado && estado.codigo === cupon && estado.estado !== "aplicado" ? mensajeDelCupon(estado) : null;
    return (
      <div className="codigo-descuento">
        <span className="codigo-descuento__etiqueta">Código de descuento</span>
        <p className="cupon__ok" role="status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {aviso ? cupon : `${cupon} aplicado`}
          <button type="button" className="cupon__quitar" onClick={quitarCupon}>
            Quitar
          </button>
        </p>
        {aviso ? <p className="cupon__nota">{aviso}</p> : null}
      </div>
    );
  }

  return (
    <div className="codigo-descuento">
      <label className="codigo-descuento__etiqueta" htmlFor="codigo-descuento">
        Código de descuento
      </label>
      <div className="cupon__form">
        <div className="cupon__campo" data-error={Boolean(error)}>
          <input
            id="codigo-descuento"
            value={codigo}
            placeholder="HARPER10"
            onChange={(e) => {
              setCodigo(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
              }
            }}
            aria-invalid={Boolean(error)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            style={{ paddingRight: "1rem" }}
          />
        </div>
        <button type="button" className="cupon__aplicar" onClick={aplicar}>
          Aplicar
        </button>
      </div>
      {error ? (
        <small className="cupon__error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
