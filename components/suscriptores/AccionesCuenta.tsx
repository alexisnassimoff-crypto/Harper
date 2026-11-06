"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEXTOS } from "@/lib/textos";
import FormularioSuscripcion from "./FormularioSuscripcion";
import { refrescarSuscriptor } from "./useSuscriptor";

const { cuenta: T } = TEXTOS.suscriptores;

/**
 * Entrar a «mi cuenta» con el mail y el código: al confirmar, la página se
 * vuelve a armar con la sesión. Si llegó desde un corazón sin haber entrado
 * (`guardar`, el SKU), primero guarda ese favorito y abre «Mis favoritos».
 */
export function EntrarACuenta({ guardar = null, soloCuenta = false }: { guardar?: string | null; soloCuenta?: boolean }) {
  const router = useRouter();

  async function alEntrar() {
    // Sin suscripción no hay favoritos guardados: solo se vuelve a armar la página.
    if (!guardar || soloCuenta) {
      router.refresh();
      return;
    }
    await fetch("/api/suscriptores/favoritos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: guardar, favorito: true }),
    }).catch(() => null);
    // La sesión, con el favorito ya guardado, para los corazones de esta pestaña.
    await refrescarSuscriptor();
    router.replace("/suscriptores/mi-cuenta#mis-favoritos");
  }

  // Sin «quiero suscribirme»: debajo está el enlace a los beneficios, y si el
  // mail no está suscripto, el mismo formulario le pide la casilla.
  return (
    <FormularioSuscripcion
      origen="Suscriptores"
      modoInicial="entrar"
      mostrarListo={false}
      conCambioDeModo={false}
      alListo={() => void alEntrar()}
      soloCuenta={soloCuenta}
      alEntrar={() => void alEntrar()}
    />
  );
}

/**
 * Salir de este navegador y darse de baja. La baja pide confirmación: deja
 * de recibir mails y pierde los beneficios (app/api/suscriptores/baja, con la
 * sesión). Ninguna de las dos borra el saldo.
 */
export function AccionesCuenta({ activo = true, email = "", soloSalir = false }: { activo?: boolean; email?: string; soloSalir?: boolean }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState<"salir" | "baja" | null>(null);
  const [error, setError] = useState("");
  const [deBaja, setDeBaja] = useState(false);

  async function salir() {
    setOcupado("salir");
    await fetch("/api/suscriptores/salir", { method: "POST" }).catch(() => null);
    await refrescarSuscriptor();
    router.refresh();
  }

  async function darDeBaja() {
    setOcupado("baja");
    setError("");
    try {
      const r = await fetch("/api/suscriptores/baja", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const cuerpo = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? "No pudimos darte de baja. Probá en un rato.");
      setDeBaja(true);
      await refrescarSuscriptor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos darte de baja.");
      setOcupado(null);
    }
  }

  if (deBaja) {
    return (
      <section className="cuenta-suscriptor__baja" role="status">
        <p className="suscripcion__listo">{TEXTOS.suscriptores.baja.listo}</p>
        <p>{TEXTOS.suscriptores.baja.listoDetalle}</p>
        <button type="button" className="suscripcion__enlace" onClick={() => router.refresh()}>
          Volver
        </button>
      </section>
    );
  }

  // La cuenta sin suscripción (Crédito Harper, paso 3): no hay suscripción que dar de baja.
  if (soloSalir) {
    return (
      <button type="button" className="enlace-accion cuenta-suscriptor__salir" onClick={salir} disabled={ocupado !== null}>
        {ocupado === "salir" ? "Saliendo…" : T.salir}
      </button>
    );
  }

  // Se dio de baja: tiene su saldo y la opción de volver a suscribirse.
  if (!activo) {
    return (
      <>
        <section className="cuenta-suscriptor__baja" aria-labelledby="cuenta-volver-titulo">
          <h2 id="cuenta-volver-titulo">{T.volver}</h2>
          <FormularioSuscripcion
            origen="Suscriptores"
            email={email}
            conCambioDeModo={false}
            textoBoton={T.volver}
            alListo={() => router.refresh()}
          />
        </section>
        <button type="button" className="enlace-accion cuenta-suscriptor__salir" onClick={salir} disabled={ocupado !== null}>
          {ocupado === "salir" ? "Saliendo…" : T.salir}
        </button>
      </>
    );
  }

  return (
    <>
      <button type="button" className="enlace-accion cuenta-suscriptor__salir" onClick={salir} disabled={ocupado !== null}>
        {ocupado === "salir" ? "Saliendo…" : T.salir}
      </button>

      <section className="cuenta-suscriptor__baja" aria-labelledby="cuenta-baja-titulo">
        <h2 id="cuenta-baja-titulo">{T.bajaTitulo}</h2>
        <p>{T.bajaTexto}</p>
        {confirmando ? (
          <div className="cuenta-suscriptor__confirmar">
            <button type="button" className="boton boton--chico boton--fantasma" onClick={darDeBaja} disabled={ocupado !== null}>
              {ocupado === "baja" ? "Un momento…" : T.bajaConfirmar}
            </button>
            <button type="button" className="suscripcion__enlace" onClick={() => setConfirmando(false)} disabled={ocupado !== null}>
              {T.cancelar}
            </button>
          </div>
        ) : (
          <button type="button" className="suscripcion__enlace" onClick={() => setConfirmando(true)}>
            {T.baja}
          </button>
        )}
        {error ? (
          <p className="suscripcion__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </>
  );
}
