import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceWhatsApp, mensajeGraduadosModelo, mensajeGraduadosPedido } from "../lib/whatsapp";
import { enlaceGraduadosDelPedido, mailConfirmacion, type DatosMail } from "../lib/mails";
import type { ItemResuelto } from "../lib/tipos";

const NUMERO = "5491149172061";

test("el enlace de la ficha lleva el modelo y nada más", () => {
  const enlace = enlaceWhatsApp(NUMERO, mensajeGraduadosModelo("AMATISTA"));
  assert.equal(
    enlace,
    "https://wa.me/5491149172061?text=" +
      encodeURIComponent("Hola, Harper. Quiero consultar por cristales graduados para el modelo AMATISTA.")
  );
});

test("el enlace del pedido lleva el número de pedido; sin número, un mensaje general", () => {
  assert.equal(
    mensajeGraduadosPedido("HARPER-7K2Q"),
    "Hola, Harper. Quiero consultar por cristales graduados para mi pedido HARPER-7K2Q."
  );
  assert.equal(mensajeGraduadosPedido(null), "Hola, Harper. Quiero consultar por cristales graduados para mi nuevo Harper.");
});

test("lo que entra al mensaje se limpia: ni símbolos ni texto largo", () => {
  assert.equal(
    mensajeGraduadosModelo("AMATISTA <script>&x=1"),
    "Hola, Harper. Quiero consultar por cristales graduados para el modelo AMATISTA scriptx1."
  );
  assert.ok(mensajeGraduadosPedido("H".repeat(200)).length < 120);
});

test("sin número de WhatsApp válido no hay enlace", () => {
  assert.equal(enlaceWhatsApp("", "hola"), null);
  assert.equal(enlaceWhatsApp("123", "hola"), null);
  assert.equal(enlaceWhatsApp("+54 9 11 4917-2061", "hola")?.startsWith("https://wa.me/5491149172061?text="), true);
});

// ---------- El mail de compra aprobada ----------

function item(slug: string, categoria: ItemResuelto["categoria"]): ItemResuelto {
  return {
    productoId: "rec1",
    productoSlug: slug,
    nombre: slug.toUpperCase(),
    categoria,
    varianteId: "recV",
    sku: `${slug.toUpperCase()}-NEGRO`,
    color: "Negro",
    foto: null,
    precioLista: 89_900,
    precioUnitario: 89_900,
    descuento: 0,
    cantidad: 1,
    subtotal: 89_900,
    stockDisponible: 3,
  };
}

function datos(items: ItemResuelto[], whatsapp = NUMERO): DatosMail {
  return {
    numero: "HARPER-7K2Q",
    items,
    subtotal: 89_900,
    envio: 9_900,
    total: 99_800,
    cliente: {
      email: "ale@harper.ar",
      nombre: "Ale Nassimoff",
      telefono: "1149172061",
      dni: "30123456",
      direccion: "Núñez 2422",
      ciudad: "Buenos Aires",
      provincia: "Ciudad Autónoma de Buenos Aires",
      cp: "1429",
      aceptaPromos: false,
      aceptaTerminos: true,
    },
    config: { whatsapp, emailContacto: "hola@harper.ar", razonSocial: "FOCUS VISION SRL", cuit: "30-71802316-1" } as DatosMail["config"],
    sitio: "https://harper.ar",
  };
}

test("el mail invita a consultar por graduados con el número de pedido, sin datos personales en el enlace", () => {
  const envio = mailConfirmacion(datos([item("citrino", "Anteojos")]));
  assert.match(envio.html, /¿Querés consultar por cristales graduados para tu nuevo Harper\? Escribinos y te asesoramos\./);
  const enlace = enlaceGraduadosDelPedido(datos([item("citrino", "Anteojos")]));
  assert.ok(enlace && envio.html.includes(enlace.replace(/&/g, "&amp;")));
  assert.ok(enlace.includes(encodeURIComponent("HARPER-7K2Q")));
  for (const sensible of ["Nassimoff", "30123456", "ale%40harper.ar", "N%C3%BA%C3%B1ez"]) {
    assert.ok(!enlace.includes(sensible), `el enlace no debería llevar ${sensible}`);
  }
  assert.match(envio.texto ?? "", /WhatsApp: https:\/\/wa\.me\//);
});

test("un pedido solo de estuches o sin WhatsApp configurado no lleva la invitación", () => {
  assert.doesNotMatch(mailConfirmacion(datos([item("r100", "Estuches")])).html, /cristales graduados/);
  assert.doesNotMatch(mailConfirmacion(datos([item("citrino", "Anteojos")], "")).html, /cristales graduados/);
  // Un anteojo no confirmado (por ejemplo, uno de sol futuro) tampoco.
  assert.doesNotMatch(mailConfirmacion(datos([item("sol-uno", "Anteojos de sol")])).html, /cristales graduados/);
});
