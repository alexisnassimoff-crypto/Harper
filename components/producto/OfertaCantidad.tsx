"use client";

import { ofertaPorCantidad, type Tramo } from "@/lib/descuentos";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Categoria } from "@/lib/tipos";

/**
 * La promoción por cantidad, en una línea, para la ficha.
 *
 * En la ficha va solo la oferta que le importa a quien compra para sí (en
 * anteojos, el segundo par); la escalera completa, con todos los tramos, está
 * en el carrito. Los precios y porcentajes son los de siempre: los mismos
 * tramos de Airtable y la misma cuenta que usa el servidor para cobrar.
 */
export default function OfertaCantidad({
  tramos,
  categoria,
  precioLista,
  cantidadActual,
}: {
  tramos: Tramo[];
  categoria: Categoria;
  precioLista: number;
  /** Unidades de esta categoría que ya están en el carrito. */
  cantidadActual: number;
}) {
  const oferta = ofertaPorCantidad(tramos, categoria, precioLista, cantidadActual);
  if (!oferta) return null;

  // Los anteojos se cuentan en pares; lo demás, en unidades.
  const esPar = categoria === "Anteojos";
  const unidad = (n: number) => (esPar ? (n === 1 ? "par" : "pares") : n === 1 ? "unidad" : "unidades");
  const cadaUno = esPar ? "cada par" : "cada unidad";

  if (oferta.estado === "alcanzada") {
    return (
      <p className="oferta-cantidad">
        <span className="oferta-cantidad__linea">
          Tu carrito ya tiene <strong>{oferta.porcentaje}% off</strong> en {cadaUno}.
        </span>
      </p>
    );
  }

  const sumaYa = oferta.faltan < oferta.unidades;

  return (
    <div className="oferta-cantidad">
      <p className="oferta-cantidad__linea">
        {sumaYa ? (
          <>
            Sumá {oferta.faltan} {unidad(oferta.faltan)} más y llevás {oferta.unidades} por{" "}
            <strong>{formatearPrecio(oferta.total)}</strong>
          </>
        ) : (
          <>
            Llevá {oferta.unidades} {unidad(oferta.unidades)} por <strong>{formatearPrecio(oferta.total)}</strong>
          </>
        )}
        <span className="escalera__ahorro">Ahorrás {formatearPrecio(oferta.ahorro)}</span>
      </p>
      <p className="oferta-cantidad__detalle">
        {formatearPrecio(oferta.unitario)} {cadaUno}, con el {oferta.porcentaje}% off aplicado en el carrito.
      </p>
    </div>
  );
}
