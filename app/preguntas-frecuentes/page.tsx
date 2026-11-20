import type { Metadata } from "next";
import { duoParaAnunciar, duoParaLasPreguntas } from "@/components/portada/duoDelServidor";
import { PreguntasFrecuentes } from "@/components/portada/SeccionesPortada";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { getProductos } from "@/lib/catalogo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA } from "@/lib/confianza";
import { NOMBRE_MARCAS } from "@/lib/cuotas";
import { conEspera, verificarCuotasPara } from "@/lib/cuotas-servidor";
import { fraseDeLaEscala, getTramos } from "@/lib/descuentos";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { precio as formatearPrecio } from "@/lib/formato";
import { paresDisponibles } from "@/lib/packs";
import { preguntasDePortada } from "@/lib/portada";
import {
  creditoActivo,
  DIAS_PARA_LIBERAR_CREDITO,
  MESES_PARA_VENCER_CREDITO,
  PORCENTAJE_CREDITO_UN_ANTEOJO,
  PORCENTAJE_CREDITO_VARIOS,
} from "@/lib/credito-harper";

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
 *
 * Ale, 18/11/2026: las cuotas y el envío son los mismos para todos; la
 * pregunta de la suscripción con beneficios pasó a ser la de la cuenta y las
 * novedades, y la del Dúo aparece solo si el servidor lo tiene prendido, con
 * los importes que cobra por dos anteojos. La del Crédito Harper (qué es,
 * cuánto vuelve, cuándo queda disponible y cuándo vence), solo con
 * HARPER_CREDITO_ACTIVO prendido, con los números del motor (lib/credito-harper.ts).
 */
export default async function PaginaPreguntas() {
  const [productos, config, tramos] = await Promise.all([getProductos(), getConfig(), getTramos()]);
  const anteojos = productos.filter((p) => esCategoriaDeAnteojos(p.categoria) && paresDisponibles(p.variantes) > 0);
  const [cuotas, duo] = await Promise.all([
    conEspera(verificarCuotasPara(anteojos.map((p) => p.precio)), 3_000, null),
    // Null con el Dúo apagado: la página no lo nombra.
    duoParaAnunciar(anteojos),
  ]);
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
        escala: fraseDeLaEscala(tramos, "Anteojos"),
        porcentajeDineroMP: PORCENTAJE_DINERO_MP,
        duo: duoParaLasPreguntas(duo),
        cuenta: true,
        // Null con el Crédito Harper apagado: la página no lo nombra.
        credito: creditoActivo()
          ? { unAnteojo: PORCENTAJE_CREDITO_UN_ANTEOJO, varios: PORCENTAJE_CREDITO_VARIOS, dias: DIAS_PARA_LIBERAR_CREDITO, meses: MESES_PARA_VENCER_CREDITO }
          : null,
      })}
    />
  );
}
