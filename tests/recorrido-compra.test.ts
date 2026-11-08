import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TEXTOS } from "../lib/textos";

/**
 * Recorrido móvil del carrito al pago (Ale, 08/11/2026): solo presentación.
 * Lo que se mira en el navegador está en el PR (capturas y escenarios); acá,
 * que no se pierda lo que lo hace funcionar.
 */

const leer = (ruta: string) => readFileSync(join(__dirname, "../..", ruta), "utf8");
const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

/** El bloque de una regla `@media` (con sus llaves balanceadas) que contiene `marca`. */
function bloqueMedia(css: string, consulta: string, marca: string): string {
  let desde = 0;
  for (;;) {
    const inicio = css.indexOf(`@media ${consulta}`, desde);
    if (inicio < 0) return "";
    let nivel = 0;
    let fin = css.indexOf("{", inicio);
    for (let i = fin; i < css.length; i++) {
      if (css[i] === "{") nivel++;
      else if (css[i] === "}" && --nivel === 0) {
        fin = i;
        break;
      }
    }
    const bloque = css.slice(inicio, fin + 1);
    if (bloque.includes(marca)) return bloque;
    desde = fin + 1;
  }
}

test("carrito: el resumen con «Finalizar compra» va antes que las sugerencias", () => {
  const vista = sinComentarios(leer("components/carrito/VistaCarrito.tsx"));
  const resumen = vista.indexOf('className="panel carrito-vista__resumen"');
  const finalizar = vista.indexOf("Finalizar compra");
  const sugerencias = vista.indexOf("<SugerenciasCarrito");
  assert.ok(resumen > 0 && finalizar > resumen, "el resumen tiene el botón");
  assert.ok(sugerencias > finalizar, "las sugerencias van después del botón");
  // Las sugerencias ya no están dentro de la columna de los productos.
  const items = vista.slice(vista.indexOf('className="pila carrito-vista__items"'), resumen);
  assert.doesNotMatch(items, /SugerenciasCarrito/);

  // En escritorio, las dos columnas de siempre: productos y sugerencias a la izquierda, el resumen a la derecha.
  const css = leer("app/globals.css");
  const escritorio = bloqueMedia(css, "(min-width: 41.5rem)", ".carrito-vista");
  assert.match(escritorio, /grid-template-columns: repeat\(2, minmax\(18rem, 1fr\)\);/);
  assert.match(escritorio, /\.carrito-vista__resumen \{\s*grid-column: 2;\s*grid-row: 1 \/ span 2;/);
  assert.match(escritorio, /\.carrito-vista > \.sugerencias \{\s*grid-column: 1;\s*grid-row: 2;/);
});

test("checkout: sin conexión, un mensaje en castellano que dice que no se perdió nada", () => {
  const formulario = leer("components/checkout/FormularioCheckout.tsx");
  assert.match(formulario, /error instanceof TypeError\s*\?\s*TEXTOS\.checkout\.sinConexion/);
  assert.match(TEXTOS.checkout.sinConexion, /conexión/);
  assert.match(TEXTOS.checkout.sinConexion, /tu carrito y tus datos siguen acá/);
  assert.doesNotMatch(TEXTOS.checkout.sinConexion, /fetch|failed|error/i);
  // Los mensajes del servidor (409, total nuevo, cupón) siguen tal cual.
  assert.match(formulario, /: error instanceof Error\s*\?\s*error\.message/);
});

test("checkout: después de un pago rechazado, el aviso dice que el carrito y los datos siguen", () => {
  const pagina = leer("app/checkout/page.tsx");
  assert.match(pagina, /no te cobramos nada[\s\S]{0,400}TEXTOS\.checkout\.siguenAca/);
  assert.equal(TEXTOS.checkout.siguenAca, "Tu carrito y tus datos siguen acá.");
});

test("carrito y checkout: en celular el WhatsApp flotante se guarda y la consulta queda junto al botón y al total", () => {
  const css = leer("app/globals.css");
  const celular = bloqueMedia(css, "(max-width: 46rem)", ".ayuda-wsp");
  assert.match(celular, /body:has\(\.cta-fija--pago\[data-visible\]\) \.wsp,\s*body:has\(\.carrito-vista\) \.wsp \{\s*display: none;/);
  assert.match(celular, /html:has\(\.cta-fija--pago\[data-visible\]\) \{\s*scroll-padding-bottom:/);
  // Solo el checkout: la regla no toca la barra de la ficha.
  assert.doesNotMatch(celular, /body\[data-cta-fija\] \.wsp \{\s*display: none/);

  // La consulta, junto al total del checkout y a «Finalizar compra», con el número de Config.
  assert.match(leer("components/checkout/AyudaWhatsApp.tsx"), /className="ayuda-wsp"[\s\S]{0,300}href=\{`https:\/\/wa\.me\/\$\{numero\}`\}/);
  assert.match(leer("components/checkout/FormularioCheckout.tsx"), /<AyudaWhatsApp numero=\{whatsapp\} \/>\s*<\/aside>/);
  assert.match(leer("components/carrito/VistaCarrito.tsx"), /Finalizar compra\s*<\/Link>[\s\S]{0,300}<AyudaWhatsApp numero=\{whatsapp\} \/>/);
  assert.match(leer("app/checkout/page.tsx"), /whatsapp=\{config\.whatsapp \?\? ""\}/);
  assert.match(leer("app/carrito/page.tsx"), /whatsapp=\{config\.whatsapp \?\? ""\}/);
});

test("checkout: la invitación a Suscriptores se pliega sin esconder la oferta ni la CFTEA", () => {
  const caja = sinComentarios(leer("components/checkout/SuscriptorEnCheckout.tsx"));
  const invitacion = caja.slice(caja.indexOf("checkout__suscriptor--invitacion"));
  const pliegue = invitacion.indexOf('<details className="checkout__suscriptor-pliegue">');
  assert.ok(pliegue > 0);
  // La oferta y la nota (con la CFTEA cuando se nombran cuotas) quedan antes del pliegue, a la vista.
  assert.ok(invitacion.indexOf("checkoutCaja.invitacion(") < pliegue);
  assert.ok(invitacion.indexOf("CFTEA") < pliegue);
  // El formulario, adentro.
  assert.ok(invitacion.indexOf("<FormularioSuscripcion") > pliegue);
  assert.equal(TEXTOS.suscriptores.checkoutCaja.abrir, "Quiero suscribirme");
});
