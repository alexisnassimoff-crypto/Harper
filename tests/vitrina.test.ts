import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDeFoto, coloresConStock, empujeDeLaBarra, enLetras, fotosDeVitrina, modoDePortada, precioUnico, tinteDe, tinteDeColor } from "../lib/vitrina";
import { TEXTOS } from "../lib/textos";

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

test("las líneas: disponibles con stock; mientras no, «Próximamente» con los modelos anunciados", async () => {
  const { LINEAS, lineasDeLaPortada } = await import("../lib/lineas");
  const anteojo = (categoria: string, agotada = false) => ({ categoria, variantes: [{ agotada }, { agotada: false }] }) as never;

  const hoy = lineasDeLaPortada([anteojo("Anteojos"), anteojo("Anteojos"), anteojo("Estuches")]);
  assert.deepEqual(
    hoy.map((l) => [l.clave, l.estado, l.modelos]),
    [
      ["fotocromaticos", "disponible", 2],
      ["sol", "proximamente", 10],
      ["receta", "proximamente", 10],
      ["clip-on", "proximamente", 5],
    ],
  );
  assert.equal(hoy.find((l) => l.clave === "sol")?.colores, 37);
  assert.equal(hoy.find((l) => l.clave === "receta")?.colores, 37);
  assert.equal(hoy.find((l) => l.clave === "clip-on")?.colores, 21);
  // Las que se usan con graduación invitan a consultar por los cristales; los de sol, no.
  assert.deepEqual(
    hoy.filter((l) => l.conAumento).map((l) => l.clave),
    ["fotocromaticos", "receta", "clip-on"],
  );

  // Cuando se cargan los de sol en Airtable, la línea pasa sola a disponible, con su sección.
  const conSol = lineasDeLaPortada([anteojo("Anteojos"), anteojo("Anteojos de sol")]);
  const sol = conSol.find((l) => l.clave === "sol");
  assert.equal(sol?.estado, "disponible");
  assert.equal(sol?.ruta, "/anteojos-de-sol");

  // Nada de precios ni códigos de fábrica en lo que se publica.
  assert.ok(!/KG\d|K0\d|RMB|\d{2,}\s*(?:yuan|元)/.test(JSON.stringify(LINEAS)));
});

test("cada color de un modelo tiene su fondo: al tocar otro color, el fondo cambia", () => {
  const modelos: [string, string[]][] = [
    ["citrino", ["Negro", "Ámbar traslúcido", "Gris traslúcido", "Carey"]],
    ["amatista", ["Negro", "Ámbar traslúcido", "Gris traslúcido"]],
    ["obsidiana", ["Negro", "Ámbar traslúcido", "Gris traslúcido"]],
    ["cuarzo", ["Negro", "Ámbar traslúcido"]],
    ["nuevo", ["Negro", "Carey", "Gris"]],
  ];
  modelos.forEach(([slug, colores], i) => {
    const tintes = colores.map((c) => tinteDeColor(slug, c, i));
    assert.equal(new Set(tintes).size, colores.length, `${slug}: ${tintes.join(", ")}`);
  });
  // El negro conserva el tinte del modelo cuando ningún otro color lo usa.
  assert.equal(tinteDeColor("obsidiana", "Negro", 2), tinteDe("obsidiana", 2));
});

test("Socios: «N lugares numerados» solo mientras nadie se anotó; con cero lugares, ocupados", () => {
  assert.equal(TEXTOS.socios.cupos(100, 100), "100 lugares numerados");
  assert.equal(TEXTOS.socios.cupos(99, 100), "Quedan 99 de 100 lugares");
  assert.equal(TEXTOS.socios.cupos(0, 100), "Los 100 lugares ya están ocupados");
  assert.equal(TEXTOS.socios.cupos(0, 0), "Los 0 lugares ya están ocupados");
});

test("«Todos cuestan lo mismo.» no está en las bajadas: la portada lo agrega solo con un único precio", () => {
  assert.ok(!/cuestan lo mismo/i.test(TEXTOS.modelos.bajada));
  assert.ok(!/cuestan lo mismo/i.test(TEXTOS.modelos.bajadaConSol));
  assert.equal(TEXTOS.modelos.mismoPrecio, "Todos cuestan lo mismo.");
});
