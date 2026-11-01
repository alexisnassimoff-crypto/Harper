# Harper: instrucciones para Claude

Además de la tienda (harper.ar), este repo tiene el sistema con el que Claude
asesora a Ale en Mercado Libre (métricas, agente de preguntas, plan de Full,
resumen semanal). El negocio vive en la base de Airtable **Harper**
(`appcFfhxM8uVdVKoP`).

## Al empezar cualquier conversación sobre el negocio

1. Leer la tabla **Pendientes** (`tblAMt8vVWOBORCPo`) y la tabla
   **Decisiones** (`tbljuMCTM1vkBM16r`).
2. Si hace falta, mirar los datos: **Metricas ML** (`tblBsnFGfuDJdgzAO`),
   **Anuncios ML** (`tblqegsPcKPH5PyTR`), **Preguntas ML** (`tblnAnZxDI5VlWaQ3`),
   **Datos del negocio** (`tblUoWPVIPkgVQPRJ`), **Costos ML**
   (`tblEkjLXaXO1Fy0zd`), **Envios a Full** (`tblBHkTmGdlr3fdyj`) y
   **Competencia** (`tblFbqlG2S0qooix7`, se lee con `/api/ml/competencia`) y
   **Promociones ML** (`tblC8MCMjIVqsp0YQ`, la llenan `/api/ml/promociones` y
   la actualización diaria).
3. **Al final de cada respuesta, repetir los pendientes de Ale** que sigan sin
   hacer, hasta que Ale confirme que los hizo. Cuando confirme, marcar la fila
   «Hecha» con la fecha en `Hecha_el`.

## Cómo recomendar

- Cada recomendación lleva el dato en que se basa, el razonamiento, qué
  resultado mostraría que estaba mal y cómo se mide. Si no hay dato, decir que
  es una hipótesis.
- Pocas recomendaciones, no listas de opciones. Preguntar antes de suponer.
- Lo que se decide va a la tabla Decisiones con fecha de revisión; lo que
  alguien tiene que hacer, a Pendientes.
- Si una estimación resulta equivocada, corregirla en la bitácora y decirlo.

## Dónde está cada cosa

- Archivos de Ale: Google Drive, carpeta «Harper – Asesor»
  (`1ol7_D1wEHvcBrPGrzYYvRXJ1rxppTYQr`). Ahí está el modelo de márgenes
  (`Harper_Margen_MercadoLibre.xlsx`).
- Parámetros de Full: tabla Config, claves `full_*`.
- El token de Mercado Libre vive en Config y lo usa solo el servidor. No usarlo
  a mano en comandos: los datos se leen de las tablas que llena
  `/api/ml/metricas` todos los días.
