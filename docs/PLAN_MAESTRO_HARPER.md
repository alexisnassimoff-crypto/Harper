# Harper Eyewear — Plan maestro de producto, experiencia y crecimiento
**Fecha de definición:** 2026-11-04  
**Estado:** documento de ejecución; no implica que las funcionalidades pendientes estén construidas.  
**Regla operativa:** la rentabilidad neta por pedido, no solo el volumen, gobierna las decisiones.

## 1. Misión y recorrido
Harper es una marca **directa al consumidor (D2C)** de anteojos modernos, buena calidad percibida y relación precio-valor competitiva. No se posiciona como una óptica ni busca captar ópticas como clientes.

**Canales de entrada:** Mercado Libre (principal canal de ventas), Instagram, Google, Meta Ads, referidos y otras campañas. Las campañas propias llevan a **landing pages específicas** que comparten marca, membresía y base de clientes. Las compras realizadas en Mercado Libre se completan allí; cualquier invitación posterior a la web debe cumplir las políticas del marketplace.

**Recorrido deseado:** entrada → producto visible e invitación destacada a suscribirse → descubrimiento de beneficios → elección → compra (permitida aun sin registrarse) → fulfillment y unboxing → posventa → comunicaciones autorizadas, cashback y recompra.

**Membresía:** «suscriptor» y «miembro» son la misma condición. Registro gratuito con nombre, email y cumpleaños opcional; autorización de marketing explícita. Se pueden hacer compras sin registrarse; los beneficios se reservan a miembros. No impedir navegar mediante un formulario obligatorio.

## 2. Pilar: Producto y diseño
- Colección **ya seleccionada**. Líneas: fotocromáticos, sol, receta con o sin graduación y clip-on. Público amplio de jóvenes a adultos.
- Diseño moderno y atractivo; calidad cuidada, sin posicionamiento de bajo costo ni lujo inaccesible.
- Posible protagonista comercial: fotocromáticos y anteojos sin graduación con filtro azul, sujeto a medición.
- No atribuir al filtro azul ventajas médicas no demostradas.
- Ordenar catálogo por categorías y por necesidad; no rehacer la selección de proveedores que ya gestiona el responsable.
- Packaging y unboxing: en diseño, pendiente cerrar especificación y control de empaque.

## 3. Pilar: Experiencia de compra
- **Ficha:** fotografía clara, medidas, guía de talle y calce, beneficios, plazos, dudas frecuentes, garantía y CTA móvil fijo. Referencia aportada: Etnia Barcelona (no reproducir sus promesas de 30 días/36 meses).
- **Probador virtual:** aún por elegir. Evaluar cámara en vivo y carga de foto con criterios de precisión, velocidad, privacidad, costo y fricción. No desarrollar una tecnología propia antes de probar soluciones disponibles. La distancia interpupilar no sustituye validación de calce ni centrado profesional.
- **Asesoramiento:** WhatsApp, sin chatbot incrustado en web. Responsable humano inicialmente atiende en horario laboral; asistente automatizado *en WhatsApp* califica el contacto cuando no esté disponible y preserva contexto.
- **Graduados:** ya existen laboratorio y lista de precios. El cliente elige modelo, podrá guardar una receta de forma privada en su cuenta, solicita cotización por WhatsApp y recibe alternativas según graduación y necesidades. No incluir imágenes de recetas ni datos médicos en URL ni analítica publicitaria. Definir permisos de acceso, retención y seguridad.
- **Cuenta:** reutilizar login por email existente y ampliar con pedidos, favoritos con corazón, recetas privadas, seguimiento, datos opcionales, saldo y beneficios.
- **Fulfillment:** entrega estandarizada y devoluciones con retorno al operador. Inspección de calidad al reingreso **pendiente acordar**; devolver a stock vendible solo tras aprobación de estado.
- **Devoluciones:** decisión 2026-11-04: derecho de arrepentimiento de **10 días corridos** en compras a distancia; costo de envío de devolución a cargo de Harper. Separar política comercial de cambios de color/modelo (actualmente 30 días) del arrepentimiento. No hacer del embalaje original una barrera automática para el arrepentimiento. Revisar jurídicamente excepciones de graduados fabricados a medida, respetando siempre garantía por defectos.
- **Garantía:** comunicar «6 meses de garantía por defectos de fabricación» para productos nuevos, conforme a Ley 24.240 art. 11 (sin restringir otros derechos legales).

## 4. Pilar: Comunicación, confianza y fidelización
- Invitación a suscribirse visible desde la tienda, sin bloquear productos ni checkout.
- Beneficios propuestos: cupón de bienvenida, cashback, envío, ventajas para miembros, sorteos, lanzamientos, cumpleaños, gift cards y referidos.
- **Cashback deseado:** 10% de lo efectivamente pagado por productos en harper.ar, sin envío; ninguna compra en Mercado Libre genera cashback Harper. Compatible con cuotas. El usuario desea no acumularlo con otras promociones, pero debe definir si ello afecta **generación** o **redención** (el código actual permite combinar promoción, cupón y saldo). El usuario evalúa vencimiento de 12 meses; código actual **no vence** y se libera a los 30 días. No cambiar reglas sin decisión económica y validación de saldos.
- Cumpleaños opcional: email automático de saludo con incentivo a definir.
- Email marketing: novedades aproximadamente **cada 15 días** y mensajes por eventos/campañas. Evaluar Klaviyo u otro proveedor **sin duplicar** Airtable como fuente de verdad.
- Giveaways con bases claras, consentimiento y medición de calidad del lead.
- Tarjetón/QR en paquete ML: deseado, pero sujeto a verificación de política de Mercado Libre.
- Meta Pixel/CAPI están **implementados en código**, aún falta prueba real en Events Manager y deduplicación. Evaluar medición y creatividad para Meta, Google y otros canales antes de escalar gasto. TikTok Shop se adopta solo si se confirma disponibilidad operativa para Argentina.

## 5. Qué existe en GitHub (verificado en main al 2026-11-04)
- Next.js, Airtable, Mercado Pago y webhook, estado de pagos, stock, envío, Mercado Libre, Meta Pixel/CAPI, suscripción por código email, cupón, saldo/cashback, cuenta básica, botón de arrepentimiento, CTA móvil. La existencia de código **no confirma** que funcione en producción.
- Referencias: `app/suscriptores/mi-cuenta/page.tsx`, `components/suscriptores/FormularioSuscripcion.tsx`, `lib/suscriptores.ts`, `lib/meta.ts`, `lib/pixel.ts`, `app/api/health/route.ts`.
- `app/estuches/page.tsx` y `app/panos/page.tsx` devuelven 404 si Airtable no publica productos de esas categorías. El PR #45 documenta venta de estuches y paños solo en ML desde 2026-11-03. Verificar siempre datos de producción antes de afirmar ausencia absoluta.
- **No constatado como funcionalidad implementada** en la revisión: favoritos persistentes, recetas privadas en cuenta, cumpleaños y campañas automáticas, probador virtual, tablero consolidado de conversiones y rentabilidad.

## 6. Tablero mínimo de métricas (sin cifras inventadas)
**Fuente de verdad:** pedidos acreditados, productos, devoluciones y costos en Airtable. Meta/Google sirven para atribución y optimización, pero **no** sustituyen las ventas efectivamente cobradas.

| KPI | Definición / fórmula | Fuente mínima |
| --- | --- | --- |
| Sesiones | Sesiones web por fuente/medio/campaña | Analítica web (a implementar o verificar) |
| Tasa de registro | Nuevos miembros confirmados / visitas a la landing | Web + Airtable suscriptores |
| Vistas de producto | Eventos de vista por SKU/modelo | Analítica web |
| Add-to-cart rate | Sesiones con agregado / sesiones web | Analítica |
| Inicio checkout | Sesiones que inician checkout / sesiones | Analítica |
| Conversión web | Pedidos web **acreditados** / sesiones web | Airtable + analítica |
| Pedidos ML | Pedidos acreditados y no cancelados originados en ML | ML + Airtable |
| Ticket promedio (AOV) | Ingreso de productos neto de descuentos / pedidos acreditados, separados ML/web | Airtable |
| Facturación neta | Cobros netos menos devoluciones; mostrar IVA por separado | Airtable / contabilidad |
| Margen contribución/pedido | Venta neta de IVA - costo del producto - medios de pago - comisiones - fulfillment - envío a cargo - devolución esperada - cashback devengado | Costeo + pedidos |
| CAC (primer comprador) | Gasto atribuible de publicidad / compradores nuevos atribuibles; etiquetar limitaciones | Plataformas ads + Airtable |
| ROAS observado | Ventas atribuidas / gasto ads en mismo intervalo y ventana | Meta/Google/ML |
| Cashback | Saldo emitido, habilitado, usado, anulado y pendiente | Airtable |
| Retención / recompra | Compradores con 2+ compras / compradores de cohorte; ventanas 30/90/180 días | Airtable |
| Retornos y garantía | Pedidos devueltos y fallas reportadas / pedidos entregados | Airtable + logística |
| Servicio | Tiempo de primera respuesta, consultas calificadas y cierres por WhatsApp | WhatsApp / CRM |
| Rendimiento | Core Web Vitals y tasa de error en checkout | Vercel / medición web |

Separar reportes por **fuente, campaña, dispositivo, categoría, nuevos vs. recurrentes y canal de cierre**. Atribución no equivale a causalidad: evitar sumar conversiones atribuidas de múltiples plataformas como si fueran ventas únicas.

## 7. Backlog propuesto para Codex (PR pequeños, sin rehacer lo existente)
**P0 — Una sola validación de salida a producción**
1. Comparar `main` con despliegue real y revisar `/api/health` sin mostrar credenciales.
2. Simular registro, checkout, pago de prueba, confirmación, stock, cashback, cancelación y devolución.
3. Revisar Meta Events Manager: PageView, ViewContent, AddToCart, InitiateCheckout y Purchase; Pixel/CAPI deduplicados.
4. Revisar textos de devoluciones/garantías y actualizar los tests correspondientes.

**P1 — Medición y miembros (primero reutilizar)**
5. Definir esquema de eventos y dashboard semanal en Airtable / fuente analítica; instrumentar solo eventos faltantes, con consentimiento.
6. Ampliar cuenta: historial de pedidos y favoritos; probar control de acceso entre usuarios.
7. Cumpleaños opcional con automatización consentida.
8. Recetas: almacenamiento de archivos privados, controles de acceso y eliminación; cotización por WhatsApp con referencia segura.

**P2 — Conversión, comunidad y experimentación**
9. Landings por campaña y captura de origen; pruebas controladas de CTA de suscripción.
10. Selección de proveedor de probador virtual (cámara/foto); prototipo con pocos modelos.
11. Automatizaciones de email (bienvenida, cumpleaños, después de compra, recompra), sin duplicar contactos y bajas.
12. Gift cards, sorteos, referidos, devoluciones en cuenta y protocolo de inspección con logística.

## 8. Criterios para trabajar con Codex
- Leer primero `CLAUDE.md` y este documento, luego inspeccionar **solo archivos relevantes** de cada tarea.
- No realizar auditorías globales repetitivas ni reescribir checkout, webhook, stock, miembros o Meta sin una falla probada.
- Una tarea = un alcance claro, tests, demo breve y PR en rama propia; **nunca fusionar ni desplegar automáticamente sin revisión**.
- Toda métrica debe explicar fuente, fórmula, período, limitaciones y resultado.
- No incluir tokens, contraseñas, recetas, datos personales reales ni datos secretos en commits/issues públicos.
- Actualizar este documento tras decisiones confirmadas; separar hechos, hipótesis y pendientes.
