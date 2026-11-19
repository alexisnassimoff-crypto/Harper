import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AccionesCuenta, EntrarACuenta } from "@/components/suscriptores/AccionesCuenta";
import MiCreditoHarper from "@/components/suscriptores/MiCreditoHarper";
import MisCompras from "@/components/suscriptores/MisCompras";
import MisDatos from "@/components/suscriptores/MisDatos";
import MisFavoritos from "@/components/suscriptores/MisFavoritos";
import SeccionesCuenta from "@/components/suscriptores/SeccionesCuenta";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { billeteraDeLaCuenta, cuentaConCredito, visitaDeLaCuenta, type VisitaCuenta } from "@/lib/credito-cuenta";
import { direccionesDisponibles } from "@/lib/direcciones-servidor";
import { favoritosDelCatalogo, normalizarSku } from "@/lib/favoritos";
import { comprasDeLaCuenta } from "@/lib/mis-compras";
import { misDatos } from "@/lib/mis-datos-servidor";
import { precio as formatearPrecio } from "@/lib/formato";
import { DIAS_PARA_USAR_CASHBACK, fechaArgentina, fechaLegible, type MovimientoSaldo } from "@/lib/suscriptores";
import { resumenDeLaCuenta } from "@/lib/suscriptores-cuenta";
import { COOKIE_CUENTA, COOKIE_SUSCRIPTOR } from "@/lib/suscriptores-sesion";
import { TEXTOS } from "@/lib/textos";

/**
 * «Mi Cuenta Harper» (Ale, 03/11/2026): entra con su mail y el código que le
 * llega, y ve sus compras («Mis compras», solo las del mail verificado de la
 * cuenta, lib/mis-compras.ts), sus favoritos (Ale, 05/11/2026: los anteojos
 * guardados con el corazón, lib/favoritos.ts) y sus datos («Mis datos» y
 * «Mis direcciones», lib/mis-datos.ts). Todo se lee de nuevo de Airtable en
 * cada visita (lib/suscriptores-cuenta.ts). Es a donde llevan los mails.
 *
 * Ale, 18/11/2026: los beneficios en plata de la suscripción terminaron para
 * todos, y la página dejó de mostrarlos. No hay más casilla del cupón de
 * bienvenida ni textos del saldo que volvía de cada compra. El saldo de antes
 * (lo disponible, lo que está en camino) y la pestaña «Movimientos» salen
 * solo en la cuenta que de verdad tiene saldo o movimientos sin anular; ese
 * día no había ninguna, así que nadie los ve. La página lleva la etiqueta
 * «Mi Cuenta Harper» para todos, y el pie ya no invita a «desbloquear
 * beneficios».
 *
 * Crédito Harper, paso 3 (solo con HARPER_CREDITO_ACTIVO=1, apagado): entra
 * también quien compró sin suscribirse, con su mail verificado y sin darse de
 * alta (lib/credito-cuenta.ts), y la cuenta suma «Mi Crédito Harper», aparte
 * del saldo de antes. Apagado, la página no lo nombra.
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

export default async function MiCuenta({ searchParams }: { searchParams: Promise<{ guardar?: string | string[] }> }) {
  const almacen = await cookies();
  const conCredito = cuentaConCredito();
  const visita = await visitaDeLaCuenta(
    { suscriptor: almacen.get(COOKIE_SUSCRIPTOR)?.value ?? null, cuenta: almacen.get(COOKIE_CUENTA)?.value ?? null },
    { abierta: conCredito }
  ).catch((error) => {
    console.error("[suscriptores] no se pudo leer la sesión:", error instanceof Error ? error.message : error);
    return null;
  });

  if (!visita) {
    // Llegó desde un corazón sin haber entrado: al entrar, se guarda ese color.
    const pedido = (await searchParams).guardar;
    const sku = normalizarSku(typeof pedido === "string" ? pedido : null);
    const pendiente = sku ? (favoritosDelCatalogo([sku], await getProductos())[0] ?? null) : null;
    return (
      <section className="contenedor seccion cuenta-suscriptor" aria-labelledby="cuenta-titulo">
        <p className="etiqueta-mono">{T.etiquetaCuenta}</p>
        <h1 id="cuenta-titulo" className="titulo-serif">
          {T.entrarTitulo}
        </h1>
        <p className="apagado cuenta-suscriptor__bajada">{conCredito ? T.entrarBajadaCuenta : T.entrarBajada}</p>
        {pendiente ? (
          <p className="cuenta-suscriptor__pendiente">{TEXTOS.favoritos.pendiente(`${pendiente.modelo} ${pendiente.color}`)}</p>
        ) : null}
        <div className="cuenta-suscriptor__entrar">
          <EntrarACuenta guardar={pendiente?.sku ?? null} soloCuenta={conCredito} />
        </div>
        {/* «¿Todavía no tenés cuenta? Mirá qué incluye y abrila gratis» (antes del 18/11/2026 invitaba a los beneficios). */}
        <p className="cuenta-suscriptor__pie">
          {T.noSuscripto} <Link href="/suscriptores">{T.verBeneficios}</Link>
        </p>
      </section>
    );
  }

  if (visita.tipo === "comprador") return <CuentaDelComprador visita={visita} />;
  const cuenta = visita.cuenta;

  // Las compras y los favoritos, en paralelo y por su lado: si no se pueden leer, el resto de la cuenta sigue.
  const [resumen, compras, config, productos, datos, billetera] = await Promise.all([
    resumenDeLaCuenta(cuenta),
    comprasDeLaCuenta(cuenta.email).catch((error) => {
      console.error("[mis-compras] no se pudieron leer:", error instanceof Error ? error.message : error);
      return null;
    }),
    getConfig().catch(() => null),
    getProductos(),
    misDatos(cuenta).catch((error) => {
      console.error("[mis-datos] no se pudieron leer:", error instanceof Error ? error.message : error);
      return null;
    }),
    conCredito ? leerBilletera(visita) : Promise.resolve(null),
  ]);
  // Sin catálogo no se pueden armar (getProductos devuelve [] si Airtable falla).
  const favoritos = cuenta.favoritos.length === 0 ? [] : productos.length > 0 ? favoritosDelCatalogo(cuenta.favoritos, productos) : null;
  const hoy = fechaArgentina(new Date());
  // El saldo de antes del 18/11/2026 que está en camino, cada uno con el día desde el que se usa (el más cercano primero).
  const enCamino = resumen.movimientos
    .filter((m): m is MovimientoSaldo & { disponibleDesde: string } => m.tipo === "Cashback" && m.disponibleDesde !== null && m.disponibleDesde > hoy)
    .sort((a, b) => a.disponibleDesde.localeCompare(b.disponibleDesde));
  // Ale, 18/11/2026: el saldo ya no se genera, así que no se le muestra un
  // «$ 0» a nadie. Los números salen solo si la cuenta de verdad tiene saldo
  // (para usar o en camino), y «Movimientos», solo si tiene alguno sin anular
  // (resumenDeLaCuenta ya saca los anulados). Ese día no había ninguna.
  const conSaldo = resumen.saldoDisponible > 0 || resumen.saldoEnCamino > 0;
  const conMovimientos = resumen.movimientos.length > 0;
  const nombre = resumen.nombre.split(" ")[0] ?? "";

  return (
    <section className="contenedor seccion cuenta-suscriptor" aria-labelledby="cuenta-titulo">
      <p className="etiqueta-mono">{T.etiquetaCuenta}</p>
      <h1 id="cuenta-titulo" className="titulo-serif">
        {nombre ? T.hola(nombre) : T.titulo}
      </h1>
      <p className="apagado cuenta-suscriptor__bajada">{resumen.email}</p>
      {resumen.activo ? null : (
        <p className="cuenta-suscriptor__aviso" role="status">
          {T.deBaja}
        </p>
      )}

      {/* El saldo de antes, con su título: no es el Crédito Harper. Sin la casilla del cupón de bienvenida, que terminó. */}
      {conSaldo ? (
        <>
          <h2 className="label cuenta-suscriptor__saldo-anterior">{T.saldoAnterior}</h2>
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
          </dl>
        </>
      ) : null}

      <Link href="/#los-modelos" className="boton cuenta-suscriptor__comprar">
        {TEXTOS.suscriptores.elegir}
      </Link>

      {/* Compras, favoritos y datos en pestañas (Ale, 05/11/2026): una a la vez. */}
      <SeccionesCuenta
        inicial={(compras?.length ?? 0) > 0 || (favoritos?.length ?? 0) === 0 ? "mis-compras" : "mis-favoritos"}
        secciones={[
          ...(conCredito ? [seccionCredito(billetera)] : []),
          {
            id: "mis-compras",
            titulo: T.pestanas.compras,
            cantidad: compras?.length ?? null,
            contenido: <MisCompras compras={compras} email={resumen.email} whatsapp={config?.whatsapp ?? null} />,
          },
          {
            id: "mis-favoritos",
            titulo: T.pestanas.favoritos,
            cantidad: favoritos?.length ?? null,
            contenido: <MisFavoritos favoritos={favoritos} />,
          },
          // Los movimientos del saldo de antes del 18/11/2026: la pestaña existe solo si hay alguno.
          ...(conMovimientos
            ? [
                {
                  id: "movimientos",
                  titulo: T.pestanas.movimientos,
                  contenido: (
                    <section id="movimientos" className="cuenta-suscriptor__movimientos" aria-labelledby="cuenta-movimientos-titulo">
                      <h2 id="cuenta-movimientos-titulo" className="label">
                        {T.movimientos}
                      </h2>
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
                    </section>
                  ),
                },
              ]
            : []),
          {
            id: "mis-datos",
            titulo: T.pestanas.datos,
            contenido: <MisDatos vista={datos} buscador={direccionesDisponibles()} />,
          },
        ]}
      />

      <AccionesCuenta activo={resumen.activo} email={resumen.email} />
    </section>
  );
}

/** Si Airtable no contesta: null, y la sección muestra el error (nunca un $ 0). */
function leerBilletera(visita: VisitaCuenta) {
  return billeteraDeLaCuenta(visita).catch((error) => {
    console.error("[credito] no se pudo leer la billetera:", error instanceof Error ? error.message : error);
    return null;
  });
}

function seccionCredito(billetera: Awaited<ReturnType<typeof leerBilletera>>) {
  return { id: "mi-credito", titulo: T.pestanas.credito, contenido: <MiCreditoHarper billetera={billetera} /> };
}

/**
 * La cuenta de quien compró sin suscribirse (paso 3, solo con el Crédito
 * Harper prendido): su crédito y sus compras, por el mail verificado. Sin
 * favoritos ni datos guardados (ni saldo de antes del 18/11/2026): eso vive
 * en la fila de la cuenta, que se abre al suscribirse, y entrar no la crea.
 */
async function CuentaDelComprador({ visita }: { visita: Extract<VisitaCuenta, { tipo: "comprador" }> }) {
  const [billetera, compras, config] = await Promise.all([
    leerBilletera(visita),
    comprasDeLaCuenta(visita.email).catch((error) => {
      console.error("[mis-compras] no se pudieron leer:", error instanceof Error ? error.message : error);
      return null;
    }),
    getConfig().catch(() => null),
  ]);
  return (
    <section className="contenedor seccion cuenta-suscriptor" aria-labelledby="cuenta-titulo">
      <p className="etiqueta-mono">{T.etiquetaCuenta}</p>
      <h1 id="cuenta-titulo" className="titulo-serif">
        {T.titulo}
      </h1>
      <p className="apagado cuenta-suscriptor__bajada">{visita.email}</p>

      <Link href="/#los-modelos" className="boton cuenta-suscriptor__comprar">
        {TEXTOS.suscriptores.elegir}
      </Link>

      <SeccionesCuenta
        inicial="mi-credito"
        secciones={[
          seccionCredito(billetera),
          {
            id: "mis-compras",
            titulo: T.pestanas.compras,
            cantidad: compras?.length ?? null,
            contenido: <MisCompras compras={compras} email={visita.email} whatsapp={config?.whatsapp ?? null} />,
          },
        ]}
      />

      <AccionesCuenta soloSalir />
    </section>
  );
}
