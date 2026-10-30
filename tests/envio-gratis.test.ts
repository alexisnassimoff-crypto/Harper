import { test } from "node:test";
import assert from "node:assert/strict";
import {
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

test("la regla en una frase, según lo que haya en Config", () => {
  assert.match(sinEspacios(textoEnvioGratis(U)), /^Envío gratis en AMBA desde \$ 60\.000 y a todo el país desde \$ 150\.000\.$/);
  assert.match(sinEspacios(textoEnvioGratis({ amba: 0, nacional: 150000 })), /^Envío a domicilio\. Gratis desde \$ 150\.000\.$/);
  assert.match(sinEspacios(textoEnvioGratis({ amba: 60000, nacional: 0 })), /^Envío gratis en AMBA desde \$ 60\.000\.$/);
  assert.equal(textoEnvioGratis({ amba: 0, nacional: 0 }), "Envío a domicilio.");
});

test("en el carrito, sin dirección: gratis en AMBA o cuánto falta", () => {
  const unPar = envioEnElCarrito(89900, 10100, U);
  assert.equal(unPar.valor, "Gratis en AMBA");
  assert.match(sinEspacios(unPar.nota), /Al resto del país, gratis desde \$ 150\.000\./);
  assert.equal(unPar.total, "Total");

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
