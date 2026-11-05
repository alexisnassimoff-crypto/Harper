"use client";

import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import { desglosar } from "@/lib/resumen";
import { TEXTOS } from "@/lib/textos";
import OfertaCantidad from "@/components/producto/OfertaCantidad";
import OfertaDuo from "@/components/producto/OfertaDuo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { mensajesDelDuo, notaEnvioGratisDelDuo } from "@/lib/promocion-anteojos";
import FilasDescuento from "./FilasDescuento";
import type { Categoria } from "@/lib/tipos";
import { useCarrito } from "./CarritoContexto";
import { useCarritoResuelto } from "./useCarritoResuelto";
import CuotasDelCarrito from "./CuotasDelCarrito";
import LineaCarrito from "./LineaCarrito";
import SugerenciasCarrito from "./SugerenciasCarrito";
import CodigoDescuento from "@/components/checkout/CodigoDescuento";
import { buscarCupon } from "@/lib/cupones";
import { envioEnElCarrito } from "@/lib/envio-gratis";

export default function VistaCarrito() {
  const { items: guardados, cupon } = useCarrito();
  const { datos, cargando, actualizando, error, recargar } = useCarritoResuelto({ cuotas: true });

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
  // El envío gratis se mide sin el cupón, como en el servidor, y depende de
  // la zona: acá todavía no hay dirección.
  const envio = envioEnElCarrito(datos.subtotalSinCupon ?? datos.subtotal, resumen.envio, {
    amba: datos.envioGratisAmbaDesde ?? 0,
    nacional: datos.envioGratisDesde,
  });

  // Con el Dúo prendido (Tarea 07), lo que dice el servidor del Dúo; apagado, nada.
  const duo = datos.duo ? mensajesDelDuo(datos.duo, "carrito") : null;
  const notaDuo = notaEnvioGratisDelDuo({
    base: datos.subtotalSinCupon ?? datos.subtotal,
    items: datos.items,
    umbral: resumen.envio === 0 ? datos.envioGratisDesde : (datos.envioGratisAmbaDesde ?? 0),
    gratis: resumen.envio === 0 || envio.valor === "Gratis en AMBA",
  });

  // Unidades y descuento aplicado por categoría, para la línea del segundo par.
  const porCategoria = new Map<Categoria, { unidades: number; precioLista: number; descuento: number }>();
  for (const item of datos.items) {
    const actual = porCategoria.get(item.categoria) ?? { unidades: 0, precioLista: item.precioLista, descuento: 0 };
    actual.unidades += item.cantidad;
    actual.precioLista = Math.min(actual.precioLista, item.precioLista);
    actual.descuento = Math.max(actual.descuento, item.descuento);
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
            <LineaCarrito key={item.varianteId} item={item} actualizando={actualizando} />
          ))}
        </ul>

        <SugerenciasCarrito sugerencias={datos.sugerencias ?? []} />
      </div>

      <aside className="panel" aria-busy={actualizando} data-actualizando={actualizando || undefined}>
        <h2 className="label">Resumen</h2>

        {/* El cupón aplicado en la ficha, con la opción de quitarlo. El campo
            para escribir un código está en el checkout. */}
        {cupon ? <CodigoDescuento estado={datos.cupon ?? null} /> : null}

        {/* La cuenta se lee de arriba abajo: lista − descuento + envío = total. */}
        <Fila etiqueta="Subtotal" valor={formatearPrecio(resumen.lista)} />

        <FilasDescuento ahorro={resumen.descuento} items={datos.items} cupon={datos.cupon} />
        {/* El cupón de bienvenida del suscriptor, en su renglón (el saldo se elige en el checkout). */}
        {resumen.cupon > 0 ? (
          <div className="fila" style={{ color: "var(--verde)" }}>
            <span>{TEXTOS.suscriptores.checkoutCaja.cupon}</span>
            <span>−{formatearPrecio(resumen.cupon)}</span>
          </div>
        ) : null}
        {/* El envío se cotiza en el checkout con la dirección (Envia): acá no
            se anuncia un precio que puede cambiar, salvo cuando es gratis. */}
        <Fila etiqueta="Envío a domicilio" valor={envio.valor} />

        {/* Solo la promoción del segundo par, en una línea. Sin tabla de
            tramos: el descuento que corresponda ya se ve en la fila de arriba. */}
        {/* Con el Dúo: su línea, y la del tramo solo si con otro par conviene el tramo. */}
        {duo ? <OfertaDuo lineas={[duo.siguiente]} /> : null}
        {[...porCategoria.entries()].filter(([categoria]) => !duo || duo.tramos || !esCategoriaDeAnteojos(categoria)).map(([categoria, info]) => (
          <OfertaCantidad
            key={categoria}
            tramos={datos.tramos}
            categoria={categoria}
            precioLista={info.precioLista}
            cantidadEnCarrito={info.unidades}
            descuentoAplicado={info.descuento}
            variante="carrito"
            cuponPorcentaje={datos.cupon?.estado === "aplicado" ? (buscarCupon(datos.cupon.codigo)?.porcentaje ?? 0) : 0}
          />
        ))}

        {envio.nota || datos.suscriptor ? (
          <p className="apagado" style={{ fontSize: "0.8125rem" }}>
            {datos.suscriptor ? TEXTOS.suscriptores.envioGratis : envio.nota}
          </p>
        ) : null}
        {notaDuo && !datos.suscriptor ? (
          <p className="apagado" style={{ fontSize: "0.8125rem" }}>
            {notaDuo}
          </p>
        ) : null}

        <div className="fila fila--total">
          <span>{envio.total}</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(resumen.total - resumen.envio)}</strong>
        </div>
        {/* Las cuotas para este total (Ale, 05/11/2026): hasta 3, o hasta 6 para suscriptores. */}
        <CuotasDelCarrito datos={datos} monto={resumen.total - resumen.envio} />

        <Link href="/checkout" className="boton boton--bloque">
          Finalizar compra
        </Link>
      </aside>
    </div>
  );
}

export function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="fila">
      <span className="apagado">{etiqueta}</span>
      <span>{valor}</span>
    </div>
  );
}
