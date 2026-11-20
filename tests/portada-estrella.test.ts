import { test } from "node:test";
import assert from "node:assert/strict";

import { anunciosDelHeader } from "../lib/anuncios";
import { precio } from "../lib/formato";
import { CARACTERISTICAS_ANTEOJOS } from "../lib/caracteristicas";
import { garantiasDePortada, pasosDeCompra, preguntasDePortada } from "../lib/portada";
import { modoDePortada } from "../lib/vitrina";

// Ale, 18/11/2026: las cuotas son hasta 3 para todos (nadie tiene 6) y ya no
// hay cupón de primera compra ni datos de suscriptor que pasarle a los textos.
const BASE = {
  incluye: [],
  caracteristicas: CARACTERISTICAS_ANTEOJOS,
  cuotas: { cuotas: 3, cftea: "0,00 %" },
  nombreMarcas: "Visa y Mastercard",
  envioGratisDesde: 150000,
  envioGratisTexto: "$ 150.000",
  hayWhatsapp: true,
  diasArrepentimiento: 10,
  diasCambio: 30,
  mesesGarantia: 6,
  porcentajeDineroMP: 10,
};

/** Lo que el servidor le pasa a las preguntas con el Dúo prendido (components/portada/duoDelServidor.ts). */
const DUO = { porcentaje: 25, dos: { total: "$ 157.325", lista: "$ 179.800", totalDineroMP: "$ 141.593" } };
const MINIMO = "El mínimo se cuenta con los anteojos a precio de lista.";
const TRES = { cuotas: 3, montoCuota: 29966.67, cftea: "0,00 %" };
/** Lo que ya no se le promete a nadie: ni en la barra ni en las preguntas, con el Dúo prendido o apagado. */
const TERMINADO = /envío gratis siempre|gratis siempre|de bienvenida|si sos suscriptor|desbloque|10\s?% de vuelta|de vuelta como saldo|Suscriptores Harper|suscriptor|HARPER10|primera compra|6 cuotas/i;
/** Los datos de antes (suscriptores, cuotas de suscriptor, cupón), como los mandaría una página sin actualizar. */
const DE_ANTES = { suscriptores: true, cuotasSuscriptor: { cuotas: 6, montoCuota: 14983.33, cftea: "0,00 %" }, cupon: { codigo: "HARPER10", porcentaje: 10 } } as object;

test("el modelo de la portada sale de Config, con el Citrino por defecto", () => {
  assert.deepEqual(modoDePortada(""), { tipo: "vitrina" });
  assert.deepEqual(modoDePortada(" Cuarzo "), { tipo: "estrella", slug: "cuarzo" });
  assert.deepEqual(modoDePortada("ninguno"), { tipo: "catalogo" });
});

test("las preguntas dicen solo lo confirmado: las cuotas de todos, el mínimo del envío a precio de lista y ningún cupón de primera compra (Ale, 18/11/2026)", () => {
  const preguntas = preguntasDePortada(BASE);
  const texto = (inicio: string) => preguntas.find((p) => p.pregunta.startsWith(inicio))?.respuesta ?? "";

  assert.ok(!preguntas.some((p) => /estuche|paño/i.test(p.respuesta)), "sin Incluye cargado no se nombra la caja");
  assert.equal(
    texto("¿Qué trae"),
    "Filtro de luz azul, cristales fotocromáticos que se adaptan a la luz solar, protección UV400 contra los rayos UVA y UVB y armazón apto para colocar cristales con aumento."
  );
  assert.match(texto("¿Les puedo poner"), /los cristales oftálmicos te los ponemos nosotros: consultanos por WhatsApp con tu receta/);
  // Las cuotas que Mercado Pago confirmó, que son de cualquier comprador.
  assert.match(texto("¿Cómo puedo pagar"), /En anteojos tenés 3 cuotas sin interés con Visa y Mastercard \(CFTEA 0,00 %\); el valor de cada cuota está junto al precio\. Son las mismas para todos: no hace falta tener cuenta\./);
  // El 10 % es por pagar con el dinero de la cuenta, en un pago, y nunca sobre el envío.
  assert.match(texto("¿Cómo puedo pagar"), /«Dinero en Mercado Pago» y pagás con el dinero de tu cuenta, en un pago, tenés 10% OFF extra\. No se aplica al envío\.$/);
  // El envío: gratis solo desde el mínimo de Config, que se cuenta a precio de lista.
  assert.equal(
    texto("¿Cuánto cuesta el envío"),
    `Envío gratis desde $ 150.000. ${MINIMO} Si tu compra no llega al mínimo, el costo aparece en el checkout antes de pagar. Despachamos de lunes a viernes.`
  );
  assert.match(texto("¿Puedo cambiarlos"), /10 días .* 30 días .* 6 meses de garantía/);
  // Sin el Dúo, sin escala y sin pedir la de la cuenta: no hay más preguntas que esas.
  assert.deepEqual(
    preguntas.map((p) => p.pregunta),
    ["¿Qué trae cada par?", "¿Les puedo poner cristales con aumento?", "¿Cómo puedo pagar?", "¿Cuánto cuesta el envío?", "¿Puedo cambiarlos o devolverlos?"]
  );
  // El cupón de primera compra (HARPER10) no se pregunta más, ni mandando el dato de antes.
  const conDatosDeAntes = preguntasDePortada({ ...BASE, ...DE_ANTES });
  assert.deepEqual(conDatosDeAntes, preguntas);
  assert.ok(!preguntas.some((p) => TERMINADO.test(`${p.pregunta} ${p.respuesta}`)));

  // Solo si Airtable tuviera una escala de anteojos (hoy, ninguna), se explica.
  const conEscala = preguntasDePortada({ ...BASE, escala: "llevá 3 y pagá 2, o llevá 5 y pagá 3" });
  const escala = conEscala.find((p) => p.pregunta === "¿Hay descuento por llevar más de un par?")?.respuesta ?? "";
  assert.match(escala, /^Sí: llevá 3 y pagá 2, o llevá 5 y pagá 3\. Podés mezclar modelos y colores/);
  assert.ok(!conEscala.some((p) => /HARPER10/.test(p.respuesta)));

  // Sin cuotas confirmadas ni características ni WhatsApp: no se afirma nada de eso.
  const sinNada = preguntasDePortada({ ...BASE, cuotas: null, caracteristicas: null, incluye: ["Estuche rígido", "Paño de microfibra"] });
  assert.ok(!sinNada.some((p) => /cuotas/.test(p.respuesta)));
  assert.ok(!sinNada.some((p) => /aumento|filtro/i.test(p.respuesta)));
  assert.equal(sinNada[0].respuesta, "Cada par incluye estuche rígido y paño de microfibra.");
  // Sin ningún mínimo cargado, no se promete envío gratis ni se aclara nada.
  const sinMinimo = preguntasDePortada({ ...BASE, envioGratisDesde: 0, envioGratisTexto: "" });
  assert.equal(sinMinimo.find((p) => p.pregunta === "¿Cuánto cuesta el envío?")?.respuesta, "El costo aparece en el checkout antes de pagar. Despachamos de lunes a viernes.");

  for (const p of preguntas) {
    assert.ok(!/\d+\s*(a|-)\s*\d+\s*días hábiles/i.test(p.respuesta), "sin plazos de entrega");
    assert.ok(!/certific|ISO|norma/i.test(p.respuesta), "sin certificaciones");
  }
});

test("el Dúo en las preguntas: solo con el dato del servidor, con sus importes; apagado, ninguna respuesta lo nombra (Ale, 18/11/2026)", () => {
  // Apagado (sin el dato, o null): ni la pregunta ni una mención.
  for (const duo of [undefined, null]) {
    const apagado = preguntasDePortada({ ...BASE, duo, cuenta: true, escala: "llevá 3 y pagá 2", envioGratisAmbaTexto: "$ 60.000" });
    assert.ok(!apagado.some((p) => /d[uú]o/i.test(`${p.pregunta} ${p.respuesta} ${p.enlace?.texto ?? ""} ${p.enlace?.href ?? ""}`)), "apagado, no se nombra");
  }

  const prendido = preguntasDePortada({ ...BASE, envioGratisDesde: 250000, envioGratisTexto: "$ 250.000", envioGratisAmbaTexto: "$ 60.000", duo: DUO, cuenta: true });
  const que = prendido.find((p) => p.pregunta === "¿Qué es el Dúo?");
  // El porcentaje y los importes son los que mandó el servidor: 2 anteojos de
  // $ 89.900 quedan en $ 157.325 y, con dinero en Mercado Pago, en $ 141.593.
  assert.equal(
    que?.respuesta,
    "Si llevás dos anteojos, el de menor precio tiene 25% OFF. Dos anteojos: $ 157.325 en lugar de $ 179.800. Con más anteojos, el descuento va en uno de cada dos, siempre en los de menor precio. Podés combinar modelos y colores. El descuento se aplica automáticamente en el carrito. El 10% OFF extra por pagar con dinero en Mercado Pago se suma al Dúo: dos anteojos quedan en $ 141.593. Para el envío gratis, el mínimo se cuenta con los anteojos a precio de lista."
  );
  assert.deepEqual(que?.enlace, { href: "/legales/terminos#duo", texto: "Ver las condiciones del Dúo" });
  // Nunca «antes $ …»: el precio de lista de dos no es un precio que haya existido.
  assert.ok(!prendido.some((p) => /\bantes \$/.test(p.respuesta)));
  assert.match(prendido.find((p) => p.pregunta === "¿Cómo puedo pagar?")?.respuesta ?? "", /No se aplica al envío\. Se suma al Dúo\.$/);
  // Si el servidor no pudo armar el carrito de dos, se anuncia sin importes (ninguno inventado).
  const sinImportes = preguntasDePortada({ ...BASE, duo: { porcentaje: 25, dos: null } }).find((p) => p.pregunta === "¿Qué es el Dúo?")?.respuesta ?? "";
  assert.match(sinImportes, /^Si llevás dos anteojos, el de menor precio tiene 25% OFF\. Con más anteojos/);
  assert.match(sinImportes, /se suma al Dúo\. Para el envío gratis/);
  assert.doesNotMatch(sinImportes, /\$/);
  // Ni prendido se promete lo que terminó.
  assert.ok(!prendido.some((p) => TERMINADO.test(`${p.pregunta} ${p.respuesta}`)));
});

test("los pasos de compra no prometen plazos y nombran las cuotas solo si están confirmadas", () => {
  const con = pasosDeCompra({ cuotas: { cuotas: 3, cftea: "0,00 %" }, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, envioGratisDesde: 150000, envioGratisTexto: "$ 150.000", diasCambio: 30 });
  const sin = pasosDeCompra({ cuotas: null, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, envioGratisDesde: 0, envioGratisTexto: "", diasCambio: 30 });
  assert.equal(con.length, 4);
  assert.match(con[1].texto, /3 cuotas sin interés con Visa y Mastercard \(CFTEA 0,00 %\)/);
  assert.ok(!/cuotas/.test(sin[1].texto));
  assert.ok(!/gratis/.test(sin[2].texto));
});

test("la barra de anuncios (Ale, 18/11/2026): el Dúo solo prendido, el envío con los mínimos de Config, las cuotas confirmadas, el 10 % y el banner al final", () => {
  const ENVIO = `Envío gratis en AMBA desde ${precio(60000)} · Al resto del país, gratis desde ${precio(250000)}`;
  const CUOTAS = "3 cuotas sin interés en anteojos con Visa y Mastercard · CFTEA 0,00 %";
  const DINERO_MP = "10% OFF extra pagando con dinero en Mercado Pago";
  const minimos = { envioGratisDesde: 250000, envioGratisAmbaDesde: 60000 };

  // Con el Dúo prendido (llega el porcentaje del servidor), va primero.
  assert.deepEqual(anunciosDelHeader({ banner: "Nuevo color: Citrino verde", cuotas: TRES, duo: 25, ...minimos }), [
    "Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF",
    ENVIO,
    CUOTAS,
    DINERO_MP,
    "Nuevo color: Citrino verde",
  ]);
  // Apagado (null, 0 o sin el dato), la barra no lo nombra.
  for (const duo of [null, 0, undefined]) {
    const apagado = anunciosDelHeader({ banner: "Nuevo color: Citrino verde", cuotas: TRES, duo, ...minimos });
    assert.deepEqual(apagado, [ENVIO, CUOTAS, DINERO_MP, "Nuevo color: Citrino verde"]);
    assert.ok(!apagado.some((a) => /d[uú]o/i.test(a)));
  }

  // El envío gratis lo arma el código con los mínimos de Config.
  assert.deepEqual(anunciosDelHeader({ banner: "", cuotas: null, envioGratisDesde: 250000 }), [`Envío gratis desde ${precio(250000)}`, DINERO_MP]);
  assert.deepEqual(anunciosDelHeader({ banner: "", cuotas: null, envioGratisAmbaDesde: 60000 }), [`Envío gratis en AMBA desde ${precio(60000)}`, DINERO_MP]);
  // Si el de AMBA no es más bajo que el del resto del país, hay uno solo.
  assert.deepEqual(anunciosDelHeader({ banner: "", cuotas: null, envioGratisDesde: 250000, envioGratisAmbaDesde: 250000 }), [`Envío gratis desde ${precio(250000)}`, DINERO_MP]);
  // Sin ningún mínimo, no se promete envío gratis; sin cuotas confirmadas, no se nombran.
  assert.deepEqual(anunciosDelHeader({ banner: " ", cuotas: null }), [DINERO_MP]);

  // Un `banner_texto` que habla del envío gratis (el de antes, escrito a mano)
  // no sale: prometería un monto que el servidor no respeta.
  for (const banner of ["Envío gratis en compras superiores a $150.000", "Envio gratis en compras superiores a $80.000", "ENVÍO GRATIS", "Envíos sin cargo a todo el país", "Envío bonificado esta semana"]) {
    assert.deepEqual(anunciosDelHeader({ banner, cuotas: TRES, ...minimos }), [ENVIO, CUOTAS, DINERO_MP], banner);
  }
  // Uno que nombra el envío sin prometerlo gratis, sí.
  assert.equal(anunciosDelHeader({ banner: "Despachamos envíos de lunes a viernes", cuotas: null }).at(-1), "Despachamos envíos de lunes a viernes");

  // Con una escala de anteojos en Airtable (hoy, ninguna), va después del Dúo y antes del envío.
  const escala = [
    { categoria: "Anteojos" as const, desdeUnidades: 3, porcentaje: 100 / 3, paga: 2 },
    { categoria: "Anteojos" as const, desdeUnidades: 5, porcentaje: 40, paga: 3 },
  ];
  assert.deepEqual(anunciosDelHeader({ banner: "Envío gratis", cuotas: null, escala, duo: 25, ...minimos }), [
    "Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF",
    "Llevá 3, pagá 2 · Llevá 5, pagá 3 en anteojos",
    ENVIO,
    DINERO_MP,
  ]);
  // El encabezado usa el texto como clave de cada mensaje: sin repetidos.
  assert.deepEqual(anunciosDelHeader({ banner: DINERO_MP, cuotas: null }), [DINERO_MP]);
});

test("la barra ya no invita a suscribirse ni nombra cuotas de suscriptor: las cuotas son las de todos, solo si Mercado Pago las confirmó (Ale, 18/11/2026)", () => {
  // Las cuotas confirmadas, sin «6 si sos suscriptor».
  const conCuotas = anunciosDelHeader({ banner: "", cuotas: TRES });
  assert.equal(conCuotas[0], "3 cuotas sin interés en anteojos con Visa y Mastercard · CFTEA 0,00 %");
  // Sin ninguna confirmada, no se nombran cuotas.
  assert.ok(!anunciosDelHeader({ banner: "", cuotas: null }).some((a) => /cuotas/.test(a)));
  // Aunque una página sin actualizar mandara los datos de antes, la barra es la misma:
  // ni «Suscribite gratis y desbloqueá $ 10.000 de bienvenida y envío gratis siempre», ni las 6.
  for (const duo of [null, 25]) {
    const datos = { banner: "Nuevo color", cuotas: TRES, duo, envioGratisDesde: 250000, envioGratisAmbaDesde: 60000 };
    const barra = anunciosDelHeader(datos);
    assert.deepEqual(anunciosDelHeader({ ...datos, ...DE_ANTES }), barra);
    assert.ok(!barra.some((a) => TERMINADO.test(a)), barra.join(" | "));
  }
});

test("la pregunta de la cuenta Harper: las novedades y la cuenta, sin cupón, saldo, envío gratis ni cuotas propias (Ale, 18/11/2026)", () => {
  const preguntas = preguntasDePortada({ ...BASE, cuenta: true });
  assert.ok(!preguntas.some((p) => p.pregunta === "¿Qué es Suscriptores Harper?"), "el programa ya no se nombra");
  const que = preguntas.find((p) => p.pregunta === "¿Para qué sirve la cuenta Harper?");
  assert.equal(
    que?.respuesta,
    "Es gratis. Dejás tu mail y te avisamos cuando salen modelos y colores nuevos. Con ese mismo mail entrás a tu cuenta, donde seguís tus compras y guardás tus favoritos, tus datos y tus direcciones. Las cuotas y el envío son los mismos para todos, con cuenta o sin cuenta. Si te das de baja, dejás de recibir nuestros mails de novedades. Tu cuenta sigue igual, y los mails de tus pedidos te siguen llegando."
  );
  assert.deepEqual(que?.enlace, { href: "/suscriptores", texto: "Conocer la cuenta Harper" });
  // Ni un peso prometido por tener cuenta.
  assert.doesNotMatch(que?.respuesta ?? "", /\$|%|descuento|cupón|saldo|gratis siempre|beneficio/i);
  // El envío es el de cualquiera: ya no «Si sos suscriptor, es gratis siempre.».
  assert.doesNotMatch(preguntas.find((p) => p.pregunta === "¿Cuánto cuesta el envío?")?.respuesta ?? "", /suscriptor|siempre/i);
  assert.ok(!preguntas.some((p) => TERMINADO.test(`${p.pregunta} ${p.respuesta}`)));
  // Solo donde se pide (/preguntas-frecuentes): la portada no la muestra.
  assert.ok(!preguntasDePortada(BASE).some((p) => /cuenta Harper/.test(p.pregunta)));
  // Los datos de antes (`suscriptores`, `cuotasSuscriptor`) ya no prenden nada.
  assert.deepEqual(preguntasDePortada({ ...BASE, ...DE_ANTES }), preguntasDePortada(BASE));
});

test("con envío gratis en AMBA, la portada dice los dos mínimos (AMBA y resto del país) y que se cuentan a precio de lista, y «Comprá seguro» (Ale, 18/11/2026)", () => {
  const conAmba = { envioGratisDesde: 250000, envioGratisTexto: "$ 250.000", envioGratisAmbaTexto: "$ 60.000" };
  const envio = preguntasDePortada({ ...BASE, ...conAmba }).find((p) => p.pregunta === "¿Cuánto cuesta el envío?");
  assert.equal(
    envio?.respuesta,
    `Envío gratis en AMBA desde $ 60.000. Al resto del país, gratis desde $ 250.000. ${MINIMO} Si tu compra no llega al mínimo, el costo aparece en el checkout apenas ponés tu dirección, antes de pagar. Despachamos de lunes a viernes.`
  );
  assert.ok(!/rueddo|correo|andreani/i.test(envio?.respuesta ?? ""), "sin nombrar con quién despachamos");
  // Solo con el de AMBA: el resto del país paga el envío, y se dice.
  const soloAmba = preguntasDePortada({ ...BASE, envioGratisDesde: 0, envioGratisTexto: "", envioGratisAmbaTexto: "$ 60.000" }).find((p) => p.pregunta === "¿Cuánto cuesta el envío?");
  assert.equal(
    soloAmba?.respuesta,
    `Envío gratis en AMBA desde $ 60.000. ${MINIMO} Al resto del país, el costo aparece en el checkout apenas ponés tu dirección, antes de pagar. Despachamos de lunes a viernes.`
  );

  const pasos = pasosDeCompra({ cuotas: null, nombreMarcas: "Visa y Mastercard", porcentajeDineroMP: 10, diasCambio: 30, ...conAmba });
  assert.equal(pasos[2].texto, "Preparamos tu pedido de lunes a viernes. Envío gratis en AMBA desde $ 60.000. Al resto del país, gratis desde $ 250.000.");

  const garantias = garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, ...conAmba });
  assert.equal(garantias[0].titulo, "Comprá seguro");
  assert.equal(garantias[2].titulo, "Envío gratis en AMBA desde $ 60.000");
  assert.equal(garantias[2].texto, `Al resto del país, gratis desde $ 250.000. ${MINIMO} Despachamos de lunes a viernes.`);

  const sinAmba = garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, envioGratisDesde: 250000, envioGratisTexto: "$ 250.000" });
  assert.equal(sinAmba[2].titulo, "Envío gratis desde $ 250.000");
  assert.equal(sinAmba[2].texto, `${MINIMO} Despachamos de lunes a viernes.`);
  // Sin ningún mínimo, solo que se despacha.
  const sinMinimo = garantiasDePortada({ diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6, envioGratisDesde: 0, envioGratisTexto: "" });
  assert.deepEqual([sinMinimo[2].titulo, sinMinimo[2].texto], ["Envío a domicilio", "Despachamos de lunes a viernes."]);
});
