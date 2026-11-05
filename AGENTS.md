# Instrucciones para agentes de código (Codex y similares)

Antes de implementar una tarea de Harper:

1. Leer `CLAUDE.md` y `docs/PLAN_MAESTRO_HARPER.md`. Diferenciar **decisiones confirmadas**, **hipótesis** y **pendientes**.
2. Inspeccionar solo los archivos relacionados con la tarea. **No repetir auditorías generales** ni reconstruir funciones existentes sin evidencia de fallas.
3. Trabajar en ramas y PR por alcance pequeño, sin fusionar ni desplegar cambios por cuenta propia. No editar `main` directamente.
4. Incluir pruebas para comportamiento nuevo, ejecutar `npm run typecheck`, `npm test` y `npm run build` cuando el entorno lo permita. Si no se ejecutan, declararlo.
5. En cada entrega describir: antes/después, archivos, pruebas, riesgos, cómo validar y cómo revertir.
6. Prioridad económica: margen neto por pedido y conversión acreditada, no volumen o ROAS aislado. No inventar cifras, certificaciones ni testimonios.
7. Proteger registros de clientes, recetas graduadas, consentimientos y credenciales. Nunca guardar tokens o datos de salud en el repositorio, URL compartibles o eventos de marketing.
8. Mantener alineados los textos de portada, legales, descuentos y cashback con su **fuente única de código** y con los tests.
