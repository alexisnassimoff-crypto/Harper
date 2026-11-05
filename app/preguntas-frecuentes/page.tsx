import type { Metadata } from "next";
import { PreguntasFrecuentes } from "@/components/portada/SeccionesPortada";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { getProductos } from "@/lib/catalogo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA } from "@/lib/confianza";
import { CUPON_BIENVENIDA, HAY_CUPONES } from "@/lib/cupones";
import { NOMBRE_MARCAS } from "@/lib/cuotas";
import { conEspera, verificarCuotasPara } from "@/lib/cuotas-servidor";
import { fraseDeLaEscala, getTramos } from "@/lib/descuentos";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { precio as formatearPrecio } from "@/lib/formato";
import { paresDisponibles } from "@/lib/packs";
import { preguntasDePortada } from "@/lib/portada";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Envíos, cambios, devoluciones, garantía, cuotas y cristales: lo que conviene saber antes de comprar en Harper.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

/**
 * Las preguntas frecuentes, en su página (Ale, 05/11/2026): salieron de la
 * portada para que quede corta. Las mismas respuestas de lib/portada.ts, con
 * los mismos datos de Config, Mercado Pago y Airtable.
 */
export default async function PaginaPreguntas() {
  const [productos, config, tramos] = await Promise.all([getProductos(), getConfig(), getTramos()]);
  const anteojos = productos.filter((p) => esCategoriaDeAnteojos(p.categoria) && paresDisponibles(p.variantes) > 0);
  const cuotas = await conEspera(verificarCuotasPara(anteojos.map((p) => p.precio)), 3_000, null);
  const confirmados = anteojos.length > 0 && anteojos.every((m) => caracteristicasDe(m) !== null);

  return (
    <PreguntasFrecuentes
      preguntas={preguntasDePortada({
        incluye: anteojos[0]?.incluye ?? [],
        caracteristicas: confirmados ? (caracteristicasDe(anteojos[0])?.lista ?? null) : null,
        cuotas,
        nombreMarcas: NOMBRE_MARCAS,
        envioGratisDesde: config.envioGratisDesde,
        envioGratisTexto: formatearPrecio(config.envioGratisDesde),
        envioGratisAmbaTexto:
          config.envioGratisAmbaDesde > 0 && (config.envioGratisDesde <= 0 || config.envioGratisAmbaDesde < config.envioGratisDesde)
            ? formatearPrecio(config.envioGratisAmbaDesde)
            : null,
        hayWhatsapp: Boolean(config.whatsapp),
        diasArrepentimiento: DIAS_ARREPENTIMIENTO,
        diasCambio: DIAS_CAMBIO,
        mesesGarantia: MESES_GARANTIA,
        cupon: HAY_CUPONES ? CUPON_BIENVENIDA : null,
        escala: fraseDeLaEscala(tramos, "Anteojos"),
        porcentajeDineroMP: PORCENTAJE_DINERO_MP,
        suscriptores: true,
      })}
    />
  );
}
