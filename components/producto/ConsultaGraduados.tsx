import { enlaceWhatsApp, mensajeGraduadosModelo, TEXTO_GRADUADOS_FICHA } from "@/lib/whatsapp";

/**
 * La invitación a consultar por cristales graduados, en la ficha de los
 * modelos cuyo armazón los admite. Discreta: una línea y un enlace a
 * WhatsApp con el modelo en el mensaje. No vende ni cobra nada.
 */
export default function ConsultaGraduados({ modelo, whatsapp }: { modelo: string; whatsapp: string | null }) {
  const enlace = enlaceWhatsApp(whatsapp, mensajeGraduadosModelo(modelo));
  if (!enlace) return null;

  return (
    <p className="consulta-graduados">
      <span className="consulta-graduados__pregunta">{TEXTO_GRADUADOS_FICHA.pregunta}</span>{" "}
      {TEXTO_GRADUADOS_FICHA.explicacion}{" "}
      <a href={enlace} target="_blank" rel="noopener noreferrer" className="consulta-graduados__enlace">
        {TEXTO_GRADUADOS_FICHA.accion}
      </a>
    </p>
  );
}
