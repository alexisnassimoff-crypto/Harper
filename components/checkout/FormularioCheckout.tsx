"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import { componerDireccion, faltantes, type Faltante } from "@/lib/direcciones";
import {
  CONDICIONES_IVA,
  CONSUMIDOR_FINAL,
  normalizarFacturacion,
  validarFacturacion,
  type ErroresFacturacion,
  type Facturacion,
} from "@/lib/facturacion";
import { precio as formatearPrecio } from "@/lib/formato";
import { datosDeCompra, origenParaElPedido, trackPixel } from "@/lib/pixel";
import { desglosar } from "@/lib/resumen";
import type { DatosCliente, EleccionEnvio } from "@/lib/tipos";
import type { MedioPago } from "@/lib/transferencia";
import { validarCliente, type ErroresCliente } from "@/lib/validacion";
import BarraPagar, { TextoBotonPagar } from "./BarraPagar";
import CampoDireccion, { type DireccionElegida } from "./CampoDireccion";
import CodigoDescuento from "./CodigoDescuento";
import { PROVINCIAS } from "./provincias";
import { useCotizacionEnvio } from "./useEnvio";

const CLAVE_DATOS = "harper.datos.v1";
/** La dirección elegida en el buscador, con su piso: no hace falta buscarla otra vez. */
const CLAVE_DOMICILIO = "harper.domicilio.v1";
const ID_FORMULARIO = "formulario-checkout";

/** Lo que se guarda de la dirección elegida para la próxima compra. */
type DomicilioGuardado = { elegida: DireccionElegida; piso: string; numero: string };

/** Los errores del cliente y de la factura, más el del casillero de dirección (que no es un dato en sí). */
type Errores = ErroresCliente & ErroresFacturacion & { domicilio?: string };

/** Los datos de facturación tal como se completan. Por defecto, consumidor final. */
type DatosFactura = { aCuit: boolean; razonSocial: string; cuit: string; condicionIva: string; domicilioFiscal: string };
const FACTURA_VACIA: DatosFactura = { aCuit: false, razonSocial: "", cuit: "", condicionIva: "", domicilioFiscal: "" };

/** El orden en que aparecen los campos, por id, para llevar el foco al primer error. */
const ORDEN_CAMPOS = [
  "email",
  "nombre",
  "telefono",
  "dni",
  "domicilio",
  "numero",
  "piso",
  "direccion",
  "ciudad",
  "cp",
  "provincia",
  "facturaRazonSocial",
  "facturaCuit",
  "facturaCondicionIva",
  "facturaDomicilio",
  "aceptaTerminos",
] as const;

/** Lo que puede contestar /api/checkout. */
type RespuestaCheckout = {
  initPoint?: string;
  numero?: string;
  error?: string;
  errores?: ErroresCliente & ErroresFacturacion;
  descartados?: { varianteId: string; motivo: string }[];
  totalNuevo?: number;
  /** El cupón no corresponde (por ejemplo, no es la primera compra). */
  cuponRechazado?: string;
};

const VACIO: DatosCliente = {
  email: "",
  nombre: "",
  telefono: "",
  dni: "",
  direccion: "",
  ciudad: "",
  provincia: "",
  cp: "",
  // Sin marcar: el consentimiento para promociones lo da el comprador.
  aceptaPromos: false,
  // Sin marcar: la confirmación de edad y la aceptación de los Términos son
  // un sí explícito en cada compra.
  aceptaTerminos: false,
};

/**
 * El checkout, pensado para el celular: los datos que la logística necesita
 * para entregar (y ninguno más), autocompletado del navegador en cada campo,
 * los datos guardados para la próxima compra, el pedido resumido en una
 * línea arriba y el botón de pagar siempre a mano.
 *
 * La dirección es un solo casillero con sugerencias de Google: el comprador
 * elige una de la lista y de ahí salen calle, número, localidad, provincia y
 * código postal. Si Google no trae alguno (pasa con el CP en pueblos chicos, o
 * con una avenida elegida sin número), se pide solo ese dato. Sin Google
 * configurado, o si el comprador no encuentra su dirección, están los campos
 * de siempre.
 *
 * Solo hay envío a domicilio, a tarifa fija (o gratis desde el mínimo): no se
 * ofrecen sucursales ni servicios que todavía no existen.
 */
export default function FormularioCheckout({
  reintento = false,
  buscador = false,
  medioInicial = "mercadopago",
}: {
  /** Verdadero cuando vuelve de un pago rechazado: no es un checkout nuevo. */
  reintento?: boolean;
  /** Verdadero si el servidor tiene Google Places: la dirección se busca. */
  buscador?: boolean;
  /** Al volver de un pago rechazado por transferencia, sigue elegida. */
  medioInicial?: MedioPago;
}) {
  const { items, quitar, cupon, quitarCupon } = useCarrito();
  const {
    datos: carrito,
    cargando,
    actualizando,
    error: errorCarrito,
    recargar,
  } = useCarritoResuelto();

  const [form, setForm] = useState<DatosCliente>(VACIO);
  // Aparte de los del comprador: no se guardan para la próxima compra, así
  // que cada compra arranca como consumidor final.
  const [factura, setFactura] = useState<DatosFactura>(FACTURA_VACIA);
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  // Por defecto, Mercado Pago con cualquier medio, como siempre. La
  // transferencia (dinero en cuenta, 10% más) se elige acá.
  const [medioElegido, setMedioElegido] = useState<MedioPago>(medioInicial);
  const medioPago: MedioPago = medioElegido === "transferencia" && carrito?.transferencia ? "transferencia" : "mercadopago";

  // La dirección: con el buscador de Google o con los campos manuales.
  const [modoDireccion, setModoDireccion] = useState<"buscador" | "manual">(buscador ? "buscador" : "manual");
  const [elegida, setElegida] = useState<DireccionElegida | null>(null);
  // Lo que Google no trae y se pide aparte: el número de la calle, y el piso o
  // depto, que nunca forma parte de la sugerencia.
  const [numero, setNumero] = useState("");
  const [piso, setPiso] = useState("");
  const faltan: Faltante[] = elegida ? faltantes(elegida) : [];

  // Envío a domicilio. Si Correo Argentino cotiza (cuando esté configurado),
  // se toma la opción a domicilio más barata sin preguntar nada; si no, la
  // tarifa fija del carrito. Nunca se ofrecen sucursales ni servicios.
  const { cotizacion } = useCotizacionEnvio(form.cp);
  const opcionDomicilio =
    (cotizacion?.opciones ?? [])
      .filter((o) => o.modo === "D")
      .sort((a, b) => a.precio - b.precio)[0] ?? null;

  // El envío bonificado gana sobre cualquier cotización: el pedido llegó al
  // mínimo y lo paga Harper.
  const envio = cotizacion?.bonificado
    ? 0
    : (opcionDomicilio?.precio ?? cotizacion?.envio ?? carrito?.envio ?? 0);

  // Los dos precios vienen del servidor: cambiar de medio de pago no espera
  // ninguna consulta.
  const resumenMercadoPago = desglosar({
    subtotal: carrito?.subtotal ?? 0,
    ahorro: carrito?.ahorro ?? 0,
    envio,
  });
  const resumenTransferencia = carrito?.transferencia
    ? desglosar({
        subtotal: carrito.subtotal,
        ahorro: carrito.ahorro,
        ahorroTransferencia: carrito.transferencia.ahorro,
        envio,
      })
    : null;
  const resumen = medioPago === "transferencia" && resumenTransferencia ? resumenTransferencia : resumenMercadoPago;

  // Pre-carga los datos de una compra anterior: la comodidad de tener
  // cuenta, sin la fricción de crearla.
  const restaurado = useRef(false);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_DATOS);
      const previos = guardado ? (JSON.parse(guardado) as Partial<DatosCliente>) : null;
      if (previos) {
        // El consentimiento y la aceptación no se recuerdan: se preguntan cada vez.
        delete previos.aceptaPromos;
        delete previos.aceptaTerminos;
        setForm((f) => ({ ...f, ...previos }));
      }

      if (buscador) {
        const domicilio = window.localStorage.getItem(CLAVE_DOMICILIO);
        const previo = domicilio ? (JSON.parse(domicilio) as Partial<DomicilioGuardado>) : null;

        if (previo?.elegida?.id && previo.elegida.calle) {
          // La dirección ya elegida vuelve resuelta: ni se busca ni se paga otra vez.
          aplicarDireccion(previo.elegida, previo.numero ?? "");
          setPiso(previo.piso ?? "");
        } else if (previos?.direccion || previos?.ciudad) {
          // Una compra anterior con los campos manuales: se respeta tal cual.
          setModoDireccion("manual");
        }
      }
    } catch {
      // Sin datos guardados se arranca en blanco, que es lo normal.
    } finally {
      restaurado.current = true;
    }
    // Solo al montar: `buscador` no cambia en vida del formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La dirección elegida también se recuerda, con su piso y su número.
  useEffect(() => {
    if (!restaurado.current || modoDireccion !== "buscador") return;
    try {
      if (elegida) {
        const guardado: DomicilioGuardado = { elegida, piso, numero };
        window.localStorage.setItem(CLAVE_DOMICILIO, JSON.stringify(guardado));
      } else {
        window.localStorage.removeItem(CLAVE_DOMICILIO);
      }
    } catch {
      // Si no se puede guardar, la compra sigue igual.
    }
  }, [elegida, piso, numero, modoDireccion]);

  // Y se van guardando mientras escribe: si abandona y vuelve, no empieza de
  // cero. Sin el consentimiento, que no se recuerda.
  useEffect(() => {
    if (!restaurado.current) return;

    const id = window.setTimeout(() => {
      try {
        // La dirección se guarda como viaja, con el piso: si otro día el
        // buscador no está, el campo manual la muestra completa.
        const { aceptaPromos: _consentimiento, aceptaTerminos: _aceptacion, ...datos } = clienteAEnviar();
        if (Object.values(datos).some((v) => typeof v === "string" && v.trim() !== "")) {
          window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos));
        }
      } catch {
        // Si no se puede guardar, la compra sigue igual.
      }
    }, 400);

    return () => window.clearTimeout(id);
    // `clienteAEnviar` lee form, piso y modoDireccion: son las dependencias reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, piso, modoDireccion]);

  // Al volver de Mercado Pago con el botón "atrás", iOS Safari restaura la
  // página desde el cache con el estado anterior: el botón quedaba trabado en
  // "Redirigiendo…" para siempre. `pageshow` con `persisted` es ese caso.
  useEffect(() => {
    function alVolver(evento: PageTransitionEvent) {
      if (evento.persisted) setEnviando(false);
    }
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);

  // El email no se guarda mientras se escribe: recién al enviar el pedido.
  // Sin una base legal y el consentimiento que correspondan, quien no
  // terminó la compra no recibe campañas de recuperación ni promociones.

  // InitiateCheckout: una vez por visita al checkout, con el carrito ya
  // resuelto (valor e ítems reales). Ni con carrito vacío ni al volver de un
  // pago rechazado, que no es un checkout nuevo.
  const checkoutAvisado = useRef(false);

  useEffect(() => {
    if (checkoutAvisado.current || reintento) return;
    if (!carrito || carrito.items.length === 0) return;

    checkoutAvisado.current = true;
    trackPixel("InitiateCheckout", datosDeCompra({ items: carrito.items, valor: carrito.subtotal }));
  }, [carrito, reintento]);


  // Un aviso de error (por ejemplo, el cupón rechazado al pagar desde la barra
  // fija) se lleva a la franja visible: en celular quedaba fuera de pantalla.
  const avisoFallo = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const nodo = avisoFallo.current;
    if (fallo && nodo) requestAnimationFrame(() => mostrarEntreCapasFijas(nodo));
    // `mostrarEntreCapasFijas` solo mide el DOM: no es una dependencia real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallo]);

  function actualizar<K extends keyof DatosCliente>(campo: K, valor: DatosCliente[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  /**
   * Vuelca la dirección elegida en los datos del pedido. El número viene de la
   * sugerencia o, si Google no lo trajo, de lo que escribió el comprador.
   */
  function aplicarDireccion(d: DireccionElegida, numeroEscrito: string) {
    setElegida(d);
    setNumero(numeroEscrito);
    setForm((f) => ({
      ...f,
      direccion: componerDireccion({ calle: d.calle, numero: d.numero || numeroEscrito.trim() }),
      // Lo que Google no trajo no pisa lo que el comprador ya cargó a mano
      // (al restaurar, o al volver a aplicar la misma dirección). Después de
      // "Cambiar" esos campos están vacíos, así que nada viejo se arrastra.
      ciudad: d.localidad || f.ciudad,
      provincia: d.provincia || f.provincia,
      cp: d.cp || f.cp,
    }));
    setErrores((e) => ({ ...e, domicilio: undefined, direccion: undefined, ciudad: undefined, provincia: undefined, cp: undefined }));
  }

  /** El número que Google no trajo: solo cambia la calle y número del pedido. */
  function cambiarNumero(valor: string) {
    if (!elegida) return;
    setNumero(valor);
    setForm((f) => ({ ...f, direccion: componerDireccion({ calle: elegida.calle, numero: valor.trim() }) }));
    setErrores((e) => ({ ...e, direccion: undefined }));
  }

  /** Descarta la dirección elegida para buscar otra. */
  function cambiarDireccion() {
    setElegida(null);
    setNumero("");
    setForm((f) => ({ ...f, direccion: "", ciudad: "", provincia: "", cp: "" }));
  }

  /**
   * A los campos manuales, por decisión del comprador o porque Google no está.
   * Se lleva lo que ya tenía: la dirección resuelta con su piso, o lo que
   * venía tipeando en el casillero.
   */
  function cargarAMano(tipeado = "") {
    setModoDireccion("manual");
    setForm((f) => ({
      ...f,
      direccion: elegida ? (piso.trim() ? `${f.direccion}, ${piso.trim()}` : f.direccion) : tipeado.trim(),
    }));
    setElegida(null);
    setErrores((e) => ({ ...e, domicilio: undefined }));
    try {
      window.localStorage.removeItem(CLAVE_DOMICILIO);
    } catch {
      // Sin almacenamiento no hay nada que borrar.
    }
    window.setTimeout(() => document.getElementById("direccion")?.focus(), 0);
  }

  function eleccion(): EleccionEnvio | undefined {
    if (!opcionDomicilio) return undefined;
    return { modo: opcionDomicilio.modo, servicio: opcionDomicilio.servicio };
  }

  /**
   * Lleva el foco al primer campo con error, en el orden del formulario. Con
   * el buscador, los errores de calle, localidad, provincia o CP caen en el
   * casillero de dirección, salvo que ese dato se esté pidiendo aparte.
   */
  function enfocarPrimerError(encontrados: Errores) {
    const porCampo = encontrados as Partial<Record<(typeof ORDEN_CAMPOS)[number], string>>;
    for (const campo of ORDEN_CAMPOS) {
      if (!porCampo[campo]) continue;
      const id = campo === "direccion" && !document.getElementById("direccion") ? "numero" : campo;
      const nodo = document.getElementById(id) ?? document.getElementById("domicilio");
      if (nodo) {
        nodo.focus({ preventScroll: true });
        // Se mide en el cuadro siguiente, con el mensaje de error ya pintado.
        const bloque = nodo.closest<HTMLElement>(".checkout__legal, .campo") ?? nodo;
        requestAnimationFrame(() => mostrarEntreCapasFijas(bloque));
        return;
      }
    }
  }

  /**
   * Deja el campo con error a la vista, con su etiqueta y su mensaje. focus()
   * no desplaza si el campo "está en pantalla" aunque lo tapen el header, la
   * barra fija de pagar o el aviso de cookies: acá se mide la franja que de
   * verdad se ve y, si no entra, se lo centra en ella.
   */
  function mostrarEntreCapasFijas(bloque: HTMLElement) {
    // Se mide, se desplaza y se vuelve a medir: al bajar, la franja de
    // promoción se va y el header queda pegado arriba, y eso corre la franja
    // visible. Con dos o tres vueltas queda donde tiene que estar.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      if (!bloque.isConnected) return;
      const arriba = Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
      let abajo = window.innerHeight;
      for (const capa of document.querySelectorAll<HTMLElement>(".cta-fija, .cookies")) {
        const r = capa.getBoundingClientRect();
        if (r.height > 0 && r.top < abajo && r.bottom > arriba) abajo = r.top;
      }
      const { top, bottom } = bloque.getBoundingClientRect();
      if (top >= arriba && bottom <= abajo) return;
      const alto = bottom - top;
      const franja = abajo - arriba;
      // Si no entra entero, que se vea desde arriba (etiqueta y campo primero).
      const desplazar = alto > franja ? top - arriba - 8 : (top + bottom) / 2 - (arriba + abajo) / 2;
      if (Math.abs(desplazar) < 1) return;
      const antes = window.scrollY;
      window.scrollBy({ top: desplazar, behavior: "instant" });
      if (window.scrollY === antes) return; // Tope de la página: no hay más para mover.
    }
  }

  function actualizarFactura(cambios: Partial<DatosFactura>, campoConError?: keyof ErroresFacturacion) {
    setFactura((f) => ({ ...f, ...cambios }));
    if (campoConError) setErrores((e) => ({ ...e, [campoConError]: undefined }));
  }

  /** Los datos de facturación tal como viajan: los del titular solo si los eligió. */
  function facturacionAEnviar(): Facturacion {
    if (!factura.aCuit) return CONSUMIDOR_FINAL;
    const { aCuit: _elegida, ...datos } = factura;
    return { tipo: "cuit", ...datos };
  }

  /** Los datos del pedido tal como viajan: con el piso o depto en la dirección. */
  function clienteAEnviar(): DatosCliente {
    if (modoDireccion !== "buscador") return form;
    const extra = piso.trim();
    return { ...form, direccion: extra ? `${form.direccion}, ${extra}` : form.direccion };
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFallo(null);

    const cliente = clienteAEnviar();
    const facturacion = facturacionAEnviar();
    const encontrados: Errores = { ...validarCliente(cliente), ...validarFacturacion(normalizarFacturacion(facturacion)) };

    if (modoDireccion === "buscador") {
      if (!elegida) {
        // Sin una dirección elegida, los errores de sus partes son uno solo.
        delete encontrados.direccion;
        delete encontrados.ciudad;
        delete encontrados.provincia;
        delete encontrados.cp;
        encontrados.domicilio = "Elegí tu dirección de la lista";
      } else if (!elegida.numero && !numero.trim()) {
        encontrados.direccion = "Ingresá el número de la calle";
      }
    }

    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados);
      enfocarPrimerError(encontrados);
      return;
    }

    setEnviando(true);

    try {
      const { aceptaPromos: _consentimiento, aceptaTerminos: _aceptacion, ...datos } = clienteAEnviar();
      window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos));
    } catch {
      // Si no se puede guardar, la compra sigue igual.
    }

    try {
      const respuesta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Solo QUÉ eligió. El precio lo vuelve a cotizar el servidor: si acá
        // viajara un monto, cualquiera podría pagar $0 de envío. `totalVisto`
        // es lo que se le mostró: si el servidor calcula otra cosa, frena.
        body: JSON.stringify({
          cliente,
          items,
          envio: eleccion(),
          totalVisto: resumen.total,
          // De qué anuncio vino, para el pedido y para la Conversions API.
          origen: origenParaElPedido(),
          // Para emitir la factura. No va a Mercado Pago ni a Meta.
          facturacion,
          // Solo el código: cuánto descuenta lo calcula el servidor.
          cupon,
          // Solo cómo paga: el 10% de la transferencia también lo calcula el servidor.
          medioPago,
        }),
      });

      // Un 500 puede volver como página de error en HTML. Sin esta guarda,
      // `json()` explotaba y el cliente terminaba leyendo "Unexpected token '<'".
      const cuerpo: RespuestaCheckout = await respuesta.json().catch(() => ({}));

      // El servidor revalida con la misma función que el navegador, así que
      // si encontró algo que acá pasó, se pinta campo por campo.
      if (respuesta.status === 400 && cuerpo.errores) {
        setErrores(cuerpo.errores);
        setEnviando(false);
        enfocarPrimerError(cuerpo.errores);
        return;
      }

      // Algo se agotó mientras completaba los datos: se saca del carrito y se
      // le muestra el total nuevo antes de mandarlo a pagar.
      if (respuesta.status === 409 && cuerpo.descartados) {
        for (const d of cuerpo.descartados) quitar(d.varianteId);
        setFallo(cuerpo.error ?? "Tu carrito cambió: revisalo antes de pagar.");
        setEnviando(false);
        return;
      }

      // El cupón no corresponde (por ejemplo, ya hay una compra con ese email
      // o DNI): se quita, el carrito se recalcula solo y ve el total real
      // antes de pagar.
      if (respuesta.status === 409 && cuerpo.cuponRechazado) {
        quitarCupon();
        setFallo(`${cuerpo.error ?? "El cupón no se pudo aplicar."} Revisá el total antes de pagar.`);
        setEnviando(false);
        return;
      }

      // El total cambió (un precio, un descuento, el envío): se vuelve a
      // resolver el carrito y el comprador ve el nuevo antes de pagar.
      if (respuesta.status === 409 && typeof cuerpo.totalNuevo === "number") {
        recargar();
        setFallo(cuerpo.error ?? "El total cambió: revisalo antes de pagar.");
        setEnviando(false);
        return;
      }

      if (!respuesta.ok || !cuerpo.initPoint) {
        throw new Error(cuerpo.error ?? "No pudimos iniciar el pago");
      }

      // A partir de acá manda Mercado Pago.
      window.location.href = cuerpo.initPoint;
    } catch (error) {
      setFallo(
        error instanceof Error
          ? error.message
          : "No pudimos iniciar el pago. Probá de nuevo."
      );
      setEnviando(false);
    }
  }

  if (cargando && !carrito) return <p className="apagado">Cargando…</p>;

  // El carrito del comprador existe (está en su navegador); lo que falló es
  // ponerle precios. Antes esto decía "No hay nada para comprar", que es falso.
  if (errorCarrito && !carrito) {
    return (
      <div className="pila" style={{ gap: "1rem", alignItems: "flex-start" }}>
        <p className="apagado">No pudimos cargar tu carrito. Probá de nuevo en un momento.</p>
        <button type="button" className="boton boton--fantasma" onClick={recargar}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!carrito || carrito.items.length === 0) {
    return (
      <div className="pila" style={{ gap: "1.5rem", alignItems: "flex-start" }}>
        <p className="apagado">No hay nada para comprar todavía.</p>
        <Link href="/" className="boton">
          Ver productos
        </Link>
      </div>
    );
  }

  const cantidadTotal = carrito.items.reduce((n, i) => n + i.cantidad, 0);
  const productos = `${cantidadTotal} ${cantidadTotal === 1 ? "producto" : "productos"}`;
  const envioTexto = resumen.envio === 0 ? "Gratis" : formatearPrecio(resumen.envio);
  const notaEnvio =
    carrito.envioGratisDesde > 0
      ? `Correo Argentino a domicilio. Gratis desde ${formatearPrecio(carrito.envioGratisDesde)}.`
      : "Correo Argentino a domicilio.";

  const listaItems = (
    <>
      {carrito.items.map((item) => (
        <li key={item.varianteId} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="tarjeta__marco" style={{ width: "2.75rem", aspectRatio: "1 / 1", flexShrink: 0 }}>
            {item.foto ? (
              <Image src={item.foto} alt="" fill sizes="44px" style={{ objectFit: "contain", padding: "4px" }} />
            ) : null}
          </div>
          <div style={{ flex: 1, fontSize: "0.8125rem" }}>
            <div>
              {item.cantidad}× {item.nombre}
            </div>
            <div className="apagado">{item.color}</div>
          </div>
          <span style={{ fontSize: "0.8125rem" }}>{formatearPrecio(item.subtotal)}</span>
        </li>
      ))}
    </>
  );

  return (
    <form id={ID_FORMULARIO} className="checkout__form" onSubmit={enviar} noValidate>
      <div className="checkout__campos">
        {/* En celular el resumen queda abajo de todo: esta línea adelanta lo
            esencial y se despliega para ver el detalle. */}
        <details className="checkout__resumen-movil">
          <summary>
            <span>
              {productos} · <strong>{formatearPrecio(resumen.total)}</strong>
              {resumen.envio === 0 ? " · envío gratis" : " · envío incluido"}
              {resumen.ahorroTotal > 0 ? ` · ahorrás ${formatearPrecio(resumen.ahorroTotal)}` : ""}
            </span>
            <span className="checkout__ver">Ver detalle</span>
          </summary>
          <ul>{listaItems}</ul>
          {resumen.transferencia > 0 ? (
            <div className="fila" style={{ color: "var(--verde)" }}>
              <span>Transferencia ({carrito.transferencia?.porcentaje}%)</span>
              <span>−{formatearPrecio(resumen.transferencia)}</span>
            </div>
          ) : null}
          <div className="fila">
            <span className="apagado">Envío a domicilio</span>
            <span>{envioTexto}</span>
          </div>
        </details>

        <Campo
          id="email"
          etiqueta="Email"
          tipo="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          valor={form.email}
          error={errores.email}
          onChange={(v) => actualizar("email", v)}
        />

        <Campo
          id="nombre"
          etiqueta="Nombre y apellido"
          autoComplete="name"
          enterKeyHint="next"
          valor={form.nombre}
          error={errores.nombre}
          onChange={(v) => actualizar("nombre", v)}
        />

        <div className="checkout__par">
          <Campo
            id="telefono"
            etiqueta="Teléfono"
            tipo="tel"
            autoComplete="tel"
            inputMode="tel"
            enterKeyHint="next"
            valor={form.telefono}
            error={errores.telefono}
            onChange={(v) => actualizar("telefono", v)}
          />
          <Campo
            id="dni"
            etiqueta="DNI"
            inputMode="numeric"
            enterKeyHint="next"
            valor={form.dni}
            error={errores.dni}
            onChange={(v) => actualizar("dni", v)}
          />
        </div>

        {modoDireccion === "buscador" ? (
          <>
            <CampoDireccion
              elegida={elegida}
              onElegir={(d) => aplicarDireccion(d, "")}
              onCambiar={cambiarDireccion}
              onNoDisponible={cargarAMano}
              onManual={cargarAMano}
              error={
                errores.domicilio ??
                (!faltan.includes("numero") ? errores.direccion : undefined) ??
                (!faltan.includes("localidad") ? errores.ciudad : undefined) ??
                (!faltan.includes("provincia") ? errores.provincia : undefined) ??
                (!faltan.includes("cp") ? errores.cp : undefined)
              }
            />

            {elegida ? (
              // El piso va solo, a todo el ancho; si además falta el número,
              // los dos van en un par.
              <div className={faltan.includes("numero") ? "checkout__par checkout__par--piso" : undefined}>
                {faltan.includes("numero") ? (
                  <Campo
                    id="numero"
                    etiqueta="Número"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="next"
                    valor={numero}
                    error={errores.direccion}
                    onChange={cambiarNumero}
                  />
                ) : null}
                <Campo
                  id="piso"
                  etiqueta="Piso / depto (opcional)"
                  autoComplete="off"
                  placeholder="5° B"
                  enterKeyHint="next"
                  valor={piso}
                  onChange={setPiso}
                />
              </div>
            ) : null}

            {/* Solo lo que Google no trajo. En Argentina suele ser el código postal. */}
            {elegida && faltan.includes("cp") ? (
              <Campo
                id="cp"
                etiqueta="Código postal"
                autoComplete="postal-code"
                inputMode="numeric"
                enterKeyHint="next"
                valor={form.cp}
                error={errores.cp}
                onChange={(v) => actualizar("cp", v)}
              />
            ) : null}
            {elegida && faltan.includes("localidad") ? (
              <Campo
                id="ciudad"
                etiqueta="Localidad"
                autoComplete="address-level2"
                enterKeyHint="next"
                valor={form.ciudad}
                error={errores.ciudad}
                onChange={(v) => actualizar("ciudad", v)}
              />
            ) : null}
            {elegida && faltan.includes("provincia") ? (
              <SelectorProvincia valor={form.provincia} error={errores.provincia} onChange={(v) => actualizar("provincia", v)} />
            ) : null}
          </>
        ) : (
          <>
            <Campo
              id="direccion"
              etiqueta="Calle y número"
              autoComplete="address-line1"
              placeholder="Av. Cabildo 1234, 5° B"
              enterKeyHint="next"
              valor={form.direccion}
              error={errores.direccion}
              onChange={(v) => actualizar("direccion", v)}
            />

            <div className="checkout__par checkout__par--localidad">
              <Campo
                id="ciudad"
                etiqueta="Localidad"
                autoComplete="address-level2"
                enterKeyHint="next"
                valor={form.ciudad}
                error={errores.ciudad}
                onChange={(v) => actualizar("ciudad", v)}
              />
              <Campo
                id="cp"
                etiqueta="Código postal"
                autoComplete="postal-code"
                inputMode="numeric"
                enterKeyHint="done"
                valor={form.cp}
                error={errores.cp}
                onChange={(v) => actualizar("cp", v)}
              />
            </div>

            <SelectorProvincia valor={form.provincia} error={errores.provincia} onChange={(v) => actualizar("provincia", v)} />

            {buscador ? (
              <p className="domicilio__ayuda apagado">
                <button type="button" className="enlace-accion" onClick={() => setModoDireccion("buscador")}>
                  Buscar la dirección con Google
                </button>
              </p>
            ) : null}
          </>
        )}

        {/* Datos de facturación: por defecto, consumidor final. Si la factura
            va a nombre de una empresa u otro titular con CUIT, sus datos son
            propios de la factura: no los del comprador ni los de la entrega. */}
        <fieldset className="checkout__facturacion">
          <legend className="label">Datos de facturación</legend>
          <label className="checkout__promos">
            <input
              type="radio"
              name="facturacion"
              checked={!factura.aCuit}
              onChange={() => actualizarFactura({ aCuit: false })}
            />
            Consumidor final
          </label>
          <label className="checkout__promos">
            <input
              id="facturaACuit"
              type="radio"
              name="facturacion"
              checked={factura.aCuit}
              onChange={() => actualizarFactura({ aCuit: true })}
            />
            Factura a nombre de una empresa u otro titular con CUIT
          </label>

          {factura.aCuit ? (
            <div className="checkout__facturacion-campos">
              <Campo
                id="facturaRazonSocial"
                etiqueta="Razón social o nombre del titular"
                autoComplete="organization"
                enterKeyHint="next"
                valor={factura.razonSocial}
                error={errores.facturaRazonSocial}
                onChange={(v) => actualizarFactura({ razonSocial: v }, "facturaRazonSocial")}
              />
              <Campo
                id="facturaCuit"
                etiqueta="CUIT"
                inputMode="numeric"
                autoComplete="off"
                placeholder="30-12345678-9"
                enterKeyHint="next"
                valor={factura.cuit}
                error={errores.facturaCuit}
                onChange={(v) => actualizarFactura({ cuit: v }, "facturaCuit")}
              />
              <SelectorCondicionIva
                valor={factura.condicionIva}
                error={errores.facturaCondicionIva}
                onChange={(v) => actualizarFactura({ condicionIva: v }, "facturaCondicionIva")}
              />
              <Campo
                id="facturaDomicilio"
                etiqueta="Domicilio fiscal"
                autoComplete="off"
                placeholder="Calle 123, localidad, provincia, CP"
                enterKeyHint="done"
                valor={factura.domicilioFiscal}
                error={errores.facturaDomicilio}
                onChange={(v) => actualizarFactura({ domicilioFiscal: v }, "facturaDomicilio")}
              />
            </div>
          ) : null}
        </fieldset>

        {/* Medio de pago. Cada opción muestra su total, y el resumen y el
            botón cambian al instante. Las dos se pagan en Mercado Pago. */}
        {resumenTransferencia && carrito.transferencia ? (
          // Mientras se envía, no se cambia: lo que se ve es lo que se cobra.
          <fieldset className="medio-pago" disabled={enviando}>
            <legend className="label">Medio de pago</legend>
            <label className="medio-pago__opcion" data-elegida={medioPago === "mercadopago"}>
              <input
                type="radio"
                name="medioPago"
                value="mercadopago"
                checked={medioPago === "mercadopago"}
                onChange={() => setMedioElegido("mercadopago")}
              />
              <span className="medio-pago__texto">
                <span className="medio-pago__nombre">Tarjeta o Mercado Pago</span>
                <span className="medio-pago__detalle">Crédito, débito o dinero en cuenta.</span>
              </span>
              <span className="medio-pago__precio">{formatearPrecio(resumenMercadoPago.total)}</span>
            </label>
            <label className="medio-pago__opcion" data-elegida={medioPago === "transferencia"}>
              <input
                id="medioTransferencia"
                type="radio"
                name="medioPago"
                value="transferencia"
                checked={medioPago === "transferencia"}
                onChange={() => setMedioElegido("transferencia")}
              />
              <span className="medio-pago__texto">
                <span className="medio-pago__nombre">
                  Transferencia o dinero en cuenta
                  <span className="medio-pago__extra">{carrito.transferencia.porcentaje}% OFF adicional</span>
                </span>
                <span className="medio-pago__detalle">
                  Pagás en Mercado Pago con el dinero de tu cuenta. Podés cargarlo antes con una transferencia desde
                  tu banco.
                </span>
              </span>
              <span className="medio-pago__precio">{formatearPrecio(resumenTransferencia.total)}</span>
            </label>
          </fieldset>
        ) : null}

        {/* Mayoría de edad (o autorización del representante legal) y Términos:
            una sola casilla, obligatoria y sin marcar. Sin pedir la fecha de
            nacimiento. Los enlaces abren aparte para no perder el checkout. */}
        <div className="checkout__legal" data-error={Boolean(errores.aceptaTerminos)}>
          <label className="checkout__promos checkout__acepta">
            <input
              id="aceptaTerminos"
              type="checkbox"
              name="aceptaTerminos"
              checked={form.aceptaTerminos === true}
              onChange={(e) => actualizar("aceptaTerminos", e.target.checked)}
              aria-invalid={Boolean(errores.aceptaTerminos)}
              aria-describedby={errores.aceptaTerminos ? "error-terminos" : undefined}
            />
            <span>
              Soy mayor de edad o cuento con autorización de mi representante legal, y acepto los{" "}
              <a href="/legales/terminos" target="_blank" rel="noopener" className="checkout__enlace">
                Términos y condiciones
              </a>
              .
            </span>
          </label>
          {errores.aceptaTerminos ? (
            <small id="error-terminos" className="checkout__error">
              {errores.aceptaTerminos}
            </small>
          ) : null}
          <p className="checkout__nota">
            Usamos tus datos para procesar y entregar tu compra, según la{" "}
            <a href="/legales/privacidad" target="_blank" rel="noopener" className="checkout__enlace">
              Política de privacidad
            </a>
            .
          </p>
        </div>

        <label className="checkout__promos">
          <input
            type="checkbox"
            name="aceptaPromos"
            checked={form.aceptaPromos}
            onChange={(e) => actualizar("aceptaPromos", e.target.checked)}
          />
          Quiero recibir novedades y promociones de Harper.
        </label>
      </div>

      <aside
        className="panel checkout__panel"
        style={{ position: "sticky", top: "6rem" }}
        aria-busy={actualizando}
        data-actualizando={actualizando || undefined}
      >
        {/* En celular la lista ya está arriba, en el resumen desplegable: acá
            quedan solo la cuenta y el botón. */}
        <h2 className="label checkout__panel-titulo">Tu pedido</h2>

        <ul className="pila checkout__panel-lista" style={{ gap: "0.85rem", listStyle: "none", margin: 0, padding: 0 }}>
          {listaItems}
        </ul>

        <CodigoDescuento estado={carrito.cupon ?? null} />

        {/* La cuenta se lee de arriba abajo: lista − descuento + envío = total. */}
        <div className="fila">
          <span className="apagado">Subtotal</span>
          <span>{formatearPrecio(resumen.lista)}</span>
        </div>

        {resumen.descuento > 0 ? (
          <div className="fila" style={{ color: "var(--verde)" }}>
            <span>{carrito.cupon?.estado === "aplicado" ? `Cupón ${carrito.cupon.codigo}` : "Descuento"}</span>
            <span>−{formatearPrecio(resumen.descuento)}</span>
          </div>
        ) : null}

        {resumen.transferencia > 0 ? (
          <div className="fila" style={{ color: "var(--verde)" }}>
            <span>Transferencia ({carrito.transferencia?.porcentaje}%)</span>
            <span>−{formatearPrecio(resumen.transferencia)}</span>
          </div>
        ) : null}

        <div className="fila">
          <span className="apagado">Envío a domicilio</span>
          <span>{envioTexto}</span>
        </div>
        <p className="apagado checkout__envio-nota">{notaEnvio}</p>

        <div className="fila fila--total">
          <span>Total</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(resumen.total)}</strong>
        </div>

        {resumen.ahorroTotal > 0 ? (
          <p className="ahorro-total">¡Ahorraste {formatearPrecio(resumen.ahorroTotal)}!</p>
        ) : null}

        {fallo ? (
          <p ref={avisoFallo} role="alert" style={{ color: "var(--alerta)", fontSize: "0.8125rem" }}>
            {fallo}
          </p>
        ) : null}

        {/* En celular este botón no se muestra: lo reemplaza la barra fija,
            siempre a la vista, con el mismo texto y el total. */}
        <button type="submit" className="boton boton--bloque checkout__pagar" disabled={enviando}>
          <TextoBotonPagar medio={medioPago} total={formatearPrecio(resumen.total)} ocupado={enviando} />
        </button>

        {medioPago === "transferencia" ? (
          <p className="apagado" style={{ fontSize: "0.75rem" }}>
            Pagás en Mercado Pago solo con el dinero de tu cuenta de Mercado Pago:
            sin tarjetas ni cuotas. Si no te alcanza, podés cargarlo antes con una
            transferencia desde tu banco.
          </p>
        ) : (
          <p className="apagado" style={{ fontSize: "0.75rem" }}>
            Pagás en Mercado Pago con tarjeta de crédito o débito, o con dinero en
            cuenta. Las cuotas disponibles y su costo los ves en Mercado Pago antes
            de confirmar el pago.
          </p>
        )}
      </aside>

      <BarraPagar
        visible
        formulario={ID_FORMULARIO}
        total={formatearPrecio(resumen.total)}
        medio={medioPago}
        ocupado={enviando}
      />
    </form>
  );
}

function SelectorProvincia({
  valor,
  error,
  onChange,
}: {
  valor: string;
  error?: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="campo" data-error={Boolean(error)}>
      <span>Provincia</span>
      <select
        id="provincia"
        name="provincia"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="address-level1"
        aria-invalid={Boolean(error)}
      >
        <option value="">Elegí una provincia</option>
        {PROVINCIAS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function SelectorCondicionIva({
  valor,
  error,
  onChange,
}: {
  valor: string;
  error?: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="campo" data-error={Boolean(error)}>
      <span>Condición frente al IVA</span>
      <select
        id="facturaCondicionIva"
        name="facturaCondicionIva"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      >
        <option value="">Elegí una opción</option>
        {CONDICIONES_IVA.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  onChange,
  error,
  tipo = "text",
  ...resto
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  error?: string;
  tipo?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "tel" | "email";
  enterKeyHint?: "next" | "done";
  placeholder?: string;
}) {
  return (
    <label className="campo" htmlFor={id} data-error={Boolean(error)}>
      <span>{etiqueta}</span>
      <input
        id={id}
        name={id}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        {...resto}
      />
      {error ? <small>{error}</small> : null}
    </label>
  );
}
