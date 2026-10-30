"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import { buscarCupon } from "@/lib/cupones";
import { ofertaDeEscala, porcentajeParaCantidad, proximoTramo } from "@/lib/descuentos";
import { precio as formatearPrecio } from "@/lib/formato";
import { empujeDeLaBarra } from "@/lib/vitrina";

/**
 * La barra «Tus pares», al pie del celular en la portada: aparece cuando el
 * visitante pasa la vitrina de arriba. Sin nada elegido, invita a llevarse
 * dos; con pares en el carrito, dice el total que calculó el servidor y qué
 * gana con el próximo, y paga directo (al checkout, sin pasar por el carrito).
 *
 * Como la CtaFija de la ficha: va con un portal en <body> y, mientras se ve,
 * marca <body data-cta-fija> para que el botón de WhatsApp y el pie le hagan lugar.
 */
export default function BarraTusPares({
  despuesDe,
  invitacion,
  precioPar,
}: {
  /** El id del elemento que, al salir de pantalla, hace aparecer la barra. */
  despuesDe: string;
  /** Sin nada en el carrito: "Dos pares, en 6 cuotas sin interés de $ 28.468". */
  invitacion: string;
  precioPar: number;
}) {
  const router = useRouter();
  const { items } = useCarrito();
  const { datos } = useCarritoResuelto({ cuotas: true });
  const [paso, setPaso] = useState(false);
  const [montado, setMontado] = useState(false);
  const [yendo, setYendo] = useState(false);

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    const objetivo = document.getElementById(despuesDe);
    if (!objetivo) return;
    const observador = new IntersectionObserver(([e]) => setPaso(!e.isIntersecting && e.boundingClientRect.top < 0));
    observador.observe(objetivo);
    return () => observador.disconnect();
  }, [despuesDe]);

  const visible = paso;
  useEffect(() => {
    if (!visible) return;
    document.body.dataset.ctaFija = "";
    return () => {
      delete document.body.dataset.ctaFija;
    };
  }, [visible]);

  if (!montado) return null;

  const conDatos = items.length > 0 && datos;
  const pares = conDatos ? datos.items.filter((i) => i.categoria === "Anteojos").reduce((n, i) => n + i.cantidad, 0) : 0;
  const unidades = conDatos ? datos.items.reduce((n, i) => n + i.cantidad, 0) : 0;
  const cupon = conDatos && datos.cupon?.estado === "aplicado" ? (buscarCupon(datos.cupon.codigo)?.porcentaje ?? 0) : 0;
  const empuje = conDatos
    ? empujeDeLaBarra({
        pares,
        actual: porcentajeParaCantidad(datos.tramos, "Anteojos", pares),
        proximo: proximoTramo(datos.tramos, "Anteojos", pares),
        cupon,
        subtotalSinCupon: datos.subtotalSinCupon,
        precioPar,
        envioGratisDesde: datos.envioGratisDesde,
        escala: ofertaDeEscala(datos.tramos, "Anteojos", pares),
      })
    : null;
  // Sin dirección todavía el envío no se sabe: se muestran los productos y
  // sus cuotas (las verificadas para ese monto, sin el envío).
  const productos = conDatos ? datos.total - datos.envio : 0;
  const cuota = conDatos ? ((datos.envio > 0 ? datos.cuotasSinEnvio : datos.cuotas) ?? null) : null;

  function pagar() {
    if (yendo) return;
    setYendo(true);
    router.push("/checkout");
  }

  return createPortal(
    <div className="cta-fija tus-pares" data-visible={visible || undefined} inert={!visible}>
      {empuje ? <p className="tus-pares__empuje">{empuje}</p> : null}
      <div className="tus-pares__fila">
        {conDatos ? (
          <>
            <div className="cta-fija__datos">
              <span className="cta-fija__nombre">
                {unidades === pares ? `${pares} ${pares === 1 ? "par" : "pares"}` : `${unidades} productos`}
              </span>
              <span className="cta-fija__precio">
                {formatearPrecio(productos)}
                {cuota ? (
                  <small>
                    {" "}
                    · {cuota.cuotas} × {formatearPrecio(cuota.montoCuota)}
                  </small>
                ) : null}
              </span>
            </div>
            <button type="button" className="boton boton--chico" onClick={pagar} disabled={yendo}>
              {yendo ? "Un momento…" : "Pagar"}
            </button>
          </>
        ) : (
          <>
            <p className="tus-pares__invitacion">{invitacion}</p>
            <a href="#los-modelos" className="boton boton--chico">
              Elegir
            </a>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
