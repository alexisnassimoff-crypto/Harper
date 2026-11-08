import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atributosQueMencionan,
  esQueSacar,
  estadoDelCambio,
  MAXIMO_LINEAS,
  paginaDeCambios,
  QUE_SE_PUEDE_SACAR,
  quitarLineas,
} from "../lib/ml-descripciones";

const DESCRIPCION = [
  "Anteojos Harper Citrino",
  "",
  "Características principales:",
  "✔ Filtro de luz azul: protege tus ojos de las pantallas.",
  "✔ Tratamiento Antirreflex: Minimiza los reflejos molestos de luces artificiales y monitores.",
  "",
  "✔ Fotocromáticos: se oscurecen con el sol.",
  "✔ Protección UV400.",
].join("\n");

test("saca solo la línea del antirreflex y deja el resto igual", () => {
  const { nuevo, quitadas } = quitarLineas(DESCRIPCION, QUE_SE_PUEDE_SACAR.antirreflex.patron);
  assert.deepEqual(quitadas, ["✔ Tratamiento Antirreflex: Minimiza los reflejos molestos de luces artificiales y monitores."]);
  assert.ok(!/antirreflex/i.test(nuevo));
  assert.ok(nuevo.includes("✔ Filtro de luz azul"));
  assert.ok(nuevo.includes("✔ Fotocromáticos"));
  assert.ok(nuevo.includes("UV400"));
  assert.ok(!nuevo.includes("\n\n\n"));
});

test("reconoce las formas de escribirlo y el UV400", () => {
  const p = QUE_SE_PUEDE_SACAR.antirreflex.patron;
  for (const t of ["Antirreflex", "antireflejo", "anti-reflejo", "Anti reflex", "ANTIRREFLEJO"]) assert.ok(p.test(t), t);
  assert.ok(!p.test("Filtro de luz azul"));
  assert.ok(QUE_SE_PUEDE_SACAR.uv400.patron.test("Protección UV 400"));
  assert.ok(QUE_SE_PUEDE_SACAR.uv400.patron.test("uv400"));
});

test("si no hay nada que sacar, la descripción queda exactamente igual", () => {
  const texto = "Estuche rígido\n\n\nCon paño";
  assert.deepEqual(quitarLineas(texto, QUE_SE_PUEDE_SACAR.antirreflex.patron), { nuevo: texto, quitadas: [] });
});

test("solo se puede sacar lo de la lista cerrada", () => {
  assert.equal(esQueSacar("antirreflex"), true);
  assert.equal(esQueSacar("uv400"), true);
  assert.equal(esQueSacar(".*"), false);
  assert.equal(esQueSacar("toString"), false);
  assert.equal(esQueSacar(null), false);
});

test("el estado: sin cambios, para aplicar, aplicado, y no toca si hay demasiadas líneas", () => {
  assert.equal(estadoDelCambio([], true), "sin cambios");
  assert.equal(estadoDelCambio(["a"], false), "para aplicar");
  assert.equal(estadoDelCambio(["a"], true), "aplicado");
  assert.equal(estadoDelCambio(Array(MAXIMO_LINEAS + 1).fill("a"), true), "demasiadas líneas");
});

test("las características que lo mencionan se informan", () => {
  assert.deepEqual(
    atributosQueMencionan(
      { attributes: [{ name: "Tratamientos de los cristales", value_name: "Antirreflejo, Filtro de luz azul" }, { name: "Material", value_name: "PC" }] },
      QUE_SE_PUEDE_SACAR.antirreflex.patron
    ),
    ["Tratamientos de los cristales: Antirreflejo, Filtro de luz azul"]
  );
  assert.deepEqual(atributosQueMencionan(null, QUE_SE_PUEDE_SACAR.antirreflex.patron), []);
});

test("la página muestra lo que se saca, avisa las características y ofrece el botón solo antes de aplicar", () => {
  const cambios = [
    { id: "MLA1", titulo: "Citrino <gris>", quitadas: ["✔ Tratamiento Antirreflex"], atributos: ["Tratamientos: Antirreflejo"], estado: "para aplicar" as const },
    { id: "MLA2", titulo: "Estuche", quitadas: [], atributos: [], estado: "sin cambios" as const },
  ];
  const antes = paginaDeCambios({ que: "antirreflex", cambios, aplicar: false, linkAplicar: "https://x/?a=1&aplicar=1" });
  assert.ok(antes.includes("Citrino &lt;gris&gt;"));
  assert.ok(antes.includes("<s>✔ Tratamiento Antirreflex</s>"));
  assert.ok(antes.includes("corregir a mano en ML"));
  assert.ok(antes.includes("Sacar estas líneas en Mercado Libre"));
  assert.ok(antes.includes("&amp;aplicar=1"));
  assert.ok(!antes.includes("Estuche"));

  const despues = paginaDeCambios({
    que: "antirreflex",
    cambios: [{ ...cambios[0], estado: "aplicado" as const }],
    aplicar: true,
    linkAplicar: null,
  });
  assert.ok(despues.includes("aplicado"));
  assert.ok(!despues.includes("Sacar estas líneas en Mercado Libre"));

  assert.ok(paginaDeCambios({ que: "UV400", cambios: [], aplicar: false, linkAplicar: null }).includes("Ninguna descripción menciona «UV400»"));
});
