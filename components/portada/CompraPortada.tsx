"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useAvisoCookiesAbierto } from "@/components/AvisoCookies";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import ConsultaGraduados from "@/components/producto/ConsultaGraduados";
import CtaFija from "@/components/producto/CtaFija";
import CuponBienvenida from "@/components/producto/CuponBienvenida";
import Galeria from "@/components/producto/Galeria";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { parrafosDe } from "@/lib/descripcion";
import { buscarCupon, CUPON_BIENVENIDA } from "@/lib/cupones";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { conDescuento, type Tramo } from "@/lib/descuentos";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { fotosDeGaleria } from "@/lib/galeria";
import { netoDe, type ImpuestosNacionales } from "@/lib/impuestos";
import {
  armarPack,
  CANTIDADES_PACK,
  nombrePack,
  PACK_RECOMENDADO,
  paresDisponibles,
  repartirColores,
  type Pack,
} from "@/lib/packs";
import { trackAgregarVarios, trackPixel } from "@/lib/pixel";
import type { Producto } from "@/lib/tipos";
import { indiceVarianteInicial } from "@/lib/variantes";
import type { Garantia } from "@/lib/portada";
import Estrellas, { formatearPuntaje } from "./Estrellas";
import { Garantias } from "./SeccionesPortada";

/**
 * La compra del modelo estrella, arriba de todo en la portada: la galería,
 * los packs de 1, 2 o 4 pares con un color para cada par, el estuche
 * opcional y el botón. Arriba, los modelos: arranca en el modelo estrella y
 * se puede pasar a cualquier otro sin salir de la portada.
 *
 * Los precios salen de lib/packs.ts, con la misma cuenta que el carrito; el
 * carrito igual los vuelve a calcular en el servidor al cobrar. Las cuotas se
 * anuncian solo para un total que Mercado Pago confirmó (`cuotasPorTotal`).
 */
export default function CompraPortada({
  modelos,
  modeloInicial,
  tramos,
  cuotasPorTotal,
  impuestos,
  envioGratisDesde,
  estuche,
  calificacion,
  garantias,
  whatsapp,
}: {
  /** Los anteojos con stock, el estrella primero. */
  modelos: Producto[];
  /** El slug del modelo con el que abre (Config.portada_producto). */
  modeloInicial: string;
  tramos: Tramo[];
  /** Cuotas sin interés confirmadas por Mercado Pago, por total exacto. */
  cuotasPorTotal: Record<string, CuotasVerificadas>;
  impuestos: ImpuestosNacionales;
  envioGratisDesde: number;
  /** El estuche que se ofrece sumar, o null si no hay. */
  estuche: Producto | null;
  /**
   * Las opiniones de todos los anteojos Harper (no solo de este modelo: así
   * se dice), resumidas; null si no hay. Salen de Mercado Libre, pero no se
   * lo nombra.
   */
  calificacion: { promedio: number; total: number } | null;
  garantias: Garantia[];
  whatsapp: string | null;
}) {
  const router = useRouter();
  const { items, agregar, cupon, listo } = useCarrito();
  const { datos: carritoResuelto } = useCarritoResuelto();
  const [enTransicion, iniciarTransicion] = useTransition();

  const [slug, setSlug] = useState(modeloInicial);
  const producto = modelos.find((m) => m.slug === slug) ?? modelos[0];
  const variantes = producto.variantes;
  const inicial = useMemo(() => indiceVarianteInicial(producto), [producto]);
  const maximo = paresDisponibles(variantes);

  const [cantidad, setCantidad] = useState<number>(() => (maximo >= PACK_RECOMENDADO ? PACK_RECOMENDADO : 1));
  // Lo que eligió el visitante para cada par; lo que falta lo completa
  // `repartirColores` con un color distinto por par, sin pasarse del stock.
  const [deseados, setDeseados] = useState<(number | undefined)[]>([]);
  const [parActivo, setParActivo] = useState(0);
  const [conEstuche, setConEstuche] = useState(false);
  const [colorEstuche, setColorEstuche] = useState(() => (estuche ? indiceVarianteInicial(estuche) : 0));
  const [agregado, setAgregado] = useState(false);

  const colores = useMemo(
    () => repartirColores(variantes, cantidad, deseados, inicial),
    [variantes, cantidad, deseados, inicial]
  );

  // La galería muestra el color del último par que se tocó.
  const varianteVista = variantes[colores[Math.min(parActivo, cantidad - 1)]] ?? variantes[inicial];
  // La foto de portada del color (al sol y adentro) va primera.
  const fotos = useMemo(() => fotosDeGaleria(varianteVista), [varianteVista]);

  // HARPER10, si está aplicado: cada pack se calcula con la misma regla que
  // el carrito (el cupón o la promoción por cantidad, la que convenga).
  const cuponPorcentaje = buscarCupon(cupon)?.porcentaje ?? 0;
  const base = { precio: producto.precio, tramos, categoria: producto.categoria, cuponPorcentaje };
  const packs = CANTIDADES_PACK.map((c) => armarPack({ ...base, cantidad: c }));
  const extra = estuche ? { precio: estuche.precio, categoria: estuche.categoria } : null;
  const conElEstuche = armarPack({ ...base, cantidad, extra });
  const compra = conEstuche ? conElEstuche : armarPack({ ...base, cantidad });

  // "Mejor precio por par" solo si de verdad lo es: el único con el par más barato.
  const masBarato = Math.min(...packs.map((p) => p.precioUnitario));
  const mejorPorPar = packs.filter((p) => p.precioUnitario === masBarato).length === 1 ? masBarato : null;

  const varianteEstuche = estuche?.variantes[colorEstuche] ?? null;
  const cuotas = cuotasPorTotal[String(compra.total)] ?? null;
  const conDineroMP = conDescuento(compra.total, PORCENTAJE_DINERO_MP);
  const envioGratis = (pack: Pack) => envioGratisDesde > 0 && pack.totalParaEnvio >= envioGratisDesde;

  // Res. SIyC 4/2025: el precio sin impuestos nacionales de lo que se compra.
  const netoPares = netoDe(impuestos, producto.categoria, compra.precioUnitario * cantidad);
  const netoEstuche =
    conEstuche && estuche && compra.precioExtra !== null ? netoDe(impuestos, estuche.categoria, compra.precioExtra) : 0;
  const neto = netoPares === null || netoEstuche === null ? null : Math.round((netoPares + netoEstuche) * 100) / 100;

  const sinStock = colores.some((c) => c < 0) || (conEstuche && (!varianteEstuche || varianteEstuche.agotada));
  const caracteristicas = caracteristicasDe(producto);
  const parrafos = parrafosDe(producto.descripcion);

  // Las variantes elegidas, agrupadas: dos pares negros son un renglón de 2.
  function lineas() {
    const porColor = new Map<number, number>();
    for (const c of colores) if (c >= 0) porColor.set(c, (porColor.get(c) ?? 0) + 1);
    const pares = [...porColor].map(([i, n]) => ({
      productoSlug: producto.slug,
      varianteId: variantes[i].id,
      sku: variantes[i].sku,
      cantidad: n,
      precioUnitario: compra.precioUnitario,
    }));
    if (!conEstuche || !estuche || !varianteEstuche || compra.precioExtra === null) return pares;
    return [
      ...pares,
      {
        productoSlug: estuche.slug,
        varianteId: varianteEstuche.id,
        sku: varianteEstuche.sku,
        cantidad: 1,
        precioUnitario: compra.precioExtra,
      },
    ];
  }

  function sumar(aSumar: ReturnType<typeof lineas>) {
    for (const l of aSumar) agregar({ productoSlug: l.productoSlug, varianteId: l.varianteId, cantidad: l.cantidad });
    trackAgregarVarios({ items: aSumar, nombre: `${producto.nombre} · ${nombrePack(cantidad)}` });
  }

  function agregarAlCarrito() {
    sumar(lineas());
    setAgregado(true);
  }

  function comprarAhora() {
    // Si el pack ya está en el carrito —porque tocó "Agregar" antes— no se
    // suma otra vez: se completa solo lo que falta para tenerlo.
    const enCarrito = new Map<string, number>();
    for (const i of items) enCarrito.set(i.varianteId, (enCarrito.get(i.varianteId) ?? 0) + i.cantidad);
    const faltan = lineas()
      .map((l) => ({ ...l, cantidad: l.cantidad - (enCarrito.get(l.varianteId) ?? 0) }))
      .filter((l) => l.cantidad > 0);
    sumar(faltan);
    iniciarTransicion(() => router.push("/checkout"));
  }

  function elegirModelo(nuevo: Producto) {
    if (nuevo.slug === producto.slug) return;
    setSlug(nuevo.slug);
    // Cada modelo arranca con sus colores; la cantidad se mantiene si alcanza
    // el stock del nuevo, y si no, el pack más grande que se pueda armar.
    const disponibles = paresDisponibles(nuevo.variantes);
    setCantidad((c) => (c <= disponibles ? c : ([...CANTIDADES_PACK].reverse().find((n) => n <= disponibles) ?? 1)));
    setDeseados([]);
    setParActivo(0);
    setAgregado(false);
    trackPixel("ViewContent", {
      content_ids: [nuevo.variantes[indiceVarianteInicial(nuevo)]?.sku ?? nuevo.slug],
      content_type: "product",
      content_name: nuevo.nombre,
      value: nuevo.precio,
      currency: "ARS",
    });
  }

  function elegirPack(nueva: number) {
    setCantidad(nueva);
    setParActivo((p) => Math.min(p, nueva - 1));
    setAgregado(false);
  }

  function elegirColor(par: number, indice: number) {
    // Los colores que ya se ven quedan fijos: cambiar uno no mueve los otros.
    setDeseados((previos) => {
      const nuevos = [...previos];
      colores.forEach((c, i) => {
        if (c >= 0) nuevos[i] = c;
      });
      nuevos[par] = indice;
      return nuevos;
    });
    setParActivo(par);
    setAgregado(false);
  }

  // Si el carrito ya tiene algo más que este pack (otro modelo, otro color o
  // más unidades), "Comprar ahora" lo suma: el total ya no es el del pack, y
  // se avisa en vez de mostrar un precio que el checkout no va a cobrar.
  const enElPack = new Map<string, number>();
  for (const l of lineas()) enElPack.set(l.varianteId, l.cantidad);
  const conOtrosProductos = listo && items.some((i) => i.cantidad > (enElPack.get(i.varianteId) ?? 0));

  // Los colores que quedan con pocas unidades, una sola vez cada uno.
  const conPocas = [...new Set(colores.filter((c) => c >= 0))]
    .map((i) => variantes[i])
    .filter((v) => v.stock <= 5);

  // La barra fija de compra aparece cuando el bloque de botones sale de
  // pantalla, y se va cuando vuelve: nunca hay dos botones a la vista.
  const bloqueCompra = useRef<HTMLDivElement>(null);
  const [compraEnPantalla, setCompraEnPantalla] = useState(true);
  const avisoCookies = useAvisoCookiesAbierto();

  useEffect(() => {
    const nodo = bloqueCompra.current;
    if (!nodo || typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(
      (entradas) => setCompraEnPantalla(entradas.some((e) => e.isIntersecting)),
      { threshold: 0.2 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return (
    <div className={modelos.length > 1 ? "contenedor portada-compra" : "contenedor portada-compra portada-compra--un-modelo"}>
      {/* Los modelos, arriba de todo: se ve de entrada que no hay uno solo. */}
      {modelos.length > 1 ? (
        <div className="modelos surge">
          <p className="label">{modelos.length} modelos · Elegí el tuyo</p>
          <div className="modelos__lista" role="group" aria-label="Modelo">
            {modelos.map((m) => (
              <button
                key={m.slug}
                type="button"
                className="modelo"
                aria-pressed={m.slug === producto.slug}
                onClick={() => elegirModelo(m)}
              >
                <span className="modelo__foto">
                  {m.fotoPrincipal ? (
                    // Las fotos de frente tienen mucho margen blanco: recortadas al
                    // ancho, los anteojos se ven del tamaño de la tarjeta.
                    <Image src={m.fotoPrincipal} alt="" fill sizes="120px" style={{ objectFit: "cover" }} />
                  ) : null}
                </span>
                <span className="modelo__nombre">{m.nombre}</span>
                <span className="modelo__colores" aria-hidden="true">
                  {m.variantes
                    .filter((v) => !v.agotada)
                    .map((v) => (
                      <span key={v.id} style={{ background: v.colorHex }} />
                    ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* En celular, el nombre va arriba de la foto: se ve qué es y cuántas
          opiniones tiene sin bajar. En escritorio, arriba de la compra. */}
      <div className="pila surge portada-compra__titulo">
        {calificacion ? (
          <a href="#opiniones" className="calificacion">
            <Estrellas puntaje={calificacion.promedio} />
            <span>
              {formatearPuntaje(calificacion.promedio)} · {calificacion.total.toLocaleString("es-AR")}{" "}
              {calificacion.total === 1 ? "opinión" : "opiniones"} de anteojos Harper
            </span>
          </a>
        ) : null}
        <span className="label">{producto.categoria}</span>
        <h1 className="portada-compra__nombre">{producto.nombre}</h1>
      </div>

      <div className="pila surge portada-compra__galeria" style={{ gap: "0.75rem" }}>
        <Galeria
          fotos={fotos}
          videos={producto.videos}
          poster={producto.fotoPrincipal}
          alt={`${producto.nombre} — ${varianteVista.color}`}
        />
      </div>

      <div className="pila surge surge-1 ficha-producto__datos portada-compra__datos">
        {caracteristicas ? (
          <ul className="caracteristicas" aria-label="Características">
            {caracteristicas.lista.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}

        {/* El cupón habla de la compra elegida (el pack), no de un par suelto. */}
        <CuponBienvenida
          precio={producto.precio}
          estadoServidor={carritoResuelto?.cupon ?? null}
          compra={
            conOtrosProductos
              ? "carrito"
              : { conCupon: compra.conCupon, porcentaje: compra.porcentaje, ahorro: compra.ahorro, total: compra.total }
          }
        />

        {/* ---------- Packs ---------- */}
        <fieldset className="packs">
          <legend className="label packs__titulo">Elegí cuántos pares</legend>
          {packs.map((pack) => {
            const disponible = pack.cantidad <= maximo;
            const etiqueta =
              pack.cantidad === PACK_RECOMENDADO
                ? "Recomendado"
                : pack.cantidad > 1 && pack.precioUnitario === mejorPorPar
                  ? "Mejor precio por par"
                  : null;
            const descuento =
              pack.porcentaje > 0
                ? pack.conCupon
                  ? `${pack.porcentaje}% OFF con ${CUPON_BIENVENIDA.codigo}`
                  : `${pack.porcentaje}% OFF`
                : null;

            return (
              <label
                key={pack.cantidad}
                className="pack"
                data-elegido={pack.cantidad === cantidad || undefined}
                data-sin-stock={!disponible || undefined}
              >
                <input
                  type="radio"
                  name="pack"
                  className="pack__radio"
                  value={pack.cantidad}
                  checked={pack.cantidad === cantidad}
                  disabled={!disponible}
                  onChange={() => elegirPack(pack.cantidad)}
                />
                <span className="pack__cuerpo">
                  <span className="pack__nombre">
                    {nombrePack(pack.cantidad)}
                    {etiqueta && disponible ? <span className="pack__etiqueta">{etiqueta}</span> : null}
                  </span>
                  <span className="pack__detalle">
                    {!disponible
                      ? "Sin stock para este pack"
                      : [
                          pack.cantidad > 1 ? `${formatearPrecio(pack.precioUnitario)} c/u` : null,
                          descuento,
                          envioGratis(pack) ? "Envío gratis" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Precio por unidad"}
                  </span>
                </span>
                <span className="pack__precios">
                  <span className="pack__total">{formatearPrecio(pack.total)}</span>
                  {pack.ahorro > 0 ? <s className="pack__lista">{formatearPrecio(pack.lista)}</s> : null}
                </span>
              </label>
            );
          })}
        </fieldset>

        {/* ---------- Un color por par ---------- */}
        <div className="pares" role="group" aria-label={cantidad === 1 ? "Color" : "Color de cada par"}>
          <p className="label">{cantidad === 1 ? "Elegí el color" : "Elegí el color de cada par"}</p>
          {colores.map((elegido, par) => {
            // Cuántos de cada color piden los otros pares: no se ofrece más de lo que hay.
            const otros = new Map<number, number>();
            colores.forEach((c, i) => {
              if (i !== par && c >= 0) otros.set(c, (otros.get(c) ?? 0) + 1);
            });

            return (
              <div key={par} className="par" data-activo={(par === parActivo && cantidad > 1) || undefined}>
                <p className="par__titulo">
                  {cantidad > 1 ? `Par ${par + 1}: ` : ""}
                  <strong>{variantes[elegido]?.color ?? "Sin stock"}</strong>
                </p>
                <div className="par__colores">
                  {variantes.map((v, i) => {
                    const sinStock = v.agotada || v.stock <= (otros.get(i) ?? 0);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className="swatch swatch--chico"
                        aria-pressed={i === elegido}
                        aria-label={`${cantidad > 1 ? `Par ${par + 1}: ` : ""}${v.color}${sinStock ? ", sin stock" : ""}`}
                        title={sinStock ? `${v.color} — sin stock` : v.color}
                        disabled={sinStock}
                        onClick={() => elegirColor(par, i)}
                        style={{ background: v.colorHex, opacity: sinStock ? 0.35 : 1 }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ---------- El estuche, opcional ---------- */}
        {estuche && conElEstuche.precioExtra !== null ? (
          <div className="extra" data-elegido={conEstuche || undefined}>
            <label className="extra__opcion">
              <input
                type="checkbox"
                className="extra__casilla"
                checked={conEstuche}
                onChange={(e) => {
                  setConEstuche(e.target.checked);
                  setAgregado(false);
                }}
              />
              {varianteEstuche?.fotos[0] ? (
                <span className="extra__foto">
                  <Image src={varianteEstuche.fotos[0]} alt="" fill sizes="56px" style={{ objectFit: "contain" }} />
                </span>
              ) : null}
              <span className="extra__texto">
                <span className="extra__nombre">Sumá el estuche {estuche.nombre}</span>
                {primeraOracion(estuche.descripcion) ? (
                  <span className="extra__detalle">{primeraOracion(estuche.descripcion)}</span>
                ) : null}
              </span>
              <span className="extra__precio">
                + {formatearPrecio(conElEstuche.precioExtra)}
                {conElEstuche.precioExtra < estuche.precio ? <s>{formatearPrecio(estuche.precio)}</s> : null}
              </span>
            </label>
            {conEstuche ? (
              <div className="par par--extra">
                <p className="par__titulo">
                  Estuche: <strong>{varianteEstuche?.color}</strong>
                </p>
                <div className="par__colores">
                  {estuche.variantes.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      className="swatch swatch--chico"
                      aria-pressed={i === colorEstuche}
                      aria-label={`Estuche: ${v.color}${v.agotada ? ", sin stock" : ""}`}
                      title={v.agotada ? `${v.color} — sin stock` : v.color}
                      disabled={v.agotada}
                      onClick={() => {
                        setColorEstuche(i);
                        setAgregado(false);
                      }}
                      style={{ background: v.colorHex, opacity: v.agotada ? 0.35 : 1 }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Total y compra ---------- */}
        <div className="resumen-pack">
          <p className="resumen-pack__fila">
            <span className="resumen-pack__total">{formatearPrecio(compra.total)}</span>
            {compra.ahorro > 0 ? <s className="resumen-pack__lista">{formatearPrecio(compra.lista)}</s> : null}
            {compra.ahorro > 0 ? (
              <span className="resumen-pack__ahorro">Ahorrás {formatearPrecio(compra.ahorro)}</span>
            ) : null}
          </p>
          {neto !== null ? (
            <small className="precio-sin-impuestos">Precio sin impuestos nacionales: {precioConCentavos(neto)}</small>
          ) : null}
          {cuotas ? (
            <>
              <span className="resumen-pack__cuotas">
                {cuotas.cuotas} cuotas sin interés de {precioConCentavos(cuotas.montoCuota)}
              </span>
              <span className="cuotas-condiciones">
                Precio de contado {formatearPrecio(compra.total)} · CFTEA {cuotas.cftea} · {NOMBRE_MARCAS}
              </span>
            </>
          ) : null}
          <span className="resumen-pack__dinero">
            o <strong>{formatearPrecio(conDineroMP)}</strong> pagando con dinero en Mercado Pago{" "}
            <span className="resumen-pack__extra">{PORCENTAJE_DINERO_MP}% OFF extra</span>
          </span>
        </div>

        <div ref={bloqueCompra} className="pila" style={{ gap: "0.75rem" }}>
          {sinStock ? (
            <button type="button" className="boton boton--bloque" disabled>
              Sin stock para esta combinación
            </button>
          ) : (
            <>
              <button type="button" className="boton boton--bloque" onClick={comprarAhora} disabled={enTransicion}>
                {enTransicion
                  ? "Un momento…"
                  : conOtrosProductos
                    ? "Comprar ahora"
                    : `Comprar ahora · ${formatearPrecio(compra.total)}`}
              </button>
              <button type="button" className="boton boton--fantasma boton--bloque" onClick={agregarAlCarrito}>
                {agregado ? "Agregado al carrito" : "Agregar al carrito"}
              </button>
              {/* El aviso va siempre que el carrito tenga más que este pack,
                  también después de "Agregar" (por ejemplo, si se tocó dos veces). */}
              {conOtrosProductos ? (
                <p className="apagado" style={{ fontSize: "0.8125rem" }}>
                  Tu carrito ya tiene otros productos: se suman a esta compra y el total final lo ves en el checkout.{" "}
                  <Link href="/carrito" className="enlace-verde">
                    Ver el carrito
                  </Link>
                </p>
              ) : agregado ? (
                <Link href="/carrito" className="label enlace-verde" style={{ alignSelf: "center" }}>
                  Ver el carrito
                </Link>
              ) : null}
              {conPocas.map((v) => (
                <p key={v.id} className="apagado" style={{ fontSize: "0.8125rem" }}>
                  Quedan {v.stock} {v.stock === 1 ? "unidad" : "unidades"} en {v.color}.
                </p>
              ))}
            </>
          )}
        </div>

        {caracteristicas ? <ConsultaGraduados modelo={producto.nombre} whatsapp={whatsapp} /> : null}

        <Garantias garantias={garantias} />

        {parrafos.length > 0 ? (
          <section className="pila ficha-producto__bloque" aria-labelledby="portada-descripcion">
            <h2 id="portada-descripcion" className="label">
              Sobre {producto.nombre}
            </h2>
            <div className="descripcion">
              {parrafos.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Con otros productos en el carrito la barra no aparece: su precio sería
          el del pack, no el del checkout, y abajo hay grillas con otros
          botones de compra que se podrían confundir con este. */}
      <CtaFija
        visible={(!compraEnPantalla || avisoCookies) && !sinStock && !conOtrosProductos}
        nombre={`${producto.nombre} · ${nombrePack(cantidad)}${conEstuche && estuche ? ` + estuche ${estuche.nombre}` : ""}`}
        precio={formatearPrecio(compra.total)}
        detalle={cuotas ? `${cuotas.cuotas} cuotas de ${precioConCentavos(cuotas.montoCuota)} · CFTEA ${cuotas.cftea}` : null}
        ocupado={enTransicion}
        alComprar={comprarAhora}
      />
    </div>
  );
}

/** "Estuche rígido con cierre magnético en ecocuero premium. Estructura…" → la primera oración. */
function primeraOracion(texto: string | null | undefined): string {
  const limpio = (texto ?? "").trim();
  const fin = limpio.search(/\.(\s|$)/);
  return fin > 0 ? limpio.slice(0, fin + 1) : limpio;
}
