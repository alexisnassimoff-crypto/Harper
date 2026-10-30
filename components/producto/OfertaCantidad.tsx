"use client";

import { nombreDelTramo, ofertaDeEscala, ofertaPorCantidad, type Tramo } from "@/lib/descuentos";
import { precio as formatearPrecio } from "@/lib/formato";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import type { Categoria } from "@/lib/tipos";

/**
 * La promoción por cantidad, en una sola línea y solo para anteojos: el
 * segundo par. Nada de tablas ni tramos mayores (se siguen aplicando en el
 * servidor, sin publicitarlos).
 *
 * - En la ficha, sin nada en el carrito: "Llevá 2 pares y obtenés 5% off en
 *   cada uno" y lo que queda este par.
 * - Con un par en el carrito (ficha o carrito): "Sumá otro par…".
 * - Con el descuento ya aplicado por el servidor: la ficha lo confirma; el
 *   carrito no dice nada más (el descuento ya se ve en el resumen).
 */
export default function OfertaCantidad({
  tramos,
  categoria,
  precioLista,
  cantidadEnCarrito,
  descuentoAplicado,
  variante = "ficha",
  cuponPorcentaje = 0,
}: {
  tramos: Tramo[];
  categoria: Categoria;
  precioLista: number;
  /** Unidades de esta categoría que ya están en el carrito. */
  cantidadEnCarrito: number;
  /** El mayor descuento que el servidor aplicó a esta categoría. */
  descuentoAplicado: number;
  variante?: "ficha" | "carrito";
  /**
   * El porcentaje del cupón que tiene aplicado el visitante (0 si no). Las
   * promociones no se suman: si el cupón da lo mismo o más, esta no se
   * anuncia, porque no le daría nada más.
   */
  cuponPorcentaje?: number;
}) {
  if (!esCategoriaDeAnteojos(categoria)) return null;

  // Con la escala «llevá 3, pagá 2 · llevá 5, pagá 3»: cuánto falta para el
  // próximo escalón (en la ficha, las opciones ya la cuentan).
  const escala = ofertaDeEscala(tramos, categoria, cantidadEnCarrito);
  if (escala) {
    if (cuponPorcentaje > 0) return null;
    const { actual, siguiente } = escala;
    if (!siguiente) {
      return actual && descuentoAplicado > 0 ? (
        <p className="oferta-cantidad">
          <strong>{nombreDelTramo({ desdeUnidades: actual.lleva, paga: actual.paga, porcentaje: 0 })}</strong> aplicado.
        </p>
      ) : null;
    }
    if (cantidadEnCarrito < 1) return null;
    const gratis = siguiente.lleva - siguiente.paga;
    const premio = gratis === 1 ? (siguiente.faltan === 1 ? "te lo llevás gratis" : "uno te sale gratis") : `te llevás ${gratis} gratis`;
    return (
      <p className="oferta-cantidad">
        {siguiente.faltan === 1 ? "Sumá otro par" : `Sumá ${siguiente.faltan} pares más`} y <strong>{premio}</strong>.
      </p>
    );
  }

  const oferta = ofertaPorCantidad(tramos, categoria, precioLista, cantidadEnCarrito, descuentoAplicado);
  if (!oferta) return null;
  if (cuponPorcentaje > 0 && (oferta.estado === "aplicada" || oferta.porcentaje <= cuponPorcentaje)) return null;

  if (oferta.estado === "aplicada") {
    return variante === "ficha" ? (
      <p className="oferta-cantidad">Tu carrito ya tiene el descuento por llevar más de un par.</p>
    ) : null;
  }

  const pares = (n: number) => (n === 1 ? "par" : "pares");

  if (oferta.faltan < oferta.unidades) {
    return (
      <p className="oferta-cantidad">
        Sumá {oferta.faltan === 1 ? "otro par" : `${oferta.faltan} ${pares(oferta.faltan)} más`} y obtenés{" "}
        <strong>{oferta.porcentaje}% off</strong> en {oferta.unidades === 2 ? "los dos" : "cada uno"}.
      </p>
    );
  }

  // El carrito nunca llega acá con 0 unidades de la categoría; la ficha sí.
  return (
    <p className="oferta-cantidad">
      Llevá {oferta.unidades} {pares(oferta.unidades)} y obtenés <strong>{oferta.porcentaje}% off</strong> en cada
      uno.{" "}
      <span className="oferta-cantidad__detalle">Este par queda en {formatearPrecio(oferta.unitario)}.</span>
    </p>
  );
}
