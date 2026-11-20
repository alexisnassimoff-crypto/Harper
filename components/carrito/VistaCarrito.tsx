"use client";

import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import { desglosar } from "@/lib/resumen";
import OfertaCantidad from "@/components/producto/OfertaCantidad";
import OfertaDuo from "@/components/producto/OfertaDuo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { mensajesDelDuo, notaEnvioGratisDelDuo } from "@/lib/promocion-anteojos";
import FilasDescuento from "./FilasDescuento";
import type { Categoria } from "@/lib/tipos";
import { useCarrito } from "./CarritoContexto";
import { useCarritoResuelto } from "./useCarritoResuelto";
import CuotasDelCarrito from "./CuotasDelCarrito";
import CreditoQueSuma from "./CreditoQueSuma";
import LineaCarrito from "./LineaCarrito";
import SugerenciasCarrito from "./SugerenciasCarrito";
import AyudaWhatsApp from "@/components/checkout/AyudaWhatsApp";
import CodigoDescuento from "@/components/checkout/CodigoDescuento";
import { buscarCupon } from "@/lib/cupones";
import { envioEnElCarrito } from "@/lib/envio-gratis";

/**
 * La página del carrito: los productos, el resumen con «Finalizar compra» y
 * las sugerencias. Ale, 18/11/2026: tener cuenta Harper no cambia nada del
 * resumen. No hay renglón de cupón de bienvenida ni envío gratis por estar
 * suscripto: la nota del envío es la de cualquier compra.
 */
export default function VistaCarrito({ whatsapp = "" }: { whatsapp?: string }) {
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
  // El envío gratis se mide sobre la misma base que el servidor (sin el cupón
  // y antes del Dúo) y depende de la zona: acá todavía no hay dirección.
  const base = datos.subtotalSinCupon ?? datos.subtotal;
  const umbrales = { amba: datos.envioGratisAmbaDesde ?? 0, nacional: datos.envioGratisDesde };
  const envioSinAclarar = envioEnElCarrito(base, resumen.envio, umbrales);

  // Con el Dúo prendido (Tarea 07), lo que dice el servidor del Dúo; apagado, nada.
  const duo = datos.duo ? mensajesDelDuo(datos.duo, "carrito") : null;
  const notaDuo = notaEnvioGratisDelDuo({
    base,
    items: datos.items,
    umbral: resumen.envio === 0 ? umbrales.nacional : umbrales.amba,
    gratis: resumen.envio === 0 || envioSinAclarar.valor === "Gratis en AMBA",
  });
  // Con el Dúo aplicado y un mínimo sin alcanzar («Te faltan…», «Al resto del
  // país, gratis desde…»), la nota aclara que ese mínimo se cuenta antes del
  // descuento del Dúo (Ale, 18/11/2026). Si la nota del Dúo ya lo dice, no se
  // repite. Sin Dúo en ningún renglón, la nota es la de siempre.
  const envio = notaDuo ? envioSinAclarar : envioEnElCarrito(base, resumen.envio, umbrales, datos.items);

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
    // En el celular, una columna: los productos, el resumen con «Finalizar
    // compra» y recién después las sugerencias (antes el botón quedaba a casi
    // dos pantallas). Desde 41.5rem, dos columnas como siempre: productos y
    // sugerencias a la izquierda, el resumen a la derecha (globals.css).
    <div className="carrito-vista">
      <div className="pila carrito-vista__items">
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
      </div>

      <aside className="panel carrito-vista__resumen" aria-busy={actualizando} data-actualizando={actualizando || undefined}>
        <h2 className="label">Resumen</h2>

        {/* El cupón aplicado en la ficha, con la opción de quitarlo. El campo
            para escribir un código está en el checkout. */}
        {cupon ? <CodigoDescuento estado={datos.cupon ?? null} /> : null}

        {/* La cuenta se lee de arriba abajo: lista − descuento + envío = total. */}
        <Fila etiqueta="Subtotal" valor={formatearPrecio(resumen.lista)} />

        <FilasDescuento ahorro={resumen.descuento} items={datos.items} cupon={datos.cupon} />
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

        {/* La nota del envío, la misma con cuenta o sin cuenta (Ale, 18/11/2026). */}
        {envio.nota ? (
          <p className="apagado" style={{ fontSize: "0.8125rem" }}>
            {envio.nota}
          </p>
        ) : null}
        {notaDuo ? (
          <p className="apagado" style={{ fontSize: "0.8125rem" }}>
            {notaDuo}
          </p>
        ) : null}

        <div className="fila fila--total">
          <span>{envio.total}</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(resumen.total - resumen.envio)}</strong>
        </div>
        {/* Debajo del total: las cuotas confirmadas para ese importe (las mismas
            para todos) y lo que cuesta con dinero en Mercado Pago. */}
        <CuotasDelCarrito datos={datos} monto={resumen.total - resumen.envio} />
        {/* El Crédito Harper que suma esta compra (Ale, 18/11/2026), con
            tarjeta o Mercado Pago: solo si el servidor lo mandó. */}
        <CreditoQueSuma monto={datos.creditoPrevisto?.mercadoPago} />

        <Link href="/checkout" className="boton boton--bloque">
          Finalizar compra
        </Link>
        {/* En celular, con el botón ya en la primera pantalla, el WhatsApp
            flotante lo tapaba: se guarda y la consulta queda acá. */}
        <AyudaWhatsApp numero={whatsapp} />
      </aside>

      <SugerenciasCarrito sugerencias={datos.sugerencias ?? []} />
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
