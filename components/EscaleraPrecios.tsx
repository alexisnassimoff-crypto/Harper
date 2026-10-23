"use client";

import { conDescuento, type Tramo } from "@/lib/descuentos";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Categoria } from "@/lib/tipos";

/**
 * La escalera de precios por cantidad.
 *
 * Los tramos existían pero eran una línea de texto: acá se VEN. Cada escalón
 * muestra el precio unitario que se desbloquea, el alcanzado queda pintado, y
 * una barra de progreso avanza hacia el siguiente. La idea es que agrandar el
 * pedido se sienta como un juego, no como una tabla de condiciones.
 *
 * Para los anteojos, el primer escalón es LA oferta: el segundo par. Por eso
 * se enuncia completa —total de los dos, ahorro y precio por par— antes de que
 * el segundo esté en el carrito, que es cuando se decide.
 *
 * Solo presentación: los precios reales los decide el servidor en
 * `resolverCarrito`, con estos mismos tramos. Acá no se calcula nada que
 * después se cobre.
 */
export default function EscaleraPrecios({
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
  const escalones = tramos
    .filter((t) => t.categoria === categoria)
    .sort((a, b) => a.desdeUnidades - b.desdeUnidades);

  if (escalones.length === 0) return null;

  const cantidad = Math.max(0, cantidadActual);
  const proximo = escalones.find((t) => cantidad < t.desdeUnidades) ?? null;
  const ultimo = escalones[escalones.length - 1];

  // Los anteojos se cuentan en pares; lo demás, en unidades.
  const esPar = categoria === "Anteojos";
  const unidad = (n: number) => (esPar ? (n === 1 ? "par" : "pares") : n === 1 ? "unidad" : "unidades");

  // La barra reparte un ancho igual por pieza (el precio de lista más un
  // escalón por tramo). Se llena una fracción por pieza alcanzada, más el
  // avance proporcional hacia el próximo escalón.
  const piezas = escalones.length + 1;
  const alcanzadas =
    (cantidad >= 1 ? 1 : 0) +
    escalones.filter((t) => cantidad >= t.desdeUnidades).length;

  const base = [...escalones].reverse().find((t) => cantidad >= t.desdeUnidades);
  const desde = base?.desdeUnidades ?? 1;
  const progreso =
    proximo && cantidad >= 1
      ? Math.min(1, Math.max(0, (cantidad - desde) / (proximo.desdeUnidades - desde)))
      : 0;

  const llenado = ((alcanzadas + progreso) / piezas) * 100;

  // La oferta del primer escalón, enunciada completa mientras no se alcanzó.
  const primero = escalones[0];
  const oferta =
    cantidad < primero.desdeUnidades
      ? {
          unidades: primero.desdeUnidades,
          unitario: conDescuento(precioLista, primero.porcentaje),
          total: conDescuento(precioLista, primero.porcentaje) * primero.desdeUnidades,
          ahorro: (precioLista - conDescuento(precioLista, primero.porcentaje)) * primero.desdeUnidades,
        }
      : null;

  return (
    <div className="escalera" aria-label="Descuentos por cantidad">
      <p className="escalera__titulo">
        {proximo ? (
          cantidad === 0 ? (
            <>Llevá más, pagá menos</>
          ) : (
            <>
              Sumá {proximo.desdeUnidades - cantidad} {unidad(proximo.desdeUnidades - cantidad)} más y pagás{" "}
              <strong>{formatearPrecio(conDescuento(precioLista, proximo.porcentaje))}</strong>{" "}
              por {unidad(1)}
            </>
          )
        ) : (
          <>Estás en el mejor precio: {ultimo.porcentaje}% off</>
        )}
      </p>

      {oferta ? (
        <p className="escalera__oferta">
          {oferta.unidades} {unidad(oferta.unidades)} por{" "}
          <strong>{formatearPrecio(oferta.total)}</strong>
          <span className="escalera__ahorro">ahorrás {formatearPrecio(oferta.ahorro)}</span>
        </p>
      ) : null}

      <div className="escalera__tramos">
        <div className="escalera__pieza" data-alcanzado={cantidad >= 1 || undefined}>
          <span className="escalera__cantidad">1</span>
          <span className="escalera__precio">{formatearPrecio(precioLista)}</span>
        </div>

        {escalones.map((t) => (
          <div
            key={t.desdeUnidades}
            className="escalera__pieza"
            data-alcanzado={cantidad >= t.desdeUnidades || undefined}
            data-proximo={t === proximo || undefined}
          >
            <span className="escalera__cantidad">{t.desdeUnidades}+</span>
            <span className="escalera__precio">
              {formatearPrecio(conDescuento(precioLista, t.porcentaje))}
            </span>
            <span className="escalera__off">−{t.porcentaje}%</span>
          </div>
        ))}
      </div>

      <div className="escalera__barra" aria-hidden="true">
        <div
          className="escalera__relleno"
          style={{ width: `${cantidad === 0 ? 0 : Math.min(100, llenado)}%` }}
        />
      </div>
    </div>
  );
}
