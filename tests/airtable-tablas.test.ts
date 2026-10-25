import { test } from "node:test";
import assert from "node:assert/strict";

// Se carga ANTES de importar el cliente: los IDs se resuelven al cargar el módulo.
process.env.AIRTABLE_TABLAS = JSON.stringify({
  pedidos: "tblPRUEBA00000001",
  variantes: "tblPRUEBA00000002",
  clientes: "no-es-un-id",
  otraCosa: "tblPRUEBA00000003",
});

import { TABLAS } from "../lib/airtable";

test("AIRTABLE_TABLAS reemplaza solo las tablas conocidas con IDs válidos; el resto queda como en la base real", () => {
  assert.equal(TABLAS.pedidos, "tblPRUEBA00000001");
  assert.equal(TABLAS.variantes, "tblPRUEBA00000002");
  // Un valor que no es un ID de tabla se ignora.
  assert.equal(TABLAS.clientes, "tblsaNGzIXaeK8aJM");
  // Las no mencionadas, intactas.
  assert.equal(TABLAS.productos, "tblrhgsHP6oJLa5C2");
  assert.equal(TABLAS.config, "tblMyAedM5pvVijLf");
  assert.equal(TABLAS.descuentos, "tblYkgJW6Bi0Fx048");
  assert.equal(TABLAS.arrepentimientos, "tblgag8YwduSiTWfx");
  assert.ok(!("otraCosa" in TABLAS));
});
