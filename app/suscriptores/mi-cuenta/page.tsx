import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AccionesCuenta, EntrarACuenta } from "@/components/suscriptores/AccionesCuenta";
import { precio as formatearPrecio } from "@/lib/formato";
import { CUPON_BIENVENIDA, DIAS_PARA_USAR_CASHBACK, fechaArgentina, fechaLegible, type MovimientoSaldo } from "@/lib/suscriptores";
import { resumenDeLaCuenta, suscriptorDeLaSesion } from "@/lib/suscriptores-cuenta";
import { COOKIE_SUSCRIPTOR } from "@/lib/suscriptores-sesion";
import { TEXTOS } from "@/lib/textos";

/**
 * «Mi cuenta» de Suscriptores Harper (Ale, 03/11/2026): entra con su mail y
 * el código que le llega, y ve su saldo, lo que tiene en camino (y desde
 * cuándo lo puede usar), su cupón de bienvenida y sus movimientos. Todo se
 * lee de nuevo de Airtable en cada visita (lib/suscriptores-cuenta.ts). Es a
 * donde llevan los mails.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: TEXTOS.suscriptores.cuenta.titulo,
  robots: { index: false, follow: false },
};

const { cuenta: T } = TEXTOS.suscriptores;

/** "2026-11-03T15:00:00.000Z" → "03/11/2026", el día en Buenos Aires. */
const diaDe = (iso: string) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "" : fechaLegible(fechaArgentina(fecha));
};
const conSigno = (monto: number) => `${monto < 0 ? "−" : "+"}${formatearPrecio(Math.abs(monto))}`;

export default async function MiCuenta() {
  const valor = (await cookies()).get(COOKIE_SUSCRIPTOR)?.value ?? null;
  const cuenta = await suscriptorDeLaSesion(valor).catch((error) => {
    console.error("[suscriptores] no se pudo leer la sesión:", error instanceof Error ? error.message : error);
    return null;
  });

  if (!cuenta) {
    return (
      <section className="contenedor seccion cuenta-suscriptor" aria-labelledby="cuenta-titulo">
        <p className="etiqueta-mono">{TEXTOS.suscriptores.etiqueta}</p>
        <h1 id="cuenta-titulo" className="titulo-serif">
          {T.entrarTitulo}
        </h1>
        <p className="apagado cuenta-suscriptor__bajada">{T.entrarBajada}</p>
        <div className="cuenta-suscriptor__entrar">
          <EntrarACuenta />
        </div>
        <p className="cuenta-suscriptor__pie">
          {T.noSuscripto} <Link href="/suscriptores">{T.verBeneficios}</Link>
        </p>
      </section>
    );
  }

  const resumen = await resumenDeLaCuenta(cuenta);
  const hoy = fechaArgentina(new Date());
  // Lo que está en camino, cada cashback con el día desde el que se usa (el más cercano primero).
  const enCamino = resumen.movimientos
    .filter((m): m is MovimientoSaldo & { disponibleDesde: string } => m.tipo === "Cashback" && m.disponibleDesde !== null && m.disponibleDesde > hoy)
    .sort((a, b) => a.disponibleDesde.localeCompare(b.disponibleDesde));
  const nombre = resumen.nombre.split(" ")[0] ?? "";

  return (
    <section className="contenedor seccion cuenta-suscriptor" aria-labelledby="cuenta-titulo">
      <p className="etiqueta-mono">{TEXTOS.suscriptores.etiqueta}</p>
      <h1 id="cuenta-titulo" className="titulo-serif">
        {nombre ? T.hola(nombre) : T.titulo}
      </h1>
      <p className="apagado cuenta-suscriptor__bajada">{resumen.email}</p>

      <dl className="cuenta-suscriptor__numeros">
        <div className="cuenta-suscriptor__numero cuenta-suscriptor__numero--principal">
          <dt>{T.disponible}</dt>
          <dd>
            <span className="cuenta-suscriptor__monto">{formatearPrecio(resumen.saldoDisponible)}</span>
            <span className="cuenta-suscriptor__detalle">{T.disponibleDetalle}</span>
          </dd>
        </div>
        <div className="cuenta-suscriptor__numero">
          <dt>{T.enCamino}</dt>
          <dd>
            <span className="cuenta-suscriptor__monto">{formatearPrecio(resumen.saldoEnCamino)}</span>
            {enCamino.length === 1 ? (
              <span className="cuenta-suscriptor__fechas">{T.enCaminoFecha(fechaLegible(enCamino[0].disponibleDesde))}</span>
            ) : enCamino.length > 1 ? (
              <ul className="cuenta-suscriptor__fechas">
                {enCamino.map((m) => (
                  <li key={m.id}>{T.enCaminoDesde(formatearPrecio(m.monto), fechaLegible(m.disponibleDesde))}</li>
                ))}
              </ul>
            ) : (
              <span className="cuenta-suscriptor__detalle">{T.sinEnCamino}</span>
            )}
            <span className="cuenta-suscriptor__detalle">{T.enCaminoDetalle(DIAS_PARA_USAR_CASHBACK)}</span>
          </dd>
        </div>
        <div className="cuenta-suscriptor__numero" data-estado={resumen.cupon === "Disponible" ? "disponible" : "usado"}>
          <dt>{T.cupon}</dt>
          <dd>
            <span className="cuenta-suscriptor__monto">{resumen.cupon === "Disponible" ? formatearPrecio(CUPON_BIENVENIDA) : "Usado"}</span>
            <span className="cuenta-suscriptor__detalle">
              {resumen.cupon === "Disponible" ? T.cuponDisponible(formatearPrecio(CUPON_BIENVENIDA)) : T.cuponUsado(resumen.cuponPedido)}
            </span>
          </dd>
        </div>
      </dl>

      <Link href="/#los-modelos" className="boton cuenta-suscriptor__comprar">
        {TEXTOS.suscriptores.elegir}
      </Link>

      <section className="cuenta-suscriptor__movimientos" aria-labelledby="cuenta-movimientos-titulo">
        <h2 id="cuenta-movimientos-titulo" className="label">
          {T.movimientos}
        </h2>
        {resumen.movimientos.length > 0 ? (
          <ul>
            {resumen.movimientos.map((m) => (
              <li key={m.id} className="cuenta-suscriptor__movimiento">
                <span className="cuenta-suscriptor__fecha">{diaDe(m.fecha)}</span>
                <span className="cuenta-suscriptor__concepto">
                  {m.tipo === "Ajuste" ? T.movimiento.Ajuste : T.movimiento[m.tipo](m.pedido)}
                  {m.tipo === "Cashback" && m.disponibleDesde && m.disponibleDesde > hoy ? (
                    <small>{T.desde(fechaLegible(m.disponibleDesde))}</small>
                  ) : null}
                </span>
                <span className="cuenta-suscriptor__importe" data-signo={m.monto < 0 ? "menos" : "mas"}>
                  {conSigno(m.monto)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="apagado">{T.sinMovimientos}</p>
        )}
      </section>

      <AccionesCuenta />
    </section>
  );
}
