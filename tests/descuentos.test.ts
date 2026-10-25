import { test } from "node:test";
import assert from "node:assert/strict";
import { conDescuento, ofertaPorCantidad, porcentajeParaCantidad, type Tramo } from "../lib/descuentos";

// Los tramos cargados hoy: 2+ 5%, 4+ 10%, 8+ 15%, 15+ 20%. Solo el primero se comunica.
const TRAMOS: Tramo[] = [
  { categoria: "Anteojos", desdeUnidades: 15, porcentaje: 20 },
  { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 5 },
  { categoria: "Anteojos", desdeUnidades: 8, porcentaje: 15 },
  { categoria: "Anteojos", desdeUnidades: 4, porcentaje: 10 },
  { categoria: "Estuches", desdeUnidades: 3, porcentaje: 10 },
];

test("sin nada en el carrito, la oferta es el segundo par con el precio de este par, igual al que cobra el servidor", () => {
  assert.deepEqual(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 0), {
    estado: "pendiente",
    unidades: 2,
    faltan: 2,
    porcentaje: 5,
    unitario: 85_405,
  });
  assert.equal(conDescuento(89_900, porcentajeParaCantidad(TRAMOS, "Anteojos", 2)), 85_405);
});

test("nunca arma un total combinado: con otro producto en el carrito solo dice cuánto falta", () => {
  const conUno = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 1);
  assert.equal(conUno?.estado, "pendiente");
  assert.equal(conUno?.estado === "pendiente" && conUno.faltan, 1);
  assert.ok(conUno && !("total" in conUno) && !("ahorro" in conUno));
});

test("'ya tenés el descuento' solo si el servidor de verdad lo aplicó", () => {
  assert.deepEqual(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 2, 5), { estado: "aplicada", unidades: 2 });
  // Con 4 o más no se publicita el tramo mayor: solo que ya tiene descuento.
  assert.deepEqual(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 4, 10), { estado: "aplicada", unidades: 2 });
  // Si el carrito no trae descuento (por ejemplo, no se pudieron leer los tramos), no se promete nada.
  assert.equal(ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 2, 0), null);
});

test("con dos tramos de igual mínimo, muestra el porcentaje que cobra el servidor (el mayor)", () => {
  const duplicados: Tramo[] = [
    { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 5 },
    { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 8 },
  ];
  const oferta = ofertaPorCantidad(duplicados, "Anteojos", 89_900, 0);
  assert.equal(oferta?.estado === "pendiente" && oferta.porcentaje, 8);
  assert.equal(oferta?.estado === "pendiente" && oferta.unitario, conDescuento(89_900, 8));
});

test("cada categoría usa sus propios tramos; sin tramos no hay oferta", () => {
  const estuche = ofertaPorCantidad(TRAMOS, "Estuches", 6_990, 0);
  assert.equal(estuche?.estado === "pendiente" && estuche.unidades, 3);
  assert.equal(ofertaPorCantidad(TRAMOS, "Paños", 29_900, 0), null);
  assert.equal(ofertaPorCantidad([], "Anteojos", 89_900, 0), null);
});

test("una cantidad rara no rompe la cuenta", () => {
  const negativa = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, -3);
  assert.equal(negativa?.estado === "pendiente" && negativa.faltan, 2);
  const fraccion = ofertaPorCantidad(TRAMOS, "Anteojos", 89_900, 1.7);
  assert.equal(fraccion?.estado === "pendiente" && fraccion.faltan, 1);
});
