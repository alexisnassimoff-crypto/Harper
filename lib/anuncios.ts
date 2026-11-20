import { nombreDelTramo, type Tramo } from "./descuentos";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import { PORCENTAJE_DINERO_MP } from "./dinero-mp";
import { precio as formatearPrecio } from "./formato";
import { TEXTOS } from "./textos";

/**
 * Los mensajes de la barra verde de arriba, que pasan uno detrás del otro.
 *
 * Ale, 18/11/2026: la barra dice las condiciones de compra que el servidor
 * aplica, y nada más. En este orden:
 *
 *  1. El Dúo, solo si el servidor lo tiene prendido (llega el porcentaje;
 *     apagado, ni se nombra).
 *  2. El envío gratis, armado con los dos mínimos de Config (AMBA y resto del
 *     país). Ya no depende de un texto escrito a mano.
 *  3. Las cuotas, solo si Mercado Pago las confirmó (aclarando que son en
 *     anteojos, con qué tarjetas y el CFTEA). Son las mismas para todos.
 *  4. El 10 % por pagar con el dinero de la cuenta de Mercado Pago.
 *  5. `banner_texto` de Config, como una línea más y solo si aporta algo.
 *
 * Salieron la invitación a suscribirse (prometía un cupón y envío gratis
 * siempre, que terminaron ese día), las cuotas de suscriptor y el cupón de
 * primera compra. La escala «llevá 3, pagá 2» sigue saliendo sola si Airtable
 * tuviera una, porque el servidor la aplicaría; hoy no hay ninguna.
 */
export function anunciosDelHeader(datos: {
  /** `banner_texto` de Config: una línea libre y opcional (un lanzamiento, un aviso). */
  banner: string;
  cuotas: CuotasVerificadas | null;
  escala?: Tramo[];
  /** El porcentaje del Dúo si el servidor lo tiene prendido; null o sin el dato, no se nombra. */
  duo?: number | null;
  /** El mínimo del envío gratis al resto del país, de Config; 0 o sin el dato, no se anuncia. */
  envioGratisDesde?: number;
  /** El mínimo del envío gratis en AMBA, de Config; 0 o sin el dato, no se anuncia. */
  envioGratisAmbaDesde?: number;
}): string[] {
  const escala = datos.escala ?? [];
  const envio = anuncioDelEnvio(datos.envioGratisDesde ?? 0, datos.envioGratisAmbaDesde ?? 0);
  const anuncios = [
    datos.duo ? TEXTOS.programa.duo.regla(datos.duo) : "",
    escala.length > 0 ? `${escala.map((t) => nombreDelTramo(t)).join(" · ")} en anteojos` : "",
    envio,
    datos.cuotas
      ? `${TEXTOS.programa.cuotas.sinInteres(datos.cuotas.cuotas)} en anteojos con ${NOMBRE_MARCAS} · CFTEA ${datos.cuotas.cftea}`
      : "",
    TEXTOS.programa.dineroMP.barra(PORCENTAJE_DINERO_MP),
    bannerQueAporta(datos.banner),
  ].filter(Boolean);
  // El encabezado usa el texto como clave de cada mensaje: sin repetidos.
  return [...new Set(anuncios)];
}

/**
 * El envío gratis en una línea, con los mínimos de Config: «Envío gratis en
 * AMBA desde $ 60.000 · Al resto del país, gratis desde $ 250.000». El de
 * AMBA se nombra solo si es más bajo que el del resto del país, como en el
 * carrito (lib/envio-gratis.ts). Sin ningún mínimo, nada.
 */
function anuncioDelEnvio(nacional: number, amba: number): string {
  const E = TEXTOS.programa.envio;
  const hayAmba = amba > 0 && (nacional <= 0 || amba < nacional);
  if (hayAmba && nacional > 0) return `${E.amba(formatearPrecio(amba))} · ${E.resto(formatearPrecio(nacional))}`;
  if (hayAmba) return E.amba(formatearPrecio(amba));
  return nacional > 0 ? E.unico(formatearPrecio(nacional)) : "";
}

const sinTildes = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * `banner_texto` de Config, si suma algo. Hasta el 18/11/2026 era el mensaje
 * del envío gratis, escrito a mano («Envío gratis en compras superiores a
 * $150.000»). Ahora el envío gratis lo dice solo el código, con los mínimos
 * de Config: si el texto cargado habla del envío gratis no se muestra, porque
 * quedaría prometiendo un monto que el servidor no respeta.
 */
function bannerQueAporta(banner: string): string {
  const texto = banner.trim();
  if (!texto) return "";
  const plano = sinTildes(texto);
  const hablaDelEnvioGratis = /envio/.test(plano) && /gratis|sin cargo|bonificado/.test(plano);
  return hablaDelEnvioGratis ? "" : texto;
}
