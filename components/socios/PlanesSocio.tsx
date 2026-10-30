"use client";

import { useRef, useState } from "react";
import HojaPack, { type ColorDeADos, type ExtraDeLaHoja, type HojaPackControl } from "@/components/HojaPack";
import type { Planes } from "@/lib/socios";
import { TEXTOS } from "@/lib/textos";

/**
 * Los planes de Socios Harper, con su botón: se elige el primer par en la
 * hoja y la membresía entra al carrito junto con él (lib/socios.ts). Lo usan
 * la portada y /socios. Los precios vienen de Airtable; acá no se calcula nada.
 */
export default function PlanesSocio({ planes, colores }: { planes: Planes; colores: ColorDeADos[] }) {
  const hoja = useRef<HojaPackControl>(null);
  const [plan, setPlan] = useState<{ extras: ExtraDeLaHoja[]; boton: string }>({ extras: [], boton: "" });
  const lleno = planes.quedan <= 0;

  const filas = [
    {
      clave: "socio",
      apodo: TEXTOS.socios.planSocio.apodo,
      titulo: TEXTOS.socios.planSocio.titulo,
      total: planes.socio.precioTexto,
      detalle: TEXTOS.socios.planSocio.detalle,
      extras: [planes.socio],
      boton: `${TEXTOS.socios.boton} · ${planes.socio.precioTexto}`,
    },
    ...(planes.aumento
      ? [
          {
            clave: "aumento",
            apodo: TEXTOS.socios.planAumento.apodo,
            titulo: TEXTOS.socios.planAumento.titulo,
            total: planes.aumento.totalTexto,
            detalle: TEXTOS.socios.planAumento.detalle,
            extras: [planes.socio, planes.aumento],
            boton: `${TEXTOS.socios.boton} · ${planes.aumento.totalTexto}`,
          },
        ]
      : []),
  ];

  function abrir(fila: (typeof filas)[number]) {
    setPlan({ extras: fila.extras, boton: fila.boton });
    hoja.current?.abrir(1);
  }

  return (
    <>
      <ul className="de-a-dos__filas planes-socio">
        {filas.map((f) => (
          <li key={f.clave} className="de-a-dos__fila" data-plan={f.clave}>
            <div className="de-a-dos__fila-datos">
              <p className="etiqueta-mono de-a-dos__apodo">{f.apodo}</p>
              <p className="de-a-dos__fila-titulo">{f.titulo}</p>
              <p className="de-a-dos__total">
                {f.total}
                <small className="planes-socio__periodo"> {TEXTOS.socios.periodo}</small>
              </p>
              <ul className="planes-socio__detalle">
                {f.detalle.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <button type="button" className="boton boton--chico de-a-dos__boton" onClick={() => abrir(f)} disabled={lleno}>
              {lleno ? TEXTOS.socios.lleno : TEXTOS.socios.boton}
            </button>
          </li>
        ))}
      </ul>

      <HojaPack
        ref={hoja}
        colores={colores}
        totales={{}}
        titulo={TEXTOS.socios.hojaTitulo}
        extras={plan.extras}
        textoComprar={plan.boton}
      />
    </>
  );
}
