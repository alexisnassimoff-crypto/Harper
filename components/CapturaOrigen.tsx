"use client";

import { useEffect } from "react";
import { CLAVE_ORIGEN, leerOrigenDeUrl } from "@/lib/origen";

/**
 * Guarda de dónde vino el visitante, al entrar.
 *
 * Si la URL trae UTM o un click id (fbclid), se guarda en el navegador y pisa
 * lo anterior: el último anuncio que lo trajo es el que cuenta. Sin nada en
 * la URL, no se toca lo guardado. Viaja con el pedido en el checkout.
 *
 * Solo campaña, página y referrer: ningún dato de la persona.
 */
export default function CapturaOrigen() {
  useEffect(() => {
    try {
      const origen = leerOrigenDeUrl({
        search: window.location.search,
        pathname: window.location.pathname,
        referrer: document.referrer,
        ahora: Date.now(),
      });

      if (origen) window.localStorage.setItem(CLAVE_ORIGEN, JSON.stringify(origen));
    } catch {
      // Sin almacenamiento (modo privado) no hay atribución. La compra sigue.
    }
  }, []);

  return null;
}
