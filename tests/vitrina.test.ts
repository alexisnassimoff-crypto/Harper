import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDeFoto, coloresConStock, empujeDeLaBarra, enLetras, fotosDeVitrina, modoDePortada, precioUnico } from "../lib/vitrina";

test("la foto de cada color: los recortes al sol y adentro si existen; si no, la primera y nada al sol", () => {
  assert.equal(baseDeFoto("/productos/anteojos/citrino-carey-1.webp"), "citrino-carey");
  assert.equal(baseDeFoto("/productos/anteojos/citrino-carey-portada.jpg"), "citrino-carey");
  assert.equal(baseDeFoto("https://otro.sitio/foto.jpg"), null);
  assert.deepEqual(fotosDeVitrina({ fotos: ["/productos/anteojos/citrino-carey-1.webp"], fotoPortada: null }, ""), {
    adentro: "/productos/anteojos/citrino-carey-frente.webp",
    alSol: "/productos/anteojos/citrino-carey-sol.webp",
  });
  assert.deepEqual(fotosDeVitrina({ fotos: ["/productos/anteojos/nuevo-rojo-1.webp"], fotoPortada: null }, ""), {
    adentro: "/productos/anteojos/nuevo-rojo-1.webp",
    alSol: null,
  });
  assert.deepEqual(fotosDeVitrina({ fotos: [], fotoPortada: null }, "/respaldo.webp"), { adentro: "/respaldo.webp", alSol: null });
});

test("un solo precio solo si todos cuestan lo mismo; los colores son los que tienen stock", () => {
  assert.equal(precioUnico([{ precio: 89900 }, { precio: 89900 }]), 89900);
  assert.equal(precioUnico([{ precio: 89900 }, { precio: 99900 }]), null);
  assert.equal(precioUnico([]), null);
  const v = (agotada: boolean) => ({ agotada }) as never;
  assert.equal(coloresConStock([{ variantes: [v(false), v(true)] }, { variantes: [v(false)] }]), 2);
  assert.equal(enLetras(12), "doce");
  assert.equal(enLetras(40), "40");
});

test("qué portada va según Config: vacío, la vitrina", () => {
  assert.deepEqual(modoDePortada(""), { tipo: "vitrina" });
  assert.deepEqual(modoDePortada("Vitrina"), { tipo: "vitrina" });
  assert.deepEqual(modoDePortada("catálogo"), { tipo: "catalogo" });
  assert.deepEqual(modoDePortada("citrino"), { tipo: "estrella", slug: "citrino" });
});

test("la barra «Tus pares» empuja el próximo par con lo que de verdad gana", () => {
  const base = { cupon: 0, precioPar: 89900, envioGratisDesde: 150000 };
  // Un par: con otro, 5 % OFF y envío gratis a todo el país.
  assert.equal(
    empujeDeLaBarra({ ...base, pares: 1, actual: 0, proximo: { faltan: 1, porcentaje: 5 }, subtotalSinCupon: 89900 }),
    "Sumá otro: 5 % OFF y envío gratis a todo el país.",
  );
  // Con HARPER10 aplicado, el 5 % no se promete (no se suman): solo el envío.
  assert.equal(
    empujeDeLaBarra({ ...base, cupon: 10, pares: 1, actual: 0, proximo: { faltan: 1, porcentaje: 5 }, subtotalSinCupon: 89900 }),
    "Sumá otro: envío gratis a todo el país.",
  );
  // Dos pares: lo que ya tiene.
  assert.equal(
    empujeDeLaBarra({ ...base, pares: 2, actual: 5, proximo: { faltan: 2, porcentaje: 10 }, subtotalSinCupon: 170810 }),
    "5 % OFF aplicado y envío gratis a todo el país.",
  );
  // Tres: uno más y son 10 %.
  assert.equal(
    empujeDeLaBarra({ ...base, pares: 3, actual: 5, proximo: { faltan: 1, porcentaje: 10 }, subtotalSinCupon: 256215 }),
    "Uno más: 10 % OFF.",
  );
  assert.equal(
    empujeDeLaBarra({ ...base, pares: 4, actual: 10, proximo: null, subtotalSinCupon: 323640 }),
    "10 % OFF aplicado y envío gratis a todo el país.",
  );
  assert.equal(empujeDeLaBarra({ ...base, pares: 0, actual: 0, proximo: null, subtotalSinCupon: 0 }), null);
});
