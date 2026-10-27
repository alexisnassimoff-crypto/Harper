"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { buscarCupon, CUPON_BIENVENIDA, mensajeDelCupon, precioConCupon, type CuponResuelto } from "@/lib/cupones";
import { precio as formatearPrecio } from "@/lib/formato";

/**
 * El beneficio de primera compra, integrado en la ficha (nunca un pop-up).
 *
 * Se aplica con un toque: queda guardado en el carrito y llega así al
 * checkout, sin volver a escribirlo. El ahorro que se muestra es el de este
 * producto, con la misma cuenta que usa el servidor al cobrar. Si el carrito
 * ya tiene una promoción mejor (no se suman), no se promete ningún ahorro:
 * se dice que se aplica la otra.
 */
export default function CuponBienvenida({
  precio,
  estadoServidor,
  compra = null,
}: {
  precio: number;
  /** Lo que el servidor resolvió para el carrito actual (null si está vacío). */
  estadoServidor: CuponResuelto | null;
  /**
   * En la portada, lo que pasa con el cupón en la compra elegida (un pack de
   * varios pares, quizá con estuche), con la misma cuenta del carrito
   * (lib/packs.ts): si se aplica, cuánto ahorra y cuánto se paga en total; si
   * no, qué promoción se aplica en su lugar. Sin esto (la ficha), una unidad.
   * "carrito": el carrito ya tiene otros productos, así que lo que pase con
   * el cupón depende de todo el carrito y recién lo sabe el checkout.
   */
  compra?: { conCupon: boolean; porcentaje: number; ahorro: number; total: number } | "carrito" | null;
}) {
  const { cupon, aplicarCupon, quitarCupon, listo } = useCarrito();
  const [codigo, setCodigo] = useState(CUPON_BIENVENIDA.codigo);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // Al aplicar o quitar se reemplaza el control que tenía el foco: se lo
  // lleva al control equivalente del nuevo estado.
  const [enfocar, setEnfocar] = useState<"quitar" | "campo" | null>(null);
  const botonQuitar = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const aplicado = listo && cupon === CUPON_BIENVENIDA.codigo;
  const delCarrito = compra === "carrito";
  const deLaCompra = compra && compra !== "carrito" ? compra : null;
  const conCupon = deLaCompra ? deLaCompra.total : precioConCupon(precio);
  const ahorro = deLaCompra ? deLaCompra.ahorro : precio - conCupon;
  const otraPromocion = delCarrito
    ? false
    : deLaCompra
      ? aplicado && !deLaCompra.conCupon
      : aplicado && estadoServidor?.codigo === cupon && estadoServidor.estado !== "aplicado";
  const notaOtraPromocion = !otraPromocion
    ? null
    : deLaCompra
      ? `En esta compra se aplica el ${deLaCompra.porcentaje}% OFF por cantidad: ${cupon} no se suma.`
      : mensajeDelCupon(estadoServidor!);
  const notaDelCarrito = `En el checkout se aplica si es la mejor promoción para todo tu carrito.`;

  useEffect(() => {
    if (enfocar === "quitar") botonQuitar.current?.focus();
    if (enfocar === "campo") campo.current?.focus();
    if (enfocar) setEnfocar(null);
  }, [enfocar]);

  function aplicar(evento: FormEvent) {
    evento.preventDefault();
    const encontrado = buscarCupon(codigo);
    if (!encontrado) {
      setError("Ese código no es válido.");
      return;
    }
    setError(null);
    aplicarCupon(encontrado.codigo);
    setEnfocar("quitar");
  }

  function quitar() {
    quitarCupon();
    setCodigo(CUPON_BIENVENIDA.codigo);
    setEnfocar("campo");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(CUPON_BIENVENIDA.codigo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles, el código igual está a la vista.
    }
  }

  return (
    <section className="cupon" aria-label="Beneficio de primera compra">
      <p className="cupon__titulo">
        <IconoEtiqueta />
        {CUPON_BIENVENIDA.porcentaje}% OFF en tu primera compra
      </p>
      <p className="cupon__texto">
        ¿Es tu primera vez en Harper? Usá <strong>{CUPON_BIENVENIDA.codigo}</strong> y aprovechá un{" "}
        {CUPON_BIENVENIDA.porcentaje}% de descuento.
      </p>

      {aplicado ? (
        <div className="cupon__aplicado">
          <p className="cupon__ok">
            {otraPromocion ? null : <IconoCheck />}
            {otraPromocion ? cupon : `${cupon} aplicado`}
            <button ref={botonQuitar} type="button" className="cupon__quitar" onClick={quitar}>
              Quitar
            </button>
          </p>
          {delCarrito ? (
            <p className="cupon__nota">{notaDelCarrito}</p>
          ) : otraPromocion ? (
            <p className="cupon__nota">{notaOtraPromocion}</p>
          ) : (
            <>
              <p className="cupon__ahorro">
                Ahorrás {formatearPrecio(ahorro)} · Pagás <strong>{formatearPrecio(conCupon)}</strong>
              </p>
              <p className="cupon__nota">Queda aplicado en el carrito y en el checkout.</p>
            </>
          )}
        </div>
      ) : (
        <form className="cupon__form" onSubmit={aplicar} noValidate>
          <div className="cupon__campo" data-error={Boolean(error)}>
            <input
              ref={campo}
              id="cupon-ficha"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
                setError(null);
              }}
              aria-label="Código de descuento"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "cupon-ficha-error" : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="cupon__copiar" onClick={copiar} aria-label="Copiar el código">
              {copiado ? <IconoCheck /> : <IconoCopiar />}
            </button>
          </div>
          <button type="submit" className="cupon__aplicar">
            Aplicar
          </button>
        </form>
      )}
      {error ? (
        <small id="cupon-ficha-error" className="cupon__error" role="alert">
          {error}
        </small>
      ) : null}
      {!aplicado ? <p className="cupon__nota">Válido en la primera compra. No se suma a otras promociones.</p> : null}

      {/* Un solo aviso, siempre presente, para que los lectores de pantalla
          oigan el resultado de aplicar, quitar o copiar. */}
      <p className="visualmente-oculto" role="status" aria-live="polite">
        {copiado
          ? "Código copiado."
          : aplicado
            ? delCarrito
              ? `${cupon} aplicado. ${notaDelCarrito}`
              : otraPromocion
                ? notaOtraPromocion
                : `${cupon} aplicado. Ahorrás ${formatearPrecio(ahorro)}.`
            : ""}
      </p>
    </section>
  );
}

function IconoEtiqueta() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function IconoCopiar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
