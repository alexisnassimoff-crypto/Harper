import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Crédito Harper: lo que se le dice al comprador (Ale, 18/11/2026: «Orienta a
// que vuelvan a comprar con el Cashback»). Quien compra tiene que saber ANTES
// de pagar cuánto suma la compra, DESPUÉS que queda pendiente y cuándo se
// libera, y enterarse por mail cuando queda disponible y poco antes de que
// venza.
//
// Todo detrás de HARPER_CREDITO_ACTIVO, que en producción sigue apagado en
// esta etapa. Apagado, nada que vea el comprador nombra el Crédito Harper y
// todo es como siempre; prendido, cada pantalla dice lo que hace el servidor.
// Las pruebas prenden el interruptor en process.env solo adentro de cada
// prueba que lo necesita.
process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba-de-la-comunicacion";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN", "RESEND_API_KEY"]) delete process.env[v];

import { createRecord, TABLAS } from "../lib/airtable";
import { anunciosDelHeader } from "../lib/anuncios";
import { getProductos } from "../lib/catalogo";
import { getConfig } from "../lib/config";
import { mensajesDeConfianza } from "../lib/confianza";
import { type CamposCredito } from "../lib/credito-airtable";
import { creditoParaElCarrito } from "../lib/credito-cuenta";
import {
  calcularCredito,
  creditoQueSuma,
  DIAS_AVISO_VENCIMIENTO,
  DIAS_PARA_LIBERAR_CREDITO,
  MESES_PARA_VENCER_CREDITO,
  PORCENTAJE_CREDITO_UN_ANTEOJO,
  PORCENTAJE_CREDITO_VARIOS,
} from "../lib/credito-harper";
import { MARCA_REGIMEN_NUEVO, notasConRegimen, renglonesDeItems } from "../lib/credito-pagos";
import { envioEnElCarrito, textoEnvioGratis } from "../lib/envio-gratis";
import { condicionesDeCompra } from "../lib/ficha";
import { precio } from "../lib/formato";
import { interceptar, reiniciar } from "../lib/fixtures/servidor";
import { mailConfirmacion, mailCreditoDisponible, mailCreditoPorVencer } from "../lib/mails";
import { buscarPedido, itemsDelPedido, notasDelPedido, resolverCarrito } from "../lib/pedidos";
import { registroAceptacion, VERSION_TERMINOS, VERSION_TERMINOS_CON_CREDITO, versionTerminosVigente } from "../lib/legales";
import { garantiasDePortada, pasosDeCompra, preguntasDePortada } from "../lib/portada";
import { notasDeBeneficios } from "../lib/suscriptores";
import { COOKIE_CUENTA, claveDeSesionCuenta, crearSesionCuenta } from "../lib/suscriptores-sesion";
import { TEXTOS } from "../lib/textos";
import type { ItemCarrito, ItemResuelto } from "../lib/tipos";

const NOMBRA_EL_CREDITO = /cr[eé]dito harper/i;
const raiz = path.resolve(__dirname, "..", "..");
const leer = (ruta: string) => fs.readFileSync(path.join(raiz, ruta), "utf8");
/** El código sin comentarios: los de JSX (`{/* … *\/}`, sin otro cierre adentro), los de bloque y los de línea. */
const sinComentarios = (codigo: string) =>
  codigo
    .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

beforeEach(() => {
  reiniciar();
  interceptar(null);
});

async function prendido<T>(hacer: () => Promise<T> | T, duo = false): Promise<T> {
  process.env.HARPER_CREDITO_ACTIVO = "1";
  if (duo) process.env.HARPER_DUO_ACTIVO = "1";
  try {
    return await hacer();
  } finally {
    delete process.env.HARPER_CREDITO_ACTIVO;
    delete process.env.HARPER_DUO_ACTIVO;
  }
}

async function lineas() {
  const productos = await getProductos();
  const p = (slug: string) => productos.find((x) => x.slug === slug)!;
  return (slug: string, n = 0, cantidad = 1): ItemCarrito => ({ productoSlug: slug, varianteId: p(slug).variantes[n].id, cantidad });
}

// ---------- Los datos que arman los textos (como en tests/reglas-18-11.test.ts) ----------

const TRES_CUOTAS = { cuotas: 3, montoCuota: 29966.67, cftea: "0,00 %" };
const BASE_PREGUNTAS = {
  incluye: ["Estuche rígido", "Paño de microfibra"],
  caracteristicas: ["Filtro de luz azul", "Protección UV400"],
  cuotas: { cuotas: 3, cftea: "0,00 %" },
  nombreMarcas: "Visa y Mastercard",
  envioGratisDesde: 250_000,
  envioGratisTexto: "$ 250.000",
  envioGratisAmbaTexto: "$ 60.000",
  hayWhatsapp: true,
  diasArrepentimiento: 10,
  diasCambio: 30,
  mesesGarantia: 6,
  porcentajeDineroMP: 10,
  cuenta: true,
};
const DUO_PREGUNTAS = { porcentaje: 25, dos: { total: "$ 157.325", lista: "$ 179.800", totalDineroMP: "$ 141.593" } };
/** Lo que el servidor les pasa a la barra y a las preguntas con el interruptor prendido (app/layout.tsx, app/preguntas-frecuentes/page.tsx). */
const CREDITO_DEL_SERVIDOR = { unAnteojo: PORCENTAJE_CREDITO_UN_ANTEOJO, varios: PORCENTAJE_CREDITO_VARIOS, dias: DIAS_PARA_LIBERAR_CREDITO, meses: MESES_PARA_VENCER_CREDITO };

// Revisión de textos (20/11/2026): «con dos o más» y no «llevando dos» (con
// tres también es el 10 %), siempre «de anteojos», y «Mi Cuenta» en lugar de
// «tu cuenta Harper» (para ver el crédito no hace falta abrir la cuenta ni
// aceptar las novedades).
const BARRA = "Crédito Harper: 5% de vuelta con un anteojo y 10% con dos o más, para tu próxima compra de anteojos";
const PREGUNTA = "¿Qué es el Crédito Harper?";
// Revisión del 20/11/2026 (cambio a propósito): los 30 días se cuentan desde
// que Harper confirma la entrega (Fecha_entrega), no desde que llega el pedido.
const RESPUESTA =
  "Es plata para tu próxima compra de anteojos en harper.ar. Te devolvemos el 5% de lo que pagás en anteojos si llevás uno, y el 10% si llevás dos o más. Queda disponible 30 días después de que confirmamos la entrega del pedido y vence 6 meses después. Se usa solo en anteojos (no paga el envío) y lo ves en Mi Cuenta, entrando con el mail de tu compra.";

/** Lo que arman la barra, las preguntas, la confianza, la ficha, la portada y el envío sin el dato del crédito. */
function textosSinElCredito(): string[] {
  const textos: string[] = [];
  for (const minimos of [{}, { envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 }]) {
    for (const cuotas of [null, TRES_CUOTAS]) {
      for (const duo of [undefined, null, 25]) {
        for (const credito of [undefined, null]) {
          textos.push(...anunciosDelHeader({ banner: "Nuevo color: Citrino verde", cuotas, duo, credito, ...minimos }));
        }
      }
    }
  }
  for (const credito of [undefined, null]) {
    for (const duo of [undefined, null, DUO_PREGUNTAS]) {
      for (const p of preguntasDePortada({ ...BASE_PREGUNTAS, duo, credito })) textos.push(p.pregunta, p.respuesta, p.enlace?.texto ?? "", p.enlace?.href ?? "");
    }
  }
  const confianza = mensajesDeConfianza({ envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 }, TRES_CUOTAS, "en anteojos");
  for (const m of confianza) textos.push(m.texto, m.detalle ?? "", m.nota ?? "");
  for (const c of condicionesDeCompra(confianza, { diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6 })) textos.push(c.texto, c.detalle ?? "", c.nota ?? "", c.enlace);
  const envio = { envioGratisDesde: 250_000, envioGratisTexto: "$ 250.000", envioGratisAmbaTexto: "$ 60.000" };
  for (const p of pasosDeCompra({ cuotas: { cuotas: 3, cftea: "0,00 %" }, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, diasCambio: 30, ...envio })) textos.push(p.titulo, p.texto);
  for (const g of garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, ...envio })) textos.push(g.titulo, g.texto);
  const u = { amba: 60_000, nacional: 250_000 };
  textos.push(textoEnvioGratis(u));
  for (const base of [8_990, 89_900, 179_800, 269_700]) {
    const nota = envioEnElCarrito(base, base >= 250_000 ? 0 : 10_100, u, [{}, {}]);
    textos.push(nota.valor, nota.nota ?? "", nota.total);
  }
  return textos.filter(Boolean);
}

// ---------- 1. Apagado: nada lo nombra y todo es como siempre ----------

test("Apagado: la barra, las preguntas, la confianza, la portada y el envío no nombran el Crédito Harper", () => {
  const textos = textosSinElCredito();
  assert.ok(textos.length > 80, "se juntaron los textos de la tienda");
  for (const texto of textos) assert.doesNotMatch(texto, NOMBRA_EL_CREDITO, texto);
  // Ni siquiera «de vuelta»: la barra apagada es la de siempre.
  for (const texto of textos) assert.doesNotMatch(texto, /de vuelta/i, texto);
  // La barra sin el dato es exactamente la misma que con `credito: null`.
  for (const duo of [null, 25]) {
    const base = { banner: "", cuotas: TRES_CUOTAS, duo, envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 };
    assert.deepEqual(anunciosDelHeader({ ...base, credito: null }), anunciosDelHeader(base));
  }
});

test("Apagado: el carrito no trae lo que suma la compra ni ofrece crédito, aunque la cuenta tenga; /gracias no lo dice", async () => {
  const linea = await lineas();
  for (const items of [[linea("amatista")], [linea("amatista"), linea("obsidiana")], [linea("amatista"), linea("r100")]]) {
    for (const paraCobrar of [false, true]) {
      const c = await resolverCarrito(items, { paraCobrar });
      assert.equal("creditoPrevisto" in c, false, "sin lo que suma");
      assert.equal("creditoHarper" in c, false, "sin crédito para usar");
      assert.ok(c.items.every((i) => i.credito === undefined));
    }
  }
  // Una cuenta verificada con crédito disponible: apagado, el carrito no lo ve.
  const mail = "apagada@ejemplo.com";
  await createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: "credito-harper:HARPER-APAGADO1",
    Pedido: "HARPER-APAGADO1",
    Email: mail,
    Monto: 4_495,
    Porcentaje: 5,
    Base: 89_900,
    Anteojos: 1,
    Estado: "Disponible",
    Disponible_desde: "2026-11-01",
    Generado_el: "2026-09-01T12:00:00.000Z",
    Reglas: "credito-harper-v1",
    Notas: "",
  });
  const peticion = new Request("https://harper.ar/api/carrito/resolver", { method: "POST", headers: { cookie: `${COOKIE_CUENTA}=${crearSesionCuenta(claveDeSesionCuenta()!, mail)}` } });
  assert.equal(await creditoParaElCarrito(peticion, true), null);
  assert.ok(await prendido(() => creditoParaElCarrito(peticion, true)), "prendido, sí");

  // /gracias de un pedido del régimen nuevo, pagado: sin el crédito que suma.
  await createRecord(TABLAS.pedidos, { Numero: "HARPER-GR1", Estado: "pagado", Total: 89_900, Subtotal: 89_900, Items: itemsDelPedido((await resolverCarrito([linea("amatista")])).items), Notas: MARCA_REGIMEN_NUEVO });
  const pedido = await buscarPedido("HARPER-GR1");
  assert.ok(pedido);
  assert.equal("creditoGanado" in pedido, false);
  assert.equal((await prendido(() => buscarPedido("HARPER-GR1")))?.creditoGanado, 4_495, "prendido, sí");
});

/** Un renglón cobrado, como lo guarda el pedido. */
const renglon = (extra: Partial<ItemResuelto> = {}): ItemResuelto => ({
  productoId: "rec",
  productoSlug: "amatista",
  nombre: "AMATISTA",
  categoria: "Anteojos",
  varianteId: "recV",
  sku: "AMATISTA-NEGRO",
  color: "Negro",
  foto: null,
  precioLista: 89_900,
  precioUnitario: 85_405,
  descuento: 0,
  cantidad: 1,
  subtotal: 85_405,
  stockDisponible: 5,
  ...extra,
});
const datosDelMail = (items: ItemResuelto[], extra: Partial<Parameters<typeof mailConfirmacion>[0]> = {}) =>
  ({
    numero: "HARPER-MAIL1",
    items,
    subtotal: items.reduce((t, i) => t + i.subtotal, 0),
    envio: 0,
    total: items.reduce((t, i) => t + i.subtotal, 0),
    cliente: { email: "c@ejemplo.com", nombre: "Compradora", telefono: "1100000000", dni: "30123456", direccion: "Gorostiaga 1635", ciudad: "Buenos Aires", provincia: "Ciudad Autónoma de Buenos Aires", cp: "1426", aceptaPromos: false },
    config: { whatsapp: "", emailContacto: "hola@harper.ar", emailPedidos: "pedidos@harper.ar", razonSocial: "FOCUS VISION SRL", cuit: "30-71802316-1" },
    sitio: "https://harper.ar",
    ...extra,
  }) as unknown as Parameters<typeof mailConfirmacion>[0];
const todoElMail = (m: { asunto: string; html: string; texto: string }) => `${m.asunto}\n${m.html}\n${m.texto}`;

test("Apagado: el mail de confirmación no nombra el crédito, aunque un renglón traiga lo pagado con él", () => {
  const sinCredito = mailConfirmacion(datosDelMail([renglon()]));
  const conRenglon = mailConfirmacion(datosDelMail([renglon({ credito: 4_495 })]));
  for (const m of [sinCredito, conRenglon]) assert.doesNotMatch(todoElMail(m), NOMBRA_EL_CREDITO);
  // Y es exactamente el mail de siempre.
  assert.deepEqual(conRenglon, sinCredito);
  assert.deepEqual(mailConfirmacion(datosDelMail([renglon()], { creditoHarper: null })), sinCredito);
});

// ---------- 2. Dónde vive cada texto, y quién lo muestra ----------

test("En TEXTOS, el Crédito Harper vive en sus claves; sus porcentajes, días y meses son parámetros", () => {
  const hojas: { ruta: string; texto: string }[] = [];
  const andar = (valor: unknown, ruta: string): void => {
    if (typeof valor === "string") hojas.push({ ruta, texto: valor });
    else if (typeof valor === "function") andar(valor("$ 1", 3, 2, "$ 2", "$ 3"), ruta);
    else if (Array.isArray(valor)) valor.forEach((v, i) => andar(v, `${ruta}[${i}]`));
    else if (valor && typeof valor === "object") for (const [clave, v] of Object.entries(valor)) andar(v, ruta ? `${ruta}.${clave}` : clave);
  };
  andar(TEXTOS, "");
  const DEL_CREDITO = ["programa.credito", "suscriptores.cuenta.credito", "suscriptores.cuenta.pestanas.credito", "suscriptores.sinPagoCredito", "suscriptores.sinPagoSaldoYCredito"];
  const bajo = (ruta: string) => DEL_CREDITO.some((p) => ruta === p || ruta.startsWith(`${p}.`));
  assert.deepEqual(hojas.filter((h) => NOMBRA_EL_CREDITO.test(h.texto) && !bajo(h.ruta)), [], "ningún texto fuera de sus claves lo nombra");
  // Los números de la regla llegan del motor: con otros, el texto dice otros.
  const C = TEXTOS.programa.credito;
  assert.equal(C.barra(7, 12), "Crédito Harper: 7% de vuelta con un anteojo y 12% con dos o más, para tu próxima compra de anteojos");
  assert.equal(C.portadaDetalle(12), "12% con dos o más, para tu próxima compra de anteojos");
  assert.match(C.respuesta(7, 12, 45, 9), /el 7% de lo que pagás en anteojos si llevás uno, y el 12% si llevás dos o más\. Queda disponible 45 días después de que confirmamos la entrega del pedido y vence 9 meses después\./);
  assert.match(C.gracias("$ 1", 45, 9), /Queda disponible 45 días después de que confirmemos la entrega de tu pedido y vence 9 meses después\./);
  assert.equal(C.plazos(45, 9), "Queda disponible 45 días después de que confirmemos la entrega y vence 9 meses después.");
  assert.equal(TEXTOS.suscriptores.cuenta.credito.bajada(9), "Lo ganás con tus compras de anteojos. Se usa solo en anteojos. Cada crédito vence 9 meses después de quedar disponible.");
  // La regla vieja («no vence») no queda en ningún texto del crédito. (El
  // saldo de Suscriptores ganado antes del 18/11/2026 es otra cosa: ese sí
  // sigue sin vencer.)
  assert.deepEqual(hojas.filter((h) => bajo(h.ruta) && /no vence/i.test(h.texto)), []);
});

test("Cada pantalla nombra el crédito solo con el dato del servidor, que existe solo con el interruptor prendido", () => {
  // Quién usa los textos del crédito: estas pantallas y ninguna otra (los
  // registros del servidor, console.*, no los ve el comprador).
  const USA_LOS_TEXTOS = /TEXTOS\.programa\.credito|programa\.credito\b|\bcuenta\.credito\b|sinPagoCredito|sinPagoSaldoYCredito|Cr[eé]dito Harper/;
  const sinRegistros = (codigo: string) => codigo.replace(/console\.(?:log|info|warn|error)\([^\n]*/g, "");
  const usos: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.tsx?$/.test(entrada.name) && USA_LOS_TEXTOS.test(sinRegistros(sinComentarios(leer(relativo))))) usos.push(relativo);
    }
  };
  for (const dir of ["app", "components"]) recorrer(dir);
  assert.deepEqual(usos, [
    // Los errores del checkout cuando se pidió usar el crédito (solo prendido, ver abajo).
    path.join("app", "api", "checkout", "route.ts"),
    path.join("app", "gracias", "page.tsx"),
    // Revisión del 20/11/2026: la Privacidad y los Términos también lo nombran, solo prendido (ver abajo).
    path.join("app", "legales", "privacidad", "page.tsx"),
    path.join("app", "legales", "suscriptores", "page.tsx"),
    path.join("app", "legales", "terminos", "page.tsx"),
    path.join("components", "carrito", "CreditoQueSuma.tsx"),
    path.join("components", "checkout", "CreditoEnCheckout.tsx"),
    path.join("components", "checkout", "FormularioCheckout.tsx"),
    path.join("components", "portada", "PortadaVitrina.tsx"),
    path.join("components", "producto", "FichaProducto.tsx"),
    path.join("components", "suscriptores", "MiCreditoHarper.tsx"),
  ]);

  // El checkout: los errores del crédito, solo si se pidió usarlo y el interruptor está prendido.
  const ruta = sinComentarios(leer("app/api/checkout/route.ts"));
  const condicion = ruta.indexOf("if (pidioCredito && cuentaConCredito()) {");
  assert.ok(condicion > 0, "el checkout pregunta por el interruptor antes de mirar el crédito");
  for (const clave of ["sinSesion", "otroMail", "noDisponible", "otraCompra", "cambio"]) {
    const uso = ruta.indexOf(`TEXTOS.suscriptores.cuenta.credito.${clave}`);
    assert.ok(uso > condicion, clave);
  }
  assert.match(ruta, /const creditoUsado = carrito\.creditoHarper\?\.usado \?\? 0;\s*if \(cuentaCredito && creditoUsado > 0\) \{/);

  // La barra y las preguntas: el servidor les pasa los números solo prendido.
  const layout = sinComentarios(leer("app/layout.tsx"));
  assert.match(layout, /const credito = creditoActivo\(\) \? \{ unAnteojo: PORCENTAJE_CREDITO_UN_ANTEOJO, varios: PORCENTAJE_CREDITO_VARIOS \} : null;/);
  assert.match(layout, /anunciosDelHeader\(\{[\s\S]{0,400}?\bcredito,/);
  const preguntas = sinComentarios(leer("app/preguntas-frecuentes/page.tsx"));
  assert.match(
    preguntas,
    /credito: creditoActivo\(\)\s*\?\s*\{ unAnteojo: PORCENTAJE_CREDITO_UN_ANTEOJO, varios: PORCENTAJE_CREDITO_VARIOS, dias: DIAS_PARA_LIBERAR_CREDITO, meses: MESES_PARA_VENCER_CREDITO \}\s*:\s*null/
  );
  // La portada: el renglón del crédito, adentro de la condición.
  assert.match(sinComentarios(leer("components/portada/PortadaVitrina.tsx")), /\.\.\.\(creditoActivo\(\)\s*\?\s*\[\{[^\]]*C\.portada\(PORCENTAJE_CREDITO_UN_ANTEOJO\)[^\]]*\]\s*:\s*\[\]\)/);
  // La ficha: el servidor arma la línea solo prendido y en anteojos, con el carrito del servidor; la ficha solo muestra lo que llega.
  const ficha = sinComentarios(leer("app/producto/[slug]/ficha.tsx"));
  assert.match(ficha, /esAnteojo && creditoActivo\(\)\s*\?/);
  assert.match(ficha, /carrito\.creditoPrevisto\?\.mercadoPago \?\? 0/);
  // (Revisión de textos, 20/11/2026: la línea se muestra solo con el carrito sin anteojos; ver la prueba de la ficha, abajo.)
  assert.match(
    sinComentarios(leer("components/producto/FichaProducto.tsx")),
    /\{creditoDeLaFicha \? \(\s*<p[^>]*>\s*\{TEXTOS\.programa\.credito\.ficha\(creditoDeLaFicha\.uno, creditoDeLaFicha\.unoDineroMP\)\}/
  );
  // El carrito y el panel lateral: solo con el importe que mandó el servidor
  // (los dos, el de tarjeta y el de dinero en Mercado Pago; ver abajo).
  assert.match(sinComentarios(leer("components/carrito/CreditoQueSuma.tsx")), /if \(!monto \|\| monto <= 0\) return null;/);
  for (const archivo of ["components/carrito/VistaCarrito.tsx", "components/carrito/PanelCarrito.tsx"]) {
    assert.match(sinComentarios(leer(archivo)), /<CreditoQueSuma monto=\{datos\.creditoPrevisto\?\.mercadoPago\} conDineroMP=\{datos\.creditoPrevisto\?\.dineroMP\} \/>/, archivo);
  }
  // El checkout: la caja, la pista para entrar y el renglón, solo con lo que manda el servidor.
  const checkout = sinComentarios(leer("components/checkout/FormularioCheckout.tsx"));
  assert.match(checkout, /\{carrito\.creditoHarper \? \(\s*<CreditoEnCheckout/);
  assert.match(checkout, /\{carrito\.creditoPrevisto && !carrito\.creditoPrevisto\.conCuenta \? \(/);
  assert.match(checkout, /function LineaCredito\(\{ credito \}: \{ credito: number \}\) \{\s*if \(credito <= 0\) return null;/);
  assert.match(checkout, /const creditoQueSuma = carrito\.creditoPrevisto\s*\?/);
  // /gracias: el importe solo existe prendido (lib/pedidos.ts, buscarPedido) y con el pago confirmado.
  const gracias = sinComentarios(leer("app/gracias/page.tsx"));
  assert.match(gracias, /const creditoGanado = confirmado && pedido\?\.creditoGanado \? pedido\.creditoGanado : null;/);
  assert.match(gracias, /\{creditoGanado \? \(\s*<p>\{TEXTOS\.programa\.credito\.gracias\(formatearPrecio\(creditoGanado\), DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO\)\}<\/p>/);
  // Mi Cuenta: la billetera, solo con la cuenta del crédito abierta.
  const cuenta = sinComentarios(leer("app/suscriptores/mi-cuenta/page.tsx"));
  assert.match(cuenta, /const conCredito = cuentaConCredito\(\);/);
  assert.match(cuenta, /\.\.\.\(conCredito \? \[seccionCredito\(billetera\)\] : \[\]\)/);
});

test("Las condiciones publicadas: la sección del Crédito Harper entera adentro de la condición, con los números del motor", () => {
  const pagina = sinComentarios(leer("app/legales/suscriptores/page.tsx"));
  assert.match(pagina, /const conCredito = creditoActivo\(\);/);
  // Cada parte que nombra el crédito (el renglón del índice y la sección) va adentro de `{conCredito ? ( … ) : null}`.
  const bloques: [number, number][] = [];
  for (let inicio = pagina.indexOf("{conCredito ? ("); inicio >= 0; inicio = pagina.indexOf("{conCredito ? (", inicio + 1)) {
    const fin = pagina.indexOf(") : null}", inicio);
    assert.ok(fin > inicio, "cada parte del crédito cierra su condición");
    bloques.push([inicio, fin]);
  }
  assert.ok(bloques.length >= 1, "la sección está condicionada al interruptor");
  const seccion = bloques.map(([i, f]) => pagina.slice(i, f)).find((b) => b.includes('<h2 id="credito"')) ?? "";
  const fuera = bloques.reduceRight((texto, [i, f]) => texto.slice(0, i) + texto.slice(f), pagina);
  assert.match(seccion, /<h2 id="credito"/);
  assert.match(seccion, /El \{PORCENTAJE_CREDITO_UN_ANTEOJO\} % de lo que pagás por los anteojos/);
  assert.match(seccion, /\{DIAS_PARA_LIBERAR_CREDITO\} días después de que confirmamos la entrega/);
  assert.match(seccion, /A los \{MESES_PARA_VENCER_CREDITO\} meses del día en que quedó disponible/);
  assert.match(seccion, /Lo podés usar hasta el día del vencimiento inclusive, en hora de Argentina/);
  assert.match(seccion, /se usa primero el que vence antes/);
  // Revisión de textos (20/11/2026): para usarlo no hace falta abrir la cuenta
  // del punto 3 ni aceptar las novedades (entrarALaCuenta no da de alta ni pide
  // la casilla); el aviso de vencimiento, con los días del control diario; y
  // las devoluciones con lo que hace el motor desde el 20/11/2026.
  const texto = seccion.replace(/\s+/g, " ");
  assert.ok(
    texto.includes(
      "Para usarlo entrás a {miCuenta} con el mail de la compra y el código que te mandamos a ese mail (no hace falta abrir la cuenta del punto 3 ni aceptar los mails de novedades), y comprás con ese mismo mail."
    ),
    "cómo se entra para usarlo"
  );
  assert.ok(
    texto.includes(
      "Te escribimos al mail de la compra cuando el crédito que ganaste queda disponible y, si todavía te queda crédito sin usar, {DIAS_AVISO_VENCIMIENTO} días antes de que venza."
    ),
    "el aviso de vencimiento, con la constante"
  );
  assert.doesNotMatch(texto, /unos días antes/);
  assert.match(pagina, /import \{[^}]*\bDIAS_AVISO_VENCIMIENTO\b[^}]*\} from "@\/lib\/credito-harper";/);
  assert.equal(DIAS_AVISO_VENCIMIENTO, 15, "los 15 días del aviso (Ale, 18/11/2026)");
  for (const frase of [
    // El crédito ganado: con el reembolso total se anula; ya disponible, en revisión (lib/credito-persistencia.ts, anularPorPedido).
    "Si se reintegra entero el pago de la compra con la que ganaste el crédito, por una devolución o por un contracargo, ese crédito se anula.",
    "Si ya estaba disponible, queda en revisión y no lo podés usar mientras lo revisamos.",
    // Revisión del 20/11/2026: lo que ya usó de un crédito que pasa a revisión se descuenta del resto, del que
    // tenga o del que gane después (saldoDeCredito, lib/credito-uso.ts; el aviso de lib/credito-incidencias.ts).
    "Si ya lo habías usado, lo que usaste se descuenta del resto de tu Crédito Harper: del que tengas ahora o, si no alcanza, del que ganes después.",
    // Lo mismo con una incidencia abierta sobre un crédito ya disponible (marcarIncidencia lo deja «A revisar»).
    "Si el crédito ya estaba disponible, queda en revisión hasta que se resuelva; mientras tanto, lo que ya hayas usado de él se descuenta del resto de tu Crédito Harper, como se explica en «Devoluciones y contracargos».",
    // El crédito usado: con el reembolso total vuelve solo, con 6 meses nuevos (lib/credito-uso.ts, devolverUsoPorReembolso).
    "Si devolvés una compra que pagaste en parte con Crédito Harper, el crédito que usaste vuelve a tu cuenta cuando te reintegramos el pago entero, con {MESES_PARA_VENCER_CREDITO} meses para usarlo desde ese día.",
    // Con un reembolso parcial, en dinero, también lo pagado con crédito (el aviso a Harper de procesarUsoDelPago).
    "Si devolvés solo una parte de la compra, te reintegramos en dinero lo que pagaste por lo que devolviste, incluida la parte que pagaste con Crédito Harper.",
    // Con un contracargo perdido o un reclamo que ganó el comprador, «A revisar» (revisarUsoPorReembolso). Cambio a
    // propósito (revisión del 20/11/2026): antes solo nombraba el contracargo.
    "Si el pago se revierte por un contracargo, o porque Mercado Pago te dio la razón en un reclamo, el crédito que usaste en esa compra queda en revisión y sigue descontado mientras lo revisamos.",
    // Revisión del 20/11/2026: para qué se usan los datos del crédito, sin remitir al punto 6 (que incluye las
    // novedades, con la casilla del punto 3 que quien solo tiene crédito no marcó; Ley 25.326, arts. 5 y 6).
    "Para llevarlo guardamos, con el mail de la compra, el crédito de cada pedido, su estado y cómo lo usaste. Esos datos los usamos solo para llevar tu crédito: mostrártelo, descontarlo cuando lo usás, revisarlo si hay una devolución, un reclamo o un contracargo, y mandarte los avisos de arriba. Si no aceptaste los mails de novedades, tener crédito no hace que te los mandemos. Tus derechos sobre esos datos son los del punto 6.",
  ]) {
    assert.ok(texto.includes(frase), frase);
  }
  // La regla vieja («no vuelve solo», «Harper revisa cada caso») no queda.
  assert.doesNotMatch(texto, /no vuelve solo|revisa cada caso/);
  // Ni la remisión al punto 6 como si fuera el uso de los datos del crédito.
  assert.doesNotMatch(texto, /lo tratamos como dice el punto 6/);
  assert.doesNotMatch(fuera, NOMBRA_EL_CREDITO, "apagado, la página no lo nombra");
  assert.doesNotMatch(fuera, /#credito/, "ni un enlace a la sección");
  // Los meses de la página son los del motor (Ale, 18/11/2026: 6), los importe de ahí o tenga una copia igual.
  const local = /const MESES_PARA_VENCER_CREDITO = (\d+);/.exec(pagina);
  if (local) assert.equal(Number(local[1]), MESES_PARA_VENCER_CREDITO, "la constante local de la página tiene que coincidir con lib/credito-harper.ts");
  else assert.match(pagina, /import \{[^}]*\bMESES_PARA_VENCER_CREDITO\b[^}]*\} from "@\/lib\/credito-harper";/);
});

// Revisión del 20/11/2026: los Términos son lo único que se acepta en el
// checkout y no nombraban el crédito: quien compraba sin abrir la cuenta no
// tenía cómo saber que vence y se pierde. Prendido, tienen su cláusula y otra
// versión (la que guarda cada pedido); apagado, todo sigue igual.
test("Los Términos nombran el Crédito Harper, su vencimiento y sus condiciones solo prendido, y la versión aceptada cambia solo prendido", async () => {
  const terminos = sinComentarios(leer("app/legales/terminos/page.tsx"));
  assert.match(terminos, /const credito = creditoActivo\(\);/);
  const inicio = terminos.indexOf("{credito ? (");
  const fin = terminos.indexOf(") : null}", inicio);
  assert.ok(inicio > 0 && fin > inicio, "la cláusula del crédito está condicionada al interruptor");
  const clausula = terminos.slice(inicio, fin);
  const fuera = terminos.slice(0, inicio) + terminos.slice(fin);
  const texto = clausula.replace(/\s+/g, " ");
  assert.match(clausula, /<h2 id="credito"/);
  for (const parte of [
    "el {PORCENTAJE_CREDITO_UN_ANTEOJO} % de lo que pagás en dinero por los anteojos si la compra tiene uno y el{\" \"} {PORCENTAJE_CREDITO_VARIOS} % si tiene dos o más.",
    "Queda disponible{\" \"} {DIAS_PARA_LIBERAR_CREDITO} días después de que confirmamos la entrega y vence {MESES_PARA_VENCER_CREDITO} meses después de quedar disponible: lo que no uses hasta entonces se pierde.",
    "Se usa solo en anteojos; no paga el envío, los estuches ni los paños.",
    "Para tenerlo no hace falta abrir la cuenta.",
    "que forman parte de estos términos.",
  ]) {
    assert.ok(texto.includes(parte), parte);
  }
  assert.match(clausula, /<Link href="\/legales\/suscriptores#credito"/);
  assert.doesNotMatch(clausula, /Dúo/, "el Dúo solo en su cláusula");
  assert.doesNotMatch(fuera, NOMBRA_EL_CREDITO, "apagado, los Términos no lo nombran");
  assert.doesNotMatch(fuera, /#credito/);
  // La versión: la página muestra la vigente y el checkout guarda esa misma.
  assert.match(terminos, /Versión vigente: \{versionTerminosLegible\(versionTerminosVigente\(\)\)\}\./);
  assert.match(sinComentarios(leer("app/api/checkout/route.ts")), /Terminos_aceptados: registroAceptacion\(ahora, versionTerminosVigente\(\)\),/);
  const momento = new Date("2026-12-01T12:00:00.000Z");
  assert.equal(versionTerminosVigente(), VERSION_TERMINOS, "apagado, la de siempre");
  assert.equal(VERSION_TERMINOS, "2026-11-18");
  assert.equal(registroAceptacion(momento, versionTerminosVigente()), "Versión 2026-11-18 · 2026-12-01T12:00:00.000Z");
  assert.equal(await prendido(() => versionTerminosVigente()), VERSION_TERMINOS_CON_CREDITO);
  assert.equal(VERSION_TERMINOS_CON_CREDITO, "2026-11-20");
  assert.equal(await prendido(() => registroAceptacion(momento, versionTerminosVigente())), "Versión 2026-11-20 · 2026-12-01T12:00:00.000Z");
});

// Revisión del 20/11/2026: quien solo tiene crédito entra a Mi cuenta sin
// abrir la cuenta (entrarALaCuenta) y recibe igual la cookie de sesión; y sus
// datos se usan para el crédito, no para novedades (Ley 25.326, arts. 5 y 6).
test("La Política de privacidad dice, solo prendido, la cookie de quien entra para ver su crédito y para qué se usan los datos del crédito", () => {
  const pagina = sinComentarios(leer("app/legales/privacidad/page.tsx"));
  assert.match(pagina, /const conCredito = creditoActivo\(\);/);
  const bloques: string[] = [];
  let fuera = pagina;
  for (let inicio = pagina.indexOf("{conCredito ? ("); inicio >= 0; inicio = pagina.indexOf("{conCredito ? (", inicio + 1)) {
    const fin = pagina.indexOf(") : null}", inicio);
    assert.ok(fin > inicio, "cada párrafo del crédito cierra su condición");
    bloques.push(pagina.slice(inicio, fin));
    fuera = fuera.replace(pagina.slice(inicio, fin), "");
  }
  assert.equal(bloques.length, 2);
  const texto = bloques.join(" ").replace(/\s+/g, " ");
  for (const frase of [
    "Si entrás a Mi cuenta con tu mail solo para ver o usar tu Crédito Harper, sin abrir la cuenta, también guardamos esa cookie de sesión en tu navegador por {diasSesion} días, solo para reconocerte. No se usa para publicidad.",
    "Si ganás Crédito Harper, usamos tu mail y tus compras para llevar tu crédito: mostrártelo en Mi cuenta, descontarlo cuando lo usás, revisarlo si hay una devolución, un reclamo o un contracargo, y avisarte por mail cuando queda disponible y antes de que venza. Esos avisos no son mails de novedades: si no los aceptaste, no te mandamos novedades por tener crédito.",
  ]) {
    assert.ok(texto.includes(frase), frase);
  }
  assert.doesNotMatch(fuera, NOMBRA_EL_CREDITO, "apagado, la Privacidad es la de siempre");
});

// Revisión del 20/11/2026: donde se ofrece un importe de crédito, antes de
// pagar, va también cuándo se puede usar, que vence y el enlace a las
// condiciones (Ley 24.240, art. 7). El enlace abre aparte, como los legales
// del checkout, para no perder lo cargado.
test("La ficha, el carrito, el panel y el checkout dicen cuándo queda disponible y cuándo vence, con el enlace a las condiciones", () => {
  assert.equal(
    TEXTOS.programa.credito.plazos(DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO),
    "Queda disponible 30 días después de que confirmemos la entrega y vence 6 meses después."
  );
  assert.equal(TEXTOS.programa.credito.condiciones, "Ver las condiciones");
  const plazos = /\{TEXTOS\.programa\.credito\.plazos\(DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO\)\}/;
  const enlace = /<a href="\/legales\/suscriptores#credito" target="_blank" rel="noopener" className="checkout__enlace">\s*\{TEXTOS\.programa\.credito\.condiciones\}\s*<\/a>/;
  const importa = /import \{ DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO \} from "@\/lib\/credito-harper";/;
  // CreditoQueSuma es el del carrito, el panel lateral y el checkout: los tres lo muestran con el importe.
  const componente = sinComentarios(leer("components/carrito/CreditoQueSuma.tsx"));
  assert.match(componente, importa);
  assert.match(componente, /\{TEXTOS\.programa\.credito\.carrito\(formatearPrecio\(monto\), otro\)\}\{" "\}\s*\{TEXTOS\.programa\.credito\.plazos/);
  assert.match(componente, plazos);
  assert.match(componente, enlace);
  // La ficha: adentro de la línea del crédito, que solo se dibuja con `creditoDeLaFicha`.
  const ficha = sinComentarios(leer("components/producto/FichaProducto.tsx"));
  assert.match(ficha, importa);
  const linea = ficha.slice(ficha.indexOf("{creditoDeLaFicha ? ("), ficha.indexOf(") : null}", ficha.indexOf("{creditoDeLaFicha ? (")));
  assert.match(linea, plazos);
  assert.match(linea, enlace);
});

// La regla de reintegro de la devolución parcial (L1 del plan) no está
// decidida: la frase de las condiciones es una propuesta del 20/11/2026 que,
// con un Dúo, da M2 o M3 según los colores y cambia crédito por dinero. No se
// elige acá: decide Ale. Esta prueba fija que el bloqueo queda escrito donde
// se va a mirar antes de prender el interruptor. Cuando Ale decida, se
// reescriben la frase, los avisos a Harper y esta prueba.
test("La devolución parcial con crédito sigue sin decidir (L1): el plan y la página la dejan como algo que bloquea prender el crédito", () => {
  const plan = leer("docs/plan-programa-harper.md");
  const bloqueos = plan.slice(plan.indexOf("**Lo que bloquea la activación (verificado):**"));
  assert.ok(bloqueos.length > 0);
  assert.match(bloqueos.slice(0, 1_500), /En especial L1: la frase publicada de la devolución parcial es una propuesta sin decidir/);
  const l1 = plan.split("\n").find((l) => l.startsWith("| L1 |")) ?? "";
  assert.match(l1, /Bloquea prender `HARPER_CREDITO_ACTIVO`/);
  assert.match(l1, /M2/);
  assert.match(l1, /No se puede cambiar por dinero/);
  const pagina = leer("app/legales/suscriptores/page.tsx");
  assert.match(pagina, /La frase de la devolución parcial es la propuesta del 20\/11\/2026 y NO está decidida \(L1, plan §14\)/);
  assert.match(pagina, /HARPER_CREDITO_ACTIVO no se prende hasta que Ale decida L1/);
});

// ---------- 3. Prendido: las frases ----------

test("Prendido: la barra y las preguntas frecuentes traen las frases del Crédito Harper con los números del motor", () => {
  assert.deepEqual([PORCENTAJE_CREDITO_UN_ANTEOJO, PORCENTAJE_CREDITO_VARIOS, DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO], [5, 10, 30, 6]);
  // La barra: después del Dúo, antes del envío.
  const barra = anunciosDelHeader({ banner: "", cuotas: TRES_CUOTAS, duo: 25, credito: { unAnteojo: CREDITO_DEL_SERVIDOR.unAnteojo, varios: CREDITO_DEL_SERVIDOR.varios }, envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 });
  assert.equal(barra[1], BARRA);
  assert.equal(barra.filter((t) => NOMBRA_EL_CREDITO.test(t)).length, 1);
  // Sin el Dúo, primera.
  assert.equal(anunciosDelHeader({ banner: "", cuotas: null, credito: CREDITO_DEL_SERVIDOR })[0], BARRA);
  // Las preguntas: la del crédito, con su respuesta y el enlace a las condiciones.
  const p = preguntasDePortada({ ...BASE_PREGUNTAS, credito: CREDITO_DEL_SERVIDOR }).filter((x) => NOMBRA_EL_CREDITO.test(`${x.pregunta} ${x.respuesta}`));
  assert.deepEqual(p, [{ pregunta: PREGUNTA, respuesta: RESPUESTA, enlace: { href: "/legales/suscriptores#credito", texto: "Ver las condiciones" } }]);
  // La portada: «5% de vuelta en Crédito Harper» / «10% con dos o más, para tu próxima compra de anteojos».
  assert.equal(TEXTOS.programa.credito.portada(PORCENTAJE_CREDITO_UN_ANTEOJO), "5% de vuelta en Crédito Harper");
  assert.equal(TEXTOS.programa.credito.portadaDetalle(PORCENTAJE_CREDITO_VARIOS), "10% con dos o más, para tu próxima compra de anteojos");
  // «Llevando dos» quedó solo en la ficha, donde de verdad es sobre dos de ese modelo (fichaDos).
  const hojas: string[] = [];
  const juntar = (v: unknown): void => {
    if (typeof v === "string") hojas.push(v);
    else if (typeof v === "function") juntar(v("$ 1", "$ 2", 3, 4));
    else if (v && typeof v === "object") Object.values(v).forEach(juntar);
  };
  juntar(TEXTOS.programa.credito);
  assert.deepEqual(hojas.filter((t) => /llevando dos/i.test(t)), ["Llevando dos, sumás $ 1 ($ 2 con dinero en Mercado Pago)."]);
  // Lo que se lee en la billetera.
  assert.equal(TEXTOS.suscriptores.cuenta.credito.bajada(MESES_PARA_VENCER_CREDITO), "Lo ganás con tus compras de anteojos. Se usa solo en anteojos. Cada crédito vence 6 meses después de quedar disponible.");
});

// ---------- 4. Lo que suma la compra es lo que se anota ----------

/** Lo que anota el webhook para estos renglones: los Items guardados, leídos como los lee él. */
const loQueSeAnota = (items: ItemResuelto[]) => calcularCredito(renglonesDeItems(itemsDelPedido(items))).monto;

test("Lo que suma la compra (creditoQueSuma) es lo que anota el webhook: con tarjeta y con dinero en Mercado Pago, con uno y con dos anteojos", async () => {
  const linea = await lineas();
  const casos: { nombre: string; items: ItemCarrito[]; duo: boolean; tarjeta: number; dineroMP: number }[] = [
    { nombre: "un anteojo", items: [linea("amatista")], duo: false, tarjeta: 4_495, dineroMP: 4_046 },
    { nombre: "un anteojo con un estuche (el estuche no suma)", items: [linea("amatista"), linea("r100")], duo: false, tarjeta: 4_495, dineroMP: 4_046 },
    { nombre: "dos anteojos, Dúo apagado", items: [linea("amatista"), linea("obsidiana")], duo: false, tarjeta: 17_980, dineroMP: 16_182 },
    { nombre: "dos anteojos con el Dúo", items: [linea("amatista"), linea("obsidiana")], duo: true, tarjeta: 15_733, dineroMP: 14_159 },
    { nombre: "dos del mismo modelo con el Dúo", items: [linea("amatista", 0, 2)], duo: true, tarjeta: 15_733, dineroMP: 14_159 },
  ];
  for (const caso of casos) {
    const c = await prendido(() => resolverCarrito(caso.items, { paraCobrar: true }), caso.duo);
    assert.ok(c.creditoPrevisto, caso.nombre);
    assert.ok(c.dineroMP, caso.nombre);
    // Con tarjeta se cobran (y se guardan) los renglones del carrito; con dinero en Mercado Pago, los de ese 10 %.
    assert.equal(c.creditoPrevisto.mercadoPago, loQueSeAnota(c.items), `${caso.nombre}: con tarjeta`);
    assert.equal(c.creditoPrevisto.dineroMP, loQueSeAnota(c.dineroMP.items), `${caso.nombre}: con dinero en Mercado Pago`);
    assert.deepEqual([c.creditoPrevisto.mercadoPago, c.creditoPrevisto.dineroMP], [caso.tarjeta, caso.dineroMP], caso.nombre);
    assert.equal(creditoQueSuma(c.items), c.creditoPrevisto.mercadoPago);
  }
  // Sin anteojos no suma nada (y se dice 0, no se inventa).
  const soloEstuche = await prendido(() => resolverCarrito([linea("r100")], { paraCobrar: true }));
  assert.deepEqual(soloEstuche.creditoPrevisto, { mercadoPago: 0, dineroMP: 0 });
  // Un renglón que no tiene sentido no promete nada.
  assert.equal(creditoQueSuma([{ categoria: "Anteojos", cantidad: 1, subtotal: -1 }]), 0);
  assert.equal(creditoQueSuma([{ categoria: "Anteojos", cantidad: 1.5, subtotal: 89_900 }]), 0);
});

test("Prendido, /gracias dice lo mismo que va a anotar el webhook, solo en pedidos del régimen nuevo", async () => {
  const linea = await lineas();
  const uno = await prendido(() => resolverCarrito([linea("amatista")], { paraCobrar: true }));
  const dos = await prendido(() => resolverCarrito([linea("amatista"), linea("obsidiana")], { paraCobrar: true }), true);
  const crear = (numero: string, items: ItemResuelto[], notas: string | null) =>
    createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pagado", Total: 1, Subtotal: 1, Items: itemsDelPedido(items), ...(notas ? { Notas: notas } : {}) });
  await crear("HARPER-GRA1", uno.items, notasConRegimen(notasDelPedido(null, uno.items), true));
  await crear("HARPER-GRA2", dos.items, notasConRegimen(notasDelPedido(null, dos.items), true));
  await crear("HARPER-GRA3", uno.items, null); // sin la marca del checkout: reglas de antes
  const conCashback = notasDeBeneficios({ suscriptorId: "recAAAAAAAAAAAAAA", email: "a@b.com", cupon: 0, saldoUsado: 0, cashback: 8_990 }).join("\n");
  await crear("HARPER-GRA4", uno.items, notasConRegimen(conCashback, true)); // el cashback de antes: no suma
  const gracias = await prendido(async () => Promise.all(["HARPER-GRA1", "HARPER-GRA2", "HARPER-GRA3", "HARPER-GRA4"].map((n) => buscarPedido(n))));
  assert.deepEqual(gracias.map((p) => p?.creditoGanado ?? null), [loQueSeAnota(uno.items), loQueSeAnota(dos.items), null, null]);
  assert.deepEqual(gracias.slice(0, 2).map((p) => p?.creditoGanado), [4_495, 15_733]);
  // El texto de /gracias: cuánto sumó y para qué, que queda pendiente hasta 30
  // días después de que Harper confirme la entrega, cuándo vence y dónde verlo
  // (revisión de textos, 20/11/2026: «para tu próxima compra de anteojos» y «Mi
  // Cuenta»; y, a propósito, «confirmemos la entrega» en lugar de «recibas tu
  // pedido», que es lo que cuenta el código: Fecha_entrega + 30).
  const texto = TEXTOS.programa.credito.gracias(precio(4_495), DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO);
  assert.equal(
    texto,
    `Con esta compra sumaste ${precio(4_495)} de Crédito Harper para tu próxima compra de anteojos. Queda disponible 30 días después de que confirmemos la entrega de tu pedido y vence 6 meses después. Lo ves en Mi Cuenta, entrando con el mail de tu compra.`
  );
});

test("La ficha dice lo que suma con cada medio de pago: con dinero en Mercado Pago se paga menos y suma menos", () => {
  const C = TEXTOS.programa.credito;
  assert.equal(
    C.ficha("$ 4.495", "$ 4.046"),
    "Con este anteojo sumás $ 4.495 de Crédito Harper para tu próxima compra de anteojos ($ 4.046 si pagás con dinero en Mercado Pago)."
  );
  assert.equal(C.ficha("$ 4.495", null), "Con este anteojo sumás $ 4.495 de Crédito Harper para tu próxima compra de anteojos.");
  // El Dúo, que sí es sobre dos de ese modelo: «Llevando dos» se queda.
  assert.equal(C.fichaDos("$ 15.733", "$ 14.159"), "Llevando dos, sumás $ 15.733 ($ 14.159 con dinero en Mercado Pago).");
});

test("La ficha no dice lo que suma «este anteojo» si el carrito ya tiene anteojos: con ellos se queda corto", () => {
  // Revisión de textos (20/11/2026): con un anteojo en el carrito, sumar este
  // lleva la compra al 10 % y la frase («$ 4.495») se queda corta. La ficha
  // cuenta los anteojos del carrito resuelto por el servidor (los mismos que
  // usa para el Dúo) y, con alguno, no muestra la línea.
  const ficha = sinComentarios(leer("components/producto/FichaProducto.tsx"));
  assert.match(
    ficha,
    /const anteojosEnCarrito = \(carritoResuelto\?\.items \?\? \[\]\)\s*\.filter\(\(i\) => esCategoriaDeAnteojos\(i\.categoria\)\)\s*\.reduce\(\(total, i\) => total \+ i\.cantidad, 0\);/
  );
  assert.match(ficha, /const creditoDeLaFicha = credito && anteojosEnCarrito === 0 \? credito : null;/);
  // Todo lo que se dibuja del crédito pasa por `creditoDeLaFicha`: ni la caja ni las frases miran `credito` directo.
  assert.match(ficha, /\{cuotas \|\| precioDineroMP !== null \|\| creditoDeLaFicha \? \(/);
  assert.match(ficha, /\{creditoDeLaFicha\.dos && mostrarDuo \? ` \$\{TEXTOS\.programa\.credito\.fichaDos\(creditoDeLaFicha\.dos, creditoDeLaFicha\.dosDineroMP\)\}` : ""\}/);
  const sinTextos = ficha.replace(/TEXTOS\.programa\.credito\./g, "");
  assert.doesNotMatch(sinTextos, /\bcredito\./, "nada lee `credito.uno` ni `credito.dos` directo");
  assert.doesNotMatch(sinTextos, /\{credito \?|\|\| credito \?/, "ninguna parte se dibuja con `credito` directo");
  // Y la ficha del servidor (sin carrito resuelto todavía: `carritoResuelto` es null) es la de siempre.
  assert.match(sinComentarios(leer("components/carrito/useCarritoResuelto.ts")), /const \[datos, setDatos\] = useState<CarritoResueltoCliente \| null>\(null\);/);
});

test("Carrito y panel lateral: lo que suma la compra con los dos medios de pago; el checkout, con el elegido", () => {
  const C = TEXTOS.programa.credito;
  assert.equal(
    C.carrito("$ 15.733", "$ 14.159"),
    "Con esta compra sumás $ 15.733 de Crédito Harper para tu próxima compra de anteojos ($ 14.159 si pagás con dinero en Mercado Pago)."
  );
  assert.equal(C.carrito("$ 15.733", null), "Con esta compra sumás $ 15.733 de Crédito Harper para tu próxima compra de anteojos.");
  // Los números de referencia (Ale, 18/11/2026): un anteojo y tres.
  assert.equal(
    C.carrito(precio(4_495), precio(4_046)),
    `Con esta compra sumás ${precio(4_495)} de Crédito Harper para tu próxima compra de anteojos (${precio(4_046)} si pagás con dinero en Mercado Pago).`
  );
  assert.equal(C.carrito(precio(24_723), null), `Con esta compra sumás ${precio(24_723)} de Crédito Harper para tu próxima compra de anteojos.`);

  // CreditoQueSuma: el segundo importe solo si es mayor que cero y distinto del primero; formatea los dos, no calcula nada.
  const componente = sinComentarios(leer("components/carrito/CreditoQueSuma.tsx"));
  assert.match(componente, /export default function CreditoQueSuma\(\{ monto, conDineroMP = null \}: \{ monto: number \| null \| undefined; conDineroMP\?: number \| null \}\)/);
  assert.match(componente, /const otro = conDineroMP && conDineroMP > 0 && conDineroMP !== monto \? formatearPrecio\(conDineroMP\) : null;/);
  assert.match(componente, /\{TEXTOS\.programa\.credito\.carrito\(formatearPrecio\(monto\), otro\)\}/);
  // El carrito y el panel pasan los dos importes del servidor (arriba dicen «o $ X con dinero en Mercado Pago»).
  for (const archivo of ["components/carrito/VistaCarrito.tsx", "components/carrito/PanelCarrito.tsx"]) {
    const codigo = sinComentarios(leer(archivo));
    assert.equal(codigo.match(/<CreditoQueSuma /g)?.length, 1, archivo);
    assert.match(codigo, /<CreditoQueSuma monto=\{datos\.creditoPrevisto\?\.mercadoPago\} conDineroMP=\{datos\.creditoPrevisto\?\.dineroMP\} \/>/, archivo);
  }
  // El checkout, uno solo: el del medio de pago elegido.
  const checkout = sinComentarios(leer("components/checkout/FormularioCheckout.tsx"));
  assert.equal(checkout.match(/<CreditoQueSuma /g)?.length, 1);
  assert.match(checkout, /<CreditoQueSuma monto=\{creditoQueSuma\} conDineroMP=\{null\} \/>/);
});

test("La billetera de Mi Cuenta muestra lo que manda el servidor: el vencimiento más próximo, «Vence el …» y lo vencido, sin calcular fechas ni importes", () => {
  const C = TEXTOS.suscriptores.cuenta.credito;
  assert.equal(C.estado.vencido, "Vencido");
  assert.equal(C.proximoVencimiento("$ 4.495", "30/04/2027"), "$ 4.495 vencen el 30/04/2027.");
  assert.equal(C.vence("30/04/2027"), "Vence el 30/04/2027.");
  assert.equal(C.vencio("30/04/2027", "$ 1.200"), "Venció el 30/04/2027 con $ 1.200 sin usar.");
  // Revisión del 20/11/2026 (cambio a propósito): el pendiente se libera 30
  // días después de que Harper confirma la entrega (Fecha_entrega), no desde
  // que llega el pedido; «la entrega» sola se leía como el día en que llegó.
  assert.equal(C.pendienteDetalle(30), "Se libera 30 días después de que confirmemos la entrega.");
  assert.equal(C.sinEntrega(30), "Se libera 30 días después de que confirmemos la entrega.");
  const delCredito: string[] = [];
  const juntar = (v: unknown): void => {
    if (typeof v === "string") delCredito.push(v);
    else if (typeof v === "function") juntar(v("$ 1", 30, 6, "$ 2"));
    else if (v && typeof v === "object") Object.values(v).forEach(juntar);
  };
  juntar(TEXTOS.programa.credito);
  juntar(TEXTOS.suscriptores.cuenta.credito);
  assert.deepEqual(delCredito.filter((t) => /recib(?:ís|as) (?:tu|el) pedido|después de la entrega/.test(t)), [], "ningún texto cuenta los días desde que se recibe");
  const billetera = sinComentarios(leer("components/suscriptores/MiCreditoHarper.tsx"));
  assert.match(billetera, /\{T\.bajada\(MESES_PARA_VENCER_CREDITO\)\}/);
  assert.match(billetera, /\{billetera\.proximoVencimiento \? \(/);
  assert.match(billetera, /T\.vencio\(fechaLegible\(m\.venceEl\), formatearPrecio\(m\.restante \?\? m\.monto\)\)/);
  assert.match(billetera, /m\.venceEl \? T\.vence\(fechaLegible\(m\.venceEl\)\)/);
  // Solo muestra: las fechas y lo que queda vienen de la billetera (lib/credito-cuenta.ts, el cálculo del checkout).
  assert.doesNotMatch(billetera, /\b(?:venceEl|sumarMeses|estaVencido|saldoDeCredito)\(/);
  assert.doesNotMatch(billetera, /no vence/i);
});

test("La billetera con los estados del 20/11/2026: usado entero, apartado, el crédito devuelto y el uso que volvió", () => {
  const C = TEXTOS.suscriptores.cuenta.credito;
  // Las frases, exactas.
  assert.equal(C.estado.usado, "Usado");
  assert.equal(C.estado.reservado, "Apartado");
  assert.equal(C.liberado("01/11/2026"), "Se liberó el 01/11/2026.");
  // Revisión del 20/11/2026 (cambio a propósito; antes «Ya lo usaste entero.»):
  // un crédito puede quedar en $ 0 sin que el comprador lo use, cubriendo lo
  // usado de otro que pasó a revisión (saldoDeCredito). Dice lo que queda.
  assert.equal(C.usadoEntero, "No le queda nada para usar.");
  assert.doesNotMatch(C.usadoEntero, /usaste/);
  assert.equal(C.apartado, "Lo que le quedaba está apartado para un pedido que todavía no se pagó.");
  assert.equal(C.devueltoDe("HARPER-12345AB"), "Devuelto del pedido HARPER-12345AB");
  assert.equal(C.volvio("20/11/2026"), "Volvió a tu cuenta el 20/11/2026.");
  assert.equal(C.usoDevuelto, "Lo que usaste en ese pedido volvió a tu cuenta.");
  // Un uso «A revisar» ya no es por una devolución (con el reembolso total vuelve solo): no nombra el motivo.
  assert.equal(C.usoEnRevision, "Lo estamos revisando. Mientras tanto, sigue descontado.");
  assert.doesNotMatch(C.usoEnRevision, /devoluci/);

  const billetera = sinComentarios(leer("components/suscriptores/MiCreditoHarper.tsx"));
  // El crédito devuelto tiene su rama, su concepto y su propia key (la misma compra puede tener su crédito ganado, anulado).
  assert.match(billetera, /m\.tipo === "devuelto" \? \(\s*<li key=\{`devuelto-\$\{m\.pedido\}`\}/);
  assert.match(billetera, /\{T\.devueltoDe\(m\.pedido\)\}\s*<small>\{conDetalle\(T\.estado\[m\.estado\], detalleDelCredito\(m, hoy\)\)\}<\/small>/);
  assert.equal(billetera.match(/T\.concepto\(/g)?.length, 1, "«Pedido X · 0 %» no sale en el devuelto");
  // El detalle de cada estado: el ganado «se liberó», el devuelto «volvió a tu cuenta»; usado entero y apartado, con su frase.
  assert.match(billetera, /const desde = m\.disponibleDesde \? \(m\.tipo === "devuelto" \? T\.volvio : T\.liberado\)\(fechaLegible\(m\.disponibleDesde\)\) : "";/);
  assert.match(billetera, /case "reservado":\s*return juntar\(desde, T\.apartado\);/);
  assert.match(billetera, /case "usado":\s*return juntar\(desde, T\.usadoEntero\);/);
  assert.match(billetera, /case "disponible":\s*return juntar\(desde, m\.venceEl \? T\.vence\(fechaLegible\(m\.venceEl\)\) : ""\);/);
  // El uso: apartado, devuelto o en revisión.
  assert.match(billetera, /if \(m\.estado === "reservado"\) return T\.reservadoNota;\s*if \(m\.devuelto\) return T\.usoDevuelto;\s*return m\.conGestionAbierta \? T\.usoEnRevision : "";/);
  // Los estados que manda el servidor tienen todos su nombre.
  for (const estado of ["disponible", "pendiente", "en-revision", "anulado", "usado", "reservado", "vencido"] as const) assert.ok(C.estado[estado], estado);
});

// ---------- 5. Los mails ----------

test("Mail de confirmación, prendido: el renglón dice «Crédito Harper −$ X» y el bloque dice cuánto sumó, cuándo se libera y cuándo vence", () => {
  const items = [renglon({ credito: 4_495, subtotal: 85_405 })];
  const m = mailConfirmacion(datosDelMail(items, { creditoHarper: { suma: 4_270 } }));
  // «confirmemos la entrega» (revisión del 20/11/2026, a propósito): ver la prueba de /gracias.
  const sumaste = `Con esta compra sumaste ${precio(4_270)} de Crédito Harper para tu próxima compra de anteojos. Queda disponible 30 días después de que confirmemos la entrega de tu pedido y vence 6 meses después.`;
  for (const parte of [m.html, m.texto]) {
    assert.ok(parte.includes(`Crédito Harper −${precio(4_495)}`), "el renglón");
    assert.ok(parte.includes(sumaste), "el bloque");
    assert.ok(parte.includes("https://harper.ar/suscriptores/mi-cuenta"), "dónde verlo");
  }
  // Prendido pero sin nada que sumar (un pedido en $ 0 pagado con crédito): el renglón sí, el bloque no.
  const sinSuma = mailConfirmacion(datosDelMail(items, { creditoHarper: { suma: 0 } }));
  assert.ok(sinSuma.texto.includes(`Crédito Harper −${precio(4_495)}`));
  assert.doesNotMatch(todoElMail(sinSuma), /sumaste/);
  // Sin crédito usado en el renglón: solo el bloque.
  const soloSuma = mailConfirmacion(datosDelMail([renglon()], { creditoHarper: { suma: 4_270 } }));
  assert.ok(soloSuma.texto.includes(sumaste));
  assert.doesNotMatch(soloSuma.texto, /Crédito Harper −/);
});

test("Mails de «ya podés usarlo» y «vence pronto»: al mail de la compra, con el importe, la fecha y el enlace a los anteojos; sin datos que sirvan, no salen", async () => {
  const config = await getConfig();
  const disponible = mailCreditoDisponible({ config, email: "compradora@ejemplo.com", pedido: "HARPER-D1", monto: 4_495, disponibleDesde: "2026-10-31", venceEl: "2027-04-30", sitio: "https://harper.ar" });
  assert.equal(disponible.para, "compradora@ejemplo.com");
  assert.equal(disponible.asunto, `Ya podés usar tu Crédito Harper: ${precio(4_495)}`);
  assert.ok(disponible.texto.includes(`Tu Crédito Harper de ${precio(4_495)} ya está disponible para tu próxima compra de anteojos. Vence el 30/04/2027.`));
  const porVencer = mailCreditoPorVencer({ config, email: "compradora@ejemplo.com", pedido: "HARPER-D1", monto: 1_200, venceEl: "2027-04-30", dias: 0, sitio: "https://harper.ar" });
  assert.equal(porVencer.para, "compradora@ejemplo.com");
  assert.equal(porVencer.asunto, "Tu Crédito Harper vence el 30/04/2027");
  assert.ok(porVencer.texto.includes(`Tenés ${precio(1_200)} de Crédito Harper que vence el 30/04/2027. Usalo en tu próxima compra de anteojos hasta ese día inclusive.`));
  for (const m of [disponible, porVencer]) {
    assert.ok(m.html.includes('href="https://harper.ar/anteojos"'), "el botón lleva a los anteojos");
    assert.ok(m.texto.includes("https://harper.ar/anteojos"));
    assert.ok(m.texto.includes("HARPER-D1"), "el pedido con el que lo sumó");
    assert.equal(m.responderA, config.emailContacto);
  }
  // Sin un importe, con una fecha que no existe o sin mail: no se manda «Ya podés usar $ 0».
  const base = { config, email: "compradora@ejemplo.com", pedido: "HARPER-D1", monto: 4_495, disponibleDesde: "2026-10-31", venceEl: "2027-04-30" };
  for (const malo of [{ monto: 0 }, { monto: -5 }, { monto: Number.NaN }, { venceEl: "2027-02-31" }, { venceEl: "30/04/2027" }, { email: "" }, { email: "   " }]) {
    assert.throws(() => mailCreditoDisponible({ ...base, ...malo }), RangeError, JSON.stringify(malo));
    assert.throws(() => mailCreditoPorVencer({ ...base, dias: 3, ...malo }), RangeError, JSON.stringify(malo));
  }
});
