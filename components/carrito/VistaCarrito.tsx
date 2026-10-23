"use client";

import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import { desglosar } from "@/lib/resumen";
import EscaleraPrecios from "@/components/EscaleraPrecios";
import type { Categoria } from "@/lib/tipos";
import { useCarrito } from "./CarritoContexto";
import { useCarritoResuelto } from "./useCarritoResuelto";
import SugerenciasCarrito from "./SugerenciasCarrito";

export default function VistaCarrito() {
  const { cambiarCantidad, quitar, items: guardados } = useCarrito();
  const { datos, cargando, actualizando, error, recargar } = useCarritoResuelto();

  if (cargando && !datos) {
    return <p className="apagado">Cargando el carrito…</p>;
  }

  // Sin datos y con error: el carrito del comprador sigue en su navegador,
  // solo no pudimos ponerle precios. Se ofrece reintentar, nunca se vacía.
  if (error && !datos) {
    return (
      <div className="pila" style={{ gap: "1rem", alignItems: "flex-start" }}>
        <p className="apagado">
          No pudimos cargar los precios de tu carrito
          {guardados.length > 0 ? ` (${guardados.length} ${guardados.length === 1 ? "producto" : "productos"} guardados)` : ""}.
        </p>
        <button type="button" className="boton boton--fantasma" onClick={recargar}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!datos || datos.items.length === 0) {
    return (
      <div className="pila" style={{ gap: "1.5rem", alignItems: "flex-start" }}>
        <p className="apagado">Tu carrito está vacío.</p>
        <Link href="/" className="boton">
          Ver productos
        </Link>
      </div>
    );
  }

  const resumen = desglosar(datos);
  const faltaParaGratis = datos.envioGratisDesde - datos.subtotal;

  // Unidades por categoría, para la escalera de precios.
  const porCategoria = new Map<Categoria, { unidades: number; precioLista: number }>();
  for (const item of datos.items) {
    const actual = porCategoria.get(item.categoria) ?? {
      unidades: 0,
      precioLista: item.precioLista,
    };
    actual.unidades += item.cantidad;
    // El precio de referencia de la escalera: el más barato de la categoría.
    actual.precioLista = Math.min(actual.precioLista, item.precioLista);
    porCategoria.set(item.categoria, actual);
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "3rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(18rem, 100%), 1fr))",
        alignItems: "start",
      }}
    >
      {/* Los ítems y las sugerencias van en la misma columna: la grilla reparte
          columnas entre sus hijos directos, y el resumen tiene que quedar solo
          en la suya. */}
      <div className="pila" style={{ gap: "2rem" }}>
        {error ? (
          <p className="aviso-carrito" role="status">
            No pudimos actualizar los precios. Mostramos lo último que vimos.{" "}
            <button type="button" className="enlace-verde aviso-carrito__accion" onClick={recargar}>
              Reintentar
            </button>
          </p>
        ) : null}

        <ul
          className="pila"
          style={{ gap: "1.5rem", listStyle: "none", margin: 0, padding: 0 }}
          aria-busy={actualizando}
          data-actualizando={actualizando || undefined}
        >
          {datos.items.map((item) => (
            <li
              key={item.varianteId}
              style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}
            >
              <div
                className="tarjeta__marco"
                style={{ width: "5.5rem", aspectRatio: "1 / 1", flexShrink: 0 }}
              >
                {item.foto ? (
                  <Image
                    src={item.foto}
                    alt={item.nombre}
                    fill
                    sizes="88px"
                    style={{ objectFit: "contain", padding: "5px" }}
                  />
                ) : null}
              </div>

              <div className="pila" style={{ gap: "0.35rem", flex: 1 }}>
                <Link href={`/producto/${item.productoSlug}`}>
                  <strong style={{ fontWeight: 500 }}>{item.nombre}</strong>
                </Link>
                <span className="apagado" style={{ fontSize: "0.8125rem" }}>
                  {item.color}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {/* Un +/− en vez del desplegable: sumar una unidad es un solo
                      toque, y con los descuentos por cantidad queremos que
                      agrandar el pedido cueste lo menos posible. */}
                  <div className="contador">
                    <button
                      type="button"
                      className="contador__boton"
                      onClick={() => cambiarCantidad(item.varianteId, item.cantidad - 1)}
                      disabled={item.cantidad <= 1 || actualizando}
                      aria-label={`Quitar una unidad de ${item.nombre}`}
                    >
                      −
                    </button>
                    <span className="contador__valor" aria-live="polite">
                      <span className="solo-lectores">Cantidad de {item.nombre}: </span>
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      className="contador__boton"
                      onClick={() => cambiarCantidad(item.varianteId, item.cantidad + 1)}
                      disabled={item.cantidad >= Math.min(item.stockDisponible, 20) || actualizando}
                      aria-label={`Sumar una unidad de ${item.nombre}`}
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => quitar(item.varianteId)}
                    className="enlace-suave"
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      fontSize: "0.8125rem",
                      textDecoration: "underline",
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <div style={{ textAlign: "right", fontSize: "0.9375rem" }}>
                {item.descuento > 0 ? (
                  <div
                    className="apagado"
                    style={{ fontSize: "0.8125rem", textDecoration: "line-through" }}
                  >
                    {formatearPrecio(item.precioLista * item.cantidad)}
                  </div>
                ) : null}
                <span>{formatearPrecio(item.subtotal)}</span>
                {item.descuento > 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "var(--verde)" }}>
                    −{item.descuento}%
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <SugerenciasCarrito sugerencias={datos.sugerencias ?? []} />
      </div>

      <aside className="panel" aria-busy={actualizando} data-actualizando={actualizando || undefined}>
        <h2 className="label">Resumen</h2>

        {/* La cuenta se lee de arriba abajo: lista − descuento + envío = total. */}
        <Fila etiqueta="Subtotal" valor={formatearPrecio(resumen.lista)} />

        {resumen.descuento > 0 ? (
          <div className="fila" style={{ color: "var(--verde)" }}>
            <span>Descuento por cantidad</span>
            <span>−{formatearPrecio(resumen.descuento)}</span>
          </div>
        ) : null}
        <Fila
          etiqueta={datos.envioCotizado ? "Envío" : "Envío a domicilio"}
          valor={resumen.envio === 0 ? "Gratis" : formatearPrecio(resumen.envio)}
        />

        {[...porCategoria.entries()].map(([categoria, info]) => (
          <EscaleraPrecios
            key={categoria}
            tramos={datos.tramos}
            categoria={categoria}
            precioLista={info.precioLista}
            cantidadActual={info.unidades}
          />
        ))}

        {resumen.envio > 0 && faltaParaGratis > 0 ? (
          <p className="apagado" style={{ fontSize: "0.8125rem" }}>
            Te faltan {formatearPrecio(faltaParaGratis)} para el envío gratis.
          </p>
        ) : null}

        <div className="fila fila--total">
          <span>Total</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(resumen.total)}</strong>
        </div>

        <Link href="/checkout" className="boton boton--bloque">
          Finalizar compra
        </Link>
      </aside>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="fila">
      <span className="apagado">{etiqueta}</span>
      <span>{valor}</span>
    </div>
  );
}
