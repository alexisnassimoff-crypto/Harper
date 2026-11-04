"use client";

import Link from "next/link";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { precio as formatearPrecio } from "@/lib/formato";
import { CUPON_BIENVENIDA, type OrigenSuscripcion } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import { emailValido } from "@/lib/validacion";
import { refrescarSuscriptor } from "./useSuscriptor";

const { form: T } = TEXTOS.suscriptores;

/** Lo que contesta /api/suscriptores/confirmar cuando sale bien. */
export type SuscripcionConfirmada = {
  estado: "nueva" | "reactivada" | "ya" | "baja";
  suscriptor: {
    email: string;
    nombre: string;
    cupon: "Disponible" | "Usado";
    saldoDisponible: number;
    saldoEnCamino: number;
    /** Falso si entró alguien que se dio de baja: solo su saldo, sin beneficios nuevos. */
    activo?: boolean;
  };
};

type Modo = "suscribir" | "entrar";

/**
 * Suscribirse o entrar como suscriptor (Ale, 03/11/2026): el mail, el código
 * de 6 números que le llega y listo (app/api/suscriptores/codigo y
 * confirmar). Es el mismo camino para las dos cosas: si el mail ya está
 * suscripto, entra; si no, se suscribe, siempre con la casilla de los mails
 * marcada por la persona (sin marcar de entrada). La sesión queda en una
 * cookie que solo lee el servidor; acá no se guarda nada.
 *
 * Lo usan la portada, /suscriptores, «mi cuenta», la ficha y el checkout. En
 * el checkout el mail es el que ya escribió (`email`) y no se vuelve a pedir.
 */
export default function FormularioSuscripcion({
  origen,
  modoInicial = "suscribir",
  email: emailDado,
  nombre: nombreDado,
  conNombre = true,
  alListo,
  mostrarListo = true,
  textoBoton,
  conCambioDeModo = true,
  anidado = false,
}: {
  origen: OrigenSuscripcion;
  modoInicial?: Modo;
  /** El mail ya escrito en otro lado (el checkout): no se muestra el campo. */
  email?: string;
  /** El nombre ya escrito en otro lado (el checkout), si no se pide acá. */
  nombre?: string;
  conNombre?: boolean;
  alListo?: (r: SuscripcionConfirmada) => void;
  /** Falso cuando quien lo usa muestra el resultado a su manera (el checkout recalcula el carrito). */
  mostrarListo?: boolean;
  textoBoton?: string;
  /** «¿Ya sos suscriptor? Entrá con tu mail» debajo del formulario. */
  conCambioDeModo?: boolean;
  /**
   * Dentro de otro formulario (el checkout): sin <form> propio, que no se
   * puede anidar. Los botones y el Enter de los campos hacen lo mismo, sin
   * mandar el formulario de afuera.
   */
  anidado?: boolean;
}) {
  const id = useId();
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [emailPropio, setEmailPropio] = useState("");
  const [nombre, setNombre] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [desafio, setDesafio] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState<SuscripcionConfirmada | null>(null);
  // Quiso entrar con un mail que no estaba suscripto: la casilla aparece junto al código.
  const [faltabaCasilla, setFaltabaCasilla] = useState(false);

  const email = (emailDado ?? emailPropio).trim().toLowerCase();
  const suscribe = modo === "suscribir";

  async function pedirCodigo(evento?: FormEvent) {
    evento?.preventDefault();
    setError("");
    if (!emailValido(email)) return setError("Revisá el mail.");
    // Para suscribirse, la casilla antes del código: sin ella el código no sirve.
    if (suscribe && !acepta) return setError(T.faltaAcepto);
    setOcupado(true);
    try {
      const r = await fetch("/api/suscriptores/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { desafio?: string; error?: string };
      if (!r.ok || !cuerpo.desafio) throw new Error(cuerpo.error ?? "No pudimos mandar el código. Probá en un rato.");
      setDesafio(cuerpo.desafio);
      setCodigo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandar el código.");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(evento?: FormEvent) {
    evento?.preventDefault();
    setError("");
    if (suscribe && !acepta) return setError(T.faltaAcepto);
    const nombreAEnviar = nombre.trim() || (nombreDado ?? "").trim();
    setOcupado(true);
    try {
      const r = await fetch("/api/suscriptores/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          codigo: codigo.trim(),
          desafio,
          ...(nombreAEnviar ? { nombre: nombreAEnviar } : {}),
          aceptaMails: suscribe && acepta,
          origen,
        }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as Partial<SuscripcionConfirmada> & { error?: string; faltaAceptarMails?: boolean };
      // Quiso entrar con un mail que no está suscripto: el mismo código sirve
      // para suscribirse, con la casilla.
      if (r.status === 400 && cuerpo.faltaAceptarMails) {
        setModo("suscribir");
        setFaltabaCasilla(true);
        setError(T.noSuscripto);
        return;
      }
      if (!r.ok || !cuerpo.estado || !cuerpo.suscriptor) throw new Error(cuerpo.error ?? "No pudimos confirmar tu mail. Probá de nuevo.");
      const resultado = { estado: cuerpo.estado, suscriptor: cuerpo.suscriptor };
      void refrescarSuscriptor();
      setListo(resultado);
      alListo?.(resultado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos confirmar tu mail.");
    } finally {
      setOcupado(false);
    }
  }

  function volver() {
    setFaltabaCasilla(false);
    setDesafio(null);
    setCodigo("");
    setError("");
  }

  // El envoltorio: un <form> propio, o un grupo dentro del formulario de afuera.
  // Es una función y no un componente: así los campos no se vuelven a montar
  // (y no pierden el foco) en cada tecla.
  const envolver = (alEnviar: () => void, children: ReactNode) =>
    anidado ? (
      <div
        className="suscripcion"
        role="group"
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
            e.preventDefault();
            alEnviar();
          }
        }}
      >
        {children}
      </div>
    ) : (
      <form className="suscripcion" onSubmit={(e) => (e.preventDefault(), alEnviar())} noValidate>
        {children}
      </form>
    );
  const tipoBoton = anidado ? ("button" as const) : ("submit" as const);
  // En el checkout el botón principal es el de pagar: este va con contorno.
  const claseBoton = anidado ? "boton boton--fantasma boton--bloque" : "boton boton--bloque";

  const casilla = (
    <label className="suscripcion__acepta">
      <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
      <span>
        {T.acepto}{" "}
        <Link href="/legales/suscriptores" target="_blank" rel="noopener">
          {TEXTOS.suscriptores.condiciones}
        </Link>
      </span>
    </label>
  );
  const aviso = error ? (
    <p className="suscripcion__error" role="alert">
      {error}
    </p>
  ) : null;

  if (listo) {
    if (!mostrarListo) return null;
    return (
      <div className="suscripcion suscripcion--listo" role="status">
        <p className="suscripcion__listo">{T.listo[listo.estado]}</p>
        {listo.estado === "baja" ? null : (
          <p className="suscripcion__nota">
            {listo.suscriptor.cupon === "Disponible" ? T.listoCupon(formatearPrecio(CUPON_BIENVENIDA)) : T.listoSinCupon}
          </p>
        )}
        <div className="suscripcion__acciones">
          <Link href="/#los-modelos" className="boton">
            {TEXTOS.suscriptores.elegir}
          </Link>
          <Link href="/suscriptores/mi-cuenta" className="suscripcion__enlace">
            {TEXTOS.suscriptores.verCuenta}
          </Link>
        </div>
      </div>
    );
  }

  if (desafio) {
    return envolver(
      () => void confirmar(),
      <>
        <p className="suscripcion__nota" role="status">
          {T.codigoEnviado(email)}
        </p>
        <label className="campo" htmlFor={`${id}-codigo`}>
          <span>{T.codigo}</span>
          <input
            id={`${id}-codigo`}
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        {/* Quiso entrar y el mail no estaba suscripto: la casilla aparece acá. */}
        {suscribe && faltabaCasilla ? casilla : null}
        {aviso}
        <button
          type={tipoBoton}
          className={claseBoton}
          disabled={ocupado || codigo.length !== 6}
          onClick={anidado ? () => void confirmar() : undefined}
        >
          {ocupado ? "Confirmando…" : suscribe ? T.suscribirme : T.confirmar}
        </button>
        <button type="button" className="suscripcion__enlace" onClick={volver}>
          {emailDado ? "Pedir otro código" : T.otroMail}
        </button>
      </>
    );
  }

  return envolver(
    () => void pedirCodigo(),
    <>
      {emailDado === undefined ? (
        <label className="campo" htmlFor={`${id}-email`}>
          <span>{T.email}</span>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={emailPropio}
            onChange={(e) => setEmailPropio(e.target.value)}
          />
        </label>
      ) : null}
      {suscribe && conNombre ? (
        <label className="campo" htmlFor={`${id}-nombre`}>
          <span>{T.nombre}</span>
          <input
            id={`${id}-nombre`}
            name="nombre"
            autoComplete="given-name"
            maxLength={80}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
      ) : null}
      {suscribe ? casilla : null}
      {aviso}
      <button type={tipoBoton} className={claseBoton} disabled={ocupado} onClick={anidado ? () => void pedirCodigo() : undefined}>
        {ocupado ? "Mandando…" : suscribe ? (textoBoton ?? T.suscribirme) : T.pedirCodigo}
      </button>
      <p className="suscripcion__nota">{T.notaCodigo}</p>
      {conCambioDeModo ? (
        <p className="suscripcion__cambio">
          {suscribe ? (
            <>
              {T.yaSos}{" "}
              <button type="button" className="suscripcion__enlace" onClick={() => (setModo("entrar"), setError(""))}>
                {T.entrar}
              </button>
            </>
          ) : (
            <button type="button" className="suscripcion__enlace" onClick={() => (setModo("suscribir"), setError(""))}>
              {T.quieroSuscribirme}
            </button>
          )}
        </p>
      ) : null}
    </>
  );
}
