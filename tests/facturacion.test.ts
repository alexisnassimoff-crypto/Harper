import { test } from "node:test";
import assert from "node:assert/strict";
import {
  camposDeFacturacion,
  claseDeFactura,
  CONDICIONES_IVA,
  cuitValido,
  facturacionDeFila,
  facturacionDelPedido,
  formatearCuit,
  leerCondicionEmisor,
  lineasDeFacturacion,
  lineasDeNotas,
  normalizarFacturacion,
  validarFacturacion,
} from "../lib/facturacion";
import { mailAvisoInterno } from "../lib/mails";
import type { ConfigTienda } from "../lib/config";

// El CUIT de FOCUS VISION SRL: real y con dígito verificador correcto.
const CUIT_OK = "30-71802316-1";

test("CUIT: 11 números, prefijo de ARCA y dígito verificador", () => {
  assert.equal(cuitValido(CUIT_OK), true);
  assert.equal(cuitValido("30718023161"), true);
  assert.equal(cuitValido("20-12345678-6"), true);
  assert.equal(cuitValido("30-71802316-2"), false, "dígito verificador mal");
  assert.equal(cuitValido("12-71802316-1"), false, "prefijo inexistente");
  assert.equal(cuitValido("3071802316"), false, "10 números");
  assert.equal(formatearCuit("30718023161"), CUIT_OK);
});

test("sin datos, o con cualquier otra cosa, se compra como consumidor final", () => {
  assert.deepEqual(normalizarFacturacion(undefined), { tipo: "consumidor_final" });
  assert.deepEqual(normalizarFacturacion({ tipo: "otro", cuit: "1" }), { tipo: "consumidor_final" });
  assert.deepEqual(validarFacturacion(normalizarFacturacion(null)), {});
});

test("a nombre de un CUIT: se piden y se validan los cuatro datos", () => {
  const vacia = validarFacturacion(normalizarFacturacion({ tipo: "cuit" }));
  assert.deepEqual(Object.keys(vacia).sort(), ["facturaCondicionIva", "facturaCuit", "facturaDomicilio", "facturaRazonSocial"]);

  const mal = validarFacturacion(normalizarFacturacion({ tipo: "cuit", razonSocial: "Óptica Sur SA", cuit: "30-71802316-2", condicionIva: "Inventada", domicilioFiscal: "Av. Corrientes 1234, CABA, 1043" }));
  assert.equal(mal.facturaCuit, "Ese CUIT no es válido: revisá los números");
  assert.ok(mal.facturaCondicionIva);

  const bien = normalizarFacturacion({ tipo: "cuit", razonSocial: "  Óptica   Sur SA ", cuit: " 30-71802316-1 ", condicionIva: "IVA Responsable Inscripto", domicilioFiscal: "Av. Corrientes 1234, CABA, 1043" });
  assert.deepEqual(validarFacturacion(bien), {});
  assert.deepEqual(bien, { tipo: "cuit", razonSocial: "Óptica Sur SA", cuit: "30718023161", condicionIva: "IVA Responsable Inscripto", domicilioFiscal: "Av. Corrientes 1234, CABA, 1043" });
});

test("la condición de Harper se lee de Config y no se supone", () => {
  assert.equal(leerCondicionEmisor("Responsable Inscripto"), "Responsable Inscripto");
  assert.equal(leerCondicionEmisor("IVA responsable inscripto"), "Responsable Inscripto");
  assert.equal(leerCondicionEmisor("Monotributo"), "Monotributo");
  assert.equal(leerCondicionEmisor("exento"), "Exento");
  assert.equal(leerCondicionEmisor(""), null);
  assert.equal(leerCondicionEmisor("no sé"), null);
  // "No inscripto" nunca es responsable inscripto.
  assert.equal(leerCondicionEmisor("Monotributo (no inscripto en IVA)"), "Monotributo");
  assert.equal(leerCondicionEmisor("No inscripto"), null);
});

test("la clase sale de las dos condiciones frente al IVA, no de que sea una empresa", () => {
  const ri = "Responsable Inscripto" as const;
  const esperado: Record<string, string> = {
    "IVA Responsable Inscripto": "A",
    "Responsable Monotributo": "A",
    "Monotributista Social": "A",
    "Monotributo Trabajador Independiente Promovido": "A",
    "IVA Sujeto Exento": "B",
    "IVA No Alcanzado": "B",
    "IVA Liberado – Ley N° 19.640": "B",
    "Sujeto No Categorizado": "B",
    "Consumidor Final": "B",
  };
  assert.equal(Object.keys(esperado).length, CONDICIONES_IVA.length);
  for (const condicion of CONDICIONES_IVA) {
    assert.equal(claseDeFactura(ri, condicion), esperado[condicion], `RI a ${condicion}`);
    assert.equal(claseDeFactura("Monotributo", condicion), "C", `monotributo a ${condicion}`);
    assert.equal(claseDeFactura("Exento", condicion), "C", `exento a ${condicion}`);
    assert.equal(claseDeFactura(null, condicion), null, `sin dato a ${condicion}`);
  }
  // Una empresa exenta recibe B aunque sea una empresa.
  const exenta = facturacionDelPedido(normalizarFacturacion({ tipo: "cuit", razonSocial: "Fundación", cuit: CUIT_OK, condicionIva: "IVA Sujeto Exento", domicilioFiscal: "Calle 1 123, La Plata" }), ri);
  assert.equal(exenta.clase, "B");
});

test("los campos del pedido: consumidor final solo lleva condición y clase; a CUIT, todo", () => {
  assert.deepEqual(camposDeFacturacion(facturacionDelPedido(normalizarFacturacion(undefined), "Responsable Inscripto")), {
    Factura_condicion_IVA: "Consumidor Final",
    Factura_clase: "B",
  });
  assert.deepEqual(camposDeFacturacion(facturacionDelPedido(normalizarFacturacion(undefined), null)), {
    Factura_condicion_IVA: "Consumidor Final",
    Factura_clase: "A confirmar",
  });
  const aCuit = facturacionDelPedido(
    normalizarFacturacion({ tipo: "cuit", razonSocial: "Óptica Sur SA", cuit: "30718023161", condicionIva: "Responsable Monotributo", domicilioFiscal: "Av. Corrientes 1234, CABA, 1043" }),
    "Responsable Inscripto"
  );
  const campos = camposDeFacturacion(aCuit);
  assert.deepEqual(campos, {
    Factura_condicion_IVA: "Responsable Monotributo",
    Factura_clase: "A",
    Factura_razon_social: "Óptica Sur SA",
    Factura_CUIT: CUIT_OK,
    Factura_domicilio: "Av. Corrientes 1234, CABA, 1043",
  });
  // Ida y vuelta por Airtable.
  assert.deepEqual(facturacionDeFila(campos), aCuit);
  assert.equal(facturacionDeFila({}), null, "pedidos anteriores, sin estos datos");
});

const config = { razonSocial: "FOCUS VISION SRL", cuit: CUIT_OK, emailContacto: "c@harper.test", emailPedidos: "p@harper.test" } as ConfigTienda;
const base = {
  numero: "HARPER-1",
  items: [],
  subtotal: 89900,
  envio: 0,
  total: 89900,
  cliente: { email: "comprador@ejemplo.com", nombre: "Ana Pérez", telefono: "1100000000", dni: "30123456", direccion: "Núñez 2422", ciudad: "CABA", provincia: "CABA", cp: "1429", aceptaPromos: false },
  config,
  sitio: "https://harper.ar",
  pedidoUrl: "https://airtable.com/x",
};

test("el aviso interno muestra los datos de facturación aparte de los del comprador y la entrega", () => {
  const facturacion = facturacionDelPedido(
    normalizarFacturacion({ tipo: "cuit", razonSocial: "Óptica Sur SA", cuit: "30718023161", condicionIva: "Responsable Monotributo", domicilioFiscal: "Av. Corrientes 1234, CABA, 1043" }),
    "Responsable Inscripto"
  );
  const mail = mailAvisoInterno({ ...base, facturacion });
  assert.match(mail.asunto, /factura a CUIT$/);
  for (const texto of ["Datos de facturación", "Factura A a nombre de un titular con CUIT", "Óptica Sur SA", CUIT_OK, "Responsable Monotributo", "Av. Corrientes 1234, CABA, 1043", "leyenda de la Ley 27.618"]) {
    assert.ok(mail.html.includes(texto), `html: ${texto}`);
  }
  assert.match(mail.texto, /DATOS DE FACTURACIÓN\nFactura A a nombre de un titular con CUIT\nRazón social o titular: Óptica Sur SA\nCUIT: 30-71802316-1/);
  // Los datos de entrega siguen siendo los del comprador.
  assert.match(mail.texto, /Ana Pérez\nNúñez 2422, CABA/);
});

test("consumidor final: el aviso lo dice con la clase, o avisa que falta la condición de Harper", () => {
  const conClase = mailAvisoInterno({ ...base, facturacion: facturacionDelPedido(normalizarFacturacion(undefined), "Responsable Inscripto") });
  assert.match(conClase.texto, /Factura B · Consumidor final, a nombre de quien compra/);
  assert.doesNotMatch(conClase.asunto, /CUIT/);

  const sinClase = mailAvisoInterno({ ...base, facturacion: facturacionDelPedido(normalizarFacturacion(undefined), null) });
  assert.match(sinClase.texto, /Factura: clase a confirmar · Consumidor final/);
  assert.match(sinClase.texto, /falta cargar en Config la condición de Harper frente al IVA \(condicion_iva\)/);

  // Pedidos anteriores, sin datos de facturación: el aviso queda como antes.
  assert.doesNotMatch(mailAvisoInterno(base).texto, /FACTURACIÓN/);
  assert.deepEqual(lineasDeFacturacion(facturacionDelPedido(normalizarFacturacion(undefined), "Monotributo")), [
    "Factura C · Consumidor final, a nombre de quien compra",
  ]);
});

test("si el pedido quedó sin los campos Factura_, el aviso interno lee los datos de Notas", () => {
  const facturacion = facturacionDelPedido(
    normalizarFacturacion({ tipo: "cuit", razonSocial: "Óptica Sur SA", cuit: "30718023161", condicionIva: "IVA Responsable Inscripto", domicilioFiscal: "Av. Corrientes 1234, CABA, 1043" }),
    null
  );
  const notas = `DATOS DE FACTURACIÓN\n${lineasDeFacturacion(facturacion).join("\n")}`;
  const lineas = lineasDeNotas(notas);
  assert.equal(lineas?.[0], "Factura: clase a confirmar a nombre de un titular con CUIT");
  assert.equal(lineasDeNotas("Llamar antes de entregar"), null, "una nota cualquiera no es facturación");
  assert.equal(lineasDeNotas(undefined), null);

  const mail = mailAvisoInterno({ ...base, lineasFacturacion: lineas });
  assert.match(mail.asunto, /factura a CUIT$/);
  assert.match(mail.texto, /DATOS DE FACTURACIÓN\nFactura: clase a confirmar a nombre de un titular con CUIT\nRazón social o titular: Óptica Sur SA\nCUIT: 30-71802316-1/);
  assert.ok(mail.html.includes("Datos de facturación"));
});

test("Monotributo Trabajador Independiente Promovido: A con la leyenda, como los demás monotributistas", () => {
  const p = facturacionDelPedido(
    normalizarFacturacion({ tipo: "cuit", razonSocial: "Juan Pérez", cuit: "20-12345678-6", condicionIva: "Monotributo Trabajador Independiente Promovido", domicilioFiscal: "Calle 1 123, Rosario, Santa Fe" }),
    "Responsable Inscripto"
  );
  assert.equal(p.clase, "A");
  assert.ok(lineasDeFacturacion(p).some((l) => /Ley 27\.618/.test(l)));
});
