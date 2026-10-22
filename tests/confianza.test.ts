import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, mensajesDeConfianza } from "../lib/confianza";

const config = { envioGratisDesde: 80000, plazoEntrega: "3 a 7 dias habiles" };

test("con envío gratis configurado y sin cuotas", () => {
  delete process.env.NEXT_PUBLIC_CUOTAS;
  const m = mensajesDeConfianza(config);

  assert.deepEqual(m.map((x) => x.clave), ["pago", "envio", "cambios"]);
  assert.equal(m[0].texto, "Pagás con Mercado Pago");
  assert.match(m[1].texto, /Envío gratis desde \$\s?80\.000/);
  assert.equal(m[1].detalle, "Entrega en 3 a 7 dias habiles");
  assert.equal(m[2].texto, `Cambios hasta ${DIAS_CAMBIO} días`);
  assert.match(m[2].detalle ?? "", new RegExp(`${DIAS_ARREPENTIMIENTO} días`));
  assert.equal(m[2].href, "/legales/devoluciones");
});

test("las cuotas aparecen solo cuando están activas", () => {
  process.env.NEXT_PUBLIC_CUOTAS = "3";
  const m = mensajesDeConfianza(config);
  assert.ok(m.some((x) => x.clave === "cuotas" && x.texto === "3 cuotas sin interés"));
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

test("sin promoción de envío gratis se dice solo que se envía", () => {
  const m = mensajesDeConfianza({ envioGratisDesde: 0, plazoEntrega: "" });
  const envio = m.find((x) => x.clave === "envio");
  assert.equal(envio?.texto, "Envío a domicilio");
  assert.equal(envio?.detalle, undefined);
});

test("ningún mensaje afirma algo que la tienda no puede probar", () => {
  process.env.NEXT_PUBLIC_CUOTAS = "3";
  const todo = mensajesDeConfianza(config)
    .flatMap((x) => [x.texto, x.detalle ?? ""])
    .join(" ")
    .toLowerCase();

  for (const prohibida of ["uv", "certific", "reseña", "estrellas", "últimas", "solo hoy", "oferta", "garantía de por vida", "todo el país"]) {
    assert.ok(!todo.includes(prohibida), `no debería decir "${prohibida}"`);
  }
  delete process.env.NEXT_PUBLIC_CUOTAS;
});
