"use client";

import { useEffect } from "react";
import { aceptaPublicidad, alCambiarConsentimiento } from "@/lib/consentimiento";
import { CLAVE_ORIGEN, leerOrigenDeUrl, type Origen } from "@/lib/origen";

/**
 * Guarda de dónde vino el visitante, al entrar.
 *
 * Si la URL trae UTM o un click id (fbclid), se guarda en el navegador y pisa
 * lo anterior: el último anuncio que lo trajo es el que cuenta. Sin nada en
 * la URL, no se toca lo guardado. Viaja con el pedido en el checkout.
 *
 * Es medición publicitaria: se guarda solo con el consentimiento de cookies
 * de medición y publicidad. Si la persona llega desde un anuncio y acepta
 * después (en el aviso de cookies), se guarda en ese momento; si rechaza, se
 * descarta. Solo campaña, página y referrer: ningún dato de la persona.
 */
let pendiente: Origen | null = null;

function guardar(origen: Origen) {
  try {
    window.localStorage.setItem(CLAVE_ORIGEN, JSON.stringify(origen));
  } catch {
    // Sin almacenamiento (modo privado) no hay atribución. La compra sigue.
  }
}

export default function CapturaOrigen() {
  useEffect(() => {
    const origen = leerOrigenDeUrl({
      search: window.location.search,
      pathname: window.location.pathname,
      referrer: document.referrer,
      ahora: Date.now(),
    });

    if (origen) {
      if (aceptaPublicidad()) guardar(origen);
      else pendiente = origen;
    }

    return alCambiarConsentimiento((dato) => {
      if (!dato) return;
      if (dato.publicidad && pendiente) guardar(pendiente);
      pendiente = null;
    });
  }, []);

  return null;
}
