"use client";

import { useEffect, useRef, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { buscarCupon, mensajeDelCupon, type CuponResuelto } from "@/lib/cupones";

/**
 * El código de descuento del checkout: discreto, en el resumen.
 *
 * Si el cupón ya se aplicó en la ficha o en la portada, aparece aplicado y
 * no se pide nada. Si no, es solo un enlace («¿Tenés un código de
 * descuento?») que abre el campo: nadie tiene que aplicarlo dos veces ni ver
 * un casillero que parece pedirlo. Va dentro del formulario de compra, así
 * que no es un <form>: Enter aplica el código y no envía el pedido.
 */
export default function CodigoDescuento({ estado }: { estado: CuponResuelto | null }) {
  const { cupon, aplicarCupon, quitarCupon } = useCarrito();
  const [codigo, setCodigo] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Al aplicar o quitar se reemplaza el control con foco: se lo lleva al nuevo.
  const [enfocar, setEnfocar] = useState<"quitar" | "campo" | null>(null);
  const botonQuitar = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (enfocar === "quitar") botonQuitar.current?.focus();
    if (enfocar === "campo") campo.current?.focus();
    if (enfocar) setEnfocar(null);
  }, [enfocar]);

  function aplicar() {
    const encontrado = buscarCupon(codigo);
    if (!encontrado) {
      setError(codigo.trim() ? "Ese código no es válido." : "Escribí el código.");
      return;
    }
    setError(null);
    setCodigo("");
    aplicarCupon(encontrado.codigo);
    setEnfocar("quitar");
  }

  function quitar() {
    quitarCupon();
    setAbierto(true);
    setEnfocar("campo");
  }

  const aviso = cupon && estado && estado.codigo === cupon && estado.estado !== "aplicado" ? mensajeDelCupon(estado) : null;

  return (
    <div className="codigo-descuento">
      {cupon ? (
        <>
          <span className="codigo-descuento__etiqueta">Código de descuento</span>
          <p className="cupon__ok">
            {aviso ? null : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {aviso ? cupon : `${cupon} aplicado`}
            <button ref={botonQuitar} type="button" className="cupon__quitar" onClick={quitar}>
              Quitar
            </button>
          </p>
          {aviso ? <p className="cupon__nota">{aviso}</p> : null}
        </>
      ) : !abierto ? (
        <button
          type="button"
          className="enlace-accion codigo-descuento__abrir"
          onClick={() => {
            setAbierto(true);
            setEnfocar("campo");
          }}
        >
          ¿Tenés un código de descuento?
        </button>
      ) : (
        <>
          <label className="codigo-descuento__etiqueta" htmlFor="codigo-descuento">
            Código de descuento
          </label>
          <div className="cupon__form">
            <div className="cupon__campo" data-error={Boolean(error)}>
              <input
                ref={campo}
                id="codigo-descuento"
                value={codigo}
                placeholder="Tu código"
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
                aria-describedby={error ? "codigo-descuento-error" : undefined}
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
            <small id="codigo-descuento-error" className="cupon__error" role="alert">
              {error}
            </small>
          ) : null}
        </>
      )}
      <p className="visualmente-oculto" role="status" aria-live="polite">
        {cupon ? (aviso ?? `${cupon} aplicado.`) : ""}
      </p>
    </div>
  );
}
