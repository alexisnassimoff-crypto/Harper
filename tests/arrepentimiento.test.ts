import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fechaDeRecepcion,
  generarCodigo,
  normalizarSolicitud,
  pedidoParaMostrar,
  validarSolicitud,
} from "../lib/arrepentimiento";
import { registrarArrepentimiento } from "../lib/arrepentimiento-servidor";
import type { ConfigTienda } from "../lib/config";

const config = {
  razonSocial: "FOCUS VISION SRL",
  cuit: "30-71802316-1",
  emailContacto: "contacto@harper.test",
  emailPedidos: "pedidos@harper.test",
} as ConfigTienda;

const AZAR = new Uint8Array([0, 1, 2, 3, 4]);
// Sábado 25 de octubre de 2026, 2:30 en Argentina (UTC-3): un fin de semana, de madrugada.
const SABADO = new Date("2026-10-25T05:30:00Z");

const solicitud = normalizarSolicitud({
  nombre: "  Ana   Pérez ",
  email: "Ana@Ejemplo.com ",
  pedido: "harper-314756b",
  producto: "",
  motivo: "Visitá https://spam.example y ganá",
});

test("normaliza: recorta, pasa a una línea, email en minúsculas y pedido en mayúsculas", () => {
  assert.deepEqual(solicitud, {
    nombre: "Ana Pérez",
    email: "ana@ejemplo.com",
    pedido: "HARPER-314756B",
    producto: "",
    motivo: "Visitá https://spam.example y ganá",
  });
  assert.deepEqual(normalizarSolicitud(null), { nombre: "", email: "", pedido: "", producto: "", motivo: "" });
  assert.equal(normalizarSolicitud({ nombre: "Ana\r\nBcc: x@y.z" }).nombre, "Ana Bcc: x@y.z");
});

test("valida lo mínimo: nombre y un email; lo demás es opcional pero con tope", () => {
  assert.deepEqual(validarSolicitud(solicitud), {});
  const errores = validarSolicitud(normalizarSolicitud({ nombre: "A", email: "no-es-mail", motivo: "x".repeat(1001) }));
  assert.ok(errores.nombre && errores.email && errores.motivo);
});

test("en el mail al comprador solo va un número de pedido con forma de número de pedido", () => {
  assert.equal(pedidoParaMostrar("HARPER-314756B"), "HARPER-314756B");
  assert.equal(pedidoParaMostrar(""), null);
  assert.equal(pedidoParaMostrar("VISITÁ HTTPS://SPAM"), null);
});

test("el código lleva la fecha de Argentina y no usa caracteres que se confunden", () => {
  const codigo = generarCodigo(SABADO, AZAR);
  assert.equal(codigo, "ARR-20261025-23456");
  // 1:00 UTC del 26 todavía es 25 en Argentina.
  assert.match(generarCodigo(new Date("2026-10-26T01:00:00Z"), AZAR), /^ARR-20261025-/);
  assert.match(generarCodigo(SABADO, new Uint8Array([255, 254, 253, 31, 30])), /^ARR-20261025-[2-9A-HJKMNP-Z]{5}$/);
});

test("la fecha de recepción se escribe en hora de Argentina", () => {
  assert.equal(fechaDeRecepcion(SABADO), "25 de octubre de 2026, 02:30 (hora de Argentina)");
});

type Envio = { para: string; asunto: string; html: string; texto: string; responderA?: string };

function enviador(falla: (envio: Envio, intento: number) => boolean = () => false) {
  const enviados: Envio[] = [];
  let intento = 0;
  return {
    enviados,
    enviar: async (envio: Envio) => {
      intento++;
      if (falla(envio, intento)) return false;
      enviados.push(envio);
      return true;
    },
  };
}

test("un sábado de madrugada: aviso a Harper y código al comprador en el momento", async () => {
  const { enviados, enviar } = enviador();
  const r = await registrarArrepentimiento(solicitud, { config, ahora: SABADO, azar: AZAR, enviar });

  assert.deepEqual(r, { ok: true, codigo: "ARR-20261025-23456", recibida: "25 de octubre de 2026, 02:30 (hora de Argentina)", mailEnviado: true });
  assert.equal(enviados.length, 2);

  const [harper, comprador] = enviados;
  assert.equal(harper.para, "pedidos@harper.test");
  assert.equal(harper.responderA, "ana@ejemplo.com");
  assert.match(harper.asunto, /ARR-20261025-23456 — Ana Pérez/);
  assert.match(harper.texto, /Motivo: Visitá https:\/\/spam\.example/);
  assert.match(harper.texto, /siguiente día hábil/);

  assert.equal(comprador.para, "ana@ejemplo.com");
  assert.equal(comprador.responderA, "contacto@harper.test");
  assert.match(comprador.asunto, /ARR-20261025-23456/);
  assert.match(comprador.texto, /Código de recepción: ARR-20261025-23456/);
  assert.match(comprador.texto, /Pedido HARPER-314756B/);
  assert.match(comprador.texto, /Atendemos de lunes a viernes\. El siguiente día hábil te contactamos/);
  // Nada del texto libre del formulario llega a un tercero.
  assert.ok(!/spam/.test(comprador.html + comprador.texto));
  assert.ok(!/Ana/.test(comprador.html + comprador.texto));
});

test("si el aviso a Harper falla, se reintenta una vez", async () => {
  const { enviados, enviar } = enviador((_, intento) => intento === 1);
  const r = await registrarArrepentimiento(solicitud, { config, ahora: SABADO, azar: AZAR, enviar });
  assert.equal(r.ok, true);
  assert.deepEqual(enviados.map((e) => e.para), ["pedidos@harper.test", "ana@ejemplo.com"]);
});

test("si Harper no recibe el aviso, no se da un código que nadie registró", async () => {
  const { enviados, enviar } = enviador((envio) => envio.para === "pedidos@harper.test");
  const r = await registrarArrepentimiento(solicitud, { config, ahora: SABADO, azar: AZAR, enviar });
  assert.deepEqual(r, { ok: false });
  assert.equal(enviados.length, 0);
});

test("si el email al comprador falla, el código igual se da y Harper recibe otro aviso", async () => {
  const { enviados, enviar } = enviador((envio) => envio.para === "ana@ejemplo.com");
  const r = await registrarArrepentimiento(solicitud, { config, ahora: SABADO, azar: AZAR, enviar });
  assert.deepEqual(r.ok && [r.codigo, r.mailEnviado], ["ARR-20261025-23456", false]);
  assert.equal(enviados.length, 2);
  assert.match(enviados[1].asunto, /^REVISAR arrepentimiento ARR-20261025-23456/);
  assert.equal(enviados[1].para, "pedidos@harper.test");
});
