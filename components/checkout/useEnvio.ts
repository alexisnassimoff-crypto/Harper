"use client";

import { useEffect, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import type { CuotasVerificadas } from "@/lib/cuotas";
import type { DestinoEnvio, OpcionEnvio } from "@/lib/tipos";
import type { Sucursal } from "@/lib/correo";

/** Lo que contesta /api/envio/cotizar. */
export type Cotizacion = {
  /** Las opciones a domicilio, más barata primero, cada una con su comprobante. */
  opciones: OpcionEnvio[];
  /** Falso cuando `envio` es la tarifa plana de respaldo. */
  cotizado: boolean;
  envio: number;
  /** El pedido llega al mínimo y el envío lo paga Harper. */
  bonificado: boolean;
  /** Cuotas sin interés verificadas para el total con cada opción. */
  cuotas: Record<string, (CuotasVerificadas & { monto: number }) | null>;
};

/** Espera antes de cotizar, para no consultar a Envia en cada tecla. */
const ESPERA_MS = 700;

/** Si el servidor no contesta en este tiempo, se sigue con la tarifa plana. */
const ESPERA_MAXIMA_MS = 15_000;
const TIEMPO_AGOTADO = "tiempo-agotado";

/** Sin tildes ni mayúsculas, como lo compara el servidor. */
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * La clave de una cotización: lo que cambia el precio (los cuatro números del
 * CP, la provincia y la localidad), el carrito y el cupón. La calle y el
 * número viajan en la consulta, pero corregirlos no vuelve a cotizar: el
 * servidor tampoco los firma en el comprobante.
 */
function claveDe(destino: DestinoEnvio, items: unknown, cupon: unknown) {
  const cp = (destino.cp.match(/\d{4}/) ?? [""])[0];
  return JSON.stringify([cp, normalizar(destino.provincia), normalizar(destino.ciudad), items, cupon ?? null]);
}

/**
 * Cotiza el envío con Envia para la dirección que está cargando el
 * comprador, cuando ya tiene código postal, provincia, localidad y calle.
 *
 * `listo` dice si la cotización que hay es la de esta dirección y este
 * carrito: mientras no lo sea, el checkout no manda a pagar (no se cobra un
 * envío calculado para otra dirección). Nunca falla hacia afuera: si algo
 * sale mal, tarda demasiado o el servidor pide esperar (429), no hay
 * cotización y el checkout sigue con la tarifa plana.
 */
export function useCotizacionEnvio(destino: DestinoEnvio | null, cupon: unknown) {
  const { items } = useCarrito();
  const [estado, setEstado] = useState<{ clave: string; cotizacion: Cotizacion | null } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  const clave = destino && items.length > 0 ? claveDe(destino, items, cupon) : null;

  useEffect(() => {
    if (!clave || !destino) {
      setCargando(false);
      return;
    }

    const controlador = new AbortController();
    setCargando(true);

    const consultar = () => {
      const limite = window.setTimeout(() => controlador.abort(TIEMPO_AGOTADO), ESPERA_MAXIMA_MS);
      fetch("/api/envio/cotizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino, items, cupon }),
        signal: controlador.signal,
      })
        .then(async (r) => {
          // Cualquier otra respuesta (429 por demasiadas consultas, 5xx) es
          // "sin cotizar": se sigue con la tarifa plana, sin trabar el pago.
          const datos = r.ok ? ((await r.json()) as Cotizacion) : null;
          if (controlador.signal.aborted) return;
          setEstado({ clave, cotizacion: datos });
          setCargando(false);
        })
        .catch(() => {
          // Si se abortó porque cambió la dirección, no se marca nada: viene otra.
          if (controlador.signal.aborted && controlador.signal.reason !== TIEMPO_AGOTADO) return;
          setEstado({ clave, cotizacion: null });
          setCargando(false);
        })
        .finally(() => window.clearTimeout(limite));
    };

    const id = window.setTimeout(consultar, ESPERA_MS);

    return () => {
      window.clearTimeout(id);
      controlador.abort();
    };
    // `clave` resume lo que cambia el precio; `vuelta` fuerza otra cotización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, vuelta]);

  const actual = estado && estado.clave === clave ? estado.cotizacion : null;

  return {
    cotizacion: actual,
    cargando,
    /** Hay una dirección completa y un carrito para cotizar. */
    activo: clave !== null,
    /** La respuesta que hay es la de esta dirección y este carrito (aunque sea "sin cotizar"). */
    listo: clave !== null && estado?.clave === clave && !cargando,
    /** Volver a cotizar, por ejemplo si el checkout dice que el total cambió. */
    recotizar: () => setVuelta((v) => v + 1),
  };
}

/**
 * Sucursales donde retirar, para la provincia elegida.
 *
 * Solo se piden cuando hacen falta. Si Correo Argentino no contesta, la lista
 * queda vacía y el checkout esconde la opción de retiro en sucursal.
 */
export function useSucursales(provincia: string, activo: boolean) {
  const [lista, setLista] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!activo || !provincia) {
      setLista([]);
      return;
    }

    const controlador = new AbortController();
    setCargando(true);

    fetch(`/api/envio/sucursales?provincia=${encodeURIComponent(provincia)}`, {
      signal: controlador.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ sucursales: Sucursal[] }>) : null))
      .then((datos) => setLista(datos?.sucursales ?? []))
      .catch(() => setLista([]))
      .finally(() => setCargando(false));

    return () => controlador.abort();
  }, [provincia, activo]);

  return { sucursales: lista, cargando };
}
