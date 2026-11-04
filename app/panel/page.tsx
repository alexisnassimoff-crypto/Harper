import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { EntrarAlPanel, SalirDelPanel } from "@/components/panel/EntrarAlPanel";
import { precio } from "@/lib/formato";
import { leerPeriodo, PERIODOS, type PedidoPanel } from "@/lib/panel-datos";
import { datosDelPanel } from "@/lib/panel-servidor";
import { COOKIE_PANEL, mailDeLaSesionPanel } from "@/lib/panel-sesion";
import { fechaLegible } from "@/lib/suscriptores";

/**
 * El panel privado de Ale (04/11/2026): «una página solo para mí, toda la
 * info ahí, totalmente privada, y que pueda entrar solo con mi mail».
 *
 * Sin sesión, solo el formulario de entrada (lib/panel-sesion.ts). Con
 * sesión, todo se lee en el momento de Airtable y de los contadores propios
 * (lib/panel-servidor.ts). No se indexa, no se cachea y no se mide.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente de pago",
  pagado: "Pagado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
  rechazado: "Rechazado",
};

const numeroAR = (n: number, decimales = 0) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(n);
const pct = (n: number | null, decimales = 1) => (n === null ? "—" : `${numeroAR(n, decimales)} %`);
const pesos = (n: number | null) => (n === null ? "—" : precio(Math.round(n)));
const conSigno = (n: number) => `${n < 0 ? "−" : ""}${precio(Math.round(Math.abs(n)))}`;

/** «+12 %» contra el período anterior, o nada si antes no hubo ventas. */
function cambio(actual: number, anterior: number, dias: number): string | null {
  if (anterior <= 0) return null;
  const v = ((actual - anterior) / anterior) * 100;
  return `${v >= 0 ? "+" : "−"}${numeroAR(Math.abs(v), 0)} % vs. los ${dias} días anteriores`;
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string | null }) {
  return (
    <div className="panel-cifra">
      <dt>{titulo}</dt>
      <dd>
        <span className="panel-cifra__valor">{valor}</span>
        {detalle ? <span className="panel-cifra__detalle">{detalle}</span> : null}
      </dd>
    </div>
  );
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="panel-seccion">
      <h2>{titulo}</h2>
      {nota ? <p className="panel-seccion__nota">{nota}</p> : null}
      {children}
    </section>
  );
}

function SinDatos({ texto = "No se pudo leer. Probá recargar en un rato." }: { texto?: string }) {
  return <p className="apagado">{texto}</p>;
}

function TablaPedidos({ pedidos }: { pedidos: PedidoPanel[] }) {
  return (
    <div className="panel-tabla">
      <table>
        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Día</th>
            <th scope="col">Estado</th>
            <th scope="col">Productos</th>
            <th scope="col" className="panel-num">
              Total
            </th>
            <th scope="col">Provincia</th>
            <th scope="col">Origen</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.numero}>
              <td>{p.numero}</td>
              <td>{p.dia ? fechaLegible(p.dia) : "—"}</td>
              <td>{ESTADOS[p.estado] ?? p.estado}</td>
              <td>{p.items.map((i) => `${i.cantidad} × ${i.nombre}${i.color ? ` ${i.color}` : ""}`).join(", ") || "—"}</td>
              <td className="panel-num">{precio(p.total)}</td>
              <td>{p.provincia || "—"}</td>
              <td>{p.origen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Panel({ searchParams }: { searchParams: Promise<{ dias?: string | string[] }> }) {
  const valor = (await cookies()).get(COOKIE_PANEL)?.value ?? null;
  const email = await mailDeLaSesionPanel(valor).catch(() => null);

  if (!email) {
    return (
      <section className="contenedor seccion panel panel--entrar" aria-labelledby="panel-titulo">
        <p className="etiqueta-mono">Harper · Privado</p>
        <h1 id="panel-titulo" className="titulo-serif">
          Panel
        </h1>
        <p className="apagado">Entrá con tu mail: te mandamos un código.</p>
        <EntrarAlPanel />
      </section>
    );
  }

  const periodo = leerPeriodo((await searchParams).dias);
  const d = await datosDelPanel(periodo);
  const v = d.ventas;
  const conversion = d.embudo?.pasos.at(-1)?.deLasVisitas ?? null;
  const maxDia = v ? Math.max(1, ...v.porDia.map((x) => x.facturado)) : 1;
  const visitasEmbudo = d.embudo?.pasos[0]?.valor ?? 0;
  const ahora = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <section className="contenedor seccion panel" aria-labelledby="panel-titulo">
      <header className="panel-cabecera">
        <div>
          <p className="etiqueta-mono">Harper · Privado</p>
          <h1 id="panel-titulo" className="titulo-serif">
            Cómo va Harper
          </h1>
          <p className="apagado">
            Del {fechaLegible(d.desde)} al {fechaLegible(d.hoy)} · leído a las {ahora} · {email} · <SalirDelPanel />
          </p>
        </div>
        <nav className="panel-periodos" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p} href={`/panel?dias=${p}`} aria-current={p === periodo ? "page" : undefined} className="panel-periodo">
              {p} días
            </Link>
          ))}
        </nav>
      </header>

      {d.errores.length > 0 ? (
        <p className="panel-aviso" role="status">
          No se pudieron leer {d.errores.join(", ")}. Lo demás está al día.
        </p>
      ) : null}

      <Seccion titulo="La tienda web">
        {v ? (
          <dl className="panel-cifras">
            <Cifra titulo="Facturado" valor={precio(v.facturado)} detalle={cambio(v.facturado, v.anterior.facturado, periodo)} />
            <Cifra titulo="Pedidos pagados" valor={numeroAR(v.pedidos)} detalle={`${numeroAR(v.anterior.pedidos)} en los ${periodo} días anteriores`} />
            <Cifra titulo="Ticket promedio" valor={pesos(v.ticket)} />
            <Cifra titulo="Unidades" valor={numeroAR(v.unidades)} />
            <Cifra
              titulo="Ganancia estimada"
              valor={d.margen ? conSigno(d.margen.contribucion) : "—"}
              detalle={
                d.margen
                  ? `${pesos(d.margen.porPedido)} por pedido · ${pct(d.margen.porcentaje)} de las ventas sin IVA`
                  : d.sinMargen
              }
            />
            <Cifra
              titulo="Conversión"
              valor={pct(conversion, 2)}
              detalle={d.embudo?.desde ? `pagados sobre visitas, desde el ${fechaLegible(d.embudo.desde)}` : "todavía sin visitas contadas"}
            />
          </dl>
        ) : (
          <SinDatos />
        )}
      </Seccion>

      {v ? (
        <Seccion titulo="Para despachar" nota="Pagados que todavía no salieron, de cualquier fecha.">
          {v.paraDespachar.length > 0 ? <TablaPedidos pedidos={v.paraDespachar} /> : <p className="apagado">No hay nada pendiente de despacho.</p>}
        </Seccion>
      ) : null}

      {v ? (
        <Seccion titulo="Facturado por día" nota="Pedidos pagados, por el día de la compra.">
          <div className="panel-barras" role="img" aria-label={`Facturado por día, de ${fechaLegible(d.desde)} a ${fechaLegible(d.hoy)}`}>
            {v.porDia.map((x) => (
              <span
                key={x.dia}
                className="panel-barras__barra"
                tabIndex={0}
                data-valor={`${fechaLegible(x.dia)}: ${precio(x.facturado)} · ${x.pedidos} ${x.pedidos === 1 ? "pedido" : "pedidos"}`}
                style={{ height: `${x.facturado > 0 ? Math.max(3, (x.facturado / maxDia) * 100) : 0}%` }}
              />
            ))}
          </div>
          <div className="panel-barras__eje" aria-hidden="true">
            <span>{fechaLegible(d.desde)}</span>
            <span>{fechaLegible(d.hoy)}</span>
          </div>
          <details className="panel-detalle">
            <summary>Ver la tabla</summary>
            <div className="panel-tabla">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col" className="panel-num">
                      Pedidos
                    </th>
                    <th scope="col" className="panel-num">
                      Facturado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...v.porDia].reverse().map((x) => (
                    <tr key={x.dia}>
                      <td>{fechaLegible(x.dia)}</td>
                      <td className="panel-num">{x.pedidos}</td>
                      <td className="panel-num">{precio(x.facturado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Seccion>
      ) : null}

      <Seccion
        titulo="El recorrido"
        nota="Cada paso cuenta una vez por visita. Los contadores empezaron con este panel: antes no hay visitas contadas."
      >
        {d.embudo && d.embudo.desde ? (
          <ol className="panel-embudo">
            {d.embudo.pasos.map((p) => (
              <li key={p.nombre}>
                <span className="panel-embudo__nombre">{p.nombre}</span>
                <span className="panel-embudo__pista" aria-hidden="true">
                  <span className="panel-embudo__barra" style={{ width: `${visitasEmbudo > 0 ? Math.min(100, (p.valor / visitasEmbudo) * 100) : 0}%` }} />
                </span>
                <span className="panel-num">
                  {numeroAR(p.valor)} <span className="apagado">· {pct(p.deLasVisitas)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <SinDatos texto={d.embudo ? "Todavía no hay visitas contadas en este período." : "Los contadores no están disponibles (Redis)."} />
        )}
        <p className="panel-seccion__nota">
          De dónde llegan, qué páginas miran y qué tan rápido carga el sitio:{" "}
          <a href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fanalytics&title=Web%20Analytics" target="_blank" rel="noreferrer">
            Vercel Analytics
          </a>{" "}
          y{" "}
          <a href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fspeed-insights&title=Speed%20Insights" target="_blank" rel="noreferrer">
            Speed Insights
          </a>
          .
        </p>
      </Seccion>

      <Seccion
        titulo="Cuánto dejó"
        nota="Estimado, de los pedidos pagados del período: ventas y envíos sin IVA, costo de la tabla Costos ML y el cashback que se dio. No incluye la comisión de Mercado Pago, que no queda en el pedido."
      >
        {d.margen ? (
          <>
            <dl className="panel-cuenta">
              <div>
                <dt>Ventas sin IVA</dt>
                <dd>{pesos(d.margen.ventasNetas)}</dd>
              </div>
              <div>
                <dt>− Costo de los productos</dt>
                <dd>{pesos(d.margen.productos)}</dd>
              </div>
              <div>
                <dt>− Packaging</dt>
                <dd>{pesos(d.margen.packaging)}</dd>
              </div>
              <div>
                <dt>− Envíos</dt>
                <dd>{pesos(d.margen.envios)}</dd>
              </div>
              <div>
                <dt>− Cashback a suscriptores</dt>
                <dd>{pesos(d.margen.cashback)}</dd>
              </div>
              <div className="panel-cuenta__total">
                <dt>Queda (antes de Mercado Pago)</dt>
                <dd>{conSigno(d.margen.contribucion)}</dd>
              </div>
            </dl>
            {d.margen.sinCosto > 0 ? (
              <p className="panel-aviso">
                {d.margen.sinCosto} {d.margen.sinCosto === 1 ? "pedido queda afuera" : "pedidos quedan afuera"}: a algún producto le falta el costo en Costos ML.
              </p>
            ) : null}
            {d.margen.enviosEstimados > 0 ? (
              <p className="panel-seccion__nota">
                En {d.margen.enviosEstimados} {d.margen.enviosEstimados === 1 ? "pedido" : "pedidos"} sin envío cotizado se usó la tarifa plana de Config.
              </p>
            ) : null}
          </>
        ) : (
          <SinDatos texto={d.sinMargen ?? undefined} />
        )}
      </Seccion>

      {v ? (
        <div className="panel-columnas">
          <Seccion titulo="Por modelo">
            {v.porModelo.length > 0 ? (
              <div className="panel-tabla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Modelo</th>
                      <th scope="col" className="panel-num">
                        Unidades
                      </th>
                      <th scope="col" className="panel-num">
                        Facturado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.porModelo.map((m) => (
                      <tr key={m.nombre}>
                        <td>{m.nombre}</td>
                        <td className="panel-num">{numeroAR(m.unidades)}</td>
                        <td className="panel-num">{precio(m.facturado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="apagado">Sin ventas en el período.</p>
            )}
          </Seccion>

          <Seccion titulo="De dónde llegaron" nota="Solo se guarda con el sí a las cookies de medición.">
            {v.porOrigen.length > 0 ? (
              <div className="panel-tabla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Origen</th>
                      <th scope="col" className="panel-num">
                        Pedidos
                      </th>
                      <th scope="col" className="panel-num">
                        Facturado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.porOrigen.map((o) => (
                      <tr key={o.origen}>
                        <td>{o.origen}</td>
                        <td className="panel-num">{numeroAR(o.pedidos)}</td>
                        <td className="panel-num">{precio(o.facturado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="apagado">Sin ventas en el período.</p>
            )}
          </Seccion>

          <Seccion titulo="Pedidos del período, por estado">
            {Object.keys(v.estados).length > 0 ? (
              <dl className="panel-cuenta">
                {Object.entries(v.estados)
                  .sort((a, b) => b[1] - a[1])
                  .map(([estado, n]) => (
                    <div key={estado}>
                      <dt>{ESTADOS[estado] ?? estado}</dt>
                      <dd>{numeroAR(n)}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="apagado">Ningún pedido.</p>
            )}
          </Seccion>

          <Seccion titulo="Beneficios usados" nota="En los pedidos pagados del período.">
            <dl className="panel-cuenta">
              <div>
                <dt>Pedidos de suscriptores</dt>
                <dd>{numeroAR(v.beneficios.deSuscriptores)}</dd>
              </div>
              <div>
                <dt>Cupones de bienvenida</dt>
                <dd>
                  {numeroAR(v.beneficios.conCupon)} · {precio(v.beneficios.cupones)}
                </dd>
              </div>
              <div>
                <dt>Saldo usado</dt>
                <dd>{precio(v.beneficios.saldoUsado)}</dd>
              </div>
              <div>
                <dt>Cashback dado</dt>
                <dd>{precio(v.beneficios.cashback)}</dd>
              </div>
              <div>
                <dt>Con dinero en Mercado Pago</dt>
                <dd>{numeroAR(v.beneficios.conDineroMP)}</dd>
              </div>
            </dl>
          </Seccion>
        </div>
      ) : null}

      <div className="panel-columnas">
        <Seccion titulo="Suscriptores">
          {d.suscriptores ? (
            <>
              <dl className="panel-cuenta">
                <div>
                  <dt>Activos hoy</dt>
                  <dd>{numeroAR(d.suscriptores.activos)}</dd>
                </div>
                <div>
                  <dt>Nuevos en el período</dt>
                  <dd>{numeroAR(d.suscriptores.nuevos)}</dd>
                </div>
                <div>
                  <dt>Bajas en el período</dt>
                  <dd>{numeroAR(d.suscriptores.bajas)}</dd>
                </div>
                <div>
                  <dt>Cupones sin usar</dt>
                  <dd>{numeroAR(d.suscriptores.cuponesDisponibles)}</dd>
                </div>
                <div>
                  <dt>Cupones usados (siempre)</dt>
                  <dd>{numeroAR(d.suscriptores.cuponesUsados)}</dd>
                </div>
              </dl>
              {d.suscriptores.porOrigen.length > 0 ? (
                <p className="panel-seccion__nota">
                  Los nuevos, por dónde se suscribieron: {d.suscriptores.porOrigen.map((o) => `${o.origen} ${o.nuevos}`).join(" · ")}.
                </p>
              ) : null}
            </>
          ) : (
            <SinDatos />
          )}
        </Seccion>

        <Seccion titulo="Saldos de suscriptores" nota="Lo disponible y lo en camino es plata que Harper debe en descuentos.">
          {d.saldos ? (
            <dl className="panel-cuenta">
              <div>
                <dt>Disponible para usar</dt>
                <dd>{precio(d.saldos.disponible)}</dd>
              </div>
              <div>
                <dt>En camino</dt>
                <dd>{precio(d.saldos.enCamino)}</dd>
              </div>
              <div>
                <dt>Cashback dado en el período</dt>
                <dd>{precio(d.saldos.emitido)}</dd>
              </div>
              <div>
                <dt>Usado en el período</dt>
                <dd>{precio(d.saldos.usado)}</dd>
              </div>
              <div>
                <dt>Anulado en el período</dt>
                <dd>{precio(d.saldos.anulado)}</dd>
              </div>
            </dl>
          ) : (
            <SinDatos />
          )}
        </Seccion>
      </div>

      <Seccion
        titulo="Mercado Libre"
        nota={`Últimos 30 días, sea cual sea el período elegido${d.ml?.actualizado ? `. Actualizado: ${d.ml.actualizado.slice(0, 10).split("-").reverse().join("/")}` : ""}.`}
      >
        {d.ml ? (
          <>
            <dl className="panel-cifras">
              <Cifra titulo="Facturado" valor={precio(d.ml.facturado)} detalle={`${numeroAR(d.ml.unidades)} unidades · ${numeroAR(d.ml.unidades7d)} en 7 días`} />
              <Cifra titulo="Visitas" valor={numeroAR(d.ml.visitas)} detalle={`conversión ${pct(d.ml.conversion, 2)}`} />
              <Cifra titulo="Comisión de ML" valor={precio(d.ml.comision)} />
              <Cifra
                titulo="Publicidad"
                valor={precio(d.ml.adsCosto)}
                detalle={`ventas atribuidas ${precio(d.ml.adsVentas)} · ROAS ${d.ml.roas === null ? "—" : numeroAR(d.ml.roas, 1)}`}
              />
            </dl>
            {d.ml.top.length > 0 ? (
              <div className="panel-tabla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Publicación</th>
                      <th scope="col" className="panel-num">
                        Unidades
                      </th>
                      <th scope="col" className="panel-num">
                        Facturado
                      </th>
                      <th scope="col" className="panel-num">
                        ROAS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ml.top.map((t) => (
                      <tr key={t.titulo}>
                        <td>{t.titulo}</td>
                        <td className="panel-num">{numeroAR(t.unidades)}</td>
                        <td className="panel-num">{precio(t.facturado)}</td>
                        <td className="panel-num">{t.roas === null ? "—" : numeroAR(t.roas, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <SinDatos texto="Sin métricas de Mercado Libre." />
        )}
      </Seccion>

      {v ? (
        <Seccion titulo="Últimos pedidos" nota="Del período, de cualquier estado.">
          {v.ultimos.length > 0 ? <TablaPedidos pedidos={v.ultimos} /> : <p className="apagado">Ningún pedido en el período.</p>}
        </Seccion>
      ) : null}

      <p className="panel-seccion__nota">
        Todo sale de la base de Airtable{" "}
        <a href="https://airtable.com/appcFfhxM8uVdVKoP" target="_blank" rel="noreferrer">
          Harper
        </a>
        .
      </p>
    </section>
  );
}
