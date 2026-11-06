# Scripts de automatizaciones de Airtable

Copias exactas de los scripts que corren en las automatizaciones de la base
Harper (`appcFfhxM8uVdVKoP`). **El que corre es el de Airtable.** Si se cambia
uno, hay que cambiar el otro y volver a correr las pruebas.

| Archivo | Automatización | Qué hace | Pruebas |
|---|---|---|---|
| `fecha-de-entrega.js` | «Fecha de entrega» (`wflZ8rV3CNx6ugq3D`) | Cuando un pedido pasa a «entregado», pone la fecha del día en `Fecha_entrega` si está vacía. Nunca la sobrescribe (plan §18) | `tests/airtable-fecha-entrega.test.ts` |

Las pruebas corren el mismo texto del script con un Airtable simulado: no
tocan la base real.
