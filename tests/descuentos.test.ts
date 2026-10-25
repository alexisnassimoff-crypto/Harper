import { test } from "node:test";
import assert from "node:assert/strict";
import { conDescuento, ofertaPorCantidad, porcentajeParaCantidad, type Tramo } from "../lib/descuentos";

// Los tramos de anteojos publicados hoy: 2+ 5%, 4+ 10%, 8+ 15%, 15+ 20%.
const TRAMOS: Tramo[] = [
  { categoria: "Anteojos", desdeUnidades: 15, porcentaje: 20 },
  { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 5 },
  { categoria: "Anteojos", desdeUnidades: 8, porcentaje: 15 },
  { categoria: "Anteojos", desdeUnidades: 4, porcentaje: 10 },
  { categoria: "Estuches", desdeUnidades: 3, porcentaje: 10 },
];

test("la oferta de la ficha es el segundo par, con las mismas cuentas que cobra el servidor", () => {
  const oferta = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 0);
  assert.deepEqual(oferta, {
    estado: "pendiente",
    unidades: 2,
    faltan: 2,
    porcentaje: 5,
    unitario: 85_405,
    total: 170_810,
    ahorro: 8_990,
  });
  // Lo mismo que resulta de aplicar el descuento que corresponde a 2 unidades.
  assert.equal(oferta.estado === "pendiente" && oferta.unitario, conDescuento(89_900, porcentajeParaCantidad(TRAMOS, "Anteojos", 2)));
});

test("con un par en el carrito, falta uno; con dos o más, ya está aplicada", () => {
  const conUno = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 1);
  assert.equal(conUno?.estado, "pendiente");
  assert.equal(conUno?.estado === "pendiente" && conUno.faltan, 1);
  assert.equal(conUno?.estado === "pendiente" && conUno.total, 170_810);

  assert.deepEqual(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 2), { estado: "alcanzada", unidades: 2, porcentaje: 5 });
  // Con más pares informa el porcentaje que de verdad tiene el carrito.
  assert.deepEqual(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 4), { estado: "alcanzada", unidades: 2, porcentaje: 10 });
  assert.deepEqual(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 15), { estado: "alcanzada", unidades: 2, porcentaje: 20 });
});

test("cada categoría usa sus propios tramos; sin tramos no hay oferta", () => {
  const estuche = ofertaPorCantidad(TRAMOS, "Estuches", 6_990, 0);
  assert.equal(estuche?.estado === "pendiente" && estuche.unidades, 3);
  assert.equal(estuche?.estado === "pendiente" && estuche.unitario, 6_291);
  assert.equal(ofertaPorCantidad(TRAMOS, "Paños", 29_900, 0), null);
  assert.equal(ofertaPorCantidad([], "Anteojos", 89_900, 0), null);
});

test("una cantidad rara no rompe la cuenta", () => {
  const negativa = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, -3);
  assert.equal(negativa?.estado === "pendiente" && negativa.faltan, 2);
  const fraccion = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 1.7);
  assert.equal(fraccion?.estado === "pendiente" && fraccion.faltan, 1);
});
