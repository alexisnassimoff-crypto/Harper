import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Tarea 08: el motor del Crédito Harper (5 % con un anteojo, 10 % con dos o
// más). Los pedidos salen del carrito real del servidor contra el Airtable de
// prueba; el motor no se usa en ninguna parte de la tienda todavía.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;

import { getProductos } from "../lib/catalogo";
import {
  calcularCredito,
  claveDelCredito,
  creditoActivo,
  creditoAlAcreditarse,
  creditoTrasDevolucion,
  estadoDelCredito,
  porcentajeDeCredito,
  VARIABLE_CREDITO,
  type RenglonCobrado,
} from "../lib/credito-harper";
import { resolverCarrito } from "../lib/pedidos";
import type { SuscriptorDelCarrito } from "../lib/suscriptores";
import type { Categoria, ItemCarrito } from "../lib/tipos";

const renglon = (categoria: Categoria, subtotal: number, cantidad = 1, saldo?: number): RenglonCobrado => ({
  categoria,
  cantidad,
  subtotal,
  ...(saldo !== undefined ? { saldo } : {}),
});

async function lineas() {
  const productos = await getProductos();
  const p = (slug: string) => productos.find((x) => x.slug === slug)!;
  return (slug: string, n = 0, cantidad = 1): ItemCarrito => ({ productoSlug: slug, varianteId: p(slug).variantes[n].id, cantidad });
}

async function conDuo<T>(hacer: () => Promise<T>): Promise<T> {
  process.env.HARPER_DUO_ACTIVO = "1";
  try {
    return await hacer();
  } finally {
    delete process.env.HARPER_DUO_ACTIVO;
  }
}

// ---------- El porcentaje y la base ----------

test("El porcentaje: 0 sin anteojos, 5 % con uno, 10 % con dos o más", () => {
  assert.equal(porcentajeDeCredito(0), 0);
  assert.equal(porcentajeDeCredito(1), 5);
  for (const n of [2, 3, 4, 5, 6, 20]) assert.equal(porcentajeDeCredito(n), 10);
  assert.throws(() => porcentajeDeCredito(-1), RangeError);
  assert.throws(() => porcentajeDeCredito(1.5), RangeError);
});

test("Un anteojo: 5 % de lo pagado en el anteojo; los estuches y paños no suman", async () => {
  const linea = await lineas();
  const uno = await resolverCarrito([linea("amatista")], { paraCobrar: true });
  assert.deepEqual(calcularCredito(uno.items), { anteojos: 1, porcentaje: 5, base: 89_900, monto: 4_495 });

  // Con estuche y paño: la base sigue siendo solo el anteojo.
  const conComplementos = await resolverCarrito([linea("amatista"), linea("m500"), linea("pano-alta-densidad")], { paraCobrar: true });
  assert.deepEqual(conComplementos.items.map((i) => i.categoria), ["Anteojos", "Estuches", "Paños"]);
  const c = calcularCredito(conComplementos.items);
  assert.equal(c.anteojos, 1);
  assert.equal(c.base, 89_900);
  assert.equal(c.monto, 4_495);
  // El envío no está en los renglones: nunca es base.
});

test("Dos o más anteojos: 10 % de lo pagado con el Dúo (como en el plan: $ 15.733)", async () => {
  const linea = await lineas();
  const duo = await conDuo(() => resolverCarrito([linea("amatista"), linea("cuarzo", 1)], { paraCobrar: true }));
  assert.equal(duo.subtotal, 157_325);
  assert.deepEqual(calcularCredito(duo.items), { anteojos: 2, porcentaje: 10, base: 157_325, monto: 15_733 });

  // Pagado con dinero en Mercado Pago: sobre lo que queda (plan §8: $ 14.159).
  assert.ok(duo.dineroMP);
  assert.equal(calcularCredito(duo.dineroMP.items).monto, 14_159);

  // Sin el Dúo (apagado), dos pares a lista: 10 % de $ 179.800.
  const sinDuo = await resolverCarrito([linea("amatista"), linea("cuarzo", 1)], { paraCobrar: true });
  assert.equal(calcularCredito(sinDuo.items).monto, 17_980);

  // Tres en un mismo renglón cuentan como tres.
  const tres = calcularCredito([renglon("Anteojos", 247_225, 3)]);
  assert.equal(tres.anteojos, 3);
  assert.equal(tres.porcentaje, 10);
});

test("Las cuatro categorías de anteojos completos cuentan; estuches y paños no", () => {
  for (const categoria of ["Anteojos", "Anteojos de sol", "Clip-On", "Anteojos de receta"] as Categoria[]) {
    assert.equal(calcularCredito([renglon(categoria, 100_000)]).monto, 5_000, categoria);
  }
  // Un Clip-On y uno de receta: dos anteojos, 10 %.
  assert.equal(calcularCredito([renglon("Clip-On", 100_000), renglon("Anteojos de receta", 120_000)]).monto, 22_000);
  // Solo complementos: sin crédito.
  assert.deepEqual(calcularCredito([renglon("Estuches", 8_990, 2), renglon("Paños", 3_500)]), {
    anteojos: 0,
    porcentaje: 0,
    base: 0,
    monto: 0,
    motivo: "sin-anteojos",
  });
  assert.equal(calcularCredito([]).motivo, "sin-anteojos");
});

test("Nunca sobre el crédito usado: el saldo del suscriptor no es base", async () => {
  const linea = await lineas();
  const suscriptor: SuscriptorDelCarrito = { id: "recPRUEBA", email: "prueba@harper.ar", cuponDisponible: false, saldoDisponible: 12_000, activo: true };

  // Un anteojo con $ 12.000 de saldo: 5 % de $ 77.900.
  const uno = await resolverCarrito([linea("amatista")], { suscriptor, usarSaldo: true, paraCobrar: true });
  assert.equal(uno.suscriptor?.saldoUsado, 12_000);
  assert.deepEqual(calcularCredito(uno.items), { anteojos: 1, porcentaje: 5, base: 77_900, monto: 3_895 });

  // Con un estuche, el saldo se reparte entre los dos: la base es lo que quedó pagado en el anteojo.
  const conEstuche = await resolverCarrito([linea("amatista"), linea("m500")], { suscriptor, usarSaldo: true, paraCobrar: true });
  const anteojo = conEstuche.items.find((i) => i.categoria === "Anteojos")!;
  assert.ok((anteojo.saldo ?? 0) > 0);
  assert.equal(calcularCredito(conEstuche.items).base, anteojo.subtotal);
  assert.equal(calcularCredito(conEstuche.items).base, 89_900 - (anteojo.saldo ?? 0));

  // Pagado entero con saldo: nada pagado en dinero, sin crédito.
  assert.deepEqual(calcularCredito([renglon("Anteojos", 0, 1, 89_900)]), {
    anteojos: 1,
    porcentaje: 5,
    base: 0,
    monto: 0,
    motivo: "pagado-con-credito",
  });
});

test("El redondeo, como el modelo financiero: pesos enteros, al más cercano", () => {
  assert.equal(calcularCredito([renglon("Anteojos", 142_325), renglon("Anteojos", 0, 0)]).monto, 7_116); // 5 % de 142.325 = 7.116,25
  assert.equal(calcularCredito([renglon("Anteojos", 71_163, 2)]).monto, 7_116); // 10 % de 71.163 = 7.116,3
  assert.equal(calcularCredito([renglon("Anteojos", 142_325, 2)]).monto, 14_233); // 14.232,5 → 14.233 (plan §5.3)
  assert.ok(Number.isInteger(calcularCredito([renglon("Anteojos", 78_662.5, 2)]).monto));
});

test("Datos sin sentido: frena en vez de adivinar, y no modifica lo que recibe", () => {
  assert.throws(() => calcularCredito([renglon("Anteojos", -1)]), RangeError);
  assert.throws(() => calcularCredito([renglon("Anteojos", Number.NaN)]), RangeError);
  assert.throws(() => calcularCredito([renglon("Anteojos", 89_900, 1.5)]), RangeError);
  assert.throws(() => calcularCredito([renglon("Anteojos", 89_900, -2)]), RangeError);
  assert.throws(() => calcularCredito([renglon("Anteojos", 89_900, 1, -5)]), RangeError);
  const entrada = [renglon("Anteojos", 89_900), renglon("Estuches", 8_990)];
  const copia = structuredClone(entrada);
  calcularCredito(entrada);
  assert.deepEqual(entrada, copia);
});

// ---------- El pedido: sin duplicar y respetando lo anterior ----------

test("Al acreditarse el pago: se anota pendiente una sola vez por pedido", () => {
  const pedido = { numero: "HARPER-1001", renglones: [renglon("Anteojos", 157_325, 2)], pagado: true, regimen: "nuevo" as const };
  const plan = creditoAlAcreditarse(pedido, []);
  assert.equal(plan.accion, "anotar");
  if (plan.accion !== "anotar") return;
  assert.equal(plan.estado, "pendiente");
  assert.equal(plan.clave, "credito-harper:HARPER-1001");
  assert.equal(plan.calculo.monto, 15_733);

  // Ya anotado (un webhook repetido, una reconciliación): no se anota otro.
  const anotados = [{ tipo: "Cashback" as const, pedido: "HARPER-1001" }];
  assert.deepEqual(creditoAlAcreditarse(pedido, anotados), { accion: "nada", numero: "HARPER-1001", motivo: "ya-registrado", calculo: null });
  // Aunque esté anulado (por una devolución): tampoco.
  assert.equal(creditoAlAcreditarse(pedido, [{ tipo: "Cashback", pedido: " HARPER-1001 " }]).accion, "nada");
  // Movimientos de otros pedidos o el uso de saldo de este no lo frenan.
  assert.equal(creditoAlAcreditarse(pedido, [{ tipo: "Cashback", pedido: "HARPER-1002" }, { tipo: "Uso", pedido: "HARPER-1001" }]).accion, "anotar");
  // Siempre la misma clave para el mismo pedido.
  assert.equal(claveDelCredito(" HARPER-1001 "), claveDelCredito("HARPER-1001"));
  assert.throws(() => claveDelCredito("  "), RangeError);
});

test("Se respeta el régimen anterior: un pedido con las reglas de hoy no genera crédito nuevo", () => {
  const renglones = [renglon("Anteojos", 89_900)];
  // El suscriptor que sigue con las reglas de hoy (dentro del aviso, o pagado antes del cambio): su cashback, sin crédito nuevo.
  assert.deepEqual(creditoAlAcreditarse({ numero: "HARPER-2001", renglones, pagado: true, regimen: "anterior" }, []), {
    accion: "nada",
    numero: "HARPER-2001",
    motivo: "regimen-anterior",
    calculo: null,
  });
  // Sin pago acreditado: nada.
  assert.equal((creditoAlAcreditarse({ numero: "HARPER-2002", renglones, pagado: false, regimen: "nuevo" }, []) as { motivo: string }).motivo, "no-pagado");
  // Sin anteojos o pagado entero con crédito: nada, con el motivo.
  assert.equal((creditoAlAcreditarse({ numero: "HARPER-2003", renglones: [renglon("Estuches", 8_990)], pagado: true, regimen: "nuevo" }, []) as { motivo: string }).motivo, "sin-anteojos");
  assert.equal((creditoAlAcreditarse({ numero: "HARPER-2004", renglones: [renglon("Anteojos", 0, 1, 89_900)], pagado: true, regimen: "nuevo" }, []) as { motivo: string }).motivo, "pagado-con-credito");
});

// ---------- Pendiente o disponible ----------

test("Disponible 30 días después de la entrega confirmada, sin incidencias; si no, pendiente", () => {
  const base = { anulado: false, incidenciaAbierta: false };
  // Sin fecha de entrega confiable: pendiente, sin fecha.
  assert.deepEqual(estadoDelCredito({ ...base, fechaEntrega: null, hoy: "2027-06-01" }), { estado: "pendiente", disponibleDesde: null });
  // Entregado el 10/11: disponible desde el 10/12.
  assert.deepEqual(estadoDelCredito({ ...base, fechaEntrega: "2026-11-10", hoy: "2026-12-09" }), { estado: "pendiente", disponibleDesde: "2026-12-10" });
  assert.deepEqual(estadoDelCredito({ ...base, fechaEntrega: "2026-11-10", hoy: "2026-12-10" }), { estado: "disponible", disponibleDesde: "2026-12-10" });
  // Con una devolución, un reclamo o un contracargo abierto: sigue pendiente.
  assert.equal(estadoDelCredito({ ...base, incidenciaAbierta: true, fechaEntrega: "2026-11-10", hoy: "2027-01-10" }).estado, "pendiente");
  // Anulado es anulado.
  assert.equal(estadoDelCredito({ ...base, anulado: true, fechaEntrega: "2026-11-10", hoy: "2027-01-10" }).estado, "anulado");
  // La fecha va como AAAA-MM-DD.
  assert.throws(() => estadoDelCredito({ ...base, fechaEntrega: "10/11/2026", hoy: "2026-12-10" }), RangeError);
  // Con un Date, cuenta el día en Buenos Aires (las 23:30 del 9/12 en Argentina todavía es el 9).
  assert.equal(estadoDelCredito({ ...base, fechaEntrega: "2026-11-10", hoy: new Date("2026-12-10T02:30:00Z") }).estado, "pendiente");
});

// ---------- Devoluciones ----------

test("Devoluciones con el crédito pendiente: se anula o se recalcula, nunca sube; disponible, se revisa", () => {
  const pendiente = { monto: 15_733, estado: "pendiente" as const };
  // Devolvió todo: se anula.
  assert.deepEqual(creditoTrasDevolucion(pendiente, []), { accion: "anular", monto: 0 });
  assert.deepEqual(creditoTrasDevolucion(pendiente, [renglon("Estuches", 8_990)]), { accion: "anular", monto: 0 });
  // Se quedó con un anteojo: 5 % de lo que quedó pagado en él (lo que quedó pagado depende de la regla de reintegro).
  const unoQueda = creditoTrasDevolucion(pendiente, [renglon("Anteojos", 67_425)]);
  assert.equal(unoQueda.accion, "recalcular");
  assert.equal(unoQueda.monto, 3_371); // 5 % de 67.425 = 3.371,25
  // Se quedó con dos de tres: 10 % de lo que quedó.
  assert.equal(creditoTrasDevolucion({ monto: 24_723, estado: "pendiente" }, [renglon("Anteojos", 157_325, 2)]).monto, 15_733);
  // Nunca sube, aunque la cuenta diera más.
  assert.deepEqual(creditoTrasDevolucion({ monto: 1_000, estado: "pendiente" }, [renglon("Anteojos", 89_900)]), { accion: "sin-cambio", monto: 1_000 });
  // Ya disponible (o anulado): no se toca solo; lo decide Harper.
  assert.deepEqual(creditoTrasDevolucion({ monto: 15_733, estado: "disponible" }, []), { accion: "revisar", monto: 15_733 });
  assert.deepEqual(creditoTrasDevolucion({ monto: 0, estado: "anulado" }, []), { accion: "revisar", monto: 0 });
  assert.throws(() => creditoTrasDevolucion({ monto: -1, estado: "pendiente" }, []), RangeError);
});

// ---------- Sin activar ----------

test("Apagado por defecto y sin usar: ninguna página, componente ni ruta lo usa todavía", () => {
  assert.equal(VARIABLE_CREDITO, "HARPER_CREDITO_ACTIVO");
  assert.equal(creditoActivo({}), false);
  for (const valor of ["0", "", "true", "si"]) assert.equal(creditoActivo({ [VARIABLE_CREDITO]: valor }), false, valor);
  assert.equal(creditoActivo({ [VARIABLE_CREDITO]: "1" }), true);
  assert.equal(creditoActivo(), false, "en las pruebas no está prendido");

  const raiz = path.resolve(__dirname, "..", "..");
  const usos: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.(ts|tsx)$/.test(entrada.name) && relativo !== path.join("lib", "credito-harper.ts")) {
        const texto = fs.readFileSync(path.join(raiz, relativo), "utf8");
        if (/from\s+["'](?:\.\.?\/|@\/lib\/|\.\.\/lib\/)credito-harper["']/.test(texto)) usos.push(relativo);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) recorrer(dir);
  assert.deepEqual(usos, [], "no acredita ni cambia ningún cobro");
});
