import { test } from "node:test";
import assert from "node:assert/strict";
import { porcentaje } from "../lib/config";
import { normalizarDireccion } from "../lib/direcciones";
import {
  entraEnLaTarifa,
  leerTarifasRueddo,
  precioDeRueddo,
  TARIFAS_RUEDDO_POR_DEFECTO,
  zonaDeRueddo,
} from "../lib/rueddo";

const BA = "Buenos Aires";

test("la zona del reparto sale del mapa de Rueddo, por partido o por localidad", () => {
  assert.equal(zonaDeRueddo({ provincia: "Ciudad Autónoma de Buenos Aires", ciudad: "Buenos Aires" }), "CABA");
  assert.equal(zonaDeRueddo({ provincia: "CABA", ciudad: "Palermo" }), "CABA");
  // GBA 1
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Martínez" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Olivos" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Lanús Oeste" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Banfield" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Castelar" }), "GBA 1");
  // GBA 2
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Bernal" }), "GBA 2");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Nordelta" }), "GBA 2");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Adrogué" }), "GBA 2");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "José C. Paz" }), "GBA 2");
  // Zonas lejanas
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "City Bell" }), "GBA 3");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Del Viso" }), "GBA 3");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Escobar" }), "GBA 3");
  // El partido de Google gana sobre la localidad.
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Barrio Parque", partido: "Partido de San Isidro" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Villa Ballester", partido: "General San Martín" }), "GBA 1");
  // Fuera del mapa, o en otra provincia con el mismo nombre.
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Luján" }), null);
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Mar del Plata", partido: "General Pueyrredón" }), null);
  assert.equal(zonaDeRueddo({ provincia: "Córdoba", ciudad: "Pilar" }), null);
  assert.equal(zonaDeRueddo({ provincia: "San Luis", ciudad: "Merlo" }), null);
});

test("La Matanza: los barrios pegados a la Ciudad son GBA 1, el resto GBA 2", () => {
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Ramos Mejía" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "San Justo", partido: "La Matanza" }), "GBA 1");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "Gregorio de Laferrere", partido: "La Matanza" }), "GBA 2");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "González Catán" }), "GBA 2");
  assert.equal(zonaDeRueddo({ provincia: BA, ciudad: "La Matanza" }), "GBA 2", "sin el barrio, la parte más lejana");
});

test("el precio: la tarifa con IVA más el recargo, hacia arriba al peso", () => {
  assert.deepEqual(precioDeRueddo("CABA", TARIFAS_RUEDDO_POR_DEFECTO, 20), { tarifa: 3709, costo: 4487.89, precio: 5386 });
  assert.deepEqual(precioDeRueddo("GBA 1", TARIFAS_RUEDDO_POR_DEFECTO, 20), { tarifa: 5370, costo: 6497.7, precio: 7798 });
  assert.deepEqual(precioDeRueddo("GBA 2", TARIFAS_RUEDDO_POR_DEFECTO, 20), { tarifa: 7500, costo: 9075, precio: 10890 });
  assert.deepEqual(precioDeRueddo("GBA 3", TARIFAS_RUEDDO_POR_DEFECTO, 20), { tarifa: 7500, costo: 9075, precio: 10890 });
  assert.equal(precioDeRueddo("CABA", TARIFAS_RUEDDO_POR_DEFECTO, 0)?.precio, 4488, "sin recargo, la tarifa con IVA");
  assert.equal(precioDeRueddo("CABA", { ...TARIFAS_RUEDDO_POR_DEFECTO, CABA: 0 }, 20), null);
});

test("las tarifas de Config, como las escriba Ale", () => {
  assert.deepEqual(leerTarifasRueddo("CABA 3709 · GBA 1 5370 · GBA 2 7500 · GBA 3 7500"), TARIFAS_RUEDDO_POR_DEFECTO);
  assert.deepEqual(leerTarifasRueddo("CABA: $4.100\nGBA1: 5.900; GBA 2 = 8200, Zonas lejanas 8.200"), {
    CABA: 4100,
    "GBA 1": 5900,
    "GBA 2": 8200,
    "GBA 3": 8200,
  });
  assert.deepEqual(leerTarifasRueddo("CABA 4000"), { ...TARIFAS_RUEDDO_POR_DEFECTO, CABA: 4000 }, "lo que falta queda como en el tarifario");
  assert.deepEqual(leerTarifasRueddo("cualquier cosa"), TARIFAS_RUEDDO_POR_DEFECTO);
  assert.deepEqual(leerTarifasRueddo(undefined), TARIFAS_RUEDDO_POR_DEFECTO);
});

test("el recargo de Config: un porcentaje entre 0 y 100", () => {
  assert.equal(porcentaje("20", 20), 20);
  assert.equal(porcentaje("25 %", 20), 25);
  assert.equal(porcentaje("12,5%", 20), 12.5);
  assert.equal(porcentaje("0", 20), 0);
  assert.equal(porcentaje("", 20), 20);
  assert.equal(porcentaje("veinte", 20), 20);
  assert.equal(porcentaje("500", 20), 20);
});

test("la tarifa plana vale hasta 5 kg y 40 × 40 × 40 cm", () => {
  assert.equal(entraEnLaTarifa({ pesoKg: 0.5, largoCm: 20, anchoCm: 12, altoCm: 6 }), true);
  assert.equal(entraEnLaTarifa({ pesoKg: 5.2, largoCm: 20, anchoCm: 12, altoCm: 6 }), false);
  assert.equal(entraEnLaTarifa({ pesoKg: 1, largoCm: 45, anchoCm: 12, altoCm: 6 }), false);
  assert.equal(entraEnLaTarifa(null), true);
});

test("la dirección de Google trae el partido", () => {
  const d = normalizarDireccion(
    [
      { longText: "1234", types: ["street_number"] },
      { longText: "Avenida del Libertador", types: ["route"] },
      { longText: "Martínez", types: ["locality", "political"] },
      { longText: "San Isidro", types: ["administrative_area_level_2", "political"] },
      { longText: "Provincia de Buenos Aires", types: ["administrative_area_level_1", "political"] },
      { longText: "B1640", types: ["postal_code"] },
    ],
    "Av. del Libertador 1234, Martínez, Provincia de Buenos Aires"
  );
  assert.equal(d.localidad, "Martínez");
  assert.equal(d.partido, "San Isidro");
  assert.equal(zonaDeRueddo({ provincia: d.provincia, ciudad: d.localidad, partido: d.partido }), "GBA 1");
});
