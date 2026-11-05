"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import CampoDireccion, { type DireccionElegida } from "@/components/checkout/CampoDireccion";
import { PROVINCIAS } from "@/components/checkout/provincias";
import { faltantes } from "@/lib/direcciones";
import {
  MAXIMO_DIRECCIONES,
  renglonesDeDireccion,
  type DatosPersonales,
  type DireccionGuardada,
  type DireccionNueva,
  type ErroresDatos,
  type ErroresDireccion,
} from "@/lib/mis-datos";
import type { VistaMisDatos } from "@/lib/mis-datos-servidor";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores.cuenta.misDatos;
const TD = T.direcciones;

type Aviso = { tipo: "ok" | "error"; texto: string } | null;

/**
 * «Mis datos» y «Mis direcciones» en Mi cuenta (Ale, 05/11/2026): nombre,
 * mail verificado, teléfono y DNI, y hasta cinco direcciones con una
 * principal. Llegan armados del servidor (lib/mis-datos-servidor.ts) y cada
 * cambio va a /api/suscriptores/datos o /api/suscriptores/direcciones, que
 * escriben solo en la cuenta de la sesión. `vista` null = no se pudo leer.
 */
export default function MisDatos({ vista, buscador }: { vista: VistaMisDatos | null; buscador: boolean }) {
  return (
    <section id="mis-datos" className="mis-datos" aria-labelledby="mis-datos-titulo">
      <h2 id="mis-datos-titulo" className="mis-datos__titulo">
        {T.titulo}
      </h2>
      <p className="mis-datos__bajada">{T.bajada}</p>
      {vista ? (
        <>
          <DatosDeLaCuenta inicial={vista.datos} deLaUltimaCompra={vista.deLaUltimaCompra} />
          <Direcciones inicial={vista.direcciones} sugerida={vista.sugerida} buscador={buscador} />
        </>
      ) : (
        <p className="mis-compras__aviso" role="status">
          {T.error}
        </p>
      )}
    </section>
  );
}

// ---------- Datos personales ----------

function DatosDeLaCuenta({ inicial, deLaUltimaCompra }: { inicial: DatosPersonales; deLaUltimaCompra: VistaMisDatos["deLaUltimaCompra"] }) {
  const [datos, setDatos] = useState(inicial);
  const [deCompra, setDeCompra] = useState(deLaUltimaCompra);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState<ErroresDatos>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/suscriptores/datos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: form.nombre, telefono: form.telefono, dni: form.dni }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { datos?: DatosPersonales; errores?: ErroresDatos };
      if (r.ok && cuerpo.datos) {
        setDatos(cuerpo.datos);
        setForm(cuerpo.datos);
        setDeCompra([]);
        setErrores({});
        setEditando(false);
        setAviso({ tipo: "ok", texto: T.guardado });
      } else if (cuerpo.errores) {
        setErrores(cuerpo.errores);
      } else {
        setAviso({ tipo: "error", texto: T.error });
      }
    } catch {
      setAviso({ tipo: "error", texto: T.error });
    } finally {
      setGuardando(false);
    }
  }

  const marca = (campo: "nombre" | "telefono" | "dni") => (deCompra.includes(campo) ? " *" : "");

  return (
    <div className="mis-datos__bloque">
      {editando ? (
        <form className="mis-datos__form" onSubmit={guardar} noValidate>
          <Campo id="datos-nombre" etiqueta={T.nombre} autoComplete="name" valor={form.nombre} error={errores.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
          <div className="mis-datos__fijo">
            <span className="mis-datos__etiqueta">{T.email}</span>
            <span className="mis-datos__valor">
              {datos.email} <Verificado />
            </span>
            <small className="mis-datos__nota">{T.emailNota}</small>
          </div>
          <div className="mis-datos__par">
            <Campo id="datos-telefono" etiqueta={T.telefono} tipo="tel" autoComplete="tel" inputMode="tel" valor={form.telefono} error={errores.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
            <Campo id="datos-dni" etiqueta={T.dni} inputMode="numeric" autoComplete="off" valor={form.dni} error={errores.dni} onChange={(v) => setForm({ ...form, dni: v })} />
          </div>
          <small className="mis-datos__nota">{T.dniNota}</small>
          <div className="mis-datos__acciones">
            <button type="submit" className="boton" disabled={guardando}>
              {guardando ? T.guardando : T.guardar}
            </button>
            <button
              type="button"
              className="enlace-accion"
              disabled={guardando}
              onClick={() => {
                setForm(datos);
                setErrores({});
                setEditando(false);
              }}
            >
              {T.cancelar}
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="mis-datos__lista">
            <Dato etiqueta={T.nombre}>{datos.nombre ? `${datos.nombre}${marca("nombre")}` : <SinCargar />}</Dato>
            <Dato etiqueta={T.email}>
              {datos.email} <Verificado />
            </Dato>
            <Dato etiqueta={T.telefono}>{datos.telefono ? `${datos.telefono}${marca("telefono")}` : <SinCargar />}</Dato>
            <Dato etiqueta={T.dni}>{datos.dni ? `${datos.dni}${marca("dni")}` : <SinCargar />}</Dato>
          </dl>
          {deCompra.length > 0 ? <p className="mis-datos__nota">{T.deLaUltimaCompra}</p> : null}
          <button
            type="button"
            className="boton boton--fantasma mis-datos__editar"
            onClick={() => {
              setForm(datos);
              setAviso(null);
              setEditando(true);
            }}
          >
            {T.editar}
          </button>
        </>
      )}
      <AvisoDeEstado aviso={aviso} />
    </div>
  );
}

// ---------- Direcciones ----------

async function cambiar(cuerpo: Record<string, unknown>): Promise<{ direcciones?: DireccionGuardada[]; errores?: ErroresDireccion; error?: string }> {
  try {
    const r = await fetch("/api/suscriptores/direcciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const respuesta = (await r.json().catch(() => ({}))) as { direcciones?: DireccionGuardada[]; errores?: ErroresDireccion; error?: string };
    if (r.ok && respuesta.direcciones) return { direcciones: respuesta.direcciones };
    return { errores: respuesta.errores, error: respuesta.errores ? undefined : (respuesta.error ?? TD.error), direcciones: respuesta.direcciones };
  } catch {
    return { error: TD.error };
  }
}

function Direcciones({ inicial, sugerida, buscador }: { inicial: DireccionGuardada[]; sugerida: DireccionNueva | null; buscador: boolean }) {
  const [lista, setLista] = useState(inicial);
  const [propuesta, setPropuesta] = useState(sugerida);
  /** null: la lista; "nueva": el formulario vacío; un id: editando esa. */
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  async function ejecutar(cuerpo: Record<string, unknown>, listo: string) {
    setOcupado(true);
    setAviso(null);
    const r = await cambiar(cuerpo);
    setOcupado(false);
    if (r.direcciones && !r.error && !r.errores) {
      setLista(r.direcciones);
      setEditando(null);
      setBorrando(null);
      setPropuesta(null);
      setAviso({ tipo: "ok", texto: listo });
      return null;
    }
    if (r.direcciones) setLista(r.direcciones);
    if (r.error) setAviso({ tipo: "error", texto: r.error });
    return r.errores ?? null;
  }

  const enEdicion = editando && editando !== "nueva" ? lista.find((d) => d.id === editando) : undefined;

  return (
    <section className="mis-direcciones" aria-labelledby="mis-direcciones-titulo">
      <h3 id="mis-direcciones-titulo" className="mis-direcciones__titulo">
        {TD.titulo}
      </h3>
      <p className="mis-datos__bajada">{TD.bajada}</p>

      {editando ? (
        <FormularioDireccion
          inicial={enEdicion ?? null}
          esLaPrincipal={enEdicion?.principal ?? lista.length === 0}
          buscador={buscador}
          ocupado={ocupado}
          onCancelar={() => setEditando(null)}
          onGuardar={(direccion, principal) =>
            ejecutar(enEdicion ? { accion: "editar", id: enEdicion.id, direccion, principal } : { accion: "agregar", direccion, principal }, TD.guardada)
          }
        />
      ) : (
        <>
          {lista.length === 0 && !propuesta ? <p className="mis-compras__aviso">{TD.vacio}</p> : null}

          {lista.length === 0 && propuesta ? (
            <div className="direccion-guardada direccion-guardada--sugerida">
              <p className="direccion-guardada__pregunta">{TD.sugerida}</p>
              <Renglones direccion={propuesta} />
              <div className="direccion-guardada__acciones">
                <button type="button" className="boton boton--chico" disabled={ocupado} onClick={() => void ejecutar({ accion: "agregar", direccion: propuesta, principal: true }, TD.guardada)}>
                  {TD.guardarSugerida}
                </button>
              </div>
            </div>
          ) : null}

          {lista.length > 0 ? (
            <ul className="mis-direcciones__lista">
              {lista.map((d) => (
                <li key={d.id} className="direccion-guardada" data-principal={d.principal || undefined}>
                  <div className="direccion-guardada__encabezado">
                    <span className="direccion-guardada__alias">{d.alias || TD.sinNombre}</span>
                    {d.principal ? <span className="direccion-guardada__principal">{TD.principal}</span> : null}
                  </div>
                  <Renglones direccion={d} />
                  {borrando === d.id ? (
                    <div className="direccion-guardada__acciones" role="group" aria-label={TD.eliminarConfirmar}>
                      <span className="direccion-guardada__pregunta">{TD.eliminarConfirmar}</span>
                      <button type="button" className="enlace-accion direccion-guardada__eliminar" disabled={ocupado} onClick={() => void ejecutar({ accion: "eliminar", id: d.id }, TD.eliminada)}>
                        {TD.siEliminar}
                      </button>
                      <button type="button" className="enlace-accion" disabled={ocupado} onClick={() => setBorrando(null)}>
                        {TD.noEliminar}
                      </button>
                    </div>
                  ) : (
                    <div className="direccion-guardada__acciones">
                      <button type="button" className="enlace-accion" disabled={ocupado} onClick={() => setEditando(d.id)}>
                        {TD.editar}
                      </button>
                      {d.principal ? null : (
                        <button type="button" className="enlace-accion" disabled={ocupado} onClick={() => void ejecutar({ accion: "principal", id: d.id }, TD.guardada)}>
                          {TD.hacerPrincipal}
                        </button>
                      )}
                      <button type="button" className="enlace-accion" disabled={ocupado} onClick={() => setBorrando(d.id)}>
                        {TD.eliminar}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {lista.length < MAXIMO_DIRECCIONES ? (
            <button
              type="button"
              className="boton boton--fantasma mis-direcciones__agregar"
              disabled={ocupado}
              onClick={() => {
                setAviso(null);
                setEditando("nueva");
              }}
            >
              {TD.agregar}
            </button>
          ) : (
            <p className="mis-datos__nota">{TD.tope(MAXIMO_DIRECCIONES)}</p>
          )}
        </>
      )}
      <AvisoDeEstado aviso={aviso} />
    </section>
  );
}

function elegidaDe(d: DireccionGuardada | null): DireccionElegida | null {
  if (!d?.lugar) return null;
  return {
    id: d.lugar.id,
    calle: d.lugar.calle,
    numero: d.lugar.numero,
    localidad: d.ciudad,
    barrio: d.lugar.barrio,
    provincia: d.provincia,
    cp: d.cp,
    partido: d.lugar.partido || undefined,
    texto: d.lugar.texto,
  };
}

/**
 * Agregar o editar una dirección: como en el checkout, se busca en la lista de
 * Google y se completa solo lo que no trajo; si Google no está o no la
 * encuentra, con los campos de siempre.
 */
function FormularioDireccion({
  inicial,
  esLaPrincipal,
  buscador,
  ocupado,
  onGuardar,
  onCancelar,
}: {
  inicial: DireccionGuardada | null;
  esLaPrincipal: boolean;
  buscador: boolean;
  ocupado: boolean;
  onGuardar: (direccion: Record<string, unknown>, principal: boolean) => Promise<ErroresDireccion | null>;
  onCancelar: () => void;
}) {
  const [modo, setModo] = useState<"buscador" | "manual">(buscador && (!inicial || inicial.lugar) ? "buscador" : "manual");
  const [elegida, setElegida] = useState<DireccionElegida | null>(elegidaDe(inicial));
  // El número que Google no trajo (lo escribe la persona).
  const [numero, setNumero] = useState("");
  const [alias, setAlias] = useState(inicial?.alias ?? "");
  const [piso, setPiso] = useState(inicial?.piso ?? "");
  const [direccion, setDireccion] = useState(inicial && !inicial.lugar ? inicial.direccion : "");
  const [ciudad, setCiudad] = useState(inicial?.ciudad ?? "");
  const [provincia, setProvincia] = useState(inicial?.provincia ?? "");
  const [cp, setCp] = useState(inicial?.cp ?? "");
  const [principal, setPrincipal] = useState(esLaPrincipal);
  const [errores, setErrores] = useState<ErroresDireccion & { domicilio?: string }>({});
  const faltan = elegida ? faltantes(elegida) : [];

  function aMano(tipeado = "") {
    setModo("manual");
    if (elegida) {
      setDireccion(`${elegida.calle} ${elegida.numero || numero}`.trim());
      setCiudad(elegida.localidad || ciudad);
      setProvincia(elegida.provincia || provincia);
      setCp(elegida.cp || cp);
    } else if (tipeado.trim()) {
      setDireccion(tipeado.trim());
    }
    setElegida(null);
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (modo === "buscador" && !elegida) {
      setErrores({ domicilio: "Elegí tu dirección de la lista" });
      return;
    }
    const cuerpo =
      modo === "buscador" && elegida
        ? {
            alias,
            piso,
            ciudad: elegida.localidad || ciudad,
            provincia: elegida.provincia || provincia,
            cp: elegida.cp || cp,
            lugar: {
              id: elegida.id,
              calle: elegida.calle,
              numero: elegida.numero || numero.trim(),
              barrio: elegida.barrio,
              partido: elegida.partido ?? "",
              texto: elegida.texto,
            },
          }
        : { alias, direccion, piso, ciudad, provincia, cp };
    const encontrados = await onGuardar(cuerpo, principal);
    setErrores(encontrados ?? {});
  }

  return (
    <form className="mis-datos__form direccion-form" onSubmit={guardar} noValidate>
      <p className="direccion-form__titulo">{inicial ? TD.editando : TD.nueva}</p>
      <Campo id="direccion-alias" etiqueta={TD.alias} placeholder={TD.aliasEjemplo} autoComplete="off" valor={alias} error={errores.alias} onChange={setAlias} />

      {modo === "buscador" ? (
        <>
          <CampoDireccion
            elegida={elegida}
            onElegir={(d) => {
              setElegida(d);
              setNumero("");
              setErrores({});
            }}
            onCambiar={() => setElegida(null)}
            onNoDisponible={aMano}
            onManual={aMano}
            error={errores.domicilio ?? (!faltan.includes("numero") ? errores.direccion : undefined)}
          />
          {elegida && faltan.includes("numero") ? (
            <Campo id="direccion-numero" etiqueta={TD.numero} inputMode="numeric" autoComplete="off" valor={numero} error={errores.direccion} onChange={setNumero} />
          ) : null}
          {elegida ? <Campo id="direccion-piso" etiqueta={TD.piso} placeholder="5° B" autoComplete="off" valor={piso} onChange={setPiso} /> : null}
          {elegida && faltan.includes("cp") ? (
            <Campo id="direccion-cp" etiqueta={TD.cp} inputMode="numeric" autoComplete="postal-code" valor={cp} error={errores.cp} onChange={setCp} />
          ) : null}
          {elegida && faltan.includes("localidad") ? (
            <Campo id="direccion-ciudad" etiqueta={TD.localidad} autoComplete="address-level2" valor={ciudad} error={errores.ciudad} onChange={setCiudad} />
          ) : null}
          {elegida && faltan.includes("provincia") ? <SelectorProvincia valor={provincia} error={errores.provincia} onChange={setProvincia} /> : null}
        </>
      ) : (
        <>
          <Campo id="direccion-calle" etiqueta={TD.calle} placeholder="Av. Cabildo 1234" autoComplete="address-line1" valor={direccion} error={errores.direccion} onChange={setDireccion} />
          <Campo id="direccion-piso" etiqueta={TD.piso} placeholder="5° B" autoComplete="off" valor={piso} onChange={setPiso} />
          <div className="mis-datos__par">
            <Campo id="direccion-ciudad" etiqueta={TD.localidad} autoComplete="address-level2" valor={ciudad} error={errores.ciudad} onChange={setCiudad} />
            <Campo id="direccion-cp" etiqueta={TD.cp} inputMode="numeric" autoComplete="postal-code" valor={cp} error={errores.cp} onChange={setCp} />
          </div>
          <SelectorProvincia valor={provincia} error={errores.provincia} onChange={setProvincia} />
          {buscador ? (
            <p className="domicilio__ayuda apagado">
              <button type="button" className="enlace-accion" onClick={() => setModo("buscador")}>
                Buscar la dirección con Google
              </button>
            </p>
          ) : null}
        </>
      )}

      {esLaPrincipal ? null : (
        <label className="checkout__promos">
          <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
          <span>{TD.marcarPrincipal}</span>
        </label>
      )}

      <div className="mis-datos__acciones">
        <button type="submit" className="boton" disabled={ocupado}>
          {ocupado ? T.guardando : TD.guardar}
        </button>
        <button type="button" className="enlace-accion" disabled={ocupado} onClick={onCancelar}>
          {T.cancelar}
        </button>
      </div>
    </form>
  );
}

// ---------- Piezas ----------

function Renglones({ direccion }: { direccion: DireccionNueva }) {
  const [uno, dos] = renglonesDeDireccion(direccion);
  return (
    <p className="direccion-guardada__renglones">
      <span>{uno}</span>
      <span className="apagado">{dos}</span>
    </p>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="mis-datos__dato">
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Verificado() {
  return <span className="mis-datos__verificado">✓ {T.verificado}</span>;
}

function SinCargar() {
  return <span className="apagado">{T.sinCargar}</span>;
}

function AvisoDeEstado({ aviso }: { aviso: Aviso }) {
  return (
    <p className="mis-datos__aviso" role="status" aria-live="polite" data-tipo={aviso?.tipo}>
      {aviso?.texto ?? ""}
    </p>
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
  inputMode?: "numeric" | "text" | "tel";
  placeholder?: string;
}) {
  return (
    <label className="campo" htmlFor={id} data-error={Boolean(error)}>
      <span>{etiqueta}</span>
      <input id={id} name={id} type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} {...resto} />
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function SelectorProvincia({ valor, error, onChange }: { valor: string; error?: string; onChange: (valor: string) => void }) {
  return (
    <label className="campo" data-error={Boolean(error)}>
      <span>{TD.provincia}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} autoComplete="address-level1" aria-invalid={Boolean(error)}>
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
