"use client";

import { useEffect } from "react";
import { medir, type EventoDeMedicion } from "@/lib/medir";

/** Cuenta un paso del embudo al abrirse la página (lib/medir.ts). */
export default function Medir({ evento, clave }: { evento: EventoDeMedicion; clave?: string }) {
  useEffect(() => {
    medir(evento, { clave });
  }, [evento, clave]);
  return null;
}
