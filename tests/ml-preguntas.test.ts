import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fichaDePublicacion,
  firmaDeAprobacion,
  firmaValida,
  leerDecision,
  leerPregunta,
  preguntaDeNotificacion,
  problemaDeRespuesta,
} from "../lib/ml-preguntas";

test("solo las notificaciones de preguntas de nuestra aplicación dan un id", () => {
  const n = { topic: "questions", resource: "/questions/5036111111", application_id: 2069392825111111, user_id: "1" };
  assert.equal(preguntaDeNotificacion(n, "2069392825111111"), "5036111111");
  assert.equal(preguntaDeNotificacion(n, "999"), null);
  assert.equal(preguntaDeNotificacion({ ...n, topic: "orders_v2" }, "2069392825111111"), null);
  assert.equal(preguntaDeNotificacion({ ...n, resource: "/questions/12/../../users" }, "2069392825111111"), null);
  assert.equal(preguntaDeNotificacion(null, ""), null);
});

test("la pregunta se lee de la API v4", () => {
  const p = leerPregunta({ id: 11, text: "¿Hay en negro?", status: "UNANSWERED", item_id: "MLA1", seller_id: 5, date_created: "2026-10-30T10:00:00Z", answer: null });
  assert.deepEqual(p, { id: "11", texto: "¿Hay en negro?", estado: "UNANSWERED", itemId: "MLA1", vendedor: 5, creada: "2026-10-30T10:00:00Z", respuesta: null });
  assert.equal(leerPregunta({ text: "sin id" }), null);
});

test("la ficha junta lo que el agente puede usar y dice el stock sin dar el número", () => {
  const { ficha, titulo } = fichaDePublicacion(
    {
      title: "Estuche rígido de cuero",
      price: 15990,
      currency_id: "ARS",
      available_quantity: 37,
      condition: "new",
      shipping: { free_shipping: true },
      attributes: [{ name: "Material", value_name: "Cuero" }, { name: "Vacío", value_name: null }],
      variations: [{ attribute_combinations: [{ name: "Color", value_name: "Negro" }], available_quantity: 0 }],
    },
    { plain_text: "Cierre con imán." }
  );
  assert.equal(titulo, "Estuche rígido de cuero");
  assert.match(ficha, /Stock: hay stock disponible/);
  assert.doesNotMatch(ficha, /37/);
  assert.match(ficha, /- Material: Cuero/);
  assert.match(ficha, /- Negro \(sin stock\)/);
  assert.match(ficha, /envío gratis/);
  assert.match(ficha, /Cierre con imán\./);
});

test("la decisión del modelo se valida antes de usarla", () => {
  assert.deepEqual(leerDecision('{"accion":"responder","respuesta":" ¡Hola! Sí. ","motivo":"stock"}'), {
    accion: "responder",
    respuesta: "¡Hola! Sí.",
    motivo: "stock",
  });
  assert.equal(leerDecision('{"accion":"publicar","respuesta":"x","motivo":"y"}'), null);
  assert.equal(leerDecision("no es json"), null);
});

test("una respuesta con datos de contacto, links o partes sin completar no se publica", () => {
  assert.equal(problemaDeRespuesta("¡Hola! Sí, hay stock en negro. Saludos, Harper."), null);
  assert.equal(problemaDeRespuesta("¡Hola! Mide 52-19-145 y sale $ 15.990. Saludos, Harper."), null);
  assert.ok(problemaDeRespuesta(""));
  assert.ok(problemaDeRespuesta("Escribinos a hola@harper.ar"));
  assert.ok(problemaDeRespuesta("Mirá www.harper.ar"));
  assert.ok(problemaDeRespuesta("Llamá al 11 5555 4444"));
  assert.ok(problemaDeRespuesta("Mandanos un WhatsApp"));
  assert.ok(problemaDeRespuesta("Llega en [COMPLETAR: plazo] días"));
  assert.ok(problemaDeRespuesta("a".repeat(2001)));
});

test("la firma del link de aprobación es por pregunta y por secreto", () => {
  const firma = firmaDeAprobacion("123", "secreto");
  assert.ok(firmaValida("123", firma, "secreto"));
  assert.ok(!firmaValida("124", firma, "secreto"));
  assert.ok(!firmaValida("123", firma, "otro"));
  assert.ok(!firmaValida("123", null, "secreto"));
  assert.ok(!firmaValida("123", firma, ""));
});
