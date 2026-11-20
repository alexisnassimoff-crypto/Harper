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

const BARRA = "Crédito Harper: 5% de vuelta con un anteojo y 10% llevando dos, para tu próxima compra";
const PREGUNTA = "¿Qué es el Crédito Harper?";
const RESPUESTA =
  "Es plata para tu próxima compra de anteojos en harper.ar. Te devolvemos el 5% de lo que pagás en anteojos si llevás uno, y el 10% si llevás dos o más. Queda disponible 30 días después de que recibís el pedido y vence 6 meses después. Se usa solo en anteojos (no paga el envío) y lo ves en tu cuenta Harper, entrando con el mail de tu compra.";

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
  assert.equal(C.barra(7, 12), "Crédito Harper: 7% de vuelta con un anteojo y 12% llevando dos, para tu próxima compra");
  assert.match(C.respuesta(7, 12, 45, 9), /el 7% de lo que pagás en anteojos si llevás uno, y el 12% si llevás dos o más\. Queda disponible 45 días después de que recibís el pedido y vence 9 meses después\./);
  assert.match(C.gracias("$ 1", 45, 9), /Queda disponible 45 días después de que recibas tu pedido y vence 9 meses después\./);
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
    path.join("app", "legales", "suscriptores", "page.tsx"),
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
  assert.match(sinComentarios(leer("components/producto/FichaProducto.tsx")), /\{credito \? \(\s*<p[^>]*>\s*\{TEXTOS\.programa\.credito\.ficha\(credito\.uno\)\}/);
  // El carrito y el panel lateral: solo con el importe que mandó el servidor.
  assert.match(sinComentarios(leer("components/carrito/CreditoQueSuma.tsx")), /if \(!monto \|\| monto <= 0\) return null;/);
  for (const archivo of ["components/carrito/VistaCarrito.tsx", "components/carrito/PanelCarrito.tsx"]) {
    assert.match(sinComentarios(leer(archivo)), /<CreditoQueSuma monto=\{datos\.creditoPrevisto\?\.mercadoPago\} \/>/, archivo);
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
  assert.doesNotMatch(fuera, NOMBRA_EL_CREDITO, "apagado, la página no lo nombra");
  assert.doesNotMatch(fuera, /#credito/, "ni un enlace a la sección");
  // Los meses de la página son los del motor (Ale, 18/11/2026: 6), los importe de ahí o tenga una copia igual.
  const local = /const MESES_PARA_VENCER_CREDITO = (\d+);/.exec(pagina);
  if (local) assert.equal(Number(local[1]), MESES_PARA_VENCER_CREDITO, "la constante local de la página tiene que coincidir con lib/credito-harper.ts");
  else assert.match(pagina, /import \{[^}]*\bMESES_PARA_VENCER_CREDITO\b[^}]*\} from "@\/lib\/credito-harper";/);
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
  // La portada: «5% de vuelta en Crédito Harper» / «10% llevando dos, para tu próxima compra».
  assert.equal(TEXTOS.programa.credito.portada(PORCENTAJE_CREDITO_UN_ANTEOJO), "5% de vuelta en Crédito Harper");
  assert.equal(TEXTOS.programa.credito.portadaDetalle(PORCENTAJE_CREDITO_VARIOS), "10% llevando dos, para tu próxima compra");
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
  // El texto de /gracias: cuánto sumó, que queda pendiente hasta 30 días después de recibirlo, cuándo vence y dónde verlo.
  const texto = TEXTOS.programa.credito.gracias(precio(4_495), DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO);
  assert.ok(texto.startsWith(`Con esta compra sumaste ${precio(4_495)} de Crédito Harper. Queda disponible 30 días después de que recibas tu pedido y vence 6 meses después.`), texto);
  assert.match(texto, /cuenta Harper/);
});

test("La billetera de Mi Cuenta muestra lo que manda el servidor: el vencimiento más próximo, «Vence el …» y lo vencido, sin calcular fechas ni importes", () => {
  const C = TEXTOS.suscriptores.cuenta.credito;
  assert.equal(C.estado.vencido, "Vencido");
  assert.equal(C.proximoVencimiento("$ 4.495", "30/04/2027"), "$ 4.495 vencen el 30/04/2027.");
  assert.equal(C.vence("30/04/2027"), "Vence el 30/04/2027.");
  assert.equal(C.vencio("30/04/2027", "$ 1.200"), "Venció el 30/04/2027 con $ 1.200 sin usar.");
  const billetera = sinComentarios(leer("components/suscriptores/MiCreditoHarper.tsx"));
  assert.match(billetera, /\{T\.bajada\(MESES_PARA_VENCER_CREDITO\)\}/);
  assert.match(billetera, /\{billetera\.proximoVencimiento \? \(/);
  assert.match(billetera, /T\.vencio\(fechaLegible\(m\.venceEl\), formatearPrecio\(m\.restante \?\? m\.monto\)\)/);
  assert.match(billetera, /m\.venceEl \? T\.vence\(fechaLegible\(m\.venceEl\)\)/);
  // Solo muestra: las fechas y lo que queda vienen de la billetera (lib/credito-cuenta.ts, el cálculo del checkout).
  assert.doesNotMatch(billetera, /\b(?:venceEl|sumarMeses|estaVencido|saldoDeCredito)\(/);
  assert.doesNotMatch(billetera, /no vence/i);
});

// ---------- 5. Los mails ----------

test("Mail de confirmación, prendido: el renglón dice «Crédito Harper −$ X» y el bloque dice cuánto sumó, cuándo se libera y cuándo vence", () => {
  const items = [renglon({ credito: 4_495, subtotal: 85_405 })];
  const m = mailConfirmacion(datosDelMail(items, { creditoHarper: { suma: 4_270 } }));
  const sumaste = `Con esta compra sumaste ${precio(4_270)} de Crédito Harper. Queda disponible 30 días después de que recibas tu pedido y vence 6 meses después.`;
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
