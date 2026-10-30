import { test } from "node:test";
import assert from "node:assert/strict";

import { anunciosDelHeader } from "../lib/anuncios";
import { CARACTERISTICAS_ANTEOJOS } from "../lib/caracteristicas";
import { garantiasDePortada, pasosDeCompra, preguntasDePortada } from "../lib/portada";
import { modoDePortada } from "../lib/vitrina";

const BASE = {
  incluye: [],
  caracteristicas: CARACTERISTICAS_ANTEOJOS,
  cuotas: { cuotas: 6, cftea: "0,00 %" },
  nombreMarcas: "Visa y Mastercard",
  envioGratisDesde: 150000,
  envioGratisTexto: "$ 150.000",
  hayWhatsapp: true,
  diasArrepentimiento: 10,
  diasCambio: 30,
  mesesGarantia: 6,
  cupon: { codigo: "HARPER10", porcentaje: 10 },
  porcentajeDineroMP: 10,
};

test("el modelo de la portada sale de Config, con el Citrino por defecto", () => {
  assert.deepEqual(modoDePortada(""), { tipo: "vitrina" });
  assert.deepEqual(modoDePortada(" Cuarzo "), { tipo: "estrella", slug: "cuarzo" });
  assert.deepEqual(modoDePortada("ninguno"), { tipo: "catalogo" });
});

test("las preguntas dicen solo lo confirmado", () => {
  const preguntas = preguntasDePortada(BASE);
  const texto = (inicio: string) => preguntas.find((p) => p.pregunta.startsWith(inicio))?.respuesta ?? "";

  assert.ok(!preguntas.some((p) => p.pregunta.includes("incluye")), "sin Incluye cargado no se pregunta");
  assert.equal(
    texto("¿Qué tienen"),
    "Filtro de luz azul, cristales fotocromáticos que se adaptan a la luz solar, protección UV400 contra los rayos UVA y UVB y armazón apto para colocar cristales con aumento."
  );
  assert.match(texto("¿Les puedo poner"), /los cristales oftálmicos te los ponemos nosotros: consultanos por WhatsApp con tu receta/);
  assert.match(texto("¿Cómo puedo pagar"), /6 cuotas sin interés con Visa y Mastercard \(CFTEA 0,00 %\)/);
  assert.match(texto("¿Cuánto cuesta el envío"), /gratis en compras desde \$ 150\.000.*lunes a viernes/);
  assert.match(texto("¿Puedo cambiarlos"), /10 días .* 30 días .* 6 meses de garantía/);
  assert.match(texto("¿Hay descuento"), /HARPER10 .* 10% OFF/);

  // Sin cupón (desde el 30/10/2026), la pregunta es por la escala.
  const conEscala = preguntasDePortada({ ...BASE, cupon: null, escala: "llevá 3 y pagá 2, o llevá 5 y pagá 3" });
  const escala = conEscala.find((p) => p.pregunta === "¿Hay descuento por llevar más de un par?")?.respuesta ?? "";
  assert.match(escala, /^Sí: llevá 3 y pagá 2, o llevá 5 y pagá 3\. Podés mezclar modelos y colores/);
  assert.ok(!conEscala.some((p) => /HARPER10/.test(p.respuesta)));

  // Sin cuotas confirmadas ni características ni WhatsApp: no se afirma nada de eso.
  const sinNada = preguntasDePortada({ ...BASE, cuotas: null, caracteristicas: null, incluye: ["Estuche rígido", "Paño de microfibra"] });
  assert.ok(!sinNada.some((p) => /cuotas/.test(p.respuesta)));
  assert.ok(!sinNada.some((p) => /aumento|filtro/i.test(p.respuesta)));
  assert.equal(sinNada[0].respuesta, "Cada par incluye estuche rígido y paño de microfibra.");

  for (const p of preguntas) {
    assert.ok(!/\d+\s*(a|-)\s*\d+\s*días hábiles/i.test(p.respuesta), "sin plazos de entrega");
    assert.ok(!/certific|ISO|norma/i.test(p.respuesta), "sin certificaciones");
  }
});

test("los pasos de compra no prometen plazos y nombran las cuotas solo si están confirmadas", () => {
  const con = pasosDeCompra({ cuotas: { cuotas: 6, cftea: "0,00 %" }, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, envioGratisDesde: 150000, envioGratisTexto: "$ 150.000", diasCambio: 30 });
  const sin = pasosDeCompra({ cuotas: null, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, envioGratisDesde: 0, envioGratisTexto: "", diasCambio: 30 });
  assert.equal(con.length, 4);
  assert.match(con[1].texto, /6 cuotas sin interés con Visa y Mastercard \(CFTEA 0,00 %\)/);
  assert.ok(!/cuotas/.test(sin[1].texto));
  assert.ok(!/gratis/.test(sin[2].texto));
});

test("la barra de anuncios: el banner de Config primero, las cuotas solo si están confirmadas", () => {
  assert.deepEqual(anunciosDelHeader({ banner: "Envío gratis en compras superiores a $150.000", cuotas: { cuotas: 6, montoCuota: 14983.33, cftea: "0,00 %" } }), [
    "Envío gratis en compras superiores a $150.000",
    "6 cuotas sin interés en anteojos con Visa y Mastercard · CFTEA 0,00 %",
    "10% OFF extra pagando con dinero en Mercado Pago",
  ]);
  assert.deepEqual(anunciosDelHeader({ banner: " ", cuotas: null }), ["10% OFF extra pagando con dinero en Mercado Pago"]);
  // Con la escala de anteojos, va segunda; HARPER10 ya no se anuncia.
  const escala = [
    { categoria: "Anteojos" as const, desdeUnidades: 3, porcentaje: 100 / 3, paga: 2 },
    { categoria: "Anteojos" as const, desdeUnidades: 5, porcentaje: 40, paga: 3 },
  ];
  assert.deepEqual(anunciosDelHeader({ banner: "Envío gratis", cuotas: null, escala }), [
    "Envío gratis",
    "Llevá 3, pagá 2 · Llevá 5, pagá 3 en anteojos",
    "10% OFF extra pagando con dinero en Mercado Pago",
  ]);
});

test("con envío gratis en AMBA, la portada lo dice junto al de todo el país, y «Comprá seguro»", () => {
  const conAmba = { envioGratisDesde: 150000, envioGratisTexto: "$ 150.000", envioGratisAmbaTexto: "$ 60.000" };
  const envio = preguntasDePortada({ ...BASE, ...conAmba }).find((p) => p.pregunta === "¿Cuánto cuesta el envío?");
  assert.match(envio?.respuesta ?? "", /^Es gratis en AMBA en compras desde \$ 60\.000 y en todo el país desde \$ 150\.000\./);
  assert.ok(!/rueddo|correo|andreani/i.test(envio?.respuesta ?? ""), "sin nombrar con quién despachamos");

  const pasos = pasosDeCompra({ cuotas: null, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, diasCambio: 30, ...conAmba });
  assert.equal(pasos[2].texto, "Preparamos tu pedido de lunes a viernes. Envío gratis en AMBA desde $ 60.000 y en todo el país desde $ 150.000.");

  const garantias = garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, ...conAmba });
  assert.equal(garantias[0].titulo, "Comprá seguro");
  assert.equal(garantias[2].titulo, "Envío gratis en AMBA desde $ 60.000");
  assert.equal(garantias[2].texto, "En todo el país, gratis desde $ 150.000. Despachamos de lunes a viernes.");

  const sinAmba = garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, envioGratisDesde: 150000, envioGratisTexto: "$ 150.000" });
  assert.equal(sinAmba[2].titulo, "Envío gratis desde $ 150.000");
});
