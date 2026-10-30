import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, mensajesDeConfianza } from "../lib/confianza";

const config = { envioGratisDesde: 80000 };

test("con envío gratis configurado y sin cuotas", () => {
  delete process.env.NEXT_PUBLIC_CUOTAS;
  const m = mensajesDeConfianza(config);

  assert.deepEqual(m.map((x) => x.clave), ["pago", "envio", "cambios"]);
  assert.equal(m[0].texto, "Pagás con Mercado Pago");
  assert.match(m[1].texto, /Envío gratis desde \$\s?80\.000/);
  assert.equal(m[1].detalle, "A domicilio");
  assert.equal(DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, "30 días para todo, sin cifras que se contradigan");
  assert.equal(m[2].texto, `Cambios y devoluciones hasta ${DIAS_CAMBIO} días`);
  assert.equal(m[2].detalle, "Devolución sin costo, sin uso y en su empaque");
  assert.equal(m[2].href, "/legales/devoluciones");
});

const VERIFICADAS = { cuotas: 3, montoCuota: 29966.67, cftea: "0,00 %" };

test("las cuotas aparecen solo cuando Mercado Pago las confirmó, con el CFTEA", () => {
  process.env.NEXT_PUBLIC_CUOTAS = "3";
  assert.ok(!mensajesDeConfianza(config).some((x) => x.clave === "cuotas"), "la variable sola no alcanza");
  const m = mensajesDeConfianza(config, VERIFICADAS);
  const cuotas = m.find((x) => x.clave === "cuotas");
  assert.equal(cuotas?.texto, "3 cuotas sin interés");
  assert.equal(cuotas?.detalle, "Visa y Mastercard · CFTEA 0,00 %");
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

test("en la portada las cuotas dicen a qué valen", () => {
  const cuotas = mensajesDeConfianza(config, VERIFICADAS, "en anteojos").find((x) => x.clave === "cuotas");
  assert.equal(cuotas?.texto, "3 cuotas sin interés en anteojos");
});

test("sin promoción de envío gratis se dice solo que se envía", () => {
  const m = mensajesDeConfianza({ envioGratisDesde: 0 });
  const envio = m.find((x) => x.clave === "envio");
  assert.equal(envio?.texto, "Envío a domicilio");
  assert.equal(envio?.detalle, undefined);
});

test("ningún mensaje afirma algo que la tienda no puede probar, ni promete plazos", () => {
  process.env.NEXT_PUBLIC_CUOTAS = "3";
  const todo = mensajesDeConfianza(config, VERIFICADAS)
    .flatMap((x) => [x.texto, x.detalle ?? ""])
    .join(" ")
    .toLowerCase();

  for (const prohibida of [
    "uv",
    "certific",
    "reseña",
    "estrellas",
    "últimas",
    "solo hoy",
    "oferta",
    "garantía de por vida",
    "todo el país",
    "entrega en",
    "días hábiles",
    "dias habiles",
    "24 h",
    "48 h",
  ]) {
    assert.ok(!todo.includes(prohibida), `no debería decir "${prohibida}"`);
  }
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

test("con envío gratis en AMBA más bajo, se anuncia ese y el de todo el país abajo", () => {
  const envio = mensajesDeConfianza({ envioGratisDesde: 150000, envioGratisAmbaDesde: 60000 }).find((x) => x.clave === "envio");
  assert.match(envio?.texto ?? "", /^Envío gratis en AMBA desde \$\s?60\.000$/);
  assert.match(envio?.detalle ?? "", /^En todo el país desde \$\s?150\.000$/);
  // Si el de AMBA no es más bajo, no tiene sentido nombrarlo.
  const igual = mensajesDeConfianza({ envioGratisDesde: 60000, envioGratisAmbaDesde: 60000 }).find((x) => x.clave === "envio");
  assert.match(igual?.texto ?? "", /^Envío gratis desde/);
});
