import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Las reglas comerciales que decidió Ale el 18/11/2026, juntas:
//
//  1. Cuotas: hasta 3 sin interés para todos. Nadie tiene 6.
//  2. Los beneficios en plata de Suscriptores Harper terminaron para todos:
//     sin cupón de bienvenida, sin cashback, sin envío gratis por tener cuenta
//     y sin cuotas propias. Queda la cuenta y los mails de novedades.
//  3. Envío gratis: en AMBA desde `envio_gratis_amba_desde`; al resto del país
//     desde `envio_gratis_desde` ($ 250.000). El mínimo se mide con los
//     anteojos a precio de lista, antes del Dúo.
//  4. El 10 % por pagar con dinero en Mercado Pago sigue, sobre lo que queda
//     después del Dúo.
//  5. El Dúo se prende en el servidor (HARPER_DUO_ACTIVO=1). Apagado, nada lo
//     nombra.
//
// Acá están las que cruzan varias piezas. Las demás, cada una en su archivo:
// que la preferencia de Mercado Pago nunca lleve más de 3 cuotas, aunque se
// le pidan 6 o 12 (tests/cuotas.test.ts), y que el alta nueva nazca sin
// cupón (tests/suscriptores-cuenta.test.ts).
//
// El carrito es el del servidor contra el Airtable de prueba, con los mínimos
// por defecto de esos datos (los de producción) y un Envia de mentira.
process.env.HARPER_FIXTURES = "1";
process.env.ENVIA_TOKEN = "token-de-prueba";
delete process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE;
delete process.env.HARPER_FIXTURES_ENVIO_GRATIS_AMBA_DESDE;
delete process.env.HARPER_FIXTURES_ESCALA;
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;

import { listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { anunciosDelHeader } from "../lib/anuncios";
import { getProductos } from "../lib/catalogo";
import { getConfig, getConfigParaCobrar } from "../lib/config";
import { mensajesDeConfianza } from "../lib/confianza";
import { ofertaDeEscala, porcentajeParaCantidad, proximoTramo } from "../lib/descuentos";
import { PORCENTAJE_DINERO_MP } from "../lib/dinero-mp";
import { PORCENTAJE_DUO } from "../lib/duo";
import { vaciarCacheEnvia } from "../lib/envia";
import { envioEnElCarrito, textoEnvioGratis } from "../lib/envio-gratis";
import { condicionesDeCompra } from "../lib/ficha";
import { interceptar, RespuestaFixture } from "../lib/fixtures/servidor";
import { VERSION_CONDICIONES_SUSCRIPTORES, VERSION_TERMINOS } from "../lib/legales";
import { mailAvisoInterno, mailConfirmacion } from "../lib/mails";
import { CUOTAS_PREFERENCIA } from "../lib/mercadopago";
import { resolverCarrito, type CarritoResuelto } from "../lib/pedidos";
import { garantiasDePortada, pasosDeCompra, preguntasDePortada } from "../lib/portada";
import {
  BENEFICIOS_DE_SUSCRIPTOR,
  CUOTAS_SON_BENEFICIO,
  CUOTAS_SUSCRIPTORES,
  CUOTAS_TODOS,
  type SuscriptorDelCarrito,
} from "../lib/suscriptores";
import { TEXTOS } from "../lib/textos";
import type { ItemCarrito, ItemResuelto } from "../lib/tipos";
import { empujeDeLaBarra } from "../lib/vitrina";

// ---------- El entorno de prueba ----------

const CORDOBA = { cp: "5000", provincia: "Córdoba", ciudad: "Córdoba", calle: "Bv. San Juan", numero: "123" };
const CABA = { cp: "1426", provincia: "Ciudad Autónoma de Buenos Aires", ciudad: "Buenos Aires", calle: "Gorostiaga", numero: "1635" };
/** Córdoba: Correo Argentino cotiza $ 7.350,25; con el 10 % de recargo, $ 8.086 (como en tests/duo-envio.test.ts). */
const ENVIO_CORDOBA = 8086;

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entrada);
  if (!url.startsWith("https://api.envia.com/")) return fetchOriginal(entrada, init);
  const carrier = JSON.parse(String(init?.body)).shipment.carrier;
  const data =
    carrier === "andreani"
      ? [{ carrier, service: "ground", serviceDescription: "Estándar", deliveryEstimate: "2-4 días", totalPrice: "8120.40", currency: "ARS" }]
      : carrier === "correoArgentino"
        ? [{ carrier, service: "standard_dom", serviceDescription: "Clásico", deliveryEstimate: "3-6 días", totalPrice: 7350.25, currency: "ARS" }]
        : null;
  return new Response(JSON.stringify(data ? { meta: "rate", data } : { meta: "error", error: { code: 1126, message: "sin cobertura" } }));
}) as typeof fetch;
console.warn = () => {};

async function conInterruptor<T>(valor: string | undefined, hacer: () => Promise<T>): Promise<T> {
  const antes = process.env.HARPER_DUO_ACTIVO;
  if (valor === undefined) delete process.env.HARPER_DUO_ACTIVO;
  else process.env.HARPER_DUO_ACTIVO = valor;
  try {
    return await hacer();
  } finally {
    if (antes === undefined) delete process.env.HARPER_DUO_ACTIVO;
    else process.env.HARPER_DUO_ACTIVO = antes;
  }
}
const apagado = <T>(hacer: () => Promise<T>) => conInterruptor(undefined, hacer);
const prendido = <T>(hacer: () => Promise<T>) => conInterruptor("1", hacer);

/** Cambia un valor de Config del Airtable de prueba solo durante `hacer`. */
async function conConfig<T>(clave: string, valor: string, hacer: () => Promise<T>): Promise<T> {
  const fila = (await listRecords<{ Clave?: string; Valor?: string }>(TABLAS.config)).find((f) => f.fields.Clave === clave)!;
  const antes = fila.fields.Valor;
  await updateRecord(TABLAS.config, fila.id, { Valor: valor });
  try {
    return await hacer();
  } finally {
    await updateRecord(TABLAS.config, fila.id, { Valor: antes });
  }
}

/** Los renglones de prueba: anteojos de $ 89.900 de modelos distintos y un estuche. */
async function lineas() {
  const productos = await getProductos();
  const linea = (slug: string, n = 0, cantidad = 1): ItemCarrito => {
    const producto = productos.find((p) => p.slug === slug)!;
    assert.ok(producto, `el catálogo de prueba tiene «${slug}»`);
    return { productoSlug: slug, varianteId: producto.variantes[n].id, cantidad };
  };
  for (const slug of ["amatista", "cuarzo", "obsidiana"]) assert.equal(productos.find((p) => p.slug === slug)?.precio, 89_900, slug);
  return {
    uno: [linea("amatista")],
    dos: [linea("amatista"), linea("cuarzo", 1)],
    dosIguales: [linea("amatista", 0, 2)],
    tres: [linea("amatista"), linea("cuarzo", 1), linea("obsidiana", 2)],
    conEstuches: [linea("amatista"), linea("m500", 0, 2)],
    soloEstuche: [linea("m500")],
  };
}

/** Todo lo que se cobra y se muestra de un carrito, sin el comprobante del envío (lleva un IV al azar). */
const loQueSeCobra = (c: CarritoResuelto) => ({
  items: c.items,
  subtotal: c.subtotal,
  envio: c.envio,
  total: c.total,
  ahorro: c.ahorro,
  subtotalSinCupon: c.subtotalSinCupon,
  envioBonificado: c.envioBonificado,
  envioZona: c.envioZona,
  envioCotizado: c.envioCotizado,
  envioCobrado: c.envioDelPedido.cobrado,
  envioOpcion: c.envioDelPedido.opcion,
  dineroMP: c.dineroMP ? { subtotal: c.dineroMP.subtotal, ahorro: c.dineroMP.ahorro, items: c.dineroMP.items } : null,
  duo: c.duo ?? null,
});

// ---------- 1. Las constantes ----------

test("Reglas del 18/11: 3 cuotas para todos, ningún beneficio en plata por estar suscripto, y las versiones de los textos legales", () => {
  // Cuotas: las de un suscriptor son las de todos, y no son un beneficio.
  assert.equal(CUOTAS_TODOS, 3);
  assert.equal(CUOTAS_SUSCRIPTORES, CUOTAS_TODOS);
  assert.equal(CUOTAS_SUSCRIPTORES, 3);
  assert.equal(CUOTAS_SON_BENEFICIO, false);
  // El techo de la preferencia de Mercado Pago es ese mismo número.
  assert.equal(CUOTAS_PREFERENCIA, CUOTAS_TODOS);
  // La suscripción no da nada en plata: ni cupón, ni cashback, ni envío gratis, ni cuotas.
  assert.equal(BENEFICIOS_DE_SUSCRIPTOR, false);
  // Lo que sí sigue: el 10 % por dinero en Mercado Pago y el Dúo de 25 % (prendido o no).
  assert.equal(PORCENTAJE_DINERO_MP, 10);
  assert.equal(PORCENTAJE_DUO, 25);
  // Cada pedido y cada alta guardan la versión que aceptaron: cambió con el texto.
  assert.equal(VERSION_TERMINOS, "2026-11-18");
  assert.equal(VERSION_CONDICIONES_SUSCRIPTORES, "2026-11-18");
});

// ---------- 2. Con cuenta se paga exactamente lo mismo que sin ella ----------

test("Reglas del 18/11: una cuenta con sesión paga exactamente lo mismo que un visitante (renglones, subtotal, envío y total), con el Dúo apagado y prendido", async () => {
  vaciarCacheEnvia();
  const carritos = await lineas();
  // La cuenta como la traería una fila de antes del 18/11: suscripta y con el cupón «Disponible».
  const cuenta: SuscriptorDelCarrito = { id: "recCUENTAPRUEBA001", email: "cuenta@ejemplo.com", cuponDisponible: true, saldoDisponible: 0, activo: true };
  // Lo mismo con saldo de antes, mientras no pida usarlo; y dada de baja de las novedades.
  const conSaldoSinPedirlo: SuscriptorDelCarrito = { ...cuenta, saldoDisponible: 50_000, saldoReservado: 0 };
  const deBaja: SuscriptorDelCarrito = { ...cuenta, activo: false };
  const destinos = [{}, { paraCobrar: true }, { destino: CORDOBA }, { destino: CABA }, { destino: CORDOBA, paraCobrar: true }];

  let comparados = 0;
  let conEnvioPago = 0;
  let conEnvioGratis = 0;
  let conDuo = 0;
  for (const [estado, interruptor] of [["apagado", apagado], ["prendido", prendido]] as const) {
    for (const [nombre, items] of Object.entries(carritos)) {
      for (const opciones of destinos) {
        const etiqueta = `Dúo ${estado} · ${nombre} · ${JSON.stringify(opciones)}`;
        const visitante = await interruptor(() => resolverCarrito(items, opciones));
        assert.equal(visitante.suscriptor, null, etiqueta);
        if (visitante.envio > 0) conEnvioPago++;
        else conEnvioGratis++;
        if (visitante.items.some((i) => i.duo)) conDuo++;

        for (const suscriptor of [cuenta, conSaldoSinPedirlo, deBaja]) {
          for (const usarCupon of [undefined, true]) {
            const conCuenta = await interruptor(() => resolverCarrito(items, { ...opciones, suscriptor, usarCupon }));
            // Lo que pide la regla: los mismos renglones, subtotal, envío y total.
            assert.deepEqual(conCuenta.items, visitante.items, etiqueta);
            assert.deepEqual([conCuenta.subtotal, conCuenta.envio, conCuenta.total], [visitante.subtotal, visitante.envio, visitante.total], etiqueta);
            // Y todo lo demás que se muestra o se cobra: el ahorro, la base del envío gratis, el 10 % de Mercado Pago, el Dúo.
            assert.deepEqual(loQueSeCobra(conCuenta), loQueSeCobra(visitante), etiqueta);
            // Lo que el carrito dice de la cuenta: nada en plata, y las cuotas de todos.
            assert.deepEqual(
              conCuenta.suscriptor,
              {
                email: "cuenta@ejemplo.com",
                cupon: 0,
                cuponDisponible: false,
                saldoUsado: 0,
                saldoDisponible: suscriptor.saldoDisponible,
                saldoReservado: 0,
                cashbackPrevisto: 0,
                cashbackDineroMP: null,
                cuotas: CUOTAS_TODOS,
                activo: suscriptor.activo !== false,
              },
              etiqueta
            );
            comparados++;
          }
        }
      }
    }
  }
  // La comparación vio de todo: carritos que pagan envío, que no, y con el Dúo aplicado.
  assert.equal(comparados, 2 * Object.keys(carritos).length * destinos.length * 3 * 2);
  assert.ok(conEnvioPago > 10 && conEnvioGratis > 10 && conDuo > 5, `envío pago ${conEnvioPago}, gratis ${conEnvioGratis}, con Dúo ${conDuo}`);
});

// ---------- 3. El Dúo, el 10 % y el envío gratis con los mínimos de hoy ----------

test("Reglas del 18/11: con el Dúo, dos anteojos de $ 89.900 cuestan $ 157.325 y $ 141.593 con dinero en cuenta; con el mínimo en $ 250.000, dos pagan envío fuera de AMBA y tres no, aunque paguen $ 247.225", async () => {
  vaciarCacheEnvia();
  const { uno, dos, dosIguales, tres } = await lineas();
  // Los mínimos por defecto de los datos de prueba son los de producción.
  const config = await getConfig();
  assert.equal(config.envioGratisDesde, 250_000);
  assert.equal(config.envioGratisAmbaDesde, 60_000);

  // --- Dúo prendido ---
  // Dos anteojos: el 25 % en el de menor precio, y el 10 % de Mercado Pago sobre lo que queda.
  for (const items of [dos, dosIguales]) {
    const c = await prendido(() => resolverCarrito(items, { destino: CORDOBA }));
    assert.equal(c.subtotal, 157_325);
    assert.equal(c.ahorro, 22_475);
    assert.equal(c.dineroMP?.subtotal, 141_593);
    assert.equal(c.dineroMP?.porcentaje, 10);
    // El mínimo se mide a precio de lista ($ 179.800): no llega a $ 250.000 y paga el envío.
    assert.equal(c.subtotalSinCupon, 179_800);
    assert.equal(c.envioZona, "resto");
    assert.equal(c.envioBonificado, false);
    assert.equal(c.envio, ENVIO_CORDOBA);
    assert.equal(c.total, 157_325 + ENVIO_CORDOBA);
  }
  // Los mismos dos anteojos en AMBA: gratis desde $ 60.000.
  const dosEnAmba = await prendido(() => resolverCarrito(dos, { destino: CABA }));
  assert.deepEqual([dosEnAmba.envioZona, dosEnAmba.envioBonificado, dosEnAmba.envio, dosEnAmba.total], ["amba", true, 0, 157_325]);
  // Tres anteojos: pagan $ 247.225 (menos que el mínimo), pero a precio de lista
  // son $ 269.700, así que el envío al resto del país es gratis.
  const tresConDuo = await prendido(() => resolverCarrito(tres, { destino: CORDOBA }));
  assert.equal(tresConDuo.subtotal, 247_225);
  assert.ok(tresConDuo.subtotal < config.envioGratisDesde, "paga menos que el mínimo");
  assert.equal(tresConDuo.subtotalSinCupon, 269_700);
  assert.deepEqual([tresConDuo.envioZona, tresConDuo.envioBonificado, tresConDuo.envio, tresConDuo.total], ["resto", true, 0, 247_225]);
  // Y con dinero en Mercado Pago, el 10 % sobre esos $ 247.225; el envío sigue gratis.
  assert.equal(tresConDuo.dineroMP?.subtotal, 222_503);
  // Un anteojo solo no tiene Dúo y paga el envío fuera de AMBA.
  const unoConDuo = await prendido(() => resolverCarrito(uno, { destino: CORDOBA }));
  assert.deepEqual([unoConDuo.subtotal, unoConDuo.envio, unoConDuo.dineroMP?.subtotal], [89_900, ENVIO_CORDOBA, 80_910]);

  // --- Dúo apagado: los mismos mínimos, sobre el precio de lista ---
  const dosSinDuo = await apagado(() => resolverCarrito(dos, { destino: CORDOBA }));
  assert.deepEqual([dosSinDuo.subtotal, dosSinDuo.envio, dosSinDuo.total], [179_800, ENVIO_CORDOBA, 179_800 + ENVIO_CORDOBA]);
  assert.equal(dosSinDuo.dineroMP?.subtotal, 161_820);
  const tresSinDuo = await apagado(() => resolverCarrito(tres, { destino: CORDOBA }));
  assert.deepEqual([tresSinDuo.subtotal, tresSinDuo.envio, tresSinDuo.total], [269_700, 0, 269_700]);
  // El Dúo no le da ni le saca el envío gratis a nadie: con y sin él, los mismos carritos lo tienen.
  for (const items of [uno, dos, tres]) {
    for (const destino of [CORDOBA, CABA]) {
      const sin = await apagado(() => resolverCarrito(items, { destino }));
      const con = await prendido(() => resolverCarrito(items, { destino }));
      assert.equal(con.envioBonificado, sin.envioBonificado, JSON.stringify([items, destino.provincia]));
      assert.equal(con.envio, sin.envio);
    }
  }

  // Sin dirección todavía (el carrito y el panel lateral): solo vale el mínimo
  // del resto del país; dos anteojos muestran la tarifa plana y tres, gratis.
  const dosSinDestino = await prendido(() => resolverCarrito(dos));
  assert.deepEqual([dosSinDestino.subtotal, dosSinDestino.envio, dosSinDestino.total], [157_325, config.costoEnvio, 157_325 + config.costoEnvio]);
  const tresSinDestino = await prendido(() => resolverCarrito(tres));
  assert.deepEqual([tresSinDestino.subtotal, tresSinDestino.envio, tresSinDestino.total], [247_225, 0, 247_225]);

  // Lo que la barra de la compra le dice a quien está eligiendo, con lo que
  // resolvió el servidor: «envío gratis a todo el país» solo cuando la compra
  // a precio de lista llega al mínimo. Con uno y con dos anteojos no se
  // promete (ni «con uno más», si con uno más tampoco llega); con tres, sí.
  const barraDe = (c: CarritoResuelto) => {
    const pares = c.items.filter((i) => i.categoria === "Anteojos").reduce((n, i) => n + i.cantidad, 0);
    return empujeDeLaBarra({
      pares,
      actual: porcentajeParaCantidad(c.tramos, "Anteojos", pares),
      proximo: proximoTramo(c.tramos, "Anteojos", pares),
      cupon: 0,
      subtotalSinCupon: c.subtotalSinCupon,
      precioPar: 89_900,
      envioGratisDesde: c.config.envioGratisDesde,
      escala: ofertaDeEscala(c.tramos, "Anteojos", pares),
      duo: c.duo ?? null,
    });
  };
  assert.equal(barraDe(await prendido(() => resolverCarrito(uno))), "Sumá otro: 25% OFF en el de menor precio.");
  assert.equal(barraDe(dosSinDestino), "Dúo aplicado: 25% OFF.");
  assert.equal(barraDe(tresSinDestino), "Dúo aplicado. Uno más: 25% OFF en otro par.");
  // Con el Dúo apagado y sin tramos de anteojos, la barra no tiene nada que decir hasta que el envío es gratis.
  assert.equal(barraDe(await apagado(() => resolverCarrito(uno))), null);
  assert.equal(barraDe(await apagado(() => resolverCarrito(dos))), null);
  assert.equal(barraDe(await apagado(() => resolverCarrito(tres))), "Envío gratis a todo el país.");
  // Y apagado, la barra no nombra el Dúo.
  for (const items of [uno, dos, tres]) assert.doesNotMatch(barraDe(await apagado(() => resolverCarrito(items))) ?? "", /Dúo/);
});

test("Reglas del 18/11: si Config no trae el mínimo (clave vacía o Airtable caído), el de respaldo es $ 250.000, nunca los $ 80.000 de antes", async () => {
  const { uno, dos } = await lineas();
  // La clave vacía: vale el mínimo de respaldo de lib/config.ts, también al cobrar.
  await conConfig("envio_gratis_desde", "", async () => {
    assert.equal((await getConfig()).envioGratisDesde, 250_000);
    assert.equal((await getConfigParaCobrar()).envioGratisDesde, 250_000);
    // Un anteojo (y dos) no tienen envío gratis al resto del país por un dato que falta.
    for (const items of [uno, dos]) {
      const c = await apagado(() => resolverCarrito(items, { paraCobrar: true }));
      assert.ok(c.envio > 0, "sin el dato no se regala el envío");
      assert.equal(c.envioBonificado, false);
    }
  });

  // Airtable no contesta: para mostrar, los valores de respaldo (al cobrar, explota a propósito).
  const errorDeConsola = console.error;
  console.error = () => {};
  interceptar((ruta) => {
    if (decodeURIComponent(ruta).startsWith(TABLAS.config)) throw new RespuestaFixture(503, "SERVICE_UNAVAILABLE");
  });
  try {
    const deRespaldo = await getConfig();
    assert.equal(deRespaldo.envioGratisDesde, 250_000);
    // Sin poder cotizar tampoco se promete el de AMBA.
    assert.equal(deRespaldo.envioGratisAmbaDesde, 0);
    await assert.rejects(getConfigParaCobrar());
  } finally {
    interceptar(null);
    console.error = errorDeConsola;
  }
});

// ---------- 4. Los textos ----------

/** «Dúo» como palabra (también «dúo» y «duo»), sin confundirlo con «individuo» o «gradúo». */
const NOMBRA_EL_DUO = /(^|[^a-záéíóúñ])d[uú]o(?![a-záéíóúñ])/i;
/** Lo que terminó el 18/11/2026 y ya no se le promete a nadie. */
const PROMESAS_TERMINADAS: [string, RegExp][] = [
  ["envío gratis siempre", /env[ií]o gratis siempre|gratis siempre/i],
  ["de bienvenida", /de bienvenida/i],
  ["si sos suscriptor", /si sos suscriptor/i],
  ["desbloque…", /desbloque/i],
  // El cashback de saldo de suscriptores («10% de vuelta», «de vuelta como
  // saldo»). El Crédito Harper (Ale, 18/11/2026; solo con
  // HARPER_CREDITO_ACTIVO=1) dice «5% de vuelta con un anteojo…» y «5% de
  // vuelta en Crédito Harper»: esas dos frases, y solo esas, no son la promesa
  // que terminó (tests/credito-comunicacion.test.ts las fija). Desde la
  // revisión de textos del 20/11/2026 la barra dice «con dos o más» y «de
  // anteojos».
  ["10% de vuelta", /\d\s?% de vuelta(?! con un anteojo y \S+ con dos o más, para tu próxima compra de anteojos$| en Crédito Harper$)|de vuelta como saldo/i],
];

/** Todas las hojas de TEXTOS con su ruta; las funciones, llamadas con datos de ejemplo (como en tests/portada.test.ts). */
function hojasDeTextos(): { ruta: string; texto: string }[] {
  const hojas: { ruta: string; texto: string }[] = [];
  const andar = (valor: unknown, ruta: string): void => {
    if (typeof valor === "string") hojas.push({ ruta, texto: valor });
    else if (typeof valor === "function") andar(valor("$ 1", 3, 2, "$ 2", "$ 3"), ruta);
    else if (Array.isArray(valor)) valor.forEach((v, i) => andar(v, `${ruta}[${i}]`));
    else if (valor && typeof valor === "object") for (const [clave, v] of Object.entries(valor)) andar(v, ruta ? `${ruta}.${clave}` : clave);
  };
  andar(TEXTOS, "");
  return hojas;
}
const bajo = (ruta: string, prefijos: readonly string[]) => prefijos.some((p) => ruta === p || ruta.startsWith(`${p}.`) || ruta.startsWith(`${p}[`));

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
  escala: "llevá 3 y pagá 2",
  porcentajeDineroMP: 10,
  cuenta: true,
};
const ESCALA = [{ categoria: "Anteojos" as const, desdeUnidades: 3, porcentaje: 100 / 3, paga: 2 }];
const DUO_PREGUNTAS = { porcentaje: 25, dos: { total: "$ 157.325", lista: "$ 179.800", totalDineroMP: "$ 141.593" } };

/** Lo que arman los textos de la tienda sin el dato del Dúo: la barra, las preguntas, la confianza, la ficha y el envío. */
function textosConElDuoApagado(): string[] {
  const textos: string[] = [];
  for (const minimos of [{}, { envioGratisDesde: 250_000 }, { envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 }]) {
    for (const cuotas of [null, TRES_CUOTAS]) {
      for (const duo of [undefined, null, 0]) {
        textos.push(...anunciosDelHeader({ banner: "Nuevo color: Citrino verde", cuotas, escala: ESCALA, duo, ...minimos }));
        textos.push(...anunciosDelHeader({ banner: "", cuotas, duo, ...minimos }));
      }
    }
  }
  for (const duo of [undefined, null]) {
    for (const datos of [BASE_PREGUNTAS, { ...BASE_PREGUNTAS, cuotas: null, escala: null, cuenta: false, envioGratisAmbaTexto: null }, { ...BASE_PREGUNTAS, envioGratisDesde: 0, envioGratisTexto: "" }]) {
      for (const p of preguntasDePortada({ ...datos, duo })) textos.push(p.pregunta, p.respuesta, p.enlace?.texto ?? "", p.enlace?.href ?? "");
    }
  }
  const confianza = mensajesDeConfianza({ envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 }, TRES_CUOTAS, "en anteojos");
  for (const m of confianza) textos.push(m.texto, m.detalle ?? "", m.nota ?? "");
  for (const c of condicionesDeCompra(confianza, { diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6 })) textos.push(c.texto, c.detalle ?? "", c.nota ?? "", c.enlace);
  const envio = { envioGratisDesde: 250_000, envioGratisTexto: "$ 250.000", envioGratisAmbaTexto: "$ 60.000" };
  for (const p of pasosDeCompra({ cuotas: { cuotas: 3, cftea: "0,00 %" }, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, diasCambio: 30, ...envio })) textos.push(p.titulo, p.texto);
  for (const g of garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, ...envio })) textos.push(g.titulo, g.texto);
  for (const u of [{ amba: 60_000, nacional: 250_000 }, { amba: 0, nacional: 250_000 }, { amba: 60_000, nacional: 0 }, { amba: 0, nacional: 0 }]) {
    textos.push(textoEnvioGratis(u));
    // El carrito sin el detalle del Dúo en ningún renglón (lo manda solo el servidor, y solo prendido).
    for (const base of [8_990, 89_900, 179_800, 269_700]) {
      const nota = envioEnElCarrito(base, base >= 250_000 ? 0 : 10_100, u, [{}, {}]);
      textos.push(nota.valor, nota.nota ?? "", nota.total);
    }
  }
  return textos.filter(Boolean);
}

/** Lo mismo con el Dúo prendido: los textos que reciben el dato del servidor. */
function textosConElDuoPrendido(): { barra: string[]; preguntas: string[] } {
  const barra = anunciosDelHeader({ banner: "Nuevo color: Citrino verde", cuotas: TRES_CUOTAS, escala: ESCALA, duo: 25, envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 });
  const preguntas = preguntasDePortada({ ...BASE_PREGUNTAS, duo: DUO_PREGUNTAS }).flatMap((p) => [p.pregunta, p.respuesta, p.enlace?.texto ?? ""]);
  return { barra, preguntas };
}

test("Reglas del 18/11: con el Dúo apagado nada lo nombra; en TEXTOS solo lo nombran las claves que son del Dúo", () => {
  // Lo que arman la barra, las preguntas, la confianza, la ficha y el envío sin el dato del Dúo.
  const apagados = textosConElDuoApagado();
  assert.ok(apagados.length > 150, "se juntaron los textos de la tienda");
  for (const texto of apagados) assert.doesNotMatch(texto, NOMBRA_EL_DUO, `con el Dúo apagado no se lo nombra: «${texto}»`);

  // En TEXTOS, el Dúo vive en sus claves: las de `programa.duo`, la frase «Se
  // suma al Dúo.» y la aclaración del mínimo junto al carrito. Las tres se
  // usan solo cuando el servidor dice que está prendido. Ninguna otra lo nombra.
  const DEL_DUO = ["programa.duo", "programa.dineroMP.seSumaAlDuo", "checkout.minimoAntesDelDuo"];
  const hojas = hojasDeTextos();
  assert.ok(hojas.length > 300, "se recorrió TEXTOS entero");
  const fuera = hojas.filter((h) => NOMBRA_EL_DUO.test(h.texto) && !bajo(h.ruta, DEL_DUO));
  assert.deepEqual(fuera, [], "ningún texto fuera de las claves del Dúo lo nombra");
  // Y esas claves existen y lo nombran (si se mudan, hay que mudar esta lista).
  for (const clave of DEL_DUO) assert.ok(hojas.some((h) => bajo(h.ruta, [clave]) && NOMBRA_EL_DUO.test(h.texto)), clave);

  // Los mails de un pedido: sin el detalle del Dúo en el renglón (apagado, el
  // servidor no lo guarda) dicen el descuento de siempre y no lo nombran;
  // con el detalle, lo mismo que el carrito.
  const renglon = (duo?: ItemResuelto["duo"]): ItemResuelto => ({
    productoId: "rec",
    productoSlug: "amatista",
    nombre: "AMATISTA",
    categoria: "Anteojos",
    varianteId: "recV",
    sku: "AMATISTA-NEGRO",
    color: "Negro",
    foto: null,
    precioLista: 89_900,
    precioUnitario: 78_662.5,
    descuento: 12.5,
    cantidad: 2,
    subtotal: 157_325,
    stockDisponible: 5,
    ...(duo ? { duo } : {}),
  });
  const datos = (items: ItemResuelto[]) =>
    ({
      numero: "HARPER-R18",
      items,
      subtotal: 157_325,
      envio: 0,
      total: 157_325,
      cliente: { email: "c@ejemplo.com", nombre: "Compradora", telefono: "1100000000", dni: "30123456", direccion: "Gorostiaga 1635", ciudad: "Buenos Aires", provincia: "Ciudad Autónoma de Buenos Aires", cp: "1426", aceptaPromos: false },
      config: { whatsapp: "", emailContacto: "hola@harper.ar", emailPedidos: "pedidos@harper.ar", razonSocial: "FOCUS VISION SRL", cuit: "30-71802316-1" },
      sitio: "https://harper.ar",
    }) as unknown as Parameters<typeof mailConfirmacion>[0];
  const sinDetalle = datos([renglon()]);
  for (const mail of [mailConfirmacion(sinDetalle), mailAvisoInterno({ ...sinDetalle, pedidoUrl: "https://airtable.com/x" })]) {
    assert.doesNotMatch(`${mail.asunto} ${mail.texto} ${mail.html}`, NOMBRA_EL_DUO);
  }
  assert.match(mailConfirmacion(sinDetalle).html, /12,5% de descuento/);
  const conDetalle = datos([renglon({ porcentaje: 25, unidades: 1, descuento: 22_475 })]);
  assert.match(mailConfirmacion(conDetalle).html, /Dúo · 25% OFF en 1 de 2/);
  assert.doesNotMatch(mailConfirmacion(conDetalle).html, /12,5%/, "con el Dúo no se dice el porcentaje promedio del renglón");
});

test("Reglas del 18/11: con el Dúo prendido la barra y las preguntas lo anuncian con los datos del servidor, y ni prendido ni apagado se promete lo que terminó", () => {
  const { barra, preguntas } = textosConElDuoPrendido();
  // Prendido: primero en la barra, y con su pregunta.
  assert.equal(barra[0], "Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF");
  assert.ok(preguntas.includes("¿Qué es el Dúo?"));
  assert.ok(preguntas.some((t) => /Dos anteojos: \$ 157\.325 en lugar de \$ 179\.800\./.test(t) && /dos anteojos quedan en \$ 141\.593\./.test(t)));
  // El porcentaje es el que llega, no uno escrito en el texto.
  assert.equal(anunciosDelHeader({ banner: "", cuotas: null, duo: 30 })[0], "Dúo: llevá dos anteojos y el de menor precio tiene 30% OFF");

  // Ni en un estado ni en el otro: envío gratis siempre, «$ X de bienvenida»,
  // «si sos suscriptor», «desbloqueá» ni «10% de vuelta».
  const todos = [...textosConElDuoApagado(), ...barra, ...preguntas];
  for (const texto of todos) {
    for (const [nombre, patron] of PROMESAS_TERMINADAS) assert.doesNotMatch(texto, patron, `«${nombre}» en «${texto}»`);
    // Tampoco el nombre del programa, ni cuotas que nadie tiene.
    assert.doesNotMatch(texto, /Suscriptores Harper|6 cuotas|12 cuotas/i, texto);
  }
  // Las cuotas que se anuncian son las de todos, y el envío es gratis solo desde los mínimos.
  assert.ok(todos.includes("3 cuotas sin interés en anteojos con Visa y Mastercard · CFTEA 0,00 %"));
  assert.ok(todos.some((t) => /Las cuotas y el envío son los mismos para todos, con cuenta o sin cuenta\./.test(t)));
});

test("Reglas del 18/11: con el Crédito Harper prendido, la barra y las preguntas lo anuncian sin revivir lo que terminó (ni cashback de saldo, ni cuotas de suscriptor)", () => {
  // Ale, 18/11/2026: el Crédito Harper reemplaza al cashback de saldo. Sus
  // textos salen con los números del motor y no dicen «saldo» ni «suscriptor».
  const credito = { unAnteojo: 5, varios: 10, dias: 30, meses: 6 };
  const barra = anunciosDelHeader({ banner: "", cuotas: TRES_CUOTAS, duo: 25, credito, envioGratisDesde: 250_000, envioGratisAmbaDesde: 60_000 });
  const preguntas = preguntasDePortada({ ...BASE_PREGUNTAS, duo: DUO_PREGUNTAS, credito }).flatMap((p) => [p.pregunta, p.respuesta, p.enlace?.texto ?? ""]);
  const delCredito = [...barra, ...preguntas].filter((t) => /Cr[eé]dito Harper/.test(t));
  assert.ok(delCredito.length >= 2, "la barra y su pregunta");
  for (const texto of [...barra, ...preguntas]) {
    for (const [nombre, patron] of PROMESAS_TERMINADAS) assert.doesNotMatch(texto, patron, `«${nombre}» en «${texto}»`);
    assert.doesNotMatch(texto, /Suscriptores Harper|6 cuotas|12 cuotas/i, texto);
  }
  for (const texto of delCredito) assert.doesNotMatch(texto, /saldo|suscript|cashback/i, texto);
  // Va después del Dúo y antes del envío gratis.
  assert.deepEqual(barra.slice(0, 2), [
    "Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF",
    "Crédito Harper: 5% de vuelta con un anteojo y 10% con dos o más, para tu próxima compra de anteojos",
  ]);
});

test("Reglas del 18/11: los textos de antes que siguen en TEXTOS (cupón de bienvenida, envío gratis siempre, cuotas de suscriptor) no se usan en ninguna página ni componente", () => {
  // Las claves que quedaron «sin uso» hasta la limpieza (lib/textos.ts). Las
  // promesas terminadas pueden estar solo ahí: en ninguna clave viva.
  const DE_ANTES = [
    "suscriptores.beneficios",
    "suscriptores.tarjetas",
    "suscriptores.anuncio",
    "suscriptores.enlacePortada",
    "suscriptores.cuotasSuscriptor",
    "suscriptores.cuotasBeneficio",
    "suscriptores.comoUsarlos",
    "suscriptores.checkoutCaja.invitacion",
    "suscriptores.checkoutCaja.nota",
    "suscriptores.checkoutCaja.cashback",
    "suscriptores.checkoutCaja.cupon",
    "suscriptores.form.listoCupon",
    "suscriptores.form.listoSinCupon",
    "suscriptores.cuenta.cupon",
    "suscriptores.cuenta.cuponDisponible",
    "suscriptores.cuenta.cuponUsado",
    "suscriptores.cuenta.cuponYaCompro",
  ];
  // El aviso del checkout por un cupón de bienvenida rechazado: el servidor ya
  // no llega a darlo (resolverCarrito no aplica el cupón), pero la ruta todavía
  // lo nombra. No promete nada: explica un rechazo.
  const AVISOS_SIN_ALCANZAR = ["suscriptores.cuponRechazado", "suscriptores.cuponOtroMail"];
  const hojas = hojasDeTextos();
  for (const { ruta, texto } of hojas) {
    for (const [nombre, patron] of PROMESAS_TERMINADAS) {
      // «nuestros mails de bienvenida» es el mail, no el cupón.
      if (nombre === "de bienvenida" && /mails de bienvenida/.test(texto)) continue;
      if (patron.test(texto)) assert.ok(bajo(ruta, [...DE_ANTES, ...AVISOS_SIN_ALCANZAR]), `«${nombre}» en una clave viva de TEXTOS: ${ruta} = «${texto}»`);
    }
  }

  // Ningún archivo de app/ ni de components/ lee esas claves, ni directo ni por un alias de TEXTOS.suscriptores.
  const raiz = path.resolve(__dirname, "..", "..");
  const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const usos: string[] = [];
  let archivos = 0;
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.(ts|tsx)$/.test(entrada.name)) {
        archivos++;
        const codigo = sinComentarios(fs.readFileSync(path.join(raiz, relativo), "utf8"));
        if (!codigo.includes("TEXTOS")) continue;
        // De dónde cuelga cada nombre: «TEXTOS.suscriptores» mismo y sus alias
        // (`const T = TEXTOS.suscriptores.cuenta;`, `const { form: T } = TEXTOS.suscriptores;`).
        const bases: { nombre: string; ruta: string }[] = [{ nombre: "TEXTOS.suscriptores", ruta: "suscriptores" }];
        for (const m of codigo.matchAll(/const\s+(\w+)\s*=\s*TEXTOS\.suscriptores((?:\.\w+)*)\s*;/g)) bases.push({ nombre: m[1], ruta: `suscriptores${m[2]}` });
        for (const m of codigo.matchAll(/const\s*\{([^}]*)\}\s*=\s*TEXTOS\.suscriptores((?:\.\w+)*)\s*;/g)) {
          for (const parte of m[1].split(",").map((p) => p.trim()).filter(Boolean)) {
            const [clave, alias] = parte.split(":").map((p) => p.trim());
            bases.push({ nombre: alias ?? clave, ruta: `suscriptores${m[2]}.${clave}` });
          }
        }
        for (const clave of DE_ANTES) {
          for (const base of bases) {
            const resto = clave === base.ruta ? "" : clave.startsWith(`${base.ruta}.`) ? clave.slice(base.ruta.length) : null;
            if (resto === null) continue;
            // Un alias que ES la clave de antes: cualquier uso. Si no, el camino que falta hasta ella.
            const patron = new RegExp(`(?<![\\w.])${escapar(base.nombre)}${escapar(resto)}(?![\\w])`);
            const declaracion = new RegExp(`const\\s+${escapar(base.nombre)}\\s*=|\\{[^}]*\\b${escapar(base.nombre)}\\b[^}]*\\}\\s*=`);
            const cuerpo = resto === "" ? codigo.replace(declaracion, "") : codigo;
            if (patron.test(cuerpo)) usos.push(`${relativo}: ${clave}`);
          }
        }
      }
    }
  };
  for (const dir of ["app", "components"]) recorrer(dir);
  assert.ok(archivos > 100, "se recorrieron app/ y components/");
  assert.deepEqual([...new Set(usos)], [], "ninguna pantalla muestra un texto de los beneficios que terminaron");
});

test("Reglas del 18/11: las páginas que anuncian el Dúo (barra, tarjetas, portada, preguntas y Términos) toman el dato del interruptor del servidor, y sin el dato no dibujan nada", async () => {
  const raiz = path.resolve(__dirname, "..", "..");
  const leer = (ruta: string) => fs.readFileSync(path.join(raiz, ruta), "utf8");
  // Los comentarios de JSX (`{/* … *\/}`) sin otro cierre adentro: si no, un
  // `{` seguido de un comentario de tipo se come el código hasta el próximo
  // «*\/ }» (pasaba en components/checkout/FormularioCheckout.tsx).
  const sinComentarios = (codigo: string) =>
    codigo
      .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  // La puerta por la que preguntan: null apagado, el porcentaje prendido.
  const { porcentajeDelDuo } = await import("../lib/pedidos");
  assert.equal(await apagado(async () => porcentajeDelDuo()), null);
  assert.equal(await prendido(async () => porcentajeDelDuo()), 25);
  for (const valor of ["0", "", "true", "si"]) assert.equal(await conInterruptor(valor, async () => porcentajeDelDuo()), null, `HARPER_DUO_ACTIVO="${valor}"`);

  // La barra: el layout le pasa a los anuncios lo que diga el servidor.
  const layout = sinComentarios(leer("app/layout.tsx"));
  assert.match(layout, /const duo = porcentajeDelDuo\(\);/);
  assert.match(layout, /anunciosDelHeader\(\{[\s\S]{0,400}?\bduo,/);
  // Las tarjetas: la etiqueta se arma en el servidor, solo con ese porcentaje y solo para anteojos con stock.
  const grilla = sinComentarios(leer("components/GrillaProductos.tsx"));
  assert.match(grilla, /const porcentajeDuo = porcentajeDelDuo\(\);/);
  assert.match(grilla, /const etiquetaDuo = porcentajeDuo === null \? null : TEXTOS\.programa\.duo\.etiqueta\(porcentajeDuo\);/);
  assert.match(grilla, /etiquetaDuo=\{esCategoriaDeAnteojos\(p\.categoria\) && !p\.agotado \? etiquetaDuo : null\}/);
  assert.match(sinComentarios(leer("components/producto/EtiquetaDuo.tsx")), /if \(!texto\) return null;/);
  // La portada y las preguntas: el ayudante contesta null con el Dúo apagado, y las páginas pasan lo que contesta.
  const ayudante = sinComentarios(leer("components/portada/duoDelServidor.ts"));
  assert.match(ayudante, /const porcentaje = porcentajeDelDuo\(\);\s*if \(porcentaje === null\) return null;/);
  assert.match(ayudante, /if \(!duo\) return null;/);
  for (const pagina of ["app/page.tsx", "app/preguntas-frecuentes/page.tsx"]) {
    assert.match(sinComentarios(leer(pagina)), /duo: duoParaLasPreguntas\(/, pagina);
  }
  assert.match(sinComentarios(leer("components/portada/PortadaVitrina.tsx")), /duoParaAnunciar\(todos\)/);

  // Los Términos: la cláusula del Dúo entera adentro de la condición, y fuera de ella ni una mención.
  const terminos = sinComentarios(leer("app/legales/terminos/page.tsx"));
  assert.match(terminos, /const duo = duoActivo\(\) \? PORCENTAJE_DUO : null;/);
  const inicio = terminos.indexOf("{duo !== null ? (");
  const fin = terminos.indexOf(") : null}", inicio);
  assert.ok(inicio > 0 && fin > inicio, "la cláusula del Dúo está condicionada al interruptor");
  const clausula = terminos.slice(inicio, fin);
  assert.match(clausula, /<h2 id="duo"/);
  assert.match(clausula, /\{duo\}% de descuento en los de menor precio/);
  assert.match(clausula, /se suma al Dúo/);
  assert.match(clausula, /El mínimo para el envío gratis se cuenta antes del\s+descuento, con los anteojos a precio de lista/);
  assert.doesNotMatch(terminos.slice(0, inicio) + terminos.slice(fin), /Dúo/, "con el Dúo apagado, los Términos no lo nombran");
  // Y lo demás de los Términos, igual para todos: hasta 3 cuotas, sin sección de beneficios de suscriptor.
  assert.match(terminos, /en hasta \{CUOTAS_TODOS\} cuotas, las\s+mismas para todos los compradores/);
  assert.doesNotMatch(terminos, /cashback|cupón de bienvenida|gratis siempre|6 cuotas|Suscriptores Harper/i);
});

test("Reglas del 18/11: el programa ya no se llama «Suscriptores Harper» delante del comprador: ni en los textos vivos, ni en las pantallas, ni en los mails", () => {
  // En TEXTOS, solo en una clave de antes («exclusivo para suscriptores Harper», sin uso).
  const conElNombre = hojasDeTextos().filter((h) => /suscriptores harper/i.test(h.texto));
  assert.deepEqual(
    conElNombre.filter((h) => !bajo(h.ruta, ["suscriptores.cuotasBeneficio"])),
    [],
    "ningún texto vivo nombra el programa"
  );
  // Lo que se dice ahora.
  assert.equal(TEXTOS.suscriptores.etiqueta, "Cuenta Harper");
  assert.equal(TEXTOS.suscriptores.cuenta.etiquetaCuenta, "Mi Cuenta Harper");
  assert.match(TEXTOS.suscriptores.form.listo.reactivada, /las novedades de Harper/);
  assert.match(TEXTOS.suscriptores.ficha.suscripto, /las novedades de Harper/);

  // En el código de las pantallas y de los textos que arma el servidor (sin los comentarios), tampoco.
  const raiz = path.resolve(__dirname, "..", "..");
  const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const conNombre: string[] = [];
  let archivos = 0;
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.(ts|tsx)$/.test(entrada.name) && relativo !== path.join("lib", "textos.ts")) {
        archivos++;
        if (/suscriptores harper/i.test(sinComentarios(fs.readFileSync(path.join(raiz, relativo), "utf8")))) conNombre.push(relativo);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) recorrer(dir);
  assert.ok(archivos > 200);
  assert.deepEqual(conNombre, [], "ninguna pantalla, ruta ni mail escribe «Suscriptores Harper»");
});

test("Reglas del 18/11: ninguna página ni ruta pide anunciar más cuotas que las de todos", () => {
  // Las funciones que verifican cuotas con Mercado Pago aceptan cuántas pedir
  // (lib/cuotas-servidor.ts) y respetan el tope de NEXT_PUBLIC_CUOTAS, que
  // puede seguir en 6: si alguien les pidiera 6, la tienda anunciaría «6
  // cuotas sin interés» y la preferencia de Mercado Pago ofrecería 3. Por eso
  // quien llama no elige la cantidad: usa la de todos (sin decir nada) o la
  // del comprador (`cuotasDelComprador`, que hoy es la misma).
  const raiz = path.resolve(__dirname, "..", "..");
  const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  /** Los argumentos de una llamada, separados por las comas de afuera. `desde` apunta al «(». */
  const argumentos = (codigo: string, desde: number): string[] => {
    const partes: string[] = [];
    let nivel = 0;
    let actual = "";
    for (let i = desde; i < codigo.length; i++) {
      const c = codigo[i];
      if ("([{".includes(c)) {
        if (nivel++ > 0) actual += c;
      } else if (")]}".includes(c)) {
        if (--nivel === 0) {
          if (actual.trim()) partes.push(actual.trim());
          return partes;
        }
        actual += c;
      } else if (c === "," && nivel === 1) {
        partes.push(actual.trim());
        actual = "";
      } else actual += c;
    }
    return partes;
  };
  // Dónde va la cantidad en cada función: el segundo argumento (o el primero, en `cuotasAnunciables`).
  const FUNCIONES: [RegExp, number][] = [
    [/\bverificarCuotas\(/g, 1],
    [/\bverificarCuotasPara\(/g, 1],
    [/\bdiagnosticarCuotas\(/g, 1],
    [/\bcuotasAnunciables\(/g, 0],
  ];
  const PERMITIDAS = /^(?:CUOTAS_TODOS|cuotasDelComprador\([^()]*\)|cuotasMaximas\([^()]*\))$/;
  const llamadas: string[] = [];
  const fuera: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.(ts|tsx)$/.test(entrada.name)) {
        const codigo = sinComentarios(fs.readFileSync(path.join(raiz, relativo), "utf8"));
        for (const [patron, posicion] of FUNCIONES) {
          for (const m of codigo.matchAll(patron)) {
            const args = argumentos(codigo, m.index + m[0].length - 1);
            llamadas.push(relativo);
            const cantidad = args[posicion];
            if (cantidad !== undefined && !PERMITIDAS.test(cantidad)) fuera.push(`${relativo}: ${m[0]}${args.join(", ")})`);
          }
        }
        // Nadie arma la consulta por su cuenta con varias cantidades.
        if (/\bverificarVarias\(|\bcuotasDeTodosYSuscriptores\(|\bcuotasDelPrecio\(/.test(codigo)) fuera.push(`${relativo}: usa una función de las cuotas de suscriptor`);
        // Ni escribe la cantidad a mano en la preferencia de Mercado Pago.
        for (const m of codigo.matchAll(/\bcuotasMaximas:\s*([^,}\n]+)/g)) {
          if (!/^(?:CUOTAS_TODOS|cuotasDelComprador\([^()]*\))$/.test(m[1].trim())) fuera.push(`${relativo}: cuotasMaximas: ${m[1].trim()}`);
        }
      }
    }
  };
  for (const dir of ["app", "components"]) recorrer(dir);
  assert.ok(llamadas.length >= 8, `se encontraron las llamadas que verifican cuotas (${llamadas.length})`);
  assert.deepEqual(fuera, [], "las cuotas que se anuncian y las de la preferencia son siempre las de todos");
});
