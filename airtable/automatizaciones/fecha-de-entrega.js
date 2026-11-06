// Fecha de entrega (Harper). Pone la fecha del día en «Fecha_entrega» cuando
// el pedido pasa a «entregado» y el campo está vacío. Nunca sobrescribe una
// fecha cargada. No manda mails, no llama a ningún servicio y no cambia el
// Estado. Desde esta fecha corren los 30 días del Crédito Harper.
const TABLA_PEDIDOS = "tbl4HkvPUGzjbdWAe";
const CAMPO_ESTADO = "fldc5zBBzlfMxc1GA";
const CAMPO_FECHA = "fld04ZWywkyXDEXUW";

/** La fecha de hoy en la Argentina, como AAAA-MM-DD. */
function hoyEnArgentina() {
  const partes = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())) {
    partes[p.type] = p.value;
  }
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`No se pudo calcular la fecha de hoy: ${fecha}`);
  return fecha;
}

const { pedidoId } = input.config();
const tabla = base.getTable(TABLA_PEDIDOS);
// Se vuelve a leer el pedido ahora: vale lo que tiene en este momento, no lo
// que tenía cuando se disparó la automatización.
const pedido = await tabla.selectRecordAsync(pedidoId, { fields: [CAMPO_ESTADO, CAMPO_FECHA] });

if (!pedido) {
  output.set("resultado", "sin-pedido");
} else {
  const estado = pedido.getCellValue(CAMPO_ESTADO);
  const fechaCargada = pedido.getCellValue(CAMPO_FECHA);
  if (!estado || estado.name !== "entregado") {
    output.set("resultado", "no-entregado");
  } else if (fechaCargada) {
    output.set("resultado", "ya-tenia-fecha");
    output.set("fecha", String(fechaCargada));
  } else {
    const hoy = hoyEnArgentina();
    await tabla.updateRecordAsync(pedidoId, { [CAMPO_FECHA]: hoy });
    output.set("resultado", "fecha-registrada");
    output.set("fecha", hoy);
  }
}
