import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aclaracionDelMinimoConDuo,
  cotizacionParaComprador,
  envioEnElCarrito,
  esEnvioGratis,
  faltaParaGratis,
  plazoParaComprador,
  textoEnvioGratis,
  umbralDeZona,
} from "../lib/envio-gratis";

const U = { amba: 60000, nacional: 150000 };
const sinEspacios = (t: string | null) => (t ?? "").replace(/\s/g, " ");

test("AMBA es gratis desde su mínimo; el resto del país, desde el nacional", () => {
  assert.equal(esEnvioGratis(89900, "amba", U), true);
  assert.equal(esEnvioGratis(59999, "amba", U), false);
  assert.equal(esEnvioGratis(60000, "amba", U), true, "desde: el mínimo incluido");
  assert.equal(esEnvioGratis(89900, "resto", U), false);
  assert.equal(esEnvioGratis(150000, "resto", U), true);
  assert.equal(esEnvioGratis(89900, null, U), false, "sin zona, solo el nacional");
  assert.equal(esEnvioGratis(170810, null, U), true);
});

test("sin regla de AMBA (0) vale solo la nacional; sin ninguna, nunca es gratis", () => {
  assert.equal(esEnvioGratis(89900, "amba", { amba: 0, nacional: 150000 }), false);
  assert.equal(esEnvioGratis(1_000_000, "amba", { amba: 0, nacional: 0 }), false);
  assert.equal(umbralDeZona("amba", { amba: 0, nacional: 150000 }), 150000);
  assert.equal(umbralDeZona("amba", { amba: 200000, nacional: 150000 }), 150000, "si el de AMBA es más alto, vale el nacional");
  assert.equal(umbralDeZona("resto", U), 150000);
});

test("cuánto le falta, redondeado hacia arriba", () => {
  assert.equal(faltaParaGratis(8990, "amba", U), 51010);
  assert.equal(faltaParaGratis(89900, "resto", U), 60100);
  assert.equal(faltaParaGratis(89900, "amba", U), 0);
  assert.equal(faltaParaGratis(59999.4, "amba", U), 1);
  assert.equal(faltaParaGratis(1000, "resto", { amba: 0, nacional: 0 }), 0, "sin mínimo no hay nada que sugerir");
});

test("el plazo dicho para el comprador, sin inventar", () => {
  assert.equal(plazoParaComprador("Día siguiente"), "Llega en 24 h hábiles");
  assert.equal(plazoParaComprador("Next day"), "Llega en 24 h hábiles");
  assert.equal(plazoParaComprador("2-7 días"), "Llega en 2 a 7 días hábiles");
  assert.equal(plazoParaComprador("3 días"), "Llega en 3 días hábiles");
  assert.equal(plazoParaComprador("1 día"), "Llega en 1 día hábil");
  assert.equal(plazoParaComprador("Mismo día"), "Llega en el día");
  assert.equal(plazoParaComprador(""), null);
  assert.equal(plazoParaComprador(null), null);
  assert.equal(plazoParaComprador("Consultar"), null);
});

test("el plazo respeta la unidad del transportista: horas son horas, y lo que no se entiende no se promete", () => {
  assert.equal(plazoParaComprador("24-48 hs"), "Llega en 24 a 48 h hábiles");
  assert.equal(plazoParaComprador("48 horas"), "Llega en 48 h hábiles");
  assert.equal(plazoParaComprador("72 hs"), "Llega en 72 h hábiles");
  assert.equal(plazoParaComprador("24 hs"), "Llega en 24 h hábiles");
  assert.equal(plazoParaComprador("3 to 5 days"), "Llega en 3 a 5 días hábiles");
  assert.equal(plazoParaComprador("entre 3 y 6 días"), "Llega en 3 a 6 días hábiles");
  assert.equal(plazoParaComprador("3 a 6 días hábiles"), "Llega en 3 a 6 días hábiles");
  assert.equal(plazoParaComprador("1 día hábil"), "Llega en 1 día hábil");
  assert.equal(plazoParaComprador("Hasta 5 días hábiles"), "Llega en hasta 5 días hábiles");
  assert.equal(plazoParaComprador("Día hábil siguiente"), "Llega en 24 h hábiles");
  assert.equal(plazoParaComprador("Next business day"), "Llega en 24 h hábiles");
  assert.equal(plazoParaComprador("En el día"), "Llega en el día");
  for (const raro of ["2026-11-05", "3 semanas", "2-7", "Entrega estimada", "5"]) {
    assert.equal(plazoParaComprador(raro), null, raro);
  }
});

test("la regla, con los dos mínimos de Config: AMBA y, aparte, el resto del país (Ale, 18/11/2026)", () => {
  assert.match(sinEspacios(textoEnvioGratis(U)), /^Envío gratis en AMBA desde \$ 60\.000\. Al resto del país, gratis desde \$ 150\.000\.$/);
  // Con los mínimos de hoy: un anteojo ya tiene envío gratis en AMBA; al resto del país, desde $ 250.000.
  assert.match(sinEspacios(textoEnvioGratis({ amba: 60000, nacional: 250000 })), /^Envío gratis en AMBA desde \$ 60\.000\. Al resto del país, gratis desde \$ 250\.000\.$/);
  assert.match(sinEspacios(textoEnvioGratis({ amba: 0, nacional: 150000 })), /^Envío a domicilio\. Gratis desde \$ 150\.000\.$/);
  assert.match(sinEspacios(textoEnvioGratis({ amba: 60000, nacional: 0 })), /^Envío gratis en AMBA desde \$ 60\.000\.$/);
  assert.equal(textoEnvioGratis({ amba: 0, nacional: 0 }), "Envío a domicilio.");
  // Si el de AMBA no es más bajo que el del resto del país, hay uno solo y no se nombra AMBA.
  assert.match(sinEspacios(textoEnvioGratis({ amba: 250000, nacional: 250000 })), /^Envío a domicilio\. Gratis desde \$ 250\.000\.$/);
  // Solo importes: nunca «con tantos anteojos», ni «siempre», ni nada por tener cuenta.
  for (const u of [U, { amba: 60000, nacional: 250000 }, { amba: 0, nacional: 150000 }, { amba: 60000, nacional: 0 }, { amba: 0, nacional: 0 }]) {
    assert.doesNotMatch(textoEnvioGratis(u), /anteojos|pares|siempre|suscri|cuenta|Dúo/i);
  }
});

test("con el Dúo aplicado y un mínimo sin alcanzar, la nota aclara que se cuenta antes del Dúo; sin el Dúo, ni se lo nombra (Ale, 18/11/2026)", () => {
  const u = { amba: 60000, nacional: 250000 };
  // Lo que manda el servidor: algún renglón con el detalle del Dúo (solo con el Dúo prendido).
  const conDuo = [{ duo: { porcentaje: 25, unidades: 1, descuento: 22475 } }, {}];
  const sinDuo = [{}, {}];
  const ACLARACION = "El mínimo se cuenta con los anteojos a precio de lista, antes del descuento del Dúo.";
  assert.equal(aclaracionDelMinimoConDuo(conDuo), ACLARACION);
  assert.equal(aclaracionDelMinimoConDuo(sinDuo), null);
  assert.equal(aclaracionDelMinimoConDuo([]), null);

  // Dos anteojos ($ 179.800 de lista): gratis en AMBA, y al resto del país todavía no.
  const dos = envioEnElCarrito(179800, 10100, u, conDuo);
  assert.equal(dos.valor, "Gratis en AMBA");
  assert.equal(sinEspacios(dos.nota), `Al resto del país, gratis desde $ 250.000. ${ACLARACION}`);
  // Sin AMBA: «Te faltan…» se mide sobre la lista ($ 250.000 − $ 179.800), y se aclara por qué.
  const falta = envioEnElCarrito(179800, 10100, { amba: 0, nacional: 250000 }, conDuo);
  assert.equal(sinEspacios(falta.nota), `Te faltan $ 70.200 para el envío gratis. ${ACLARACION}`);
  // Tres anteojos ($ 269.700 de lista, $ 247.225 con el Dúo): gratis, sin nota.
  assert.deepEqual(envioEnElCarrito(269700, 0, u, conDuo), { valor: "Gratis", nota: null, total: "Total" });

  // Con el Dúo apagado el servidor no manda ese detalle: las mismas notas, sin nombrarlo.
  for (const items of [sinDuo, [], undefined]) {
    const nota = envioEnElCarrito(179800, 10100, u, items).nota;
    assert.equal(sinEspacios(nota), "Al resto del país, gratis desde $ 250.000.");
    assert.doesNotMatch(envioEnElCarrito(179800, 10100, { amba: 0, nacional: 250000 }, items).nota ?? "", /Dúo/);
  }
});

test("en el carrito, sin dirección: gratis en AMBA o cuánto falta", () => {
  const unPar = envioEnElCarrito(89900, 10100, U);
  assert.equal(unPar.valor, "Gratis en AMBA");
  assert.match(sinEspacios(unPar.nota), /Al resto del país, gratis desde \$ 150\.000\./);
  assert.equal(unPar.total, "Total sin envío", "como el checkout: todavía no se sabe la dirección");

  const estuche = envioEnElCarrito(8990, 10100, U);
  assert.equal(estuche.valor, "Se calcula en el checkout");
  assert.match(sinEspacios(estuche.nota), /Te faltan \$ 51\.010 para el envío gratis en AMBA\./);
  assert.equal(estuche.total, "Total sin envío");

  const dosPares = envioEnElCarrito(170810, 0, U);
  assert.deepEqual(dosPares, { valor: "Gratis", nota: null, total: "Total" });

  const sinAmba = envioEnElCarrito(89900, 10100, { amba: 0, nacional: 150000 });
  assert.equal(sinAmba.valor, "Se calcula en el checkout");
  assert.match(sinEspacios(sinAmba.nota), /Te faltan \$ 60\.100 para el envío gratis\.$/);
});

test("al navegador le llega el envío sin transportista ni costo real", () => {
  const opcion = {
    id: "rueddo:next_day",
    transportista: "rueddo",
    transportistaNombre: "Rueddo",
    servicio: "next_day",
    servicioNombre: "Día siguiente",
    costo: 5063.2,
    precio: 5064,
    plazo: "Día siguiente",
    comprobante: "a.b.c",
  };
  const base = { opcionesEnvio: [opcion], envioCotizado: true, subtotalSinCupon: 8990 };

  const estuche = cotizacionParaComprador({ ...base, envio: 5064, envioBonificado: false, envioZona: "amba" }, U);
  assert.deepEqual(estuche, {
    opciones: [{ id: "domicilio", precio: 5064, plazo: "Llega en 24 h hábiles", comprobante: "a.b.c" }],
    cotizado: true,
    envio: 5064,
    bonificado: false,
    zona: "amba",
    gratisDesde: 60000,
    falta: 51010,
  });
  assert.ok(!/rueddo|5063/i.test(JSON.stringify(estuche)), "ni el nombre ni el costo real");

  const unPar = cotizacionParaComprador({ ...base, subtotalSinCupon: 89900, envio: 0, envioBonificado: true, envioZona: "amba" }, U);
  assert.equal(unPar.falta, 0);
  assert.equal(unPar.bonificado, true);

  const cordoba = cotizacionParaComprador(
    { ...base, subtotalSinCupon: 89900, envio: 14328, envioBonificado: false, envioZona: "resto", opcionesEnvio: [{ ...opcion, plazo: "2-7 días", precio: 14328 }] },
    U
  );
  assert.equal(cordoba.gratisDesde, 150000);
  assert.equal(cordoba.falta, 60100);
  assert.equal(cordoba.opciones[0].plazo, "Llega en 2 a 7 días hábiles");
});

test("el mail al comprador dice el plazo sin el transportista; el de Harper, con", async () => {
  const { mailAvisoInterno, mailConfirmacion } = await import("../lib/mails");
  const datos = {
    numero: "HARPER-7K2Q",
    items: [],
    subtotal: 89_900,
    envio: 0,
    total: 89_900,
    cliente: {
      email: "comprador@ejemplo.com",
      nombre: "Comprador",
      telefono: "1100000000",
      dni: "30123456",
      direccion: "Gorostiaga 1635",
      ciudad: "Buenos Aires",
      provincia: "Ciudad Autónoma de Buenos Aires",
      cp: "1426",
      aceptaPromos: false,
      aceptaTerminos: true,
    },
    config: { whatsapp: "", emailContacto: "hola@harper.ar", razonSocial: "FOCUS VISION SRL", cuit: "30-71802316-1" },
    sitio: "https://harper.ar",
    envioDetalle: { transportista: "Rueddo", servicio: "rueddo:next_day", plazo: "Día siguiente", costoReal: 5063.2, bonificado: true },
  } as unknown as Parameters<typeof mailConfirmacion>[0];

  const comprador = mailConfirmacion(datos);
  assert.match(comprador.html, /Envío a domicilio · Llega en 24 h hábiles desde el despacho\./);
  assert.match(comprador.texto ?? "", /Llega en 24 h hábiles desde el despacho/);
  assert.doesNotMatch(comprador.html + (comprador.texto ?? ""), /Rueddo|rueddo/);

  const interno = mailAvisoInterno({ ...datos, pedidoUrl: "https://airtable.com/x" });
  assert.match(interno.texto ?? "", /Envío: Rueddo/);
});

test("los montos de Config se leen como pesos: el punto separa los miles", async () => {
  const { aPesos } = await import("../lib/formato");
  assert.equal(aPesos("60000"), 60000);
  assert.equal(aPesos("60.000"), 60000);
  assert.equal(aPesos("$ 60.000"), 60000);
  assert.equal(aPesos("150.000"), 150000);
  assert.equal(aPesos("1.500.000"), 1500000);
  assert.equal(aPesos("60.000,50"), 60000.5);
  assert.equal(aPesos("9900,5"), 9900.5);
  assert.equal(aPesos("60,000"), 60000);
  assert.equal(aPesos("", 7), 7);
  assert.equal(aPesos("nada", 7), 7);
});
