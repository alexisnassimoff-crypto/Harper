# Programa Harper: reglas comerciales y transición (Tarea 02)

**Estado:** **programa aprobado por Ale el 05/11/2026** (cierre de la
Tarea 02). Todavía no hay nada implementado. Este documento no cambia
precios, descuentos, créditos, checkout, Airtable ni las condiciones
publicadas. La implementación va en tareas separadas.

**Qué marca cada cosa:**

- **Definido:** lo decidió Ale.
- **A validar:** necesita una revisión legal u operativa antes de activar el
  programa. Están todas juntas en §14.
- **Debajo del piso:** un caso evaluado que deja menos del 22 %. El 22 % es
  una referencia para monitorear. **No frena el lanzamiento ni bloquea el
  checkout** (Ale, 05/11/2026).
- **No llega a la meta:** un caso que deja menos de $ 24.000 por anteojo.
  Es una meta, no una condición para lanzar.
- **Hipótesis:** un escenario para pensar, no un resultado garantizado. Por
  ejemplo, las tasas de recompra de A.8.

**Hay dos análisis en el documento:**

- **La sección A tiene los números de la política aprobada.** Usa el costo
  de $ 10.208, el 5 % de crédito en la compra individual y cuatro precios.
- **Las secciones 0 a 13 conservan el análisis anterior.** Usan el costo de
  $ 9.570, la compra individual sin crédito y el precio de $ 89.900. Sus
  números quedan como referencia.
  - Sus reglas siguen valiendo: envío, cuotas, Dúo, transición,
    devoluciones y validaciones.
  - La excepción es lo que cambia la sección A: la compra de un anteojo
    genera 5 % (ver A.10).

## Decisión final (Ale, 05/11/2026)

**Precios:**

- **Los modelos actuales mantienen sus precios publicados.** No se modifica
  ninguno.
- Los próximos modelos podrán lanzarse a precios más altos, que se definirán
  cuando lleguen.
- **El objetivo de USD 15 por anteojo ($ 24.000) es una meta,** no una
  condición para frenar el lanzamiento.
- **El 22 % es una referencia financiera para monitorear,** no un bloqueo
  automático del checkout.

**Programa Harper aprobado:**

- **1 anteojo:** 5 % de Crédito Harper.
- **2 o más anteojos:** 25 % de descuento sobre los pares elegibles de
  menor precio (con 3 pares, uno; con 4, dos; con 5, dos; con 6, tres),
  más 10 % de Crédito Harper.
- **Las recompras** también tienen estos beneficios.
- **Sin tope.**
- **Base:** lo efectivamente pagado en anteojos. Se excluyen el crédito
  usado, el envío, los estuches y los paños.
- **Generación y liberación:** se crea pendiente al acreditarse el pago.
  Se libera 30 días después de la entrega confirmada, sin devoluciones ni
  incidencias pendientes.
- **Cuotas:** hasta 6 sin interés para todos, cuando Mercado Pago las
  confirma.
- **Clientes anteriores:** se respetan los créditos, los cupones y las
  condiciones anteriores.

---

## Resumen ejecutivo

**La pregunta:** cuánto se puede invertir en fidelización sin destruir la
rentabilidad, y qué tiene que pasar para que esa inversión se recupere.

**Resultados.** Con CAC de $ 20.000 por pedido, 6 cuotas, costo de $ 10.208
y el peor envío de cada caso:

1. **A $ 89.900, ningún escenario llega a $ 24.000 por anteojo.**
   - La compra individual con 5 % no llega ni al piso del 22 % cuando Harper
     paga el envío de GBA 2 y 3: deja $ 14.109 (19,0 %).
   - La segunda compra individual tampoco: 20,2 %.
   - Esos dos casos quedan **debajo del piso**: se lanzan igual y se
     monitorean.
2. **Los $ 24.000 por anteojo dependen sobre todo del precio y del CAC, no
   del crédito.**
   - Sin crédito, la compra individual de $ 89.900 deja $ 17.824.
   - El 5 % cuesta entre $ 3.715 y $ 4.541 por pedido.
3. **Por precio:**
   - **$ 99.900:** todos los escenarios superan el 22 %. Ninguno llega a
     $ 24.000 en el peor envío.
   - **$ 104.900:** llegan las segundas compras. Las primeras quedan cerca:
     $ 23.089 la individual y $ 23.748 por anteojo el Dúo.
   - **$ 109.900:** los cuatro escenarios superan el 22 % y los $ 24.000,
     con todos los envíos evaluados.
4. **El Dúo con 10 % supera el 22 % a los cuatro precios y con todos los
   envíos evaluados:** 25,3 % o más.
5. **Las recompras que no cuestan otros $ 20.000 dejan mucho más.** Si traer
   una recompra cuesta $ 10.000, la recompra individual de $ 89.900 deja
   $ 25.022 por anteojo. El costo comercial real todavía no está medido.
6. **Hipótesis, no resultado garantizado: el crédito se recupera si genera
   compras que no habrían pasado sin él.**
   - **El 5 % individual** necesitaría que entre el 11 % y el 25 % de las
     veces que se usa sea una compra de ese tipo.
   - **El 10 % del Dúo** necesitaría entre el 22 % y el 35 %.
   - Si no, el crédito es un descuento sobre una compra que iba a ocurrir
     igual.
   - No hay tasas reales de recompra. Se van a saber con la medición de
     A.9.

**Decisión** (Ale, 05/11/2026; detalle en A.9):

- Se aprueba el programa con el 5 % individual y los precios actuales.
- Los casos que quedan debajo del piso o de la meta se monitorean; no
  frenan el lanzamiento.
- Los próximos modelos podrán salir a precios más altos.

---

## A. Crédito Harper para todos los compradores (aprobado)

### A.1 La política (Ale, 05/11/2026)

**La prioridad** es una marca con clientes que vuelvan, no solo el margen de
la primera compra. **El objetivo** es que nadie quede afuera de la
fidelización por llevar un solo anteojo.

**Las recompensas:**

- **Compra de 1 anteojo:** 5 % de Crédito Harper.
- **Compra de 2 o más anteojos:** 25 % de descuento en los pares elegibles
  de menor precio (la regla de §5.3), más 10 % de Crédito Harper.
- **Las dos recompensas** valen también en las compras futuras.
- **Sin tope.**

**Cómo se calcula:**

- Sobre lo efectivamente pagado en anteojos, después de los descuentos y del
  crédito usado.
- Nunca sobre el propio crédito usado, ni sobre estuches, paños o envío.

**Cuándo se puede usar:**

- Se genera pendiente al acreditarse el pago.
- Pasa a disponible 30 días después de la entrega confirmada, sin
  devoluciones ni incidencias pendientes.
- El crédito nuevo no vence, por ahora.

**Clientes anteriores:** se mantienen sus derechos y saldos (§11).

**Qué cambia respecto de la versión anterior:** solo la compra de un
anteojo. Antes no generaba crédito; ahora genera 5 %, también en las
recompras. Lo demás queda igual.

### A.2 El objetivo y cómo se mide

**El objetivo:** USD 15 por anteojo × $ 1.600 = **$ 24.000 de contribución
por anteojo**, después de costos variables y publicidad, antes de gastos
fijos e impuestos adicionales.

**El piso:** el 22 % sobre la venta neta de IVA es la referencia mínima, no
el objetivo.

**Tres cosas distintas que no hay que confundir:**

| Concepto | Qué es | Dónde está |
|---|---|---|
| **Contribución por pedido** | Venta neta de IVA menos producto, preparación, envío, Mercado Pago, cuotas, IIBB, devoluciones, el crédito nuevo y la publicidad | La calcula el motor |
| **Contribución por anteojo** | La del pedido dividida por los anteojos del pedido | Es la que se compara con $ 24.000 |
| **Ganancia neta final** | La contribución menos gastos fijos e impuestos adicionales, por ejemplo Ganancias | Este documento no la calcula |

**El crédito pesa una sola vez:** como costo en la compra que lo genera. La
compra que lo usa no lo vuelve a restar (regla del PR #59). Por eso, en una
recompra, lo cobrado baja (se cobra menos) pero la contribución no.

### A.3 Supuestos

- **Motor:** `lib/contribucion.ts`, sin cambios. El costo se le pasa como
  parámetro.
- **Costo por anteojo** puesto con estuche: USD 6,38 × $ 1.600 =
  **$ 10.208**. Se tomó sin IVA, como el costo anterior. Si incluye IVA, hay
  que recalcular.
- **CAC:** $ 20.000 por pedido en la primera compra. En las recompras,
  $ 20.000 como caso conservador, y costos comerciales menores en A.5 y A.6.
- **Cuotas:** 6 sin interés en todos los casos, que es lo más exigente.
- **Otros costos:** Mercado Pago 3,39 %, 6 cuotas 10,3 %, IIBB 3 %,
  devoluciones 3 % y preparación $ 2.000.
- **Envío, con las reglas de hoy:**
  - **AMBA, gratis:** CABA $ 4.488 y GBA 2 y 3 $ 9.075. Son las tarifas de
    `lib/rueddo.ts`; las vigentes se verifican al implementar.
  - **Resto del país, a $ 10.000 y $ 15.000:** la compra individual (menos
    de $ 150.000) paga el envío cotizado más 10 %. El Dúo supera los
    $ 150.000 a los cuatro precios y tiene envío gratis.
- **Precios:** $ 89.900, $ 99.900, $ 104.900 y $ 109.900, con los dos
  anteojos del Dúo al mismo precio. **Son escenarios: no cambian ningún
  precio.** El modelo no sabe cuánto se vende a cada precio.
- **El crédito** se usa entero en la compra siguiente.
- **El peor envío** de la compra individual es el gratis de GBA 2 y 3, que
  paga Harper. El del Dúo es el gratis de $ 15.000.
- **Las tablas completas,** con los cuatro envíos, están en el Anexo A.

### A.4 Primera y segunda compra

En el peor envío. Las tablas con los cuatro envíos están en el Anexo A, de
A-1 a A-4.

| Escenario | Precio | Cobrado | Crédito nuevo | Contribución del pedido | Por anteojo | Margen | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|
| 1. Primera individual, 5 % | $ 89.900 | $ 89.900 | $ 4.495 | $ 14.109 | $ 14.109 | 19,0 % | ✗ | ✗ |
|  | $ 99.900 | $ 99.900 | $ 4.995 | $ 20.096 | $ 20.096 | 24,3 % | ✓ | ✗ |
|  | $ 104.900 | $ 104.900 | $ 5.245 | $ 23.089 | $ 23.089 | 26,6 % | ✓ | ✗ |
|  | $ 109.900 | $ 109.900 | $ 5.495 | $ 26.082 | $ 26.082 | 28,7 % | ✓ | ✓ |
| 2. Primer Dúo, 25 % + 10 % | $ 89.900 | $ 157.325 | $ 15.733 | $ 32.866 | $ 16.433 | 25,3 % | ✓ | ✗ |
|  | $ 99.900 | $ 174.825 | $ 17.483 | $ 42.619 | $ 21.310 | 29,5 % | ✓ | ✗ |
|  | $ 104.900 | $ 183.575 | $ 18.358 | $ 47.496 | $ 23.748 | 31,3 % | ✓ | ✗ |
|  | $ 109.900 | $ 192.325 | $ 19.233 | $ 52.372 | $ 26.186 | 32,9 % | ✓ | ✓ |
| 3. Segunda individual: usa el 5 % anterior y genera otro 5 % | $ 89.900 | $ 85.405 | $ 4.270 | $ 15.022 | $ 15.022 | 20,2 % | ✗ | ✗ |
|  | $ 99.900 | $ 94.905 | $ 4.745 | $ 21.110 | $ 21.110 | 25,6 % | ✓ | ✗ |
|  | $ 104.900 | $ 99.655 | $ 4.983 | $ 24.154 | $ 24.154 | 27,9 % | ✓ | ✓ |
|  | $ 109.900 | $ 104.405 | $ 5.220 | $ 27.198 | $ 27.198 | 29,9 % | ✓ | ✓ |
| 4. Segundo Dúo: usa el 10 % anterior y genera otro 10 % | $ 89.900 | $ 141.592 | $ 14.159 | $ 36.711 | $ 18.356 | 28,2 % | ✓ | ✗ |
|  | $ 99.900 | $ 157.342 | $ 15.734 | $ 46.892 | $ 23.446 | 32,5 % | ✓ | ✗ |
|  | $ 104.900 | $ 165.217 | $ 16.522 | $ 51.982 | $ 25.991 | 34,3 % | ✓ | ✓ |
|  | $ 109.900 | $ 173.092 | $ 17.309 | $ 57.072 | $ 28.536 | 35,9 % | ✓ | ✓ |

**Debajo del piso (a monitorear).** La compra individual de $ 89.900,
primera y segunda, con envío gratis de GBA 2 y 3: 19,0 % y 20,2 %. Superan
el 22 % con el envío de CABA o cuando el cliente paga el envío (Anexo A-1 y
A-3). Se lanzan igual: el 22 % es una referencia, no un bloqueo.

**No llegan al objetivo de $ 24.000 por anteojo:**

- todos los escenarios de $ 89.900 y de $ 99.900 en el peor envío;
- las primeras compras de $ 104.900.

**Precio mínimo para llegar** (primera compra, CAC de $ 20.000):

| Para llegar a | Caso | Precio mínimo |
|---|---|---|
| El 22 % | Compra individual con envío gratis de GBA 2 y 3 | $ 95.264 |
| $ 24.000 por anteojo | Compra individual con envío gratis de GBA 2 y 3 | $ 106.422 |
| | Compra individual en la que el cliente paga el envío | $ 96.962 |
| | Dúo con envío gratis de GBA 2 y 3 | $ 100.395 |
| | Dúo con envío gratis de $ 15.000 | $ 105.416 |

**La segunda compra deja algo más que la primera,** porque el crédito que
usa ya se pagó y el nuevo es un poco menor.

### A.5 Recompras que no cuestan otros $ 20.000 (mail o CRM)

El cliente que vuelve no siempre necesita otra campaña de adquisición, pero
traerlo **no cuesta cero**. Están los mails, la plataforma, el tiempo y los
descuentos, y ese costo todavía no está medido.

La tabla prueba varios costos comerciales por recompra, en el peor envío.
Cada celda muestra la contribución por anteojo, el margen y dos marcas: si
llega al 22 % y si llega a $ 24.000. Las dos últimas columnas dan el costo
máximo por recompra (por pedido) que deja llegar a cada meta.

| Recompra (peor envío) | Precio | $ 0 (solo referencia) | $ 5.000 | $ 10.000 | $ 15.000 | $ 20.000 | Costo máximo para el 22 % | Costo máximo para $ 24.000 por anteojo |
|---|---|---|---|---|---|---|---|---|
| Individual con crédito (AMBA GBA 2 y 3, gratis) | $ 89.900 | $ 35.022 · 47,1 % · ✓✓ | $ 30.022 · 40,4 % · ✓✓ | $ 25.022 · 33,7 % · ✓✓ | $ 20.022 · 26,9 % · ✓✗ | $ 15.022 · 20,2 % · ✗✗ | $ 18.677 | $ 11.022 |
| Individual con crédito (AMBA GBA 2 y 3, gratis) | $ 99.900 | $ 41.110 · 49,8 % · ✓✓ | $ 36.110 · 43,7 % · ✓✓ | $ 31.110 · 37,7 % · ✓✓ | $ 26.110 · 31,6 % · ✓✓ | $ 21.110 · 25,6 % · ✓✗ | $ 22.946 | $ 17.110 |
| Individual con crédito (AMBA GBA 2 y 3, gratis) | $ 104.900 | $ 44.154 · 50,9 % · ✓✓ | $ 39.154 · 45,2 % · ✓✓ | $ 34.154 · 39,4 % · ✓✓ | $ 29.154 · 33,6 % · ✓✓ | $ 24.154 · 27,9 % · ✓✓ | $ 25.081 | $ 20.154 |
| Individual con crédito (AMBA GBA 2 y 3, gratis) | $ 109.900 | $ 47.198 · 52,0 % · ✓✓ | $ 42.198 · 46,5 % · ✓✓ | $ 37.198 · 41,0 % · ✓✓ | $ 32.198 · 35,5 % · ✓✓ | $ 27.198 · 29,9 % · ✓✓ | $ 27.216 | $ 23.198 |
| Dúo con crédito (resto $ 15.000, gratis) | $ 89.900 | $ 28.356 · 43,6 % · ✓✓ | $ 25.856 · 39,8 % · ✓✓ | $ 23.356 · 35,9 % · ✓✗ | $ 20.856 · 32,1 % · ✓✗ | $ 18.356 · 28,2 % · ✓✗ | $ 28.107 | $ 8.711 |
| Dúo con crédito (resto $ 15.000, gratis) | $ 99.900 | $ 33.446 · 46,3 % · ✓✓ | $ 30.946 · 42,8 % · ✓✓ | $ 28.446 · 39,4 % · ✓✓ | $ 25.946 · 35,9 % · ✓✓ | $ 23.446 · 32,5 % · ✓✗ | $ 35.105 | $ 18.892 |
| Dúo con crédito (resto $ 15.000, gratis) | $ 104.900 | $ 35.991 · 47,4 % · ✓✓ | $ 33.491 · 44,1 % · ✓✓ | $ 30.991 · 40,9 % · ✓✓ | $ 28.491 · 37,6 % · ✓✓ | $ 25.991 · 34,3 % · ✓✓ | $ 38.604 | $ 23.982 |
| Dúo con crédito (resto $ 15.000, gratis) | $ 109.900 | $ 38.536 · 48,5 % · ✓✓ | $ 36.036 · 45,3 % · ✓✓ | $ 33.536 · 42,2 % · ✓✓ | $ 31.036 · 39,1 % · ✓✓ | $ 28.536 · 35,9 % · ✓✓ | $ 42.104 | $ 29.072 |

**Qué muestra:**

- **A $ 89.900, la recompra individual llega:**
  - al 22 %, si cuesta hasta $ 18.677;
  - a $ 24.000 por anteojo, si cuesta hasta $ 11.022.
- **A $ 89.900, la recompra Dúo** solo llega a $ 24.000 por anteojo si cuesta
  hasta $ 8.711.
- **Desde $ 104.900,** las dos recompras llegan a las dos metas aun con un
  costo de $ 20.000.

### A.6 El cliente en una, dos y tres compras

**Supuestos:**

- envío gratis de $ 9.075 (AMBA, GBA 2 y 3) en todas las compras;
- 6 cuotas;
- CAC de $ 20.000 en la primera compra;
- cada compra usa todo el crédito disponible de la anterior;
- el crédito se cuenta una sola vez, en la compra que lo genera.

El detalle compra por compra, con lo cobrado, el crédito usado, el crédito
nuevo y la contribución, está en el Anexo A-5.

**Cómo se mueve el crédito.** Ejemplo: tres Dúos de $ 99.900.

| Compra | Usa | Genera | Contribución del pedido | Acumulada por anteojo |
|---|---|---|---|---|
| 1 | $ 0 | $ 17.483 | $ 47.516 | $ 23.758 |
| 2 | $ 17.483 | $ 15.734 | $ 51.789 | $ 24.826 |
| 3 | $ 15.734 | $ 15.909 | $ 51.361 | $ 25.111 |

- Lo que se genera es parecido a lo que se usa, así que el crédito no se
  acumula sin control.
- Los $ 15.909 de la tercera compra quedan pendientes, pero ya están
  cargados como costo en ese pedido.

**Acumulado después de tres compras, según cuánto cueste cada recompra.**
Cada celda: contribución acumulada por anteojo · margen acumulado · 22 % y
$ 24.000.

| Recorrido | Precio | Recompras a $ 20.000 | $ 10.000 | $ 5.000 |
|---|---|---|---|---|
| Individual, individual, individual | $ 89.900 | $ 14.703 · 19,8 % · ✗✗ | $ 21.369 · 28,8 % · ✓✗ | $ 24.703 · 33,2 % · ✓✓ |
|  | $ 99.900 | $ 20.755 · 25,1 % · ✓✗ | $ 27.422 · 33,2 % · ✓✓ | $ 30.755 · 37,3 % · ✓✓ |
|  | $ 104.900 | $ 23.781 · 27,4 % · ✓✗ | $ 30.448 · 35,1 % · ✓✓ | $ 33.781 · 39,0 % · ✓✓ |
|  | $ 109.900 | $ 26.807 · 29,5 % · ✓✓ | $ 33.474 · 36,9 % · ✓✓ | $ 36.807 · 40,5 % · ✓✓ |
| Dúo, Dúo, Dúo | $ 89.900 | $ 20.099 · 30,9 % · ✓✗ | $ 23.432 · 36,0 % · ✓✗ | $ 25.099 · 38,6 % · ✓✓ |
|  | $ 99.900 | $ 25.111 · 34,8 % · ✓✓ | $ 28.444 · 39,4 % · ✓✓ | $ 30.111 · 41,7 % · ✓✓ |
|  | $ 104.900 | $ 27.617 · 36,4 % · ✓✓ | $ 30.950 · 40,8 % · ✓✓ | $ 32.617 · 43,0 % · ✓✓ |
|  | $ 109.900 | $ 30.123 · 37,9 % · ✓✓ | $ 33.456 · 42,1 % · ✓✓ | $ 35.123 · 44,2 % · ✓✓ |
| Individual, Dúo, Dúo | $ 89.900 | $ 18.894 · 28,3 % · ✓✗ | $ 22.894 · 34,2 % · ✓✗ | $ 24.894 · 37,2 % · ✓✓ |
|  | $ 99.900 | $ 24.100 · 32,4 % · ✓✓ | $ 28.100 · 37,8 % · ✓✓ | $ 30.100 · 40,5 % · ✓✓ |
|  | $ 104.900 | $ 26.703 · 34,2 % · ✓✓ | $ 30.703 · 39,4 % · ✓✓ | $ 32.703 · 41,9 % · ✓✓ |
|  | $ 109.900 | $ 29.306 · 35,9 % · ✓✓ | $ 33.306 · 40,7 % · ✓✓ | $ 35.306 · 43,2 % · ✓✓ |
| Dúo, individual, individual | $ 89.900 | $ 17.482 · 25,1 % · ✓✗ | $ 22.482 · 32,3 % · ✓✗ | $ 24.982 · 35,9 % · ✓✓ |
|  | $ 99.900 | $ 23.023 · 29,7 % · ✓✗ | $ 28.023 · 36,2 % · ✓✓ | $ 30.523 · 39,4 % · ✓✓ |
|  | $ 104.900 | $ 25.794 · 31,7 % · ✓✓ | $ 30.794 · 37,9 % · ✓✓ | $ 33.294 · 41,0 % · ✓✓ |
|  | $ 109.900 | $ 28.565 · 33,5 % · ✓✓ | $ 33.565 · 39,4 % · ✓✓ | $ 36.065 · 42,4 % · ✓✓ |

**Qué muestra:**

- **El cliente que compra de a un anteojo a $ 89.900 no llega al 22 %** si
  cada recompra cuesta $ 20.000: queda en 19,8 % después de tres compras.
  - Con recompras a $ 10.000 llega al piso.
  - Con recompras a $ 5.000 llega a $ 24.000 por anteojo.
- **El cliente que vuelve es el que paga el programa:** a cada precio, el
  acumulado mejora a medida que baja el costo de la recompra.

### A.7 Cuánto se puede invertir en fidelización sin destruir la rentabilidad

La tabla muestra, en la primera compra, cuánto deja el pedido **antes** del
crédito y cuánto margen tiene para invertir en crédito sin bajar de cada
meta. Peor envío y CAC de $ 20.000.

| Compra | Precio | Contribución sin crédito | Costo del crédito | Contribución con crédito | Espacio sobre el 22 % | Espacio sobre $ 24.000 por anteojo |
|---|---|---|---|---|---|---|
| Individual, 5 % (AMBA GBA 2 y 3) | $ 89.900 | $ 17.824 | $ 3.715 | $ 14.109 | $ 1.479 | −$ 6.176 |
| | $ 99.900 | $ 24.224 | $ 4.128 | $ 20.096 | $ 6.060 | $ 224 |
| | $ 104.900 | $ 27.424 | $ 4.335 | $ 23.089 | $ 8.351 | $ 3.424 |
| | $ 109.900 | $ 30.624 | $ 4.541 | $ 26.082 | $ 10.642 | $ 6.624 |
| Dúo, 10 % (resto $ 15.000) | $ 89.900 | $ 45.869 | $ 13.002 | $ 32.866 | $ 17.264 | −$ 2.131 |
| | $ 99.900 | $ 57.068 | $ 14.449 | $ 42.619 | $ 25.282 | $ 9.068 |
| | $ 104.900 | $ 62.668 | $ 15.172 | $ 47.496 | $ 29.291 | $ 14.668 |
| | $ 109.900 | $ 68.268 | $ 15.895 | $ 52.372 | $ 33.299 | $ 20.268 |

**La respuesta: el crédito entra sin romper la meta cuando su costo es menor
que el espacio.**

- **A $ 89.900:**
  - el 5 % individual ($ 3.715) supera el espacio sobre el piso ($ 1.479);
  - en ninguna de las dos compras hay espacio para el objetivo, ni siquiera
    sin crédito.
- **A $ 99.900:** el crédito entra en el piso, pero no en el objetivo.
- **A $ 104.900:** entra en el piso. Le faltan unos $ 900 (individual) y
  $ 500 (Dúo) para el objetivo.
- **A $ 109.900:** entra en las dos metas.

### A.8 Qué tendría que pasar para que el crédito se recupere (hipótesis)

**Todo este apartado es hipotético.** Muestra cuánta recompra extra haría
falta, no cuánta va a haber. No hay tasas reales de recompra, y ningún número
de acá es un resultado garantizado. Las tasas reales salen de la medición de
A.9.

**Cómo se calcula** (para la primera recompra):

- **K** es el costo del crédito que se usa, neto de IVA.
- **G** es lo que deja la recompra, ya con su costo comercial y con el
  crédito nuevo que genera.
- **Si la recompra no habría pasado sin el crédito** (es incremental),
  Harper gana G y gasta K.
- **Si habría pasado igual,** Harper solo gasta K: el crédito fue un
  descuento.
- **El crédito se recupera si, de cada 100 usos, más de 100 × K/G son
  compras incrementales.**
- **Con tasas de recompra:** si sin crédito vuelve el r0 % de los clientes,
  con crédito tiene que volver al menos r0 ÷ (1 − K/G).
- **Aquí el crédito cuesta solo cuando se usa.** En las tablas por pedido se
  supone que se usa todo, que es lo más prudente.

**No hay datos reales de recompra.** Las tasas r0 de 10 %, 20 % y 30 % son
**hipotéticas**, solo para mostrar el cálculo.

| Beneficio | Precio | K | Costo de la recompra | G | Usos incrementales mínimos (K/G) | Recompra necesaria si r0 = 10 % | Si r0 = 20 % | Si r0 = 30 % |
|---|---|---|---|---|---|---|---|---|
| 5 % individual | $ 89.900 | $ 3.715 | $ 20.000 | $ 15.022 | 24,7 % | 13,3 % | 26,6 % | 39,9 % |
| | | | $ 10.000 | $ 25.022 | 14,8 % | 11,7 % | 23,5 % | 35,2 % |
| | | | $ 5.000 | $ 30.022 | 12,4 % | 11,4 % | 22,8 % | 34,2 % |
| 5 % individual | $ 99.900 | $ 4.128 | $ 20.000 | $ 21.110 | 19,6 % | 12,4 % | 24,9 % | 37,3 % |
| | | | $ 10.000 | $ 31.110 | 13,3 % | 11,5 % | 23,1 % | 34,6 % |
| | | | $ 5.000 | $ 36.110 | 11,4 % | 11,3 % | 22,6 % | 33,9 % |
| 5 % individual | $ 104.900 | $ 4.335 | $ 20.000 | $ 24.154 | 17,9 % | 12,2 % | 24,4 % | 36,6 % |
| | | | $ 10.000 | $ 34.154 | 12,7 % | 11,5 % | 22,9 % | 34,4 % |
| | | | $ 5.000 | $ 39.154 | 11,1 % | 11,2 % | 22,5 % | 33,7 % |
| 5 % individual | $ 109.900 | $ 4.541 | $ 20.000 | $ 27.198 | 16,7 % | 12,0 % | 24,0 % | 36,0 % |
| | | | $ 10.000 | $ 37.198 | 12,2 % | 11,4 % | 22,8 % | 34,2 % |
| | | | $ 5.000 | $ 42.198 | 10,8 % | 11,2 % | 22,4 % | 33,6 % |
| 10 % Dúo | $ 89.900 | $ 13.002 | $ 20.000 | $ 36.711 | 35,4 % | 15,5 % | 31,0 % | 46,5 % |
| | | | $ 10.000 | $ 46.711 | 27,8 % | 13,9 % | 27,7 % | 41,6 % |
| | | | $ 5.000 | $ 51.711 | 25,1 % | 13,4 % | 26,7 % | 40,1 % |
| 10 % Dúo | $ 99.900 | $ 14.449 | $ 20.000 | $ 46.892 | 30,8 % | 14,5 % | 28,9 % | 43,4 % |
| | | | $ 10.000 | $ 56.892 | 25,4 % | 13,4 % | 26,8 % | 40,2 % |
| | | | $ 5.000 | $ 61.892 | 23,3 % | 13,0 % | 26,1 % | 39,1 % |
| 10 % Dúo | $ 104.900 | $ 15.172 | $ 20.000 | $ 51.982 | 29,2 % | 14,1 % | 28,2 % | 42,4 % |
| | | | $ 10.000 | $ 61.982 | 24,5 % | 13,2 % | 26,5 % | 39,7 % |
| | | | $ 5.000 | $ 66.982 | 22,7 % | 12,9 % | 25,9 % | 38,8 % |
| 10 % Dúo | $ 109.900 | $ 15.895 | $ 20.000 | $ 57.072 | 27,9 % | 13,9 % | 27,7 % | 41,6 % |
| | | | $ 10.000 | $ 67.072 | 23,7 % | 13,1 % | 26,2 % | 39,3 % |
| | | | $ 5.000 | $ 72.072 | 22,1 % | 12,8 % | 25,7 % | 38,5 % |

**Cómo se lee:** si hoy vuelve el 20 % de los compradores individuales de
$ 89.900, con el 5 % y recompras a $ 10.000 tiene que volver al menos el
23,5 % para que el crédito se pague.

**Sensibilidad a quienes usan el crédito en compras que igual iban a hacer.**
Resultado neto del crédito por cada 100 clientes que lo usan, con recompras
a $ 10.000 y peor envío:

| Beneficio | Precio | 0 % habría comprado igual | 25 % | 50 % | 75 % | 100 % |
|---|---|---|---|---|---|---|
| 5 % individual | $ 89.900 | $ 2.130.737 | $ 1.505.181 | $ 879.625 | $ 254.069 | −$ 371.488 |
| 5 % individual | $ 99.900 | $ 2.698.203 | $ 1.920.450 | $ 1.142.697 | $ 364.943 | −$ 412.810 |
| 5 % individual | $ 104.900 | $ 2.981.894 | $ 2.128.053 | $ 1.274.211 | $ 420.370 | −$ 433.471 |
| 5 % individual | $ 109.900 | $ 3.265.669 | $ 2.335.719 | $ 1.405.768 | $ 475.818 | −$ 454.132 |
| 10 % Dúo | $ 89.900 | $ 3.370.872 | $ 2.203.092 | $ 1.035.312 | −$ 132.468 | −$ 1.300.248 |
| 10 % Dúo | $ 99.900 | $ 4.244.305 | $ 2.822.010 | $ 1.399.714 | −$ 22.581 | −$ 1.444.876 |
| 10 % Dúo | $ 104.900 | $ 4.680.979 | $ 3.131.437 | $ 1.581.894 | $ 32.352 | −$ 1.517.190 |
| 10 % Dúo | $ 109.900 | $ 5.117.737 | $ 3.440.927 | $ 1.764.116 | $ 87.306 | −$ 1.589.504 |

**Qué muestra:**

- **El 5 % individual aguanta mucho** que el crédito se use en compras que
  igual iban a pasar: con recompras a $ 10.000 sigue positivo aunque sea el
  75 %.
- **El 10 % del Dúo cuesta más por uso.** Con el 75 % ya pierde a $ 89.900 y
  a $ 99.900.
- **Si todos los que lo usan iban a comprar igual,** cualquier crédito es
  solo costo.

### A.9 Decisión y qué se monitorea (Ale, 05/11/2026)

**Decisión:**

- **Se aprueba el programa:** 5 % de crédito en la compra de un anteojo y,
  en el Dúo, 25 % de descuento más 10 % de crédito.
- **Los modelos actuales mantienen sus precios publicados.** Los próximos
  podrán salir a precios más altos.
- **El 22 % y los $ 24.000 por anteojo se monitorean.** No frenan el
  lanzamiento ni bloquean el checkout.

**Qué se monitorea:**

1. **La contribución real por pedido y por anteojo,** contra el piso del
   22 % y la meta de $ 24.000.
   - **Dato:** con los precios actuales, la compra individual con envío
     gratis de GBA 2 y 3 queda en 19,0 % ($ 14.109). Ningún escenario llega
     a $ 24.000 (A.4).
   - **Cómo se mide:** el margen del panel por pedido, separando la compra
     individual y el Dúo, y por zona de envío.
2. **La recompra que genera el crédito.**
   - **Hipótesis (A.8):** el 5 % se recupera si entre el 11 % y el 25 % de
     sus usos son compras extra.
   - **Qué mostraría que no se cumple:** que los compradores de un anteojo
     no vuelvan más que antes del programa, o que casi todos los usos sean
     de clientes que igual volvían.
   - **Cómo se mide:** la recompra a 90 días de cada mes de primeras
     compras, separando individual y Dúo, contra los meses anteriores al
     programa.
3. **El costo de cada recompra.**
   - **Dato:** a $ 89.900, la recompra individual llega al 22 % si cuesta
     hasta $ 18.677, y a $ 24.000 por anteojo si cuesta hasta $ 11.022
     (A.5).
   - **Cómo se mide:** el costo mensual del mail o CRM dividido por las
     recompras que trajeron esos mails.

### A.10 Qué cambia en el resto del documento

- **La compra de un anteojo genera 5 %,** también en las recompras. Ya está
  corregido en §1, §3, §5.3, §6, §10.1, §10.2, §10.5, §11, §13.1 y §13.2.
- **Los números de las secciones 4 a 10 son del análisis anterior:** costo
  de $ 9.570 y compra individual sin crédito. Los de la política aprobada
  están en esta sección A.
- **Para los casos que la sección A no recalculó** se mantiene la regla y
  se recalcula al implementar cada parte, con el costo de $ 10.208:
  - el 10 % por dinero en Mercado Pago (§8);
  - el cupón ya dado (§7);
  - los pedidos de 3 o más pares y con precios distintos (§5.2);
  - las devoluciones (§13.2);
  - los topes de envío (§9).
- **Se sumaron tres validaciones a §14:**
  - si USD 6,38 incluye IVA;
  - el costo real de cada recompra;
  - la recompra a 90 días de cada mes de primeras compras.

---

## 0. Cómo leer los números (análisis anterior)

### Parámetros

Los números salen de `lib/contribucion.ts`, el motor del PR #59, con sus
parámetros de referencia:

- precio de $ 89.900 por par y costo de $ 9.570 sin IVA;
- preparación $ 2.000;
- Mercado Pago 3,39 %, más 10,3 % en 6 cuotas (4,5 % en 3);
- IIBB 3 % y reserva por devoluciones 3 %;
- **publicidad (CAC) de $ 20.000 por pedido**, también en la recompra, salvo
  donde se diga;
- **contribución mínima del 22 %** sobre la venta neta de IVA.

### Las celdas

**Cada celda** muestra si llega al 22 % (✓ llega, ✗ no llega), el margen
después de publicidad y **cuánto deja el pedido en pesos**.

**Todo se calcula en 6 cuotas**, que es el caso más exigente. Con 1 o
3 cuotas, el pedido deja más. El dinero en Mercado Pago es en 1 pago.

### El envío sigue las reglas de §1

- **AMBA, envío gratis** (todo pedido con anteojos supera los $ 60.000).
  Harper paga la tarifa de Rueddo con IVA: **CABA $ 4.488, GBA 1 $ 6.498 y
  GBA 2 y 3 $ 9.075**. Son las tres columnas de las filas de AMBA.
  - Salen de las tarifas que figuran en `lib/rueddo.ts` ($ 3.709, $ 5.370 y
    $ 7.500 sin IVA).
  - Las vigentes en la tienda (Config) se tienen que verificar al
    implementar.
- **Resto del país:** costos de prueba de **$ 5.500, $ 10.000 y $ 15.000**,
  los del PR #59.
  - Si el pedido llega a $ 150.000, el envío es gratis y lo paga Harper.
  - Si no llega, el cliente paga lo cotizado más el recargo de Config
    (`envio_resto_recargo`, hoy 10 %).
  - También lo verifiqué sin el recargo, y lo marco donde cambia el
    resultado.
- **Base del umbral:** se mide sobre los productos después del descuento
  Dúo, antes del cupón, del crédito y del 10 % de Mercado Pago. Así se mide
  hoy (`lib/pedidos.ts`).

### Cómo se mide cada combinación

- **Pedido por pedido.** El pedido que genera crédito carga su costo
  completo. El pedido que usa crédito no lo vuelve a restar, porque ya se
  cargó en la compra que lo generó (regla del PR #59).
- **El acumulado del cliente no se usa para aprobar ninguna combinación.**
- En caja, una recompra que usa $ 15.733 cobra eso de menos. Ese costo está
  en el Dúo que lo generó, y ese Dúo también tiene que llegar al 22 % solo.

### De qué depende llegar al 22 %

Este documento no afirma que toda combinación llegue al 22 %: dice cuáles
de las evaluadas llegan, con estos supuestos. El piso depende de:

- el mix de anteojos del pedido y su precio real;
- el costo real del envío gratis;
- el CAC;
- las cuotas.

**Hay casos evaluados que no llegan:**

- un par suelto barato;
- un Dúo de dos pares baratos con envío gratis caro.

Están en §5 y §14 marcados como **debajo del piso**: se monitorean y no
frenan el lanzamiento.

### Hipótesis del modelo

No son datos medidos:

- todos los anteojos cuestan $ 89.900. **El modelo de $ 69.900 que aparece
  en algunos ejemplos es hipotético** y tiene el mismo costo de $ 9.570;
- el crédito se usa entero;
- la comisión de Mercado Pago es la misma con dinero en cuenta;
- la devolución de un par no suma costo de retiro;
- estuches y paños no están modelados.

---

## 1. La política (Ale, 05/11/2026)

1. **Primera compra.** El cliente elige su anteojo y puede pagar **hasta en
   6 cuotas sin interés**, cuando Mercado Pago las confirma para ese monto.
   **Definido.**
2. **Las 6 cuotas son para todos los compradores**, sin obligar a
   suscribirse ni registrarse, en la primera compra y en las recompras,
   siempre que Mercado Pago las confirme para el monto. **Definido.**
3. **Dúo.** Si suma un segundo anteojo, lleva **25 % de descuento en el de
   menor precio**. Se pueden combinar modelos y colores. **Definido.**
   - **Con 3 pares,** el 25 % va sobre uno de los más baratos.
   - **Con 4 pares,** sobre los dos más baratos.
   - **Con 5 o más pares,** sobre los ⌊n/2⌋ de menor precio: dos con 5 y
     tres con 6. **Definido.**
   - La regla con precios distintos está en §5.3.
4. **Crédito Harper:**
   - **cada compra de dos o más anteojos** genera **10 %** de crédito, sin
     tope;
   - **cada compra de un solo anteojo** genera **5 %**, también en las
     recompras (sección A);
   - se calcula sobre lo **efectivamente pagado en anteojos**, después de los
     descuentos y **sin contar el crédito usado**;
   - no se genera sobre estuches, paños ni envío.

   **Definido.**
5. **Cuándo se genera y cuándo se puede usar son dos momentos distintos**
   (§10.2). **Definido.**
   - **Generación:** el crédito se crea **pendiente** en cuanto se acredita
     el pago de un pedido con dos o más anteojos. No se espera 30 días para
     crearlo.
   - **Disponibilidad:** pasa a **disponible** 30 días después de una fecha
     de entrega confiable, sin devoluciones ni incidencias pendientes.
6. **Uso del crédito nuevo:**
   - total o parcial, en compras futuras, **solo en anteojos**;
   - **no paga el envío, ni estuches ni paños**;
   - **no vence**, por ahora.

   **Definido.**
   La fecha de entrega queda **a validar**.
7. **Envío:**
   - **gratis en AMBA desde $ 60.000**;
   - **gratis a todo el país desde $ 150.000**;
   - si el pedido no llega al mínimo, el cliente paga el envío cotizado.

   **Definido.**
8. **Cupón de bienvenida de $ 10.000:** se elimina para las **altas nuevas**
   cuando entre en vigencia el programa nuevo. Los cupones ya dados se
   respetan. **Definido.**
9. **Lo ya ganado y lo ya aceptado:** se respetan los cupones y créditos ya
   dados y las condiciones aceptadas. **El crédito ya ganado sigue con sus
   condiciones originales.** **Definido.**
   - El alcance del saldo antiguo **no se restringe**: sigue sirviendo en
     cualquier producto. **Definido.**
10. **10 % por pagar con dinero en Mercado Pago:** se mantiene por ahora,
    mientras el modelo confirme que es rentable. En los casos evaluados lo
    confirma: ver §8. **Definido.**
11. **La cuenta y el crédito no dependen de aceptar publicidad** (los mails
    de novedades). **Definido.** Cómo se implementa queda **a validar**.
12. **Transición de los suscriptores actuales:** con aviso previo y **sin
    fecha todavía**. **Definido.** El detalle queda **a validar** (§11).
13. **Devoluciones:** todavía no hay ninguna regla de reintegro definitiva
    que pueda interferir con los derechos del consumidor. Necesita una
    revisión legal (§13.2). **A validar.**

**Orden en que se aplican los beneficios.** Es el orden de hoy, el del punto
5 de las condiciones:

1. el Dúo (y los descuentos de estuches y paños);
2. el cupón ya dado, si lo hay;
3. el crédito;
4. el 10 % de dinero en Mercado Pago, sobre lo que queda.

El crédito nuevo es el 10 % de lo que se termina pagando en anteojos.

---

## 2. Las reglas de hoy

### Suscriptores Harper

Fuentes: `lib/suscriptores.ts` y las condiciones publicadas en
`/legales/suscriptores`, versión del 05/11/2026.

- **Alta:** es gratis. Se confirma el mail con un código y hay que aceptar
  recibir mails.
- **Cupón de bienvenida de $ 10.000:**
  - una sola vez, en la primera compra, sobre los productos;
  - no se aplica si ya hay una compra pagada con ese mail o con ese DNI.
- **Cashback del 10 %:**
  - se gana en **todas** las compras como suscriptor;
  - se calcula sobre lo pagado en productos, sin envío y después del cupón y
    del saldo;
  - se puede usar a los **30 días del pago**;
  - no vence, no tiene tope y puede pagar una compra entera.
- **Envío gratis siempre**, sin mínimo.
- **Cuotas sin interés:** hasta 3 para todos y hasta 6 para suscriptores con
  la sesión verificada, cuando Mercado Pago las confirma.
- **Orden de los descuentos:** primero la promoción, después el cupón y
  después el saldo. El 10 % de dinero en Mercado Pago va sobre lo que queda.
- **Devolución o arrepentimiento:**
  - se anula el cashback de esa compra; si ya se usó, el saldo puede quedar
    negativo;
  - lo que se pagó con saldo vuelve al saldo.
- **Baja:**
  - se dejan de recibir mails y de sumar beneficios nuevos (el cupón sin
    usar, el envío gratis y el cashback que viene);
  - el saldo ganado se conserva;
  - si la persona vuelve a suscribirse, recupera los beneficios.
- **Cambios (punto 9 de las condiciones):**
  - la versión nueva se publica con su fecha;
  - a quien le afecte se le avisa por mail antes de que rija;
  - el saldo ya ganado se respeta.

### Dinero en Mercado Pago

Fuente: `lib/dinero-mp.ts`.

- Da un 10 % más sobre los productos, nunca sobre el envío.
- Vale solo con dinero en cuenta, en 1 pago.
- Se suma a la mejor promoción.
- No cambia quién tiene envío gratis.
- El cashback se calcula sobre lo que queda después de ese 10 %.

### Envío para quien no está suscripto

Fuentes: Config, `lib/envio-gratis.ts` y `lib/rueddo.ts`.

- Es gratis en AMBA desde $ 60.000 y en todo el país desde $ 150.000.
- El umbral se mide sobre el subtotal sin cupón.
- Si no es gratis, el comprador paga:
  - en AMBA, la tarifa de Rueddo con IVA más 20 %;
  - en el resto del país, lo que cotiza el transportista más 10 %.

### Otros

- **Descuentos por cantidad:**
  - en anteojos están todos apagados;
  - en estuches y paños están activos: 5 % desde 2, 10 % desde 4, 15 %
    desde 8 y 20 % desde 15.
- **Cupones:** HARPER10 está apagado desde el 30/10/2026 y no hay otros
  activos.
- **Transferencia:** no está activa.
- **Dúo:** hoy no existe. No hay ningún descuento por llevar dos anteojos.

---

## 3. Hoy contra la política nueva

| Tema | Hoy | Política nueva | Estado |
|---|---|---|---|
| Quién recibe los beneficios | Solo quien se suscribe (mail y consentimiento para recibir mails) | Dúo y cuotas: cualquier comprador, sin suscribirse ni registrarse. Crédito: el comprador con su cuenta (mail verificado). Nada depende de aceptar publicidad | **Definido**. Implementación: **a validar** |
| Primera compra de 1 par | Suscriptor: cupón de $ 10.000, cashback del 10 %, envío gratis y hasta 6 cuotas. Quien no se suscribe: hasta 3 cuotas | Precio de lista, hasta 6 cuotas sin interés y 5 % de crédito. Envío según las reglas | **Definido** |
| Dos o más anteojos | Sin descuento | **Dúo:** 25 % en el de menor precio. Con 3 pares, en uno de los más baratos. Con 4, en los dos más baratos. Con 5 o más, en los ⌊n/2⌋ más baratos | **Definido** |
| Cupón de bienvenida | $ 10.000 en la primera compra de cada suscriptor | Ya no se da en las altas nuevas. Los ya dados se respetan | **Definido** |
| Crédito | 10 % en **cada** compra como suscriptor | 10 % en **cada compra de dos o más anteojos**, sobre lo pagado en anteojos sin el crédito usado y sin tope. Un anteojo solo genera 5 % | **Definido** |
| Cuándo se genera y cuándo se puede usar | Se anota al acreditarse el pago y se puede usar 30 días después del pago | Se crea **pendiente** al acreditarse el pago. Pasa a **disponible** 30 días después de una entrega con fecha confiable, sin devoluciones ni incidencias pendientes. Lo ya ganado sigue a 30 días del pago | **Definido**. Fecha de entrega: **a validar** |
| En qué se usa | En cualquier producto. Puede pagar la compra entera | El crédito nuevo, solo en anteojos, total o parcial. No paga el envío, ni estuches ni paños. No vence. El saldo antiguo conserva su alcance | **Definido** (§10.3) |
| Cuotas | 3 para todos y 6 para suscriptores | Hasta 6 para todos los compradores, sin suscribirse ni registrarse, en primera compra y recompras, cuando Mercado Pago las confirma | **Definido** |
| Envío | Suscriptor: siempre gratis. El resto: según los umbrales | Para todos: gratis en AMBA desde $ 60.000 y en el país desde $ 150.000. Si no, lo paga el cliente | **Definido** |
| 10 % por dinero en Mercado Pago | Se suma a todo | Se mantiene igual | **Definido**. Llega al 22 % (§8) |
| Baja de los mails | Corta los beneficios nuevos y conserva el saldo | Solo corta los mails de novedades. El crédito y la cuenta no cambian | **Definido** |
| Suscriptores actuales | — | Lo ganado y lo aceptado se respeta. Las reglas nuevas rigen después de un aviso previo, sin fecha todavía | **A validar** (§11) |
| Devoluciones | Anulan el cashback de esa compra | Sin regla de reintegro definitiva | **A validar** (§13.2) |
| Descuentos de estuches y paños | Activos | Sin cambios | Fuera de esta tarea |

---

## 4. Cuánto deja cada caso, hoy y con la política nueva

> **Números del análisis anterior:** costo de $ 9.570 y compra individual
> sin crédito. Con la política aprobada (5 % en la compra individual y
> costo de $ 10.208), los números están en la sección A.

Todo en 6 cuotas, con CAC de $ 20.000.

| Caso | Envío 1 | Envío 2 | Envío 3 |
|---|---|---|---|
| **Hoy:** 1 par con suscripción: cupón, cashback de $ 7.990 y envío gratis ($ 5.500 / $ 10.000 / $ 15.000) | ✗ 12,7 % · $ 8.414 | ✗ 7,1 % · $ 4.695 | ✗ 0,9 % · $ 563 |
| **Hoy:** recompra de 1 par con suscripción: usa $ 7.990 y gana otro 10 % (mismos envíos) | ✗ 21,5 % · $ 15.939 | ✗ 16,4 % · $ 12.220 | ✗ 10,9 % · $ 8.088 |
| **Nueva:** 1 par, AMBA con envío gratis (CABA / GBA 1 / GBA 2 y 3) | ✓ 30,0 % · $ 22.253 | ✓ 27,7 % · $ 20.592 | ✓ 24,8 % · $ 18.462 |
| **Nueva:** 1 par, resto del país, el cliente paga el envío ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 31,9 % · $ 25.289 | ✓ 29,7 % · $ 24.737 | ✓ 27,4 % · $ 24.125 |
| **Nueva:** Dúo con crédito del 10 % ($ 15.733), envío gratis ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
| **Nueva:** recompra de 1 par con $ 15.733 de crédito, AMBA (CABA / GBA 1 / GBA 2 y 3) | ✓ 33,4 % · $ 24.797 | ✓ 31,1 % · $ 23.136 | ✓ 28,3 % · $ 21.006 |
| **Nueva:** recompra de 1 par con $ 15.733, resto del país, el cliente paga el envío | ✓ 35,1 % · $ 27.833 | ✓ 32,7 % · $ 27.281 | ✓ 30,3 % · $ 26.669 |
| **Nueva:** recompra Dúo: usa $ 15.733 y genera $ 14.159, envío gratis | ✓ 35,3 % · $ 45.838 | ✓ 32,4 % · $ 42.119 | ✓ 29,2 % · $ 37.987 |

**Qué muestran estos números:**

1. **Hoy, el par suelto con suscripción no llega en ningún caso.** Lo hunde
   la suma de cupón, cashback en cada compra y envío gratis siempre.
2. **Con la política nueva, los casos evaluados con anteojos de $ 89.900
   llegan al 22 %**, pedido por pedido. No es una garantía para cualquier
   combinación (§0).
   - El cupón ya dado usado en un par suelto con envío gratis caro no llega
     (§7). No es una combinación nueva.
   - Los casos que con envío gratis no llegaban, el par suelto en 6 cuotas a
     $ 15.000, ya no se dan: fuera de AMBA ese envío lo paga el cliente.
3. **Con anteojos más baratos, algunos casos no llegan.** Pasa con el par
   suelto y con el Dúo de dos pares baratos con envío gratis caro. Son **no
   aptos para lanzar** sin ajustar condiciones (§5 y §14).
4. **El piso depende de cuatro cosas:**
   - el mix de anteojos;
   - el precio real;
   - el costo real del envío;
   - el CAC.

   Las tarifas vigentes se verifican al implementar (§9 y §14).

---

## 5. La primera compra

### 5.1 Un par (6 cuotas, sin crédito)

> **Análisis anterior:** el par suelto sin crédito y con costo de $ 9.570.
> Con el 5 % aprobado, ver A.4 y el Anexo A-1.

| 1 par | Envío 1 | Envío 2 | Envío 3 | Envío máximo para llegar al 22 % |
|---|---|---|---|---|
| AMBA, envío gratis (CABA / GBA 1 / GBA 2 y 3) | ✓ 30,0 % · $ 22.253 | ✓ 27,7 % · $ 20.592 | ✓ 24,8 % · $ 18.462 | $ 11.636 |
| Resto del país, el cliente paga lo cotizado más 10 % ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 31,9 % · $ 25.289 | ✓ 29,7 % · $ 24.737 | ✓ 27,4 % · $ 24.125 | — |
| Ídem, sin el recargo del 10 % | ✓ 31,6 % | ✓ 29,2 % | ✓ 26,7 % | — |
| *Sensibilidad: un modelo hipotético de $ 69.900, AMBA. **Debajo del piso*** | ✗ 16,4 % · $ 9.454 | ✗ 13,5 % · $ 7.793 | ✗ 9,8 % · $ 5.663 | $ 549 |
| *Ídem, resto del país, el cliente paga el envío. **Debajo del piso*** | ✗ 19,9 % · $ 12.490 | ✗ 17,9 % · $ 11.938 | ✗ 15,9 % · $ 11.326 | — |

- **El par de $ 89.900 llega en los casos evaluados.** En AMBA tiene margen
  hasta un envío de $ 11.636. Con las tarifas de `lib/rueddo.ts`, el más
  caro es $ 9.075; las vigentes se verifican al implementar.
- **Un par mucho más barato no llega en 6 cuotas, ni siquiera cuando el
  cliente paga el envío.** Queda **debajo del piso**. Los próximos modelos
  podrán salir a precios más altos (Ale, 05/11/2026).
  - Con el costo y el CAC de hoy, un par suelto en 6 cuotas necesita un
    precio de **$ 85.279 o más** para llegar con el envío de GBA 2 y 3.
  - Si se suma un modelo más barato, hay que recalcular antes de lanzarlo
    (§14, O4).

### 5.2 Dúo y más pares (6 cuotas, con el crédito del 10 %)

| Pedido | Paga en anteojos | Crédito | Envío | Envío 1 | Envío 2 | Envío 3 | Envío máximo |
|---|---|---|---|---|---|---|---|
| Dúo $ 89.900 + $ 89.900 | $ 157.325 | $ 15.733 | Gratis en todo el país ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 | $ 21.701 |
| Ídem en AMBA (CABA / GBA 1 / GBA 2 y 3) | | | Gratis | ✓ 32,9 % · $ 42.830 | ✓ 31,7 % · $ 41.169 | ✓ 30,0 % · $ 39.039 | — |
| *Dúo $ 89.900 + $ 69.900 (hipotético)* | $ 142.325 | $ 14.233 | AMBA gratis | ✓ 29,3 % · $ 34.470 | ✓ 27,9 % · $ 32.809 | ✓ 26,1 % · $ 30.679 | $ 14.886 |
| *Ídem, resto del país* | | | No llega a $ 150.000: lo paga el cliente | ✓ 30,6 % · $ 37.506 | ✓ 29,2 % · $ 36.955 | ✓ 27,7 % · $ 36.342 | — |
| *Dúo $ 69.900 + $ 69.900 (hipotético). **Debajo del piso*** | $ 122.325 | $ 12.233 | AMBA gratis | ✓ 23,1 % · $ 23.324 | ✗ 21,4 % · $ 21.663 | ✗ 19,3 % · $ 19.533 | $ 5.799 |
| *Ídem, resto del país. **Debajo del piso*** | | | Lo paga el cliente | ✓ 24,8 % · $ 26.360 | ✓ 23,4 % · $ 25.808 | ✗ 22,0 % · $ 25.196 (apenas por debajo) | — |
| 3 pares de $ 89.900 | $ 247.225 | $ 24.723 | Gratis ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 40,4 % · $ 82.526 | ✓ 38,6 % · $ 78.807 | ✓ 36,5 % · $ 74.675 | $ 50.967 |
| *3 pares: $ 89.900, $ 89.900 y $ 69.900* | $ 232.225 | $ 23.223 | Gratis | ✓ 38,6 % · $ 74.167 | ✓ 36,7 % · $ 70.448 | ✓ 34,6 % · $ 66.315 | $ 44.152 |
| 4 pares de $ 89.900 | $ 314.650 | $ 31.465 | Gratis | ✓ 42,5 % · $ 110.534 | ✓ 41,1 % · $ 106.815 | ✓ 39,5 % · $ 102.682 | $ 70.023 |
| *4 pares: dos de $ 89.900 y dos de $ 69.900* | $ 284.650 | $ 28.465 | Gratis | ✓ 39,9 % · $ 93.814 | ✓ 38,3 % · $ 90.095 | ✓ 36,5 % · $ 85.963 | $ 56.392 |
| 5 pares de $ 89.900 (2 con descuento) | $ 404.550 | $ 40.455 | Gratis | ✓ 45,2 % · $ 151.066 | ✓ 44,1 % · $ 147.347 | ✓ 42,8 % · $ 143.215 | — |
| 6 pares de $ 89.900 (3 con descuento) | $ 471.975 | $ 47.198 | Gratis | ✓ 45,9 % · $ 179.073 | ✓ 45,0 % · $ 175.354 | ✓ 43,9 % · $ 171.222 | — |

- **Con el precio de referencia, los casos evaluados de 2 a 6 pares llegan
  al 22 %.**
- **Un Dúo de dos pares de $ 69.900 (hipotético) no llega** en todos los
  casos evaluados:
  - con envío gratis en GBA 1 (21,4 %) y en GBA 2 y 3 (19,3 %);
  - fuera de AMBA con un envío de $ 15.000 (22,0 %, apenas por debajo).

  Queda **debajo del piso**, igual que el par suelto barato de §5.1.

### 5.3 Cómo se aplica el Dúo con precios distintos (definido)

**La regla:**

1. Se ordenan los anteojos del pedido por precio de lista.
2. Llevan el 25 % los **⌊n/2⌋ más baratos**, donde n es la cantidad de
   anteojos y ⌊n/2⌋ es la mitad redondeada hacia abajo. Es lo que hace
   `descuentoDelSegundo`.
3. Si hay precios iguales, da lo mismo cuál se elige.
4. Estuches y paños no cuentan para el Dúo.

| Anteojos en el pedido | Llevan el 25 % | Ejemplo con precios distintos | Descuento | Paga | Crédito |
|---|---|---|---|---|---|
| 1 | Ninguno | $ 89.900 | — | $ 89.900 | 5 %: $ 4.495 |
| 2 | El más barato | $ 89.900 + $ 69.900 | 25 % de $ 69.900 = $ 17.475 | $ 142.325 | $ 14.233 |
| 3 | Uno de los más baratos | $ 89.900 + $ 89.900 + $ 69.900 | 25 % de $ 69.900 = $ 17.475 | $ 232.225 | $ 23.223 |
| 4 | Los dos más baratos | $ 89.900 × 2 + $ 69.900 × 2 | 25 % de $ 69.900 × 2 = $ 34.950 | $ 284.650 | $ 28.465 |
| 5 | Los dos más baratos | 5 × $ 89.900 | 25 % de $ 89.900 × 2 = $ 44.950 | $ 404.550 | $ 40.455 |
| 6 | Los tres más baratos | 6 × $ 89.900 | 25 % de $ 89.900 × 3 = $ 67.425 | $ 471.975 | $ 47.198 |

- **Con 5 o más pares** se mantiene la regla de ⌊n/2⌋: los descuentos van a
  los pares de menor precio. **Definido.**
- **El crédito** es del 10 % desde 2 anteojos y del 5 % con 1.
- **Envío (definido, Ale, 05/11/2026):** con el Dúo, el mínimo para el envío
  gratis se mide **antes del 25 %**: los anteojos a precio de lista y los
  estuches y paños con sus tramos. Así el Dúo de $ 142.325 del ejemplo
  ($ 159.800 a lista) mantiene el envío gratis. Antes se medía después del
  Dúo y ese pedido podía pagar más que sin el Dúo (§16.3).

---

## 6. Qué se combina y qué no

Todo en 6 cuotas, salvo donde se diga. Los rangos van del caso más exigente
al más favorable, con anteojos de $ 89.900. Con modelos más baratos los
rangos bajan y algunos casos no llegan (§5).

| Combinación | Estado | Cuánto deja |
|---|---|---|
| Dúo y hasta 6 cuotas | **Se combinan** (definido) | ✓ 26,3 % a 32,9 % |
| Dúo y crédito del 10 %, en cada compra de dos o más anteojos | **Se combinan** (definido) | Igual que la fila anterior |
| Dúo que usa crédito anterior y genera crédito nuevo | **Se combinan** (definido). El crédito nuevo va sobre lo pagado | ✓ 29,2 % a 35,3 % |
| Par suelto, 6 cuotas y 5 % de crédito | **Se combinan** (definido) | Con la política aprobada, ver A.4 (19,0 % a 32,9 % según precio y envío). Sin crédito, del análisis anterior: AMBA ✓ 24,8 % a 30,0 % y resto del país ✓ 27,4 % a 31,9 % |
| Par suelto que usa crédito y genera 5 % sobre lo pagado | **Se combinan** (definido) | Con la política aprobada, ver A.4 y el Anexo A-3. Sin crédito nuevo, del análisis anterior: con $ 15.733, ✓ 28,3 % a 35,1 % |
| Crédito y envío | **No**: el crédito no paga el envío (definido) | — |
| Crédito nuevo y estuches o paños | **No**: no se genera sobre ellos (definido) ni se usa en ellos (definido). El saldo antiguo sí, con su alcance original | — |
| Dinero en Mercado Pago (1 pago) en el par suelto, el Dúo o la recompra | **Se combinan**: se mantiene (definido) | ✓ 31,5 % a 43,2 % (§8) |
| Cupón de bienvenida en altas nuevas | **Se elimina** desde la vigencia (definido) | — |
| Cupón ya dado y Dúo | **Se suman**, porque así lo dicen las condiciones aceptadas (punto 5). **A validar** | ✓ 23,5 % a 29,9 % (§7) |
| Cupón ya dado y par suelto | **Se respeta** (definido) | AMBA ✓ 24,0 % / ✗ 21,5 % / ✗ 18,3 %. Resto del país: ✓ 22,2 % a 26,6 %. Es el costo de respetar lo ya dado (§7) |
| Cupón ya dado y dinero en Mercado Pago | **Se combinan** | ✓ 24,2 % a 38,2 % |
| Cupón y crédito en la misma compra | **No pueden coincidir**: el cupón es de la primera compra y el crédito sale de una compra anterior | — |
| Descuentos de estuches y paños | Sin cambios: van sobre estuches y paños, no sobre anteojos | No modelado |

---

## 7. El cupón de bienvenida de $ 10.000

**Definido:** no se da en las altas nuevas desde que entre en vigencia el
programa. Los cupones ya dados se respetan.

**Cómo se respeta lo ya dado.** Las condiciones aceptadas dicen que el cupón
es para la primera compra, que es de una sola vez y que no vence. También
dicen que los beneficios se suman a las promociones: primero la promoción y
después el cupón (punto 5). Por eso, si la primera compra de ese suscriptor
es un Dúo, **el cupón se suma al Dúo**. Hay que validar esa lectura junto con
la transición (§14, L2).

| Cupón ya dado, 6 cuotas | Envío 1 | Envío 2 | Envío 3 |
|---|---|---|---|
| Con un Dúo y el crédito sobre lo que queda ($ 14.733). Envío gratis ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 29,9 % · $ 36.421 | ✓ 26,9 % · $ 32.702 | ✓ 23,5 % · $ 28.569 |
| Con un par suelto, AMBA (CABA / GBA 1 / GBA 2 y 3) | ✓ 24,0 % · $ 15.854 | ✗ 21,5 % · $ 14.193 | ✗ 18,3 % · $ 12.063 |
| Con un par suelto, resto del país, el cliente paga el envío ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 26,6 % · $ 18.890 | ✓ 24,4 % · $ 18.338 | ✓ 22,2 % · $ 17.725 (sin el recargo: ✗ 21,4 %) |
| Con un par suelto y dinero en Mercado Pago, AMBA (1 pago) | ✓ 30,5 % | ✓ 27,7 % | ✓ 24,2 % |

**Lo que no llega, sin esconderlo:**

- el par suelto con cupón en AMBA, cuando el envío pasa de **$ 6.093**
  (GBA 1 y GBA 2 y 3);
- el mismo par fuera de AMBA con el envío caro, si se quita el recargo.

**Es el costo de respetar lo ya dado, no una combinación nueva.** Se termina
cuando se usan los cupones que quedan. Falta saber cuántos hay sin usar
(§14, O6).

---

## 8. El 10 % por pagar con dinero en Mercado Pago (definido: se mantiene)

**Datos:**

- Se aplica después del Dúo, del cupón ya dado y del crédito.
- El crédito nuevo se calcula sobre lo que queda. Por ejemplo, un Dúo de
  $ 157.325 pagado así genera **$ 14.159** en lugar de $ 15.733.
- El 10 % no cambia quién tiene envío gratis.

**Verificación, en 1 pago:**

| Con dinero en Mercado Pago | Envío 1 | Envío 2 | Envío 3 |
|---|---|---|---|
| Par suelto, AMBA (CABA / GBA 1 / GBA 2 y 3) | ✓ 37,1 % | ✓ 34,7 % | ✓ 31,5 % |
| Par suelto, resto del país, el cliente paga el envío ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 39,6 % | ✓ 37,5 % | ✓ 35,3 % |
| Dúo con crédito ($ 14.159), envío gratis ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 40,9 % · $ 47.810 | ✓ 37,7 % · $ 44.091 | ✓ 34,1 % · $ 39.959 |
| *Dúo $ 89.900 + $ 69.900 (hipotético) con crédito, AMBA* | ✓ 37,5 % | ✓ 36,0 % | ✓ 34,0 % |
| Recompra de 1 par con $ 15.733, AMBA | ✓ 39,5 % | ✓ 37,1 % | ✓ 33,9 % |
| Recompra de 1 par con $ 15.733, resto del país, el cliente paga el envío | ✓ 41,8 % | ✓ 39,5 % | ✓ 37,3 % |
| Recompra Dúo: usa $ 15.733 y genera $ 12.743, envío gratis | ✓ 43,2 % · $ 51.073 | ✓ 40,0 % · $ 47.354 | ✓ 36,5 % · $ 43.222 |
| Cupón ya dado, Dúo y crédito, envío gratis | ✓ 38,2 % | ✓ 34,8 % | ✓ 31,0 % |

**Conclusión.** En los casos evaluados, el modelo confirma que es rentable:
**todas las combinaciones de la tabla llegan al 22 %**, incluido el Dúo
hipotético con un par de $ 69.900. Incluso dejan más que las mismas en
6 cuotas, porque el 10 % cuesta menos que la financiación de 6 cuotas
(10,3 %). Con otros precios o envíos, hay que volver a verificarlo.

**Condición para mantenerlo.** Se supuso que la comisión es la misma con
dinero en cuenta. Si Mercado Pago cobra otra comisión o cambia la de
6 cuotas, hay que recalcular (§14, O5).

---

## 9. Envío (definido: AMBA desde $ 60.000, todo el país desde $ 150.000)

**Lo que cada combinación soporta.** Envío gratis máximo, con IVA, para
seguir en el 22 %:

| Combinación | Envío gratis máximo | Hoy |
|---|---|---|
| Par suelto, 6 cuotas: solo tiene envío gratis en AMBA | $ 11.636 | Con las tarifas de `lib/rueddo.ts`, AMBA cuesta de $ 4.488 a $ 9.075: ✓. Las vigentes se verifican al implementar |
| Par suelto con cupón ya dado, 6 cuotas | $ 6.093 | GBA 1 y GBA 2 y 3 lo superan: ✗ (§7) |
| Recompra de 1 par con $ 15.733, 6 cuotas | $ 14.715 | ✓ en AMBA |
| Dúo con crédito, 6 cuotas: gratis en todo el país | $ 21.701 | No está medido fuera de AMBA |
| Recompra Dúo: usa $ 15.733 y genera crédito nuevo, 6 cuotas | $ 26.353 | No está medido fuera de AMBA |
| Dúo en el ciclo de §10.5, 6 cuotas | $ 25.930 | No está medido fuera de AMBA |
| *Dúo $ 89.900 + $ 69.900 (hipotético), AMBA gratis* | $ 14.886 | ✓ |

**Qué hay que vigilar:**

- **AMBA:** las tarifas de Rueddo se ajustan cada tres meses. Las vigentes
  en la tienda (Config) se verifican al implementar. El par suelto en
  6 cuotas deja de llegar si el envío de AMBA pasa de $ 11.636.
- **Resto del país con Dúo gratis:** llega mientras el envío no pase de
  $ 21.701. **No tengo medido el costo real por provincia.** Hay que
  medirlo antes de activar el programa (§14, O2).
- **Cuando paga el cliente,** el envío también se financia en las cuotas y
  paga comisión. Con anteojos de $ 89.900, el pedido llega igual, incluso
  sin el recargo del 10 %. Con un par de $ 69.900 no llega (§5.1).

---

## 10. Crédito Harper

### 10.1 Quién genera crédito y cuándo

| Compra | ¿Genera crédito? | Estado |
|---|---|---|
| Un solo anteojo, con o sin estuches o paños, sea la primera compra o una recompra | **Sí**: 5 % de lo pagado en el anteojo, sin tope | **Definido** |
| Dos o más anteojos, sea la primera compra o una recompra | **Sí**: 10 % de lo pagado en anteojos, sin tope | **Definido** |
| La parte de una compra que se paga con crédito | **No**: el 5 % o el 10 % va solo sobre lo pagado | **Definido** |
| Estuches, paños y envío | **No** | **Definido** |
| Quien no aceptó recibir publicidad o se dio de baja de los mails | **Sí**, igual que cualquier comprador: no depende de eso | **Definido** |
| Suscriptor del programa anterior | **Sí**, 5 % o 10 % según los anteojos, cuando ya rijan las reglas nuevas para él (§11) | **Definido** (lo ganado se respeta) |
| Compra pagada entera con crédito | **No**: no se pagó nada en dinero | Sale de la regla |
| Compra sin cuenta | El crédito tiene que quedar en una cuenta: la del mail de la compra, verificado con código | **A validar** (§14, O7) |

**Qué es una compra elegible** (definido): un pedido **pagado** con al menos
un anteojo. Genera 5 % con un anteojo y 10 % con dos o más. Con eso alcanza
para generar el crédito pendiente. La entrega y los 30 días no son parte de
la elegibilidad: son condiciones para que el crédito esté **disponible**
(§10.2).

### 10.2 Generación y disponibilidad, separadas (definido)

**1. Generación: crédito pendiente.**

- Se crea **en cuanto se acredita el pago** de un pedido con anteojos. No
  se espera la entrega ni los 30 días.
- El monto es el 5 % (un anteojo) o el 10 % (dos o más) de lo pagado en
  anteojos, sin el crédito usado.
- Se ve en la cuenta como **pendiente** y todavía no se puede usar.
- Es como se anota hoy el cashback: «cuando se acredita el pago».

**2. Disponibilidad: crédito que se puede usar.** Pasa a **disponible**
cuando se cumplen las tres condiciones:

- hay una **fecha de entrega confiable**;
- pasaron **30 días** desde esa fecha;
- **no hay devolución ni incidencia pendiente** (cambio, reclamo o
  contracargo abiertos).

Si falta la fecha de entrega o hay una incidencia abierta, el crédito sigue
pendiente hasta que se resuelva.

**3. Si se devuelve la compra.** Mientras el crédito está pendiente:

- una devolución total lo anula;
- si queda un solo anteojo, se recalcula al 5 % de lo que quede pagado;
- si quedan dos o más anteojos, se recalcula al 10 % de lo que quede pagado.

Cómo se recalcula depende de la regla de reintegro, que todavía no está
definida y necesita revisión legal (§13.2 y §14, L1).

**Por qué 30 días desde la entrega.** El arrepentimiento es de 10 días y los
cambios de 30 (`lib/confianza.ts`). Con 30 días desde la entrega, el
crédito pasa a disponible cuando ya pasaron los dos plazos. Así no queda
saldo negativo por un arrepentimiento.

**El crédito ya ganado con las reglas de hoy** se libera a los 30 días del
pago, como se aceptó.

**A validar: la fecha de entrega confiable.**

- El pedido tiene un estado «entregado» (`lib/mis-compras.ts`). Lo pone
  Harper a mano y no guarda la fecha.
- Aprobado (Ale, 05/11/2026): un campo «Fecha_entrega» en Pedidos que se
  completa solo al marcar «entregado» (§18).
- Mientras no haya fecha confiable, el crédito sigue pendiente (§14, O1).
- No cambia lo que deja el pedido.

### 10.3 En qué se usa

**El crédito nuevo:**

- se usa en compras futuras, **solo en anteojos**, total o parcial
  (definido);
- **no paga el envío** (definido);
- **no paga estuches ni paños** (definido);
- **no vence**, por ahora (definido). El modelo ya supone que se usa entero:
  no cuenta con que venza;
- no se cambia por dinero ni se transfiere, como hoy.

**El saldo ganado con las reglas de hoy conserva su alcance.** No se
restringe en forma retroactiva (definido):

- sigue sirviendo en cualquier producto, también estuches y paños;
- puede pagar la compra entera, como dicen las condiciones aceptadas;
- si eso incluye un envío que ahora se cobra queda en §14, L4. La
  validación no puede achicar lo que ese saldo permite hoy.

### 10.4 Recompras con crédito y 6 cuotas: verificación pedido por pedido

> **Análisis anterior:** la recompra individual sin crédito nuevo y costo de
> $ 9.570. Con el 5 % aprobado, ver A.4, A.5 y el Anexo A-3 y A-4.

Se pidió verificar que superen el 22 % con estas reglas y sin apoyarse en el
acumulado del cliente. **Todas las recompras evaluadas en esta tabla
llegan**, con los supuestos de §0.

**Eso no vale para cualquier recompra.** Una recompra de un par de $ 69.900
sin crédito es una compra común que no llega (§5.1). El piso depende del
mix, del precio real, del envío y del CAC.

| Recompra, 6 cuotas, CAC $ 20.000 | Envío | Envío 1 | Envío 2 | Envío 3 |
|---|---|---|---|---|
| 1 par sin crédito: es una compra común, el piso de cualquier recompra | AMBA gratis (CABA / GBA 1 / GBA 2 y 3) | ✓ 30,0 % · $ 22.253 | ✓ 27,7 % · $ 20.592 | ✓ 24,8 % · $ 18.462 |
| | Resto del país, paga el cliente ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 31,9 % · $ 25.289 | ✓ 29,7 % · $ 24.737 | ✓ 27,4 % · $ 24.125 |
| 1 par con $ 5.000 de crédito (uso parcial) | AMBA gratis | ✓ 31,0 % · $ 23.062 | ✓ 28,8 % · $ 21.401 | ✓ 25,9 % · $ 19.271 |
| | Resto del país, paga el cliente | ✓ 32,9 % · $ 26.098 | ✓ 30,6 % · $ 25.546 | ✓ 28,4 % · $ 24.933 |
| 1 par con $ 15.733 | AMBA gratis | ✓ 33,4 % · $ 24.797 | ✓ 31,1 % · $ 23.136 | ✓ 28,3 % · $ 21.006 |
| | Resto del país, paga el cliente | ✓ 35,1 % · $ 27.833 | ✓ 32,7 % · $ 27.281 | ✓ 30,3 % · $ 26.669 |
| 1 par con $ 31.465 (el crédito de un pedido de 4 pares) | AMBA gratis | ✓ 36,8 % | ✓ 34,6 % | ✓ 31,7 % |
| | Resto del país, paga el cliente | ✓ 38,3 % | ✓ 35,8 % | ✓ 33,2 % |
| Dúo que usa $ 15.733 y genera $ 14.159 | Gratis en todo el país ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 35,3 % · $ 45.838 | ✓ 32,4 % · $ 42.119 | ✓ 29,2 % · $ 37.987 |
| Dúo que usa $ 31.465 y genera crédito nuevo | Gratis | ✓ 38,2 % | ✓ 35,4 % | ✓ 32,2 % |
| 3 pares que usan $ 15.733 y generan crédito nuevo | Gratis | ✓ 42,3 % | ✓ 40,5 % | ✓ 38,4 % |
| 4 pares que usan $ 15.733 y generan crédito nuevo | Gratis | ✓ 44,0 % | ✓ 42,6 % | ✓ 41,0 % |
| *Dúo $ 89.900 + $ 69.900 (hipotético) que usa $ 15.733 y genera crédito* | AMBA gratis | ✓ 32,6 % | ✓ 31,2 % | ✓ 29,4 % |
| | Resto del país, paga el cliente | ✓ 33,7 % | ✓ 32,2 % | ✓ 30,6 % |
| *Dúo $ 69.900 + $ 69.900 (hipotético) que usa $ 15.733 y genera crédito* | AMBA gratis | ✓ 26,9 % | ✓ 25,2 % | ✓ 23,1 % |
| | Resto del país, paga el cliente | ✓ 28,5 % | ✓ 26,9 % | ✓ 25,3 % |

**Por qué usar crédito no baja el margen de la recompra.** El crédito ya se
cargó como costo en el Dúo que lo generó, y ese Dúo llega solo al 22 %. En
la recompra se cobra menos por Mercado Pago, entonces bajan la comisión, la
financiación y los IIBB.

**El piso de una recompra es la compra común de un par del mismo precio.**
Con $ 89.900 llega en los casos evaluados. Con un par mucho más barato, no.

**Lo que sí podría bajarla del 22 %:**

- un envío gratis más caro que los máximos de §9;
- un modelo más barato;
- una publicidad mayor que la de la tabla de abajo.

**Costo comercial máximo que soporta cada recompra para seguir en el 22 %.**
Es lo que se puede gastar en traerla, en lugar de los $ 20.000 de CAC. La
recompra que llega por los mails o por el crédito **no cuesta cero**, y su
costo real todavía no está medido. Cuando se mida, se compara con estos
topes.

| Recompra, 6 cuotas | Costo comercial máximo (envío 1 / 2 / 3) | Sin publicidad (referencia) |
|---|---|---|
| 1 par sin crédito, AMBA | $ 25.908 / $ 24.247 / $ 22.117 | ✓ 56,9 % / 54,6 % / 51,8 % |
| 1 par con $ 15.733, AMBA | $ 28.452 / $ 26.791 / $ 24.661 | ✓ 60,3 % / 58,1 % / 55,2 % |
| 1 par con $ 15.733, resto del país, paga el cliente | $ 30.388 / $ 28.936 / $ 27.323 | ✓ 60,3 % / 56,7 % / 53,1 % |
| Dúo que usa $ 15.733 y genera crédito nuevo, envío gratis | $ 37.234 / $ 33.515 / $ 29.383 | ✓ 50,6 % / 47,8 % / 44,6 % |

**Todos estos topes superan los $ 20.000.** Por eso, con el CAC
conservador, estas recompras llegan. Si el costo real de traer una recompra
supera su tope, esa recompra no llega.

### 10.5 Un ciclo de recompra que se sostiene

**El caso que se pidió.** Cada compra de dos o más anteojos genera el 10 %
sobre lo que se paga en anteojos, sin el crédito usado.

**Los números.** Un cliente que siempre compra un Dúo y usa el crédito del
anterior se estabiliza en un crédito de **$ 14.302** por compra: el 10 % de
$ 157.325 − $ 14.302.

| Dúo en el ciclo: usa $ 14.302 y genera $ 14.302, 6 cuotas | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 |
|---|---|---|---|
| Envío gratis | ✓ 35,0 % · $ 45.489 | ✓ 32,1 % · $ 41.770 | ✓ 28,9 % · $ 37.638 |

**Por qué no crece sin control:**

- el Dúo genera 10 % y el par suelto 5 %. El recorrido del par suelto está
  en A.6;
- el crédito nuevo es un porcentaje de lo pagado en dinero, nunca del
  crédito usado. No hay crédito sobre crédito;
- no se genera sobre el envío, ni sobre estuches o paños;
- se crea pendiente y recién pasa a disponible 30 días después de una
  entrega con fecha confiable, sin devoluciones ni incidencias pendientes;
- se anula si se devuelve la compra.

**Comparación con hoy.** Hoy cada compra genera crédito, también la de un
par. Un cliente de pares sueltos usa y genera unos $ 8.173 por compra y
queda en ✗ 21,5 % / ✗ 16,5 % / ✗ 10,9 % (6 cuotas).

**Qué mostraría que está mal:**

- que suba mucho la devolución de un par del Dúo;
- que el crédito se use sobre todo en compras que habrían llegado igual.

**Cómo se mide:**

- qué parte de los pedidos tiene dos o más anteojos;
- qué parte de los clientes con crédito vuelve dentro de los 90 días;
- cuántas devoluciones parciales tienen los Dúos;
- la contribución real por pedido en el panel.

---

## 11. Transición de los suscriptores actuales (definido: con aviso previo, sin fecha todavía)

**Lo que ya se aceptó:**

- Cada suscriptor guarda la versión de las condiciones que aceptó.
- El punto 9 obliga a publicar la versión nueva con su fecha y a avisar por
  mail, antes de que rija, a quien le afecte.
- El mismo punto dice que **el saldo ya ganado se respeta**.

**Lo que se respeta tal cual** (definido):

1. **El saldo ya disponible** queda con sus condiciones originales: no vence,
   sirve en cualquier producto y puede pagar una compra entera.
   - Con la regla nueva, usarlo en un Dúo no genera crédito sobre ese saldo.
   - Usa $ 7.990 en un par suelto en 6 cuotas: AMBA ✓ 31,7 % / 29,5 % /
     26,6 %. Resto del país, paga el cliente: ✓ 33,5 % / 31,2 % / 28,9 %.
   - Usa $ 7.990 en un Dúo y genera crédito: ✓ 33,8 % / 30,9 % / 27,8 %.
2. **El cashback anotado que todavía no está disponible** (dentro de los
   30 días del pago) se libera a los 30 días del pago, como se ganó.
3. **El cupón sin usar** se respeta y se suma al Dúo (§7).
4. **Las compras pagadas antes del cambio** siguen con las reglas de hoy,
   también si se devuelven.

**Lo que cambia después del aviso** (propuesta de transición, a validar):

| Hoy, para el suscriptor | Después del aviso | Por qué |
|---|---|---|
| Cashback del 10 % en cada compra, también la de un par | Crédito del 10 % en las compras de dos o más anteojos y del 5 % en la de un anteojo | El de hoy no llega al 22 % (§4) |
| Envío gratis siempre | Las reglas de envío de todos | El par suelto con envío gratis caro no llega al 22 % |
| Hasta 6 cuotas | Hasta 6 cuotas, igual que hoy | Sin cambio |
| Beneficios atados a recibir mails | Cuenta y crédito independientes de los mails | Decisión de Ale |

**Mientras dura el aviso, rigen las reglas de hoy, y eso cuesta.** Un par con
cupón, cashback y envío gratis queda en ✗ 12,7 % / 7,1 % / 0,9 %. Una
recompra con saldo y cashback, en ✗ 21,5 % / 16,4 % / 10,9 %. Cuanto más
largo el aviso, más pedidos así.

**Pasos propuestos** (a validar):

1. Escribir la versión nueva de las condiciones con su fecha. Es otra tarea,
   con el texto aprobado por Ale.
2. Avisar por mail, antes de que rija, a los suscriptores a quienes les
   afecte.
3. Las altas nuevas aceptan directamente la versión nueva.

**Falta definir:**

- **el plazo del aviso;**
- **a quién se avisa**, por ejemplo si también a quien se dio de baja y
  tiene saldo;
- **qué datos hacen falta antes de fijar la fecha:** suscriptores activos,
  saldo total, cashback pendiente y cupones sin usar (§14, L2 y O6).

---

## 12. Si el cliente se da de baja de los mails (definido: no afecta la cuenta ni el crédito)

- **La baja corta solo los mails de novedades y promociones.**
- **No cambia nada del crédito:**
  - el ganado, el pendiente y el que generen sus compras de dos o más
    anteojos siguen igual;
  - lo puede usar entrando con su mail y el código.
- **Los mails del pedido se siguen mandando.**
- **Quienes se dieron de baja con las reglas de hoy** perdieron los
  beneficios nuevos. Con el programa nuevo, sus compras de dos o más
  anteojos generan crédito como las de cualquiera.
- **No cambia lo que deja cada pedido:** el costo del crédito ya está en la
  compra que lo genera.
- **A validar:**
  - hoy suscribirse es dar el consentimiento para recibir mails, así que
    separar la cuenta del consentimiento cambia cómo funciona el alta y las
    condiciones y la política de privacidad (otra tarea);
  - también hay que definir si el aviso «tu crédito ya se puede usar» es un
    mail de la cuenta, que se manda siempre, o uno de novedades (§14, L3).

---

## 13. Casos de borde

### 13.1 Uno, dos o más pares

Están en §5.2 (cuánto deja cada uno) y §5.3 (cómo se aplica el Dúo con
precios distintos).

- **Resumen:**
  - con 1 par, sin descuento y con 5 % de crédito;
  - con 2, el 25 % al más barato;
  - con 3, a uno de los más baratos;
  - con 4, a los dos más baratos;
  - con 5 o más, a los ⌊n/2⌋ más baratos (definido).
- **En todos los casos** el crédito es el 10 % de lo pagado en anteojos.
- **Estuches y paños:** no cuentan para el Dúo ni generan crédito, y siguen
  con sus propios descuentos.

### 13.2 Devoluciones (a validar: ninguna regla de reintegro es definitiva)

Lo que sigue son **alternativas con lo que deja cada una**, no una regla.
Antes de elegir, hace falta una **revisión legal**: el derecho de
arrepentimiento (Ley 24.240, art. 34), la garantía y la política de
devoluciones publicada no pueden quedar recortados por la promoción.

**Devolución total de un Dúo:**

- se reintegra lo pagado y se anula el crédito pendiente de esa compra;
- como el crédito recién pasa a disponible 30 días después de la entrega,
  en un arrepentimiento todavía no se pudo usar.

Si se devuelve después de usarlo, por ejemplo por un reclamo tardío, hoy el
monto se descuenta del saldo, que puede quedar negativo. Hay que validar si
eso también rige para el crédito nuevo (§14, L5).

**Devolución de un par del Dúo, con precios distintos:**

- Ejemplo con un par A de $ 89.900 y un par B de $ 69.900 (hipotético).
- El 25 % va a B ($ 17.475): el cliente paga $ 142.325 y genera $ 14.233
  de crédito.
- Si se queda con un solo anteojo, el crédito pasa al 5 % de lo que quede
  pagado. Cómo se recalcula también entra en la revisión legal.

La tabla muestra cuánto deja lo que queda en 6 cuotas. Supone que Harper
pagó el envío, que es lo más exigente, y no cuenta el retiro del par
devuelto.

| Alternativa de reintegro | Devuelve | Se reintegra | Se queda con | Cuánto deja lo que queda (envío $ 5.500 / $ 10.000 / $ 15.000) |
|---|---|---|---|---|
| **M1.** Se recalcula como compra de un par: el que queda vuelve a su precio de lista | B (el del descuento) | $ 52.425 | A a $ 89.900 | ✓ 28,8 % / ✓ 23,8 % / ✗ 18,3 % |
| | A (el de precio completo) | $ 72.425 (menos de lo que pagó por A) | B a $ 69.900 | ✗ 14,9 % / ✗ 8,5 % / ✗ 1,3 % |
| **M2.** Se reintegra lo que figura en la factura para el par devuelto (el descuento quedó en B) | B | $ 52.425 | A a $ 89.900 | ✓ 28,8 % / ✓ 23,8 % / ✗ 18,3 % |
| | A | $ 89.900 | B a $ 52.425 (25 % menos) | ✗ −5,9 % / ✗ −14,5 % / ✗ −24,0 % |
| **M3.** El descuento se reparte según el precio (A $ 9.831, B $ 7.644) | B | $ 62.256 | A a $ 80.069 | ✓ 22,9 % / ✗ 17,2 % / ✗ 11,0 % |
| | A | $ 80.069 | B a $ 62.256 | ✗ 7,2 % / ✗ 0,0 % / ✗ −8,0 % |
| **Con precios iguales** ($ 89.900 + $ 89.900, descuento $ 22.475) | | | | |
| M1 | Cualquiera | $ 67.425 | Uno a $ 89.900 | ✓ 28,8 % / ✓ 23,8 % / ✗ 18,3 % |
| M2 | El de precio completo | $ 89.900 | Uno a $ 67.425 | ✗ 12,6 % / ✗ 5,9 % / ✗ −1,5 % |
| M3 | Cualquiera | $ 78.662,50 | Uno a $ 78.662,50 | ✗ 21,9 % / ✗ 16,2 % / ✗ 9,8 % |

**Lo económico, sin elegir regla:**

- **M1** deja lo que queda igual que un par vendido solo. Pero si se
  devuelve el par de precio completo, el cliente recibe menos de lo que
  pagó por él. Ese es el punto que más necesita la revisión legal.
- **M2** permite comprar dos, devolver el de precio completo y quedarse con
  un par al 25 % menos. Hace perder plata.
- **M3** queda en el medio.
- **Lo que pasa con B en M1 no es por la regla de reintegro:** es que un par
  barato solo no llega al 22 % en 6 cuotas (§5.1).

**Cambio de modelo o color dentro del Dúo:**

- sigue siendo un Dúo;
- si cambia el precio, se vuelve a aplicar la regla de §5.3 y el crédito se
  calcula sobre el monto final;
- la diferencia se cobra o se reintegra (a validar junto con lo anterior).

**Devolución de una recompra pagada en parte con crédito:**

- el crédito usado vuelve al saldo cuando se concreta la devolución, como
  hoy;
- la parte pagada en dinero se reintegra por Mercado Pago.

**Contracargo:** se trata como una devolución.

### 13.3 Medios de pago

| Medio | Cuotas | Crédito que genera un Dúo de $ 89.900 + $ 89.900 |
|---|---|---|
| Tarjeta o Mercado Pago, 1 pago | 1 | 10 % de $ 157.325 = **$ 15.733** |
| Tarjeta en 3 o 6 cuotas sin interés, si Mercado Pago las confirma | 3 o 6 | **$ 15.733**: las cuotas no cambian el crédito, cambian lo que deja el pedido |
| Dinero en Mercado Pago | 1 | 10 % de $ 141.592,50 = **$ 14.159** |
| Crédito más tarjeta, en una recompra Dúo que usa $ 15.733 | La que se elija | 10 % de lo pagado con tarjeta, $ 141.592 = **$ 14.159** |
| Pagado entero con crédito | — | **$ 0**. El envío, si corresponde, se paga aparte porque el crédito no lo cubre |
| Transferencia | No está activa | Si se activa, se trata como el dinero en Mercado Pago (a decidir entonces) |

- **Cuotas:** si Mercado Pago no confirma 6 cuotas sin interés para ese
  monto, se ofrecen las que confirme, como hoy (`lib/cuotas.ts`).
- **Pago rechazado o vencido:** el crédito apartado se libera a los
  30 minutos, como hoy.

---

## 14. Lo que hay que validar antes de activar el programa

### Legales

| # | Qué | Por qué |
|---|---|---|
| L1 | **Regla de reintegro de la devolución de un par del Dúo** y qué pasa con el crédito de esa compra | Ninguna de las alternativas M1, M2 y M3 es definitiva. Hay que verla con el derecho de arrepentimiento (Ley 24.240, art. 34), la garantía y la política de devoluciones publicada (§13.2) |
| L2 | **Transición de los suscriptores actuales:** el texto nuevo, el plazo del aviso y a quién se avisa | Lo pide el punto 9 de las condiciones aceptadas. También hay que confirmar que el cupón ya dado se suma al Dúo, como dice el punto 5 (§7 y §11) |
| L3 | **Separar la cuenta y el crédito del consentimiento para recibir publicidad** | Hoy suscribirse es dar ese consentimiento. Cambia el alta, las condiciones y la política de privacidad. Y hay que definir de qué tipo es el mail «tu crédito ya se puede usar» (§12) |
| L4 | **Si el saldo ganado con las reglas de hoy puede pagar el envío** | Las condiciones aceptadas dicen que el saldo «puede cubrir una compra entera». Ahora algunas compras pagan envío (§10.3) |
| L5 | **Devolución total después de usar el crédito** | Hoy el saldo puede quedar negativo. Hay que validar si se mantiene para el crédito nuevo (§13.2) |

### Operativas

| # | Qué | Por qué |
|---|---|---|
| O1 | **Una fecha de entrega confiable** para cada pedido | El crédito pendiente pasa a disponible 30 días después de esa fecha. Sin ella, sigue pendiente. Hoy «entregado» no guarda la fecha. Aprobado en §18 (05/11/2026): un campo en Pedidos que se completa al marcar «entregado». Sin fecha, el crédito nunca se libera solo |
| O2 | **El costo real del envío por provincia** fuera de AMBA | El Dúo con envío gratis a todo el país llega mientras el envío no pase de $ 21.701 (§9) |
| O3 | **Verificar las tarifas de envío vigentes en la tienda (Config)** al implementar, y revisar las de AMBA cada vez que Rueddo las ajuste | El par suelto en 6 cuotas llega mientras el envío de AMBA no pase de $ 11.636. Con las tarifas de `lib/rueddo.ts`, el máximo es $ 9.075 |
| O4 | **Recalcular antes de lanzar un modelo más barato** | Con el costo y el CAC de hoy, un par suelto en 6 cuotas necesita un precio de $ 85.279 o más. Un Dúo de dos pares baratos queda justo (§5) |
| O5 | **La comisión de Mercado Pago con dinero en cuenta** | Se supuso igual a la de tarjeta (3,39 %). Mantener el 10 % depende de que el modelo siga llegando (§8) |
| O6 | **Contar suscriptores activos, saldo total, cashback pendiente y cupones sin usar** | Hace falta para fijar la fecha y el plazo del aviso. No lo medí: está fuera del alcance |
| O7 | **Compras sin cuenta:** cómo se acredita el crédito | Tiene que quedar en la cuenta del mail de la compra, verificado con código |
| O8 | **Si el costo de USD 6,38 por anteojo incluye IVA** | La sección A lo toma sin IVA. Si lo incluye, hay que recalcular |
| O9 | **El costo comercial real de cada recompra** (mail, CRM, plataforma, tiempo) | Hay que compararlo con los topes de A.5. No está medido, y $ 0 es solo una referencia |
| O10 | **La recompra a 90 días de cada mes de primeras compras**, separando compra individual y Dúo | Es lo que dice si el crédito genera compras extra (A.8). Hoy no hay tasas reales, y las de A.8 son hipotéticas |
| O11 | **Seguir los pedidos con Dúo que tengan el envío gratis solo por la regla nueva** (definido: el envío gratis se mide antes del Dúo, Ale, 05/11/2026) | Dejan menos que la regla anterior: en el ejemplo de §16.3, $ 12.799 menos en 6 cuotas. Con los precios de hoy no hay ninguno |
| O12 | **Una categoría de complemento antes de vender clips sueltos** | Un clip suelto cargado como «Anteojos» o «Clip-On» recibiría el Dúo. Hoy no hay ninguno (§16.4) |
| O13 | **Antes de activar un cupón que reemplace promociones:** probar el envío gratis y lo que queda registrado en el pedido cuando el cupón le gana al Dúo (revisión del PR #64) | Hoy el mínimo se mide antes del Dúo aunque después gane el cupón. No hay cupones activos (§16.3) |

### Debajo del piso del 22 % (a monitorear)

Son casos evaluados que dejan menos del 22 %. Por decisión de Ale
(05/11/2026), el 22 % es una referencia para monitorear: **no frena el
lanzamiento ni bloquea el checkout.** Se siguen con el margen del panel.

| Caso | Por qué no llega | Dónde |
|---|---|---|
| Compra individual de $ 89.900 con 5 %, envío gratis de GBA 2 y 3 (precio actual) | 19,0 % la primera compra y 20,2 % la segunda | A.4 |
| Par suelto de $ 69.900 (hipotético), 6 cuotas | No llega en ningún envío, ni siquiera cuando el cliente paga el envío (9,8 % a 19,9 %). Hace falta un precio de $ 85.279 o más | §5.1 |
| Dúo de dos pares de $ 69.900 (hipotético) con crédito, 6 cuotas | No llega con envío gratis en GBA 1 (21,4 %) y en GBA 2 y 3 (19,3 %), ni fuera de AMBA con un envío de $ 15.000 (22,0 %, apenas por debajo) | §5.2 |
| Cualquier combinación fuera de los supuestos de §0 | Otro precio, otro costo de envío o un CAC mayor que el tope | §0 y §10.4 |

El cupón ya dado en un par suelto con envío gratis caro (§7) tampoco llega.
No es un lanzamiento: es el costo de respetar lo ya dado.

### Definido en la revisión del PR #60 y aprobado por Ale (05/11/2026)

- Hasta **6 cuotas para todos los compradores**, sin obligar a suscribirse
  ni registrarse, solo cuando Mercado Pago las confirma para el monto.
- **Con 5 o más pares,** el 25 % va sobre los ⌊n/2⌋ de menor precio: dos
  con 5 y tres con 6.
- **El crédito nuevo se usa solo en anteojos**, no en estuches, paños ni
  envío. El saldo antiguo conserva su alcance.
- **Generación separada de disponibilidad:**
  - el crédito se crea pendiente al acreditarse el pago de un pedido con
    dos o más anteojos;
  - pasa a disponible 30 días después de una entrega con fecha confiable,
    sin devoluciones ni incidencias pendientes (§10.2).

**Después de aprobar este documento:**

- las decisiones van a la tabla Decisiones con fecha de revisión;
- lo que haya que hacer va a Pendientes;
- este PR no toca Airtable.

---

## 15. Lo que este documento no hace

- No implementa nada.
- No cambia precios, descuentos, créditos, el checkout, Airtable, las
  condiciones publicadas ni la producción.
- No mide la cantidad de suscriptores, el saldo, los cupones sin usar ni el
  costo real del envío por provincia: quedan en §14.
- No cambia el precio: los cuatro precios de la sección A son escenarios
  para decidir.
- No inventa tasas de recompra: las de A.8 son hipotéticas.
- No empieza la Tarea 03.

---

## 16. Implementación del Dúo (Tareas 03 a 07)

### 16.1 Estado

- **El cálculo** está en `lib/duo.ts` (Tarea 03) y se aplica en el carrito
  del servidor (`resolverCarrito`, Tarea 04): el mismo cálculo para el
  carrito, el checkout y lo que se cobra.
- **Está apagado.** Solo se prende con `HARPER_DUO_ACTIVO=1`. Apagado, la
  tienda cobra exactamente lo de siempre.
- **No se prende en previews conectadas a pagos o a Airtable reales.**
- **Cuentan para el Dúo:** Anteojos, Anteojos de sol, Clip-On y Anteojos de
  receta, siempre que sean anteojos completos. Estuches y paños, no.

**Antes de prenderlo hace falta:**

1. registrar el Dúo en el pedido (hecho en la Tarea 05, §16.2);
2. medir el envío gratis antes del Dúo (aprobado y hecho en la Tarea 06, §16.3);
3. los textos de la ficha, los packs, el carrito y el checkout (hechos en la Tarea 07, §16.5);
4. las condiciones publicadas (§14, L2);
5. la transición de los suscriptores (§11).

### 16.2 Qué queda registrado en el pedido (Tarea 05)

Se guarda con los mismos renglones que calcula y cobra el servidor. No se
vuelve a calcular nada.

- **Campo Items** (el JSON de los productos del pedido): cada renglón que
  llevó el Dúo tiene un detalle `duo` con el porcentaje, cuántas unidades lo
  llevaron y cuántos pesos descontó. Por ejemplo:
  `"duo": { "porcentaje": 25, "unidades": 1, "descuento": 22475 }`.
- **Campo Notas:** una línea para leerlo de un vistazo en Airtable:
  «Promoción: Dúo 25 % · −$ 22.475 · AMATISTA Negro (1 de 1)». Si el Dúo
  va en dos renglones, los nombra a los dos.
- **No hay campos nuevos en Airtable.** Si hace falta filtrar o sumar por
  promoción, se puede agregar un campo «Promocion» más adelante, con
  autorización.

**Lo que no cambia:**

- **Con el Dúo apagado,** Items y Notas quedan exactamente como hoy.
- **Los pedidos anteriores** no tienen el detalle y se leen como «sin Dúo».
  Mis compras, la página de gracias y los avisos los leen igual que antes.
- **Los importes cobrados** son los mismos de la Tarea 04. Se comparó el
  carrito de main con el de la rama en 1.040 casos:
  - con el Dúo apagado, idénticos;
  - con el Dúo prendido, idénticos salvo el detalle nuevo.
- **Si un cupón le gana al Dúo,** el renglón queda con el cupón y sin el
  detalle del Dúo. Hoy no hay cupones activos.
- **El cupón de bienvenida del suscriptor, el saldo y el 10 % por dinero en
  Mercado Pago** se aplican después del Dúo y no borran el registro.

### 16.3 El envío gratis se mide antes del Dúo (aprobado por Ale, 05/11/2026 · Tarea 06)

**La regla.** Cuando queda el Dúo, el mínimo del envío gratis se mide
**antes del 25 %**:

- los anteojos, a precio de lista;
- los estuches y paños, con sus propios descuentos por cantidad.

**Lo que no cambia:**

- **Si en los anteojos ganan los tramos de Airtable, o el Dúo está apagado,**
  se mide como siempre, sobre lo que se paga.
- **El cupón, el saldo y el 10 % por dinero en Mercado Pago** siguen sin
  cambiar quién tiene envío gratis.
- **Los umbrales:** AMBA desde $ 60.000, todo el país desde $ 150.000.
- **Lo que se le declara al transportista** sigue siendo lo que se vende,
  con el Dúo.

**Por qué.** Antes (Tareas 04 y 05) el mínimo se medía después del Dúo. Un
Dúo podía quedar debajo del mínimo y pagar más en total que sin el Dúo
(revisión del PR #62). El ejemplo: un par de $ 89.900 y uno de $ 69.900,
envío gratis desde $ 150.000 y una cotización de $ 20.000.

| | Productos | Envío | Total |
|---|---|---|---|
| Sin el Dúo | $ 159.800 | Gratis | $ 159.800 |
| Con el Dúo, regla anterior | $ 142.325 | $ 20.000 | $ 162.325 (pagaba $ 2.525 más) |
| **Con el Dúo, regla nueva** | $ 142.325 | Gratis | **$ 142.325** |

**Cuándo cambia algo:**

- **Con los precios de hoy y los previstos ($ 89.900 a $ 109.900), nunca.**
  El Dúo más barato posible queda en $ 157.325, arriba de $ 150.000. En
  AMBA, con el umbral de $ 60.000, tampoco.
- **Cambiaría si** entra un modelo más barato (por ejemplo, uno de entre
  $ 60.100 y $ 80.100 junto a uno de $ 89.900), o si el umbral nacional
  sube por encima de $ 157.325.

**Cuánto deja.** Calculado con el modelo (`lib/contribucion.ts`, parámetros
de referencia). Supuestos: 6 cuotas, crédito del 10 %, publicidad de
$ 20.000 y un envío de $ 20.000 con IVA.

| El ejemplo, en 6 cuotas | Se cobra | Deja después de publicidad | Margen |
|---|---|---|---|
| Regla anterior: el comprador paga el envío | $ 162.325 | $ 34.450 | ✓ 25,7 % |
| Regla nueva: envío gratis | $ 142.325 | $ 21.651 | ✗ 18,4 % (debajo del piso: se monitorea, no bloquea) |

**Corrección de la versión anterior de esta sección:**

- **La diferencia es de $ 12.799 por pedido, no de $ 20.000.** Cuando el
  comprador pagaba el envío, Harper igual pagaba, sobre ese importe, la
  comisión de Mercado Pago, la financiación de las cuotas, IIBB y la
  reserva por devoluciones.
- **En 1 pago,** la regla nueva deja $ 36.310 (30,9 %) y la anterior
  $ 51.169: $ 14.859 menos.
- **Con los precios de hoy, la diferencia es $ 0:** ningún pedido cae en
  esa franja.

**Qué mostraría que la regla estaba mal:** pedidos con Dúo y envío gratis
cuyo total quede debajo del mínimo y que, en el panel, dejen menos que el
piso más de lo previsto (§14, O11). Se miden con la línea «Promoción: Dúo»
de Notas y el envío bonificado del pedido.

**Un detalle para cuando vuelvan los tramos de anteojos.** Si el Dúo le gana
a un tramo de anteojos de Airtable, la base son los anteojos a lista, no lo
que costaban con el tramo (así lo pidió la revisión del PR #63). Hoy no hay
tramos de anteojos: la lista es lo que pagaría sin el Dúo.

**Cómo se probó:**

- **Pruebas:** `tests/duo-envio.test.ts` cubre el envío de punta a punta:
  - la cotización firmada y el checkout;
  - el mínimo justo;
  - los estuches con su tramo;
  - AMBA;
  - el suscriptor;
  - el dinero en Mercado Pago.

  También hay pruebas en `tests/duo.test.ts`, `tests/duo-carrito.test.ts`,
  `tests/duo-carrito-escala.test.ts` y `tests/duo-pedido.test.ts`.
- **Comparación con main** en 2.080 carritos (con y sin escala, con
  umbral de $ 80.000 y de $ 160.000):
  - con el Dúo apagado, idénticos;
  - con el Dúo prendido, solo cambian la base y el envío de los carritos
    con Dúo, y ninguno paga más que antes ni más que sin el Dúo.

### 16.4 Un clip suelto no recibe el Dúo (verificado el 05/11/2026)

**Hoy un clip suelto no puede recibir el Dúo:**

- **Clip-On** es el anteojo completo con su clip, y cuenta para el Dúo
  (Ale, 05/11/2026).
- En Airtable (Productos), la categoría hoy solo tiene Anteojos, Estuches,
  Paños y Membresía. No hay ningún clip cargado.
- Un producto con otra categoría («Clip», «Clip suelto», «Clip magnético»,
  «Accesorios», etc.) no se publica. Tampoco se puede cobrar: el carrito
  del servidor lo descarta, así que no puede llevar el Dúo. Está probado en
  `tests/duo-pedido.test.ts`.

**Lo que depende de cómo se carguen los productos:** un clip suelto cargado
como «Anteojos» o como «Clip-On» sí recibiría el Dúo.

**Antes de vender clips sueltos:**

1. crear una categoría de complemento (por ejemplo, «Accesorios») en el
   código y en Airtable, con autorización;
2. cargar los clips sueltos en esa categoría (§14, O12).

### 16.5 Cómo se cuenta en la tienda (Tarea 07)

**Con el Dúo apagado, la tienda queda igual.** Se comparó el texto visible de
la ficha, el carrito, el checkout y la barra «Tus pares» (11 pantallas,
celular) entre main y esta versión, con los mismos datos de prueba:
idénticos.

**Con el Dúo prendido, todo sale de lo que calculó el servidor.** Ninguna
página calcula el descuento por su cuenta.

| Dónde | Qué dice |
|---|---|
| Ficha, sin anteojos en el carrito | «Dúo: llevá dos anteojos y el de menor precio tiene 25% OFF.» y «Dos de este modelo: $ 157.325 (antes $ 179.800).», con lo que cobra el servidor por dos pares |
| Ficha, con un anteojo en el carrito | «Sumá otro par y el de menor precio tiene 25% OFF.» |
| Ficha, con el Dúo ya aplicado | «Tu carrito ya tiene el Dúo: 25% OFF en el anteojo de menor precio.» |
| Renglón del carrito y del checkout | «Dúo · 25% OFF» o, si no todas las unidades lo llevan, «Dúo · 25% OFF en 1 de 2» |
| Resumen (carrito, panel lateral, checkout) | Una fila «Dúo · 25% OFF −$ 22.475»; los descuentos de estuches y paños, aparte en «Descuento» |
| Envío gratis solo por la regla de §16.3 | «Envío gratis por tu compra: el mínimo se cuenta antes del descuento del Dúo.» Nunca «te faltan» |
| Barra «Tus pares» de la portada | «Sumá otro: 25% OFF en el de menor precio…» o «Dúo aplicado…» |
| Sugerencias del carrito | «Segundo par: 25% OFF en el de menor precio», solo si el servidor confirma que suma otro con el Dúo |
| Packs | En la portada en modo estrella y en las opciones de la ficha, el total que cobra el servidor por cada pack; la etiqueta «Dúo · 25% OFF en uno» |

**Si gana un tramo de Airtable** (por ejemplo, con la escala «llevá 3, pagá
2»), se cuenta el tramo como siempre y nada dice «Dúo».

**Lo que no se tocó:**

- los pagos y los precios;
- el cashback;
- Airtable;
- las condiciones publicadas;
- la barra verde de anuncios de arriba: anunciar el Dúo ahí es parte del
  lanzamiento (§14, L2).

---

## 17. Crédito Harper: dónde se guarda y cómo se conecta (Tareas 09 a 13)

### 17.1 Estado

- **La tabla «Créditos» existe y está vacía.** Ale la aprobó el 05/11/2026
  y se creó ese día en la base real (`tbljsISq3DoFBWiEF`), con los campos de
  §17.2. No se tocó ninguna otra tabla.
- Estas piezas están en el código, **apagadas y sin conectar**:
  - el cálculo (Tarea 08, `lib/credito-harper.ts`);
  - la persistencia (Tarea 09, `lib/credito-persistencia.ts`);
  - el adaptador de Airtable (Tarea 10, `lib/credito-airtable.ts`);
  - el lector de pagos y pedidos (Tarea 11, `lib/credito-pagos.ts`, §17.9).

  No las usa el webhook, ni el checkout, ni ninguna página.
- **En producción, el Crédito Harper no hace nada.** No está conectado al
  webhook de Mercado Pago ni al checkout, y `HARPER_CREDITO_ACTIVO` está
  apagado. Cuando este documento dice qué pasa ante un aviso de pago, un
  reembolso o una entrega, describe la lógica preparada y probada, no algo
  que ya funcione con pedidos reales. Conectarla requiere autorización
  (§17.9).
- **El adaptador no escribe en la tabla real** mientras
  `HARPER_CREDITO_ACTIVO` esté apagado: solo en el Airtable de prueba.
- Las pruebas corren contra una tabla y un cerrojo en memoria
  (`tests/credito-persistencia.test.ts`) y contra el Airtable y el Redis de
  prueba (`tests/credito-airtable.test.ts`).
- **Se probó también contra un Airtable y un Redis reales de prueba**
  (Tarea 13, §17.10): pasaron las 6 pruebas y no quedó nada escrito.

### 17.2 La tabla «Créditos» (aprobada y creada)

**Por qué no en Saldos:**

1. El código de hoy lee un tipo desconocido como «Ajuste» y cuenta como
   disponible todo lo que no tiene `Disponible_desde`. Un crédito pendiente
   se vería como saldo para gastar.
2. El saldo de hoy sirve en cualquier producto. El crédito nuevo, solo en
   anteojos (§10.3). En la misma tabla se mezclarían.
3. El crédito nuevo se libera por la entrega, no por el pago. Necesita
   campos que Saldos no tiene.

**Los campos, uno por uno:**

| Campo | Tipo en Airtable | Para qué |
|---|---|---|
| Clave | Texto (campo principal) | `credito-harper:<pedido>`. Airtable **no** impide filas repetidas: la unicidad la da el cerrojo (§17.4) |
| Pedido | Texto | El número, «HARPER-…» |
| Email | Email | La cuenta del crédito: el mail de la compra, en minúsculas |
| Monto | Número, sin decimales | El crédito, en pesos |
| Porcentaje | Número, sin decimales | 5 o 10; 0 en una fila que bloquea (§17.8) |
| Base | Número | Lo pagado en dinero en anteojos |
| Anteojos | Número, sin decimales | Cuántos anteojos tuvo el pedido |
| Estado | Selección única: Pendiente, Disponible, Anulado, A revisar | «A revisar» no se puede usar hasta que Harper decida |
| Generado_el | Fecha y hora | Cuándo se anotó: al acreditarse el pago |
| Fecha_entrega | Fecha | La entrega confirmada |
| Disponible_desde | Fecha | 30 días después de la entrega |
| Incidencia_abierta | Casilla | Devolución, reclamo o contracargo abierto |
| Reglas | Texto | La versión de las reglas: «credito-harper-v1» |
| Notas | Texto largo | El historial, una línea por cambio |

**No cambia nada más:** ni Saldos, ni Pedidos, ni Suscriptores, ni Config.
La tabla va en la misma base, con el mismo token del sitio.

**Qué pedidos van con las reglas de hoy.** Se decide al crear el pedido. Hoy
el checkout ya anota «Cashback a acreditar» en las Notas del pedido; el
crédito nuevo se anotaría igual, sin campo nuevo en Pedidos. Eso es parte de
conectar el checkout (§17.7).

### 17.3 Las operaciones

**Nunca se borra una fila.** Se anula y queda la nota.

| Operación | Lee | Escribe | Cuándo |
|---|---|---|---|
| Anotar el crédito | Créditos del pedido. Saldos: si el pedido tiene «Cashback», solo lectura | Una fila Pendiente | Al acreditarse el pago |
| Confirmar la entrega | Créditos del pedido | Fecha_entrega, Disponible_desde y Notas | Cuando hay una fecha confiable (§14, O1) |
| Liberar | Créditos en Pendiente | Estado Disponible | Una vez por día |
| Devolución | Créditos del pedido | Pendiente: Anulado, o Monto, Porcentaje, Base y Anteojos recalculados. Disponible: «A revisar» | Al registrar la devolución |
| Cancelación, reembolso, contracargo perdido | Créditos del pedido y, obligatoriamente, si el pedido quedó sin cobro (§17.9) | Pendiente: Anulado. Disponible: «A revisar» | Cuando Mercado Pago o Harper lo informan |
| Incidencia abierta o cerrada | Créditos del pedido | Incidencia_abierta. Si estaba Disponible y se abre: «A revisar» | Reclamo o contracargo |
| Saldo de la cuenta | Saldos y Créditos del mail | Nada | Mi cuenta y checkout (otra tarea) |

**Cerrojo obligatorio** (revisión del PR #67). Cada operación toma en Redis
la llave `harper:credito:<pedido>` por 120 segundos. Es distinta de la del
webhook.

- **Sin Redis configurado, o si Redis falla:** no se lee ni se escribe nada.
  La operación avisa con un error para que se reintente.
- **Si el trabajo tarda más de 100 segundos:** la llave pudo vencer. No se
  escribe y se reintenta.

### 17.4 Contra duplicados y webhooks a la vez

- **Lo que protege es el cerrojo.** Con dos avisos del mismo pago a la vez,
  trabaja uno solo. El otro recibe «ocupado» y reintenta. Probado con 10 a
  la vez en memoria y con 5 contra el Airtable y el Redis de prueba: una
  fila.
- **Un reintento:** antes de crear se busca la fila del pedido, aunque esté
  anulada. Si está, no se crea otra.
- **Respaldo, no garantía:** al leer, si quedaron dos filas vigentes, queda
  la más vieja y la otra se anula. Lo mismo al liberar, así un duplicado no
  pasa a Disponible. Puede pasar si una instancia se cae en el medio o si la
  llave venció. Esto **no reemplaza** al cerrojo: Airtable no tiene índices
  únicos ni impide filas repetidas.
- **Un crédito anulado no se vuelve a crear.**
- **Un pedido con el cashback de hoy**, anulado o no, no recibe crédito
  nuevo.
- **Una fila editada a mano con datos que no tienen sentido** se lee como
  «A revisar». Por ejemplo, un estado desconocido, un monto con decimales o
  una clave de otro pedido. No se usa ni se libera sola.

### 17.5 Devoluciones, cancelaciones y contracargos

| Caso | Crédito pendiente | Crédito ya disponible |
|---|---|---|
| Devolución total | Se anula | «A revisar» |
| Devolución parcial | Se recalcula: 5 % si queda un anteojo, 10 % si quedan dos o más, sobre lo que quedó pagado. Nunca sube | «A revisar» |
| Cancelación del pedido | Se anula | «A revisar» |
| Reembolso del pago | Se anula | «A revisar» |
| Contracargo abierto | Queda pendiente: no se libera | «A revisar» |
| Contracargo ganado | Se cierra la incidencia y se libera a su tiempo | Sigue «A revisar»: decide Harper |
| Contracargo perdido | Se anula | «A revisar» |

**Por qué «A revisar» y no anular solo.** Si el cliente ya lo usó, anularlo
deja la cuenta en negativo. Hoy el cashback disponible tampoco se anula
solo: lo decide Harper. Mientras está «A revisar», no se puede usar.

**La devolución parcial** depende de la regla de reintegro, que todavía no
está definida (§14, L1).

### 17.6 Compatibilidad con el saldo de hoy

- **Saldos no se toca:** ni campos ni filas. El saldo de hoy se calcula
  exactamente igual (está probado).
- **La cuenta tendría dos bolsillos:**
  - el saldo de hoy: sirve en cualquier producto;
  - el Crédito Harper: solo anteojos. Disponible, pendiente y «A revisar»,
    por separado.
- **Usar el crédito en el checkout es otra tarea.** Necesita su propia
  propuesta: cómo se anota el uso.

### 17.7 Lo que falta para conectarlo (cada paso con aprobación)

1. ~~Aprobar la tabla «Créditos» y crearla.~~ Hecho el 05/11/2026.
2. ~~El adaptador de Airtable, con pruebas en el Airtable de prueba.~~
   Tarea 10.
3. **El webhook.** La lógica está lista (Tarea 11, §17.9):
   - lee el pago y el pedido de verdad;
   - decide el régimen;
   - reconoce pagos repetidos;
   - no anula si el pedido sigue cobrado.

   Falta conectarla: los cambios concretos están en §17.9 para autorizar.
   Con `HARPER_CREDITO_ACTIVO` apagado, no hace nada.
4. De dónde sale la fecha de entrega (§14, O1). Aprobado en §18: primero
   el campo y la automatización de Airtable; lo que la lee desde el código
   va al conectar el crédito.
5. La liberación diaria.
6. **Mostrarlo en Mi cuenta y usarlo en el checkout.** Usarlo necesita
   descontar o reservar el crédito sin descontarlo dos veces. «Disponible» es
   lo ganado, no lo que queda después de usarlo. Es otra tarea, con su propia
   propuesta.
7. La regla de reintegro de la devolución parcial (§14, L1).

### 17.8 Pagos repetidos, reembolsos anticipados y avisos fuera de orden (Tarea 10)

Mercado Pago puede avisar dos veces, avisar tarde o avisar en otro orden. La
regla: **adentro del cerrojo se lee el estado de verdad** (el pago en
Mercado Pago, el pedido en Pedidos), no el aviso que llegó.

La tabla es la lógica preparada y probada. Todavía no corre con pedidos
reales: el crédito no está conectado al webhook (§17.1).

| Caso | Qué pasa |
|---|---|
| Dos pagos aprobados del mismo pedido | Un solo crédito, sobre lo que se cobró en el pedido, no sobre la suma de los pagos |
| Se reembolsa el pago repetido y el pedido sigue cobrado | El crédito no se toca. Antes de anular, se pregunta si el pedido quedó sin cobro |
| El reembolso llega antes que el aviso del pago | Queda una fila «Anulado» sin monto ni mail. El pago que llega después no anota crédito |
| El aviso dice «aprobado», pero hoy el pago ya está reembolsado | Se lee el estado de hoy: no se anota nada |
| El reembolso llega mientras se está anotando el crédito | Espera su turno: «ocupado», se reintenta y lo anula |
| Cancelación, contracargo perdido o devolución total antes del crédito | Fila «Anulado» que impide anotarlo después |
| Devolución parcial antes del crédito | Fila «A revisar» sin monto: no se anota solo el crédito completo. El crédito menor lo decide Harper |
| La entrega se confirma antes del aviso del pago | El crédito nace con la fecha de entrega del pedido y se libera a los 30 días |
| El contracargo se abre antes de anotar el crédito | El crédito nace con la incidencia abierta y no se libera hasta cerrarla |
| «Contracargo ganado» llega antes que «contracargo abierto» | Cada aviso lee el estado de hoy en Mercado Pago: queda cerrado y se libera a su tiempo |
| Un aviso de pago atrasado sobre un crédito anulado o ya disponible | No lo revive ni lo cambia |
| No se puede leer el pedido, o se lee otro | No se escribe nada y se suelta la llave |

**Probado con infraestructura real** (Tarea 13, §17.10): la concurrencia, la
llave que vence, la respuesta perdida, Redis caído y el reembolso antes del
pago. Se probaron contra un Airtable y un Redis reales de prueba, no los de
Harper.

### 17.9 El crédito con los avisos de pago (Tarea 11)

**Qué hace `lib/credito-pagos.ts`.** Está sin conectar. Solo lee:

- a Mercado Pago le hace GET, nunca crea, cambia ni reembolsa nada;
- en Airtable lee Pedidos y Clientes;
- lo único que escribe es la tabla «Créditos», a través de la persistencia.

Ante el aviso de un pago:

1. **Del aviso solo usa el ID del pago.**
   - Lee el pago en Mercado Pago. Su `external_reference` es el pedido en
     Airtable.
   - Lee también **todos los pagos del pedido**, cada uno por su ID: la
     búsqueda de Mercado Pago puede venir atrasada.
   - **Siempre suma el pago que el webhook registró en Pedidos**
     (`MP_payment_id`) y el del aviso, aunque la búsqueda no los traiga
     (revisión del PR #69).
2. **Del pedido lee:**
   - el Estado: **solo un pedido confirmado** (pagado, preparando, enviado o
     entregado) genera crédito. Uno cancelado, rechazado o sin confirmar no,
     aunque el pago esté aprobado. Se vuelve a leer adentro del cerrojo
     (revisión del PR #69);
   - el número;
   - lo cobrado en cada renglón (Items);
   - el total;
   - el mail del cliente (Clientes);
   - el régimen.
3. **Decide con todos los pagos juntos** (`cobroDelPedido`):

   | Lo que dicen los pagos | Qué pasa con el crédito |
   |---|---|
   | Lo vigente cubre el total (uno o más pagos aprobados) | Se anota; si ya estaba, se pone al día la incidencia |
   | El cliente pagó dos veces | Un solo crédito; el resultado avisa que hay un pago repetido para devolver |
   | Se reembolsó un pago y el otro sigue vigente | **No se anula**: el pedido sigue cobrado |
   | Ya no queda nada vigente (reembolso total, contracargo perdido) | Se anula, o queda bloqueado si llegó antes del crédito |
   | Reembolso parcial | Se abre la incidencia: no se libera hasta que Harper registre la devolución |
   | Reclamo o contracargo en curso | Se anota con la incidencia abierta; ganado, se cierra |
   | En curso, rechazado o nunca cobrado | Nada, ni una fila de bloqueo: puede pagar después |

4. **Antes de escribir, vuelve a leer todo adentro del cerrojo del pedido.**
   - Si algo cambió entre el aviso y la llave, vale lo nuevo.
   - Por ejemplo, si el otro pago se reembolsó justo en ese momento, no se
     anota. Si apareció un pago nuevo, no se anula.
5. **Anular exige leer si el pedido quedó sin cobro.** Es obligatorio por
   código (revisión del PR #68). Una anulación a mano de Harper lo tiene que
   decir explícitamente.
6. **Si no se puede certificar el cobro, no se decide nada** (revisión del
   PR #69). No se escribe nada y se reintenta (`CobroIncierto`) cuando:
   - un pago tiene un estado de Mercado Pago que no se conoce: nunca se lo
     toma como «sin cobro»;
   - la búsqueda dice que hay más pagos de los que trajo, o más de 200:
     no se corta en silencio;
   - con «sin cobro», la búsqueda todavía no trae el pago del aviso o el
     registrado: puede faltar otro pago vigente.

   Un contracargo con un detalle que no se conoce cuenta como en curso: la
   plata sigue vigente y la incidencia, abierta.

**El régimen** sale de las Notas del pedido:

| Notas del pedido | Régimen |
|---|---|
| «Cashback a acreditar: …» (el de hoy) | Reglas de hoy: no hay crédito nuevo |
| «Crédito Harper: reglas nuevas (credito-harper-v1)» | Crédito Harper |
| Las dos | Reglas de hoy (no se suma nada) |
| Ninguna (todos los pedidos de hoy) | Reglas de hoy |

**Fallas.**

- **Errores de lectura:** si Mercado Pago o Airtable no contestan, suben
  como error y no se escribe nada.
- **Sin Redis:** no se escribe nada.
- **Cerrojo ocupado:** devuelve «ocupado».
- **En todos esos casos:** quien llame contesta 503 y Mercado Pago reintenta.

**Cambios concretos al flujo de pagos, PARA AUTORIZAR (no están hechos):**

1. **`app/api/checkout/route.ts`**
   - Con `HARPER_CREDITO_ACTIVO=1` y un pedido sin cashback de hoy, agregar
     a las Notas del pedido la línea «Crédito Harper: reglas nuevas
     (credito-harper-v1)».
   - No cambia ni el precio, ni el cobro, ni la preferencia de Mercado Pago.
   - Con el interruptor apagado, el pedido queda idéntico.
2. **`lib/webhook-proceso.ts`, en `procesarNotificacion`**
   - Cuándo: cuando el flujo de hoy ya contestó 200 y con
     `HARPER_CREDITO_ACTIVO=1`.
   - Qué hace: llamar a `procesarPagoParaCredito(id del pago)`.
   - Va después de soltar el cerrojo del pedido. El del crédito es otra
     llave.
   - Si tira error o queda «ocupado», el aviso contesta 503 y Mercado Pago
     reintenta. Los pasos de hoy ya son idempotentes: el reintento los salta.
   - Va para todos los avisos, también los de reembolso y contracargo, que
     hoy salen por la rama «duplicado».
   - Con el interruptor apagado, el webhook queda idéntico.
3. **Una ruta diaria nueva, `/api/credito/diario`** (cron de Vercel,
   protegida):
   - libera los créditos que cumplieron los 30 días;
   - hace una conciliación que manda un mail a Harper: créditos duplicados,
     créditos pendientes cuyo pedido ya no está cobrado y pagos repetidos sin
     devolver;
   - es lo que cubre el caso de una escritura que terminó después de vencer
     la llave (revisión del PR #68, punto 4).
4. **No se cambia:** el cashback de hoy, las cuotas, los precios ni las
   condiciones.
5. **El cashback de hoy ante pagos repetidos:** se corrigió aparte, en la
   Tarea 12 (§17.11).

**Falta decidir antes de conectar:**

- ~~la fuente de la fecha de entrega~~: decidida en §18 (05/11/2026);
- el aviso a los suscriptores (§11);
- cómo se usa el crédito en el checkout (§17.7, punto 6).

### 17.10 Pruebas en una base aislada y Redis real (Tarea 13, hechas)

`tests/integracion/credito-sandbox.test.ts` prueba contra infraestructura de
verdad, sin pedidos ni créditos de clientes.

**Resultado (05/11/2026, hora de Argentina): pasaron las 6, contra el
Airtable y el Redis de prueba reales**, en unos 20 segundos. Se corrió con el
código de main en `1109dcd`.

| Prueba | Qué mostró |
|---|---|
| 1. Cuatro instancias anotan el mismo crédito a la vez | Una sola fila y ningún duplicado anulado: alcanzó el cerrojo, sin el respaldo |
| 2. Otra instancia tiene la llave, con vencimiento de 1,5 s | «Ocupado» y ninguna fila mientras dura; a los 2 s vence sola y se crea el crédito |
| 3. Airtable escribe, pero la respuesta se pierde | El reintento encuentra la fila («ya») y no crea otra |
| 4. Redis inalcanzable | Falla cerrado (`ErrorCerrojo`) y no escribe nada |
| 5. El reembolso llega antes que el pago | Queda una fila «Anulado»; el pago que llega después no anota crédito («ya») |
| 6. Un aviso de pago de punta a punta, con pago repetido | Pedido y Cliente leídos de la base de prueba. Se crea el crédito; reembolsar el repetido no lo toca; reembolsar los dos lo anula |

En la prueba 6, Mercado Pago es de mentira, porque no hay pagos de prueba.
Airtable y Redis son los reales de prueba.

**Limpieza, verificada después de correr:**

- las cuatro tablas de «Harper Sandbox» quedaron con 0 filas;
- el Redis de prueba quedó con 0 llaves;
- en la base real no se escribió nada: «Créditos» sigue con 0 filas;
- producción siguió en `1109dcd`, con el Dúo y el Crédito Harper apagados.

**El token de Airtable de prueba no entra a la base real:**

- contra «Harper Sandbox» contesta 200;
- contra la base real (`appcFfhxM8uVdVKoP`) contesta 403.

Se comprobó antes de correr. Al primer token le faltaba esa restricción y se
reemplazó.

**Protecciones de la suite:**

- **Se saltea sola** si faltan las variables, como en la suite de siempre.
- **Se niega a correr** si la base es la real de Harper o si aparece una
  tabla real.
- **Lo que crea lleva el prefijo `SANDBOX-…`** y se borra al terminar.

**Lo que hay hoy para repetirla:**

1. **Base de Airtable «Harper Sandbox»** (`appqBwBrRQhdSNAYS`), vacía, sin
   copiar la real. La real tiene la fórmula de «Etiqueta», que tiene un
   secreto. Cuatro tablas:
   - **Créditos** (`tblHticJJUlhy0Ni8`): los 14 campos de §17.2.
   - **Pedidos** (`tblg0bsRWjbd3NY1l`): Numero (texto), Estado (selección),
     Cliente (vínculo a Clientes), Items (texto largo), Total (número),
     Notas (texto largo).
   - **Clientes** (`tble2j5u1nvXbVZ7n`): Email.
   - **Saldos** (`tbl6zfoXSvMsX17ur`): Movimiento (texto), Pedido (texto),
     Tipo (selección: Cashback, Uso, Ajuste), Anulado (casilla).
2. **Redis de Upstash aparte del de producción**, en el plan gratis:
   `content-seahorse-191881.upstash.io`.
3. **Los dos tokens no están en el código, ni en GitHub, ni en Vercel.**
   Están como «Network secrets» del entorno «Cloud» de Claude Code, uno por
   servicio:
   - `api.airtable.com`, solo con acceso a «Harper Sandbox»;
   - el host del Redis de prueba.

   El proxy del entorno los agrega a cada pedido. Por eso las variables de
   token llevan un texto de relleno, no el token.
4. **Las variables, solo donde se corra la prueba** (nunca en Vercel):

   ```
   HARPER_SANDBOX_AIRTABLE_TOKEN=token-de-relleno
   HARPER_SANDBOX_AIRTABLE_BASE=appqBwBrRQhdSNAYS
   HARPER_SANDBOX_TABLAS='{"creditos":"tblHticJJUlhy0Ni8","pedidos":"tblg0bsRWjbd3NY1l","clientes":"tble2j5u1nvXbVZ7n","saldos":"tbl6zfoXSvMsX17ur"}'
   HARPER_SANDBOX_REDIS_URL=https://content-seahorse-191881.upstash.io
   HARPER_SANDBOX_REDIS_TOKEN=token-de-relleno
   NODE_USE_ENV_PROXY=1
   ```

5. **Correr** `npm run test:credito-sandbox`.

**`NODE_USE_ENV_PROXY=1` es obligatorio desde Cloud.**

- El `fetch` de Node no usa el proxy del entorno (`HTTPS_PROXY`) si no se le
  pide.
- Sin esa variable, los pedidos salen sin pasar por el proxy, llevan el
  token de relleno y Airtable y Upstash contestan 401.
- Pasó en la primera corrida: las 6 fallaron con 401 y no se escribió nada.
- Con la variable, el proxy pone el token verdadero.
- Se corrió con Node 22.22, que la reconoce. Una versión vieja de Node la
  ignora y vuelve el 401.
- Fuera de Cloud, con los tokens en las variables, no hace falta.

**Para dejar de usar el entorno de prueba:** borrar los dos secretos en Cloud,
en Edit, Network secrets. La base y el Redis de prueba se pueden borrar sin
tocar nada de Harper.

**El adaptador escribe en esa base** solo con `HARPER_CREDITO_SANDBOX=1`,
fuera de Vercel y con una base que no sea la real (`puedeEscribirCreditos`).

### 17.11 El cashback de hoy ante pagos repetidos (Tarea 12)

**Esta sección es del cashback de hoy (tabla Saldos), que sí está en
producción** desde el PR #70. No es el Crédito Harper, que sigue sin
conectar (§17.1).

**El error que había.**

- El webhook anulaba el cashback cuando se reembolsaba el pago registrado
  en el pedido, aunque el cliente hubiera pagado dos veces y el otro pago
  siguiera cobrado.
- Al revés, si después se devolvía el repetido, no lo anulaba nunca.

**Cómo queda.** Ante un reembolso, un contracargo o una disputa de
**cualquier** pago del pedido, el webhook mira todos los pagos en Mercado
Pago, con la misma lectura del crédito (`lib/mp-cobro.ts`, solo lectura).

**Una disputa abierta** (revisión del PR #70) puede ser de dos tipos:

- `in_mediation`: el cliente abrió un reclamo en Mercado Pago;
- `charged_back` en curso: el banco inició un contracargo.

Se trata igual que un contracargo en curso. **No se anula el cashback solo
porque haya una disputa sin resolver.**

| Lo que dicen los pagos | Cashback |
|---|---|
| Pago único reembolsado, o contracargo perdido (`charged_back/settled`) | Se anula y se avisa, como siempre |
| Se devolvió el repetido y el original sigue cobrado | No se anula |
| Se devolvió el original y el repetido sigue cobrado | No se anula (antes sí) |
| Se devolvieron los dos, en cualquier orden | Se anula una sola vez, al quedar sin cobro |
| Disputa abierta (`in_mediation` o `charged_back/in_process`) | No se anula todavía. Mail «REVISAR … disputa abierta en Mercado Pago: cashback sin anular»: dice si otro pago válido cubre el pedido y, si no, cómo bloquearlo |
| La disputa termina perdida y el pedido queda sin cobro (reembolsado o contracargo perdido) | Se anula |
| La disputa termina perdida, pero otro pago válido cubre el pedido | No se anula |
| La disputa termina ganada (`charged_back/reimbursed`, o el pago vuelve a aprobado) | No se anula |
| Quedó cobrado en parte | No se anula: se avisa a Harper, que decide |
| Mercado Pago no contesta, la búsqueda viene incompleta o atrasada, o un estado no se conoce | No se anula ni se avisa por suposición: 503 y Mercado Pago reintenta |

**Qué pagos se miran:**

- los de la búsqueda de Mercado Pago;
- el del aviso;
- el registrado en el pedido;
- los que quedaron en la marca «revisar: segundo pago aprobado…».

Cada uno se lee por su ID.

**Lo único que cambia sin pagos repetidos: las disputas.**

- **El contracargo:** antes se anulaba apenas empezaba. Ahora espera a saber
  si se pierde, y mientras tanto avisa a Harper.
- **El reclamo (`in_mediation`):** antes no hacía nada ni avisaba. Ahora
  avisa.

**Lo que no cambia:**

- el resto del webhook;
- los pedidos sin cashback, que ni siquiera leen los pagos;
- los mails de siempre;
- el Crédito Harper y el Dúo, que siguen apagados.

**Riesgo: Saldos no tiene un estado de suspensión.**

- Durante una disputa abierta, el cashback sigue contando para el saldo del
  cliente.
- El riesgo existe solo si se cumplen las dos condiciones:
  - el cashback ya está disponible (30 días después del pago);
  - ningún otro pago válido cubre el pedido.
- Si el cliente lo gasta y después pierde la disputa, el webhook lo anula y
  su saldo queda en negativo hasta el próximo cashback. Es lo mismo que pasa
  hoy con un reembolso después de los 30 días.
- El aviso a Harper no evita que se use.

**Cómo bloquearlo hoy, a mano, sin cambiar la tabla.** El mail de la disputa
lo explica:

1. En Saldos, marcar «Anulado» el Cashback de ese pedido.
2. Anotar en Notas «suspendido por disputa del pago X».
3. Si la disputa se gana, desmarcarlo. Si se pierde, el webhook ya lo
   encuentra anulado y no vuelve a avisar.

Marcarlo es reversible y el saldo deja de contarlo en el acto. El webhook
nunca vuelve a crear un cashback anulado.

**Propuesta para bloquearlo solo (PARA AUTORIZAR, no está hecha):**

- **Un campo nuevo en Saldos:** «Suspendido» (casilla).
  - **Quién lo escribe:** el webhook.
    - Lo marca en el Cashback del pedido al abrirse una disputa que no está
      cubierta por otro pago.
    - Lo desmarca si la disputa se gana.
    - Si se pierde, anula como hoy.
  - **Qué cambia en el saldo:** `saldoDe` (lib/suscriptores.ts) no cuenta lo
    suspendido. El checkout y Mi cuenta usan ese cálculo, así que el bloqueo
    llega solo.
  - **Qué toca:** un campo nuevo y escrituras solo sobre la fila Cashback del
    pedido en disputa. No cambia ninguna fila existente.
- **Descartado:** consultar las disputas en Mercado Pago en cada checkout.
  Es lento, depende de que Mercado Pago conteste y no cubre Mi cuenta.

---

## 18. Fecha de entrega confiable (Tarea 14, aprobada por Ale el 05/11/2026)

**Aprobada con condiciones (§18.5).** Resuelve §14, O1. El crédito
pendiente pasa a disponible 30 días después de esta fecha (§10.2).

**Qué se implementa ahora y qué no:**

- **Ahora:** solo el campo «Fecha_entrega» en Pedidos y la automatización
  de Airtable que lo completa, con una prueba controlada.
- **Después, cada parte con su autorización:** lo que lee la fecha desde el
  código. Eso es la ruta diaria, los avisos de los 10 días y la incidencia
  por arrepentimiento.
- **El Crédito Harper sigue sin conectar.** El webhook, el checkout y Mi
  cuenta no lo usan, y `HARPER_CREDITO_ACTIVO` está apagado. Las tablas de
  esta sección dicen cómo va a funcionar cuando se conecte, no lo que pasa
  hoy en producción.

### 18.1 Lo que ya existe

| Pieza | Qué hace hoy | ¿Sirve para la fecha? |
|---|---|---|
| Estado del pedido (Pedidos): pagado, preparando, enviado, entregado | «enviado» y «entregado» los pone Harper a mano en Airtable. Ningún código los cambia | Sí: «entregado» es la señal. Pero no guarda cuándo |
| Tracking (texto) | El número o el enlace del transportista. Mi cuenta lo muestra en «Seguir mi envío» (`lib/mis-compras.ts`) | Ahí Harper ve la fecha real de entrega |
| Automatización «Aviso de despacho» (sin encender) | Con «enviado» y Tracking, le pide a harper.ar el mail «Tu pedido está en camino». No cambia el Estado | Es el modelo a copiar: una automatización de Airtable que se dispara por una condición |
| MiCorreo (`lib/correo.ts`) | Cotiza y carga el envío en Correo Argentino desde el link «Etiqueta». Guarda Correo_envio_id y el Tracking | Hoy no lee el seguimiento. Sería la fase 2 (§18.4) |
| Envia (`lib/envia.ts`) | Solo cotiza. No crea envíos ni recibe avisos | No: sin un envío creado en Envia, no hay seguimiento |
| Rueddo (`lib/rueddo.ts`) | Solo la tarifa de AMBA. El envío se arma fuera del sistema | No hay integración |
| Arrepentimientos | Guarda cada solicitud del botón, con fecha. El número de pedido es opcional y se escribe a mano | Sirve para abrir la incidencia, no para la fecha |
| Crédito Harper (`lib/credito-persistencia.ts`) | `confirmarEntrega` guarda la fecha una sola vez. Si llega otra distinta, no la pisa: devuelve «distinta». Si la entrega se conoce antes que el pago, el crédito nace con ella | Sí: solo falta de dónde leerla |

**Lo que falta:** Pedidos no tiene un campo con la fecha de entrega. Hoy
«entregado» dice que llegó, no cuándo.

**Los datos de hoy (05/11/2026):**

- De 27 pedidos web, ninguno está «enviado» ni «entregado»: hay 2 pagados,
  6 cancelados y 19 pendientes.
- De los 11 que eligieron envío, 9 son Rueddo (AMBA) y 2 de tarifa plana.
  Ninguno usó Correo Argentino ni Andreani.
- No hay fechas viejas que recuperar: el campo nacería vacío y serviría
  desde el primer envío.

### 18.2 La solución aprobada

**Fuente de la fecha: Harper, al marcar «entregado»** (confirmación
manual). Por ahora no viene del transportista.

Por qué:

- es lo que ya se hace: Harper marca el estado;
- ningún transportista tiene el seguimiento integrado, y casi todos los
  envíos elegidos son de Rueddo, que no tiene integración;
- con tan pocos pedidos, una integración cuesta más de lo que resuelve.

**Cambio en Airtable (aprobado):**

1. **Un campo nuevo en Pedidos: «Fecha_entrega»** (Fecha, sin hora).
2. **Una automatización nueva, «Fecha de entrega»**, como la de despacho:
   - registra la fecha **solo cuando el pedido pasa a «entregado» y el
     campo está vacío**;
   - pone la fecha del día, en hora de Argentina;
   - **nunca sobrescribe una fecha cargada**;
   - no llama a harper.ar, no usa secretos, no manda mails y no cambia el
     Estado.

   Antes de dejarla andando con pedidos reales, se hace una prueba
   controlada que no dispara mails ni toca pedidos reales.
3. **Harper puede corregir la fecha** a la del seguimiento del transportista
   si marcó «entregado» días después:
   - una fecha más tardía que la real es segura: el crédito se libera
     después;
   - una más temprana, no: lo liberaría antes de tiempo.

**Descartado:** un campo de «última modificación» del Estado. Cambia cada
vez que se toca el Estado, por ejemplo si después se cancela, y se perdería
la fecha.

**Cambio mínimo en el código (no está hecho).** Va al conectar el crédito,
con `HARPER_CREDITO_ACTIVO=1`, y cada punto se autoriza:

1. **Al anotar el crédito, leer Fecha_entrega del pedido.** Hoy se pasa
   vacía (`lib/credito-pagos.ts`).
2. **En la ruta diaria ya propuesta** (`/api/credito/diario`, §17.9):
   - **Confirmar entregas:** a cada crédito pendiente sin fecha, si su
     pedido ya tiene Fecha_entrega, se le aplica `confirmarEntrega`. Leerla
     un día después no cambia nada: el crédito se libera 30 días después de
     la entrega, no de cuando se leyó.
   - **Antes de liberar, volver a leer el pedido.** Si ya no está
     «entregado» o la fecha cambió, no se libera y se avisa a Harper.
   - **Avisar a Harper** en el mail diario de la conciliación (abajo).
3. **Validar la fecha:** no puede ser futura ni anterior a la compra. Si no
   es válida, no se usa y se avisa.
4. **La incidencia por arrepentimiento**, solo con el pedido verificado
   (abajo).

**El aviso de los 10 días separa dos casos** (Ale, 05/11/2026):

| Lista | Qué pedidos | Qué tiene que hacer Harper |
|---|---|---|
| **Cobrados sin despachar** | Estado «pagado» o «preparando», con más de 10 días desde la compra | Despachar o avisar al cliente |
| **Enviados sin entrega confirmada** | Estado «enviado», sin Fecha_entrega, con más de 10 días desde la compra | Mirar el seguimiento y marcar «entregado», o reclamar al transportista |

- **Quedan afuera:** los pendientes de pago, los cancelados y los
  rechazados.
- **Control aparte:** un pedido «entregado» sin Fecha_entrega no debería
  existir. Si aparece, se avisa sin esperar los 10 días: quiere decir que
  la automatización falló.
- El aviso solo lee Pedidos. Puede mandarse aunque el crédito siga apagado.

**La incidencia por arrepentimiento se abre sola solo si el pedido está
verificado** (Ale, 05/11/2026). Tienen que cumplirse las cuatro cosas:

1. la solicitud trae un número de pedido que existe en Pedidos;
2. el mail de la solicitud es el del cliente de ese pedido;
3. el pedido está confirmado: pagado, preparando, enviado o entregado;
4. el pedido tiene un Crédito Harper.

- **Si falta cualquiera, no se toca nada.** Queda para revisión manual: el
  mail de la solicitud le avisa a Harper que no se pudo vincular con
  seguridad.
- **Abrir la incidencia solo frena la liberación.** No anula el crédito ni
  cambia el monto. Cerrarla es siempre de Harper.
- El formulario no verifica el mail. Por eso hace falta que coincidan el
  número y el mail del pedido. Aun así, una incidencia abierta por error
  solo atrasa la liberación hasta que Harper la cierre.

### 18.3 Cuando falta la confirmación, llega tarde o hay una devolución

Así va a funcionar **cuando el crédito se conecte**. Hoy el Crédito Harper
no está conectado y no hace nada en producción.

| Caso | Qué pasa |
|---|---|
| Nadie confirma la entrega | El crédito sigue pendiente y **nunca se libera solo**. A los 10 días de la compra, el mail diario lo avisa a Harper en la lista que corresponde (cobrado sin despachar, o enviado sin entrega confirmada), hasta que se resuelva |
| Harper consulta y el paquete llegó | Marca «entregado» y, si hace falta, corrige la fecha a la del seguimiento |
| El paquete se perdió o volvió al remitente | Nunca queda «entregado»: el crédito no se libera. Si se reembolsa, el crédito se anula con el aviso del reembolso, cuando esté conectado al webhook (§17.9, para autorizar) |
| Harper marca «entregado» días después | La automatización pone la fecha del día. Harper la corrige a la real si la sabe. Si no, queda la tardía: el crédito se libera después, nunca antes |
| La fecha se corrige cuando el crédito ya la leyó | El crédito no cambia solo (`confirmarEntrega` devuelve «distinta»). El mail diario avisa la diferencia y Harper decide |
| Se marcó «entregado» por error | Harper vuelve el Estado atrás. Antes de liberar se relee el pedido: no se libera y se avisa. Hay 30 días para darse cuenta |
| La entrega se confirma antes que el aviso del pago | El crédito nace con esa fecha. La lógica ya lo contempla y está probada (§17.8), pero no está conectada |
| Arrepentimiento (10 días) | El crédito sigue pendiente, porque se libera a los 30 días. La solicitud abre la incidencia solo si el pedido está verificado; si no, Harper la revisa a mano (§18.2). Con la devolución hecha, se anula o se recalcula (§17.5) |
| Cambio (30 días) | Harper marca «Incidencia_abierta» en Créditos. No se libera hasta cerrarla. Si ya estaba disponible, queda «A revisar» |
| Devolución con reembolso por Mercado Pago | El crédito se anula cuando el pedido queda sin cobro, con la lectura de §17.9, una vez conectado al webhook |
| El cambio se manda en un segundo envío | Vale la primera fecha de entrega. La incidencia abierta frena la liberación hasta cerrarla |

**No se presume la entrega.** Sin fecha, el crédito no se libera solo,
aunque pasen meses. Presumirla podría liberarlo antes de que terminen los
plazos de devolución.

### 18.4 Segunda etapa: el seguimiento del transportista (no se hace ahora)

- **Correo Argentino:** Harper ya carga esos envíos en MiCorreo y guarda
  Correo_envio_id. El paso mínimo sería que la ruta diaria lea el
  seguimiento y avise «Correo Argentino dice entregado el …», para que
  Harper lo confirme. Es una hipótesis: hay que comprobar con un envío real
  que MiCorreo da la fecha de entrega antes de diseñarlo.
- **Rueddo y Andreani:** no hay integración. Hoy no conviene hacerla.
- **Cuándo hacer la fase 2:**
  - si más de 1 de cada 10 pedidos enviados llega al aviso de los 10 días;
  - o si las fechas cargadas difieren del seguimiento en más de 2 días.

**Cómo se mide:**

- los pedidos «entregado» con Fecha_entrega, sobre el total de entregados:
  tiene que dar 100 %;
- los días entre la compra y la entrega, por transportista;
- cuántos pedidos llegan al aviso de los 10 días;
- una vez por mes, comparar 5 fechas cargadas con el seguimiento del
  transportista.

### 18.5 Decisiones de Ale (05/11/2026, revisión del PR #71)

1. **Confirmación manual de la entrega**, sin integrar transportistas por
   ahora.
2. **Se crean el campo «Fecha_entrega» en Pedidos y la automatización.**
   - Registra la fecha solo cuando el pedido pasa a «entregado» y el campo
     está vacío.
   - No sobrescribe fechas existentes.
   - Primero, una prueba controlada que no dispare mails ni afecte pedidos
     reales.
3. **Sin fecha confirmada, el Crédito Harper sigue pendiente y nunca se
   libera automáticamente.** No se presume la entrega.
4. **El aviso de los 10 días separa** los pedidos cobrados que todavía no
   se despacharon de los enviados cuya entrega no se confirmó. Deja afuera
   los cancelados y los pendientes de pago (§18.2).
5. **La solicitud de arrepentimiento abre sola una incidencia solo si se
   verifica que corresponde al pedido correcto.** Si no se puede validar,
   queda para revisión manual (§18.2).
6. **El seguimiento automático de transportistas queda para una segunda
   etapa** (§18.4).

**No cambia:** los pagos, el cashback de hoy, los precios, el Dúo ni
ninguna otra función.

---

## Anexo A. Tablas completas de la sección A

Salen de `lib/contribucion.ts` con los supuestos de A.3: costo de $ 10.208, CAC de $ 20.000 por pedido, 6 cuotas y las reglas de envío de hoy. «Cobrado» es lo que se cobra con IVA, con el envío si lo paga el cliente y sin el crédito usado. «Por anteojo» es la contribución del pedido dividida por los anteojos del pedido. «$ 24.000» marca si llega al objetivo por anteojo.

### A-1. Primera compra individual, 5 % de crédito

| Precio | Envío | Cobrado | Crédito nuevo | Contribución del pedido | Por anteojo | Margen | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|
| $ 89.900 | AMBA, CABA ($ 4.488), gratis | $ 89.900 | $ 4.495 | $ 17.900 | $ 17.900 | 24,1 % | ✓ | ✗ |
| $ 89.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 89.900 | $ 4.495 | $ 14.109 | $ 14.109 | 19,0 % | ✗ | ✗ |
| $ 89.900 | Resto, $ 10.000, lo paga el cliente | $ 100.900 | $ 4.495 | $ 20.385 | $ 20.385 | 24,4 % | ✓ | ✗ |
| $ 89.900 | Resto, $ 15.000, lo paga el cliente | $ 106.400 | $ 4.495 | $ 19.772 | $ 19.772 | 22,5 % | ✓ | ✗ |
| $ 99.900 | AMBA, CABA ($ 4.488), gratis | $ 99.900 | $ 4.995 | $ 23.887 | $ 23.887 | 28,9 % | ✓ | ✗ |
| $ 99.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 99.900 | $ 4.995 | $ 20.096 | $ 20.096 | 24,3 % | ✓ | ✗ |
| $ 99.900 | Resto, $ 10.000, lo paga el cliente | $ 110.900 | $ 4.995 | $ 26.371 | $ 26.371 | 28,8 % | ✓ | ✓ |
| $ 99.900 | Resto, $ 15.000, lo paga el cliente | $ 116.400 | $ 4.995 | $ 25.758 | $ 25.758 | 26,8 % | ✓ | ✓ |
| $ 104.900 | AMBA, CABA ($ 4.488), gratis | $ 104.900 | $ 5.245 | $ 26.880 | $ 26.880 | 31,0 % | ✓ | ✓ |
| $ 104.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 104.900 | $ 5.245 | $ 23.089 | $ 23.089 | 26,6 % | ✓ | ✗ |
| $ 104.900 | Resto, $ 10.000, lo paga el cliente | $ 115.900 | $ 5.245 | $ 29.364 | $ 29.364 | 30,7 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 15.000, lo paga el cliente | $ 121.400 | $ 5.245 | $ 28.752 | $ 28.752 | 28,7 % | ✓ | ✓ |
| $ 109.900 | AMBA, CABA ($ 4.488), gratis | $ 109.900 | $ 5.495 | $ 29.873 | $ 29.873 | 32,9 % | ✓ | ✓ |
| $ 109.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 109.900 | $ 5.495 | $ 26.082 | $ 26.082 | 28,7 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 10.000, lo paga el cliente | $ 120.900 | $ 5.495 | $ 32.357 | $ 32.357 | 32,4 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 15.000, lo paga el cliente | $ 126.400 | $ 5.495 | $ 31.745 | $ 31.745 | 30,4 % | ✓ | ✓ |

### A-2. Primera compra Dúo, 25 % y 10 % de crédito

| Precio | Envío | Cobrado | Crédito nuevo | Contribución del pedido | Por anteojo | Margen | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|
| $ 89.900 | AMBA, CABA ($ 4.488), gratis | $ 157.325 | $ 15.733 | $ 41.554 | $ 20.777 | 32,0 % | ✓ | ✗ |
| $ 89.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 157.325 | $ 15.733 | $ 37.763 | $ 18.882 | 29,0 % | ✓ | ✗ |
| $ 89.900 | Resto, $ 10.000, gratis | $ 157.325 | $ 15.733 | $ 36.999 | $ 18.499 | 28,5 % | ✓ | ✗ |
| $ 89.900 | Resto, $ 15.000, gratis | $ 157.325 | $ 15.733 | $ 32.866 | $ 16.433 | 25,3 % | ✓ | ✗ |
| $ 99.900 | AMBA, CABA ($ 4.488), gratis | $ 174.825 | $ 17.483 | $ 51.307 | $ 25.654 | 35,5 % | ✓ | ✓ |
| $ 99.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 174.825 | $ 17.483 | $ 47.516 | $ 23.758 | 32,9 % | ✓ | ✗ |
| $ 99.900 | Resto, $ 10.000, gratis | $ 174.825 | $ 17.483 | $ 46.752 | $ 23.376 | 32,4 % | ✓ | ✗ |
| $ 99.900 | Resto, $ 15.000, gratis | $ 174.825 | $ 17.483 | $ 42.619 | $ 21.310 | 29,5 % | ✓ | ✗ |
| $ 104.900 | AMBA, CABA ($ 4.488), gratis | $ 183.575 | $ 18.358 | $ 56.184 | $ 28.092 | 37,0 % | ✓ | ✓ |
| $ 104.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 183.575 | $ 18.358 | $ 52.393 | $ 26.196 | 34,5 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 10.000, gratis | $ 183.575 | $ 18.358 | $ 51.628 | $ 25.814 | 34,0 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 15.000, gratis | $ 183.575 | $ 18.358 | $ 47.496 | $ 23.748 | 31,3 % | ✓ | ✗ |
| $ 109.900 | AMBA, CABA ($ 4.488), gratis | $ 192.325 | $ 19.233 | $ 61.060 | $ 30.530 | 38,4 % | ✓ | ✓ |
| $ 109.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 192.325 | $ 19.233 | $ 57.269 | $ 28.635 | 36,0 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 10.000, gratis | $ 192.325 | $ 19.233 | $ 56.505 | $ 28.252 | 35,5 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 15.000, gratis | $ 192.325 | $ 19.233 | $ 52.372 | $ 26.186 | 32,9 % | ✓ | ✓ |

### A-3. Segunda compra individual: usa el 5 % de la primera y genera otro 5 %

| Precio | Envío | Cobrado | Crédito usado | Crédito nuevo | Contribución del pedido | Por anteojo | Margen | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|---|
| $ 89.900 | AMBA, CABA ($ 4.488), gratis | $ 85.405 | $ 4.495 | $ 4.270 | $ 18.813 | $ 18.813 | 25,3 % | ✓ | ✗ |
| $ 89.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 85.405 | $ 4.495 | $ 4.270 | $ 15.022 | $ 15.022 | 20,2 % | ✗ | ✗ |
| $ 89.900 | Resto, $ 10.000, lo paga el cliente | $ 96.405 | $ 4.495 | $ 4.270 | $ 21.297 | $ 21.297 | 25,5 % | ✓ | ✗ |
| $ 89.900 | Resto, $ 15.000, lo paga el cliente | $ 101.905 | $ 4.495 | $ 4.270 | $ 20.685 | $ 20.685 | 23,5 % | ✓ | ✗ |
| $ 99.900 | AMBA, CABA ($ 4.488), gratis | $ 94.905 | $ 4.995 | $ 4.745 | $ 24.901 | $ 24.901 | 30,2 % | ✓ | ✓ |
| $ 99.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 94.905 | $ 4.995 | $ 4.745 | $ 21.110 | $ 21.110 | 25,6 % | ✓ | ✗ |
| $ 99.900 | Resto, $ 10.000, lo paga el cliente | $ 105.905 | $ 4.995 | $ 4.745 | $ 27.385 | $ 27.385 | 29,9 % | ✓ | ✓ |
| $ 99.900 | Resto, $ 15.000, lo paga el cliente | $ 111.405 | $ 4.995 | $ 4.745 | $ 26.773 | $ 26.773 | 27,8 % | ✓ | ✓ |
| $ 104.900 | AMBA, CABA ($ 4.488), gratis | $ 99.655 | $ 5.245 | $ 4.983 | $ 27.945 | $ 27.945 | 32,2 % | ✓ | ✓ |
| $ 104.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 99.655 | $ 5.245 | $ 4.983 | $ 24.154 | $ 24.154 | 27,9 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 10.000, lo paga el cliente | $ 110.655 | $ 5.245 | $ 4.983 | $ 30.429 | $ 30.429 | 31,8 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 15.000, lo paga el cliente | $ 116.155 | $ 5.245 | $ 4.983 | $ 29.816 | $ 29.816 | 29,7 % | ✓ | ✓ |
| $ 109.900 | AMBA, CABA ($ 4.488), gratis | $ 104.405 | $ 5.495 | $ 5.220 | $ 30.989 | $ 30.989 | 34,1 % | ✓ | ✓ |
| $ 109.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 104.405 | $ 5.495 | $ 5.220 | $ 27.198 | $ 27.198 | 29,9 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 10.000, lo paga el cliente | $ 115.405 | $ 5.495 | $ 5.220 | $ 33.473 | $ 33.473 | 33,5 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 15.000, lo paga el cliente | $ 120.905 | $ 5.495 | $ 5.220 | $ 32.861 | $ 32.861 | 31,5 % | ✓ | ✓ |

### A-4. Segunda compra Dúo: usa el 10 % del primer Dúo y genera otro 10 %

| Precio | Envío | Cobrado | Crédito usado | Crédito nuevo | Contribución del pedido | Por anteojo | Margen | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|---|
| $ 89.900 | AMBA, CABA ($ 4.488), gratis | $ 141.592 | $ 15.733 | $ 14.159 | $ 45.399 | $ 22.699 | 34,9 % | ✓ | ✗ |
| $ 89.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 141.592 | $ 15.733 | $ 14.159 | $ 41.608 | $ 20.804 | 32,0 % | ✓ | ✗ |
| $ 89.900 | Resto, $ 10.000, gratis | $ 141.592 | $ 15.733 | $ 14.159 | $ 40.843 | $ 20.422 | 31,4 % | ✓ | ✗ |
| $ 89.900 | Resto, $ 15.000, gratis | $ 141.592 | $ 15.733 | $ 14.159 | $ 36.711 | $ 18.356 | 28,2 % | ✓ | ✗ |
| $ 99.900 | AMBA, CABA ($ 4.488), gratis | $ 157.342 | $ 17.483 | $ 15.734 | $ 55.580 | $ 27.790 | 38,5 % | ✓ | ✓ |
| $ 99.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 157.342 | $ 17.483 | $ 15.734 | $ 51.789 | $ 25.894 | 35,8 % | ✓ | ✓ |
| $ 99.900 | Resto, $ 10.000, gratis | $ 157.342 | $ 17.483 | $ 15.734 | $ 51.024 | $ 25.512 | 35,3 % | ✓ | ✓ |
| $ 99.900 | Resto, $ 15.000, gratis | $ 157.342 | $ 17.483 | $ 15.734 | $ 46.892 | $ 23.446 | 32,5 % | ✓ | ✗ |
| $ 104.900 | AMBA, CABA ($ 4.488), gratis | $ 165.217 | $ 18.358 | $ 16.522 | $ 60.669 | $ 30.335 | 40,0 % | ✓ | ✓ |
| $ 104.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 165.217 | $ 18.358 | $ 16.522 | $ 56.878 | $ 28.439 | 37,5 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 10.000, gratis | $ 165.217 | $ 18.358 | $ 16.522 | $ 56.114 | $ 28.057 | 37,0 % | ✓ | ✓ |
| $ 104.900 | Resto, $ 15.000, gratis | $ 165.217 | $ 18.358 | $ 16.522 | $ 51.982 | $ 25.991 | 34,3 % | ✓ | ✓ |
| $ 109.900 | AMBA, CABA ($ 4.488), gratis | $ 173.092 | $ 19.233 | $ 17.309 | $ 65.760 | $ 32.880 | 41,4 % | ✓ | ✓ |
| $ 109.900 | AMBA, GBA 2 y 3 ($ 9.075), gratis | $ 173.092 | $ 19.233 | $ 17.309 | $ 61.969 | $ 30.985 | 39,0 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 10.000, gratis | $ 173.092 | $ 19.233 | $ 17.309 | $ 61.205 | $ 30.602 | 38,5 % | ✓ | ✓ |
| $ 109.900 | Resto, $ 15.000, gratis | $ 173.092 | $ 19.233 | $ 17.309 | $ 57.072 | $ 28.536 | 35,9 % | ✓ | ✓ |


### A-5. El cliente en tres compras (cada recompra con un costo comercial de $ 20.000)

Con envío gratis de $ 9.075 (AMBA, GBA 2 y 3) en todas las compras. Cada compra usa todo el crédito disponible de la anterior. El crédito pesa una sola vez: en la compra que lo genera.

#### Individual, individual, individual

| Precio | Compra | Cobrado | Crédito usado | Crédito nuevo | Contribución del pedido | Acumulada | Anteojos | Acumulada por anteojo | Margen acumulado | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $ 89.900 | 1ª (individual) | $ 89.900 | $ 0 | $ 4.495 | $ 14.109 | $ 14.109 | 1 | $ 14.109 | 19,0 % | ✗ | ✗ |
|  | 2ª (individual) | $ 85.405 | $ 4.495 | $ 4.270 | $ 15.022 | $ 29.132 | 2 | $ 14.566 | 19,6 % | ✗ | ✗ |
|  | 3ª (individual) | $ 85.630 | $ 4.270 | $ 4.282 | $ 14.976 | $ 44.108 | 3 | $ 14.703 | 19,8 % | ✗ | ✗ |
| $ 99.900 | 1ª (individual) | $ 99.900 | $ 0 | $ 4.995 | $ 20.096 | $ 20.096 | 1 | $ 20.096 | 24,3 % | ✓ | ✗ |
|  | 2ª (individual) | $ 94.905 | $ 4.995 | $ 4.745 | $ 21.110 | $ 41.206 | 2 | $ 20.603 | 25,0 % | ✓ | ✗ |
|  | 3ª (individual) | $ 95.155 | $ 4.745 | $ 4.758 | $ 21.059 | $ 62.265 | 3 | $ 20.755 | 25,1 % | ✓ | ✗ |
| $ 104.900 | 1ª (individual) | $ 104.900 | $ 0 | $ 5.245 | $ 23.089 | $ 23.089 | 1 | $ 23.089 | 26,6 % | ✓ | ✗ |
|  | 2ª (individual) | $ 99.655 | $ 5.245 | $ 4.983 | $ 24.154 | $ 47.243 | 2 | $ 23.621 | 27,2 % | ✓ | ✗ |
|  | 3ª (individual) | $ 99.917 | $ 4.983 | $ 4.996 | $ 24.101 | $ 71.343 | 3 | $ 23.781 | 27,4 % | ✓ | ✗ |
| $ 109.900 | 1ª (individual) | $ 109.900 | $ 0 | $ 5.495 | $ 26.082 | $ 26.082 | 1 | $ 26.082 | 28,7 % | ✓ | ✓ |
|  | 2ª (individual) | $ 104.405 | $ 5.495 | $ 5.220 | $ 27.198 | $ 53.280 | 2 | $ 26.640 | 29,3 % | ✓ | ✓ |
|  | 3ª (individual) | $ 104.680 | $ 5.220 | $ 5.234 | $ 27.142 | $ 80.422 | 3 | $ 26.807 | 29,5 % | ✓ | ✓ |

#### Dúo, Dúo, Dúo

| Precio | Compra | Cobrado | Crédito usado | Crédito nuevo | Contribución del pedido | Acumulada | Anteojos | Acumulada por anteojo | Margen acumulado | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $ 89.900 | 1ª (Dúo) | $ 157.325 | $ 0 | $ 15.733 | $ 37.763 | $ 37.763 | 2 | $ 18.882 | 29,0 % | ✓ | ✗ |
|  | 2ª (Dúo) | $ 141.592 | $ 15.733 | $ 14.159 | $ 41.608 | $ 79.371 | 4 | $ 19.843 | 30,5 % | ✓ | ✗ |
|  | 3ª (Dúo) | $ 143.166 | $ 14.159 | $ 14.317 | $ 41.223 | $ 120.594 | 6 | $ 20.099 | 30,9 % | ✓ | ✗ |
| $ 99.900 | 1ª (Dúo) | $ 174.825 | $ 0 | $ 17.483 | $ 47.516 | $ 47.516 | 2 | $ 23.758 | 32,9 % | ✓ | ✗ |
|  | 2ª (Dúo) | $ 157.342 | $ 17.483 | $ 15.734 | $ 51.789 | $ 99.305 | 4 | $ 24.826 | 34,4 % | ✓ | ✓ |
|  | 3ª (Dúo) | $ 159.091 | $ 15.734 | $ 15.909 | $ 51.361 | $ 150.666 | 6 | $ 25.111 | 34,8 % | ✓ | ✓ |
| $ 104.900 | 1ª (Dúo) | $ 183.575 | $ 0 | $ 18.358 | $ 52.393 | $ 52.393 | 2 | $ 26.196 | 34,5 % | ✓ | ✓ |
|  | 2ª (Dúo) | $ 165.217 | $ 18.358 | $ 16.522 | $ 56.878 | $ 109.271 | 4 | $ 27.318 | 36,0 % | ✓ | ✓ |
|  | 3ª (Dúo) | $ 167.053 | $ 16.522 | $ 16.705 | $ 56.430 | $ 165.701 | 6 | $ 27.617 | 36,4 % | ✓ | ✓ |
| $ 109.900 | 1ª (Dúo) | $ 192.325 | $ 0 | $ 19.233 | $ 57.269 | $ 57.269 | 2 | $ 28.635 | 36,0 % | ✓ | ✓ |
|  | 2ª (Dúo) | $ 173.092 | $ 19.233 | $ 17.309 | $ 61.969 | $ 119.238 | 4 | $ 29.810 | 37,5 % | ✓ | ✓ |
|  | 3ª (Dúo) | $ 175.016 | $ 17.309 | $ 17.502 | $ 61.499 | $ 180.737 | 6 | $ 30.123 | 37,9 % | ✓ | ✓ |

#### Individual, Dúo, Dúo

| Precio | Compra | Cobrado | Crédito usado | Crédito nuevo | Contribución del pedido | Acumulada | Anteojos | Acumulada por anteojo | Margen acumulado | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $ 89.900 | 1ª (individual) | $ 89.900 | $ 0 | $ 4.495 | $ 14.109 | $ 14.109 | 1 | $ 14.109 | 19,0 % | ✗ | ✗ |
|  | 2ª (Dúo) | $ 152.830 | $ 4.495 | $ 15.283 | $ 38.862 | $ 52.971 | 3 | $ 17.657 | 25,9 % | ✓ | ✗ |
|  | 3ª (Dúo) | $ 142.042 | $ 15.283 | $ 14.204 | $ 41.498 | $ 94.469 | 5 | $ 18.894 | 28,3 % | ✓ | ✗ |
| $ 99.900 | 1ª (individual) | $ 99.900 | $ 0 | $ 4.995 | $ 20.096 | $ 20.096 | 1 | $ 20.096 | 24,3 % | ✓ | ✗ |
|  | 2ª (Dúo) | $ 169.830 | $ 4.995 | $ 16.983 | $ 48.737 | $ 68.833 | 3 | $ 22.944 | 30,3 % | ✓ | ✗ |
|  | 3ª (Dúo) | $ 157.842 | $ 16.983 | $ 15.784 | $ 51.666 | $ 120.499 | 5 | $ 24.100 | 32,4 % | ✓ | ✓ |
| $ 104.900 | 1ª (individual) | $ 104.900 | $ 0 | $ 5.245 | $ 23.089 | $ 23.089 | 1 | $ 23.089 | 26,6 % | ✓ | ✗ |
|  | 2ª (Dúo) | $ 178.330 | $ 5.245 | $ 17.833 | $ 53.675 | $ 76.764 | 3 | $ 25.588 | 32,2 % | ✓ | ✓ |
|  | 3ª (Dúo) | $ 165.742 | $ 17.833 | $ 16.574 | $ 56.751 | $ 133.514 | 5 | $ 26.703 | 34,2 % | ✓ | ✓ |
| $ 109.900 | 1ª (individual) | $ 109.900 | $ 0 | $ 5.495 | $ 26.082 | $ 26.082 | 1 | $ 26.082 | 28,7 % | ✓ | ✓ |
|  | 2ª (Dúo) | $ 186.830 | $ 5.495 | $ 18.683 | $ 58.612 | $ 84.694 | 3 | $ 28.231 | 33,9 % | ✓ | ✓ |
|  | 3ª (Dúo) | $ 173.642 | $ 18.683 | $ 17.364 | $ 61.835 | $ 146.529 | 5 | $ 29.306 | 35,9 % | ✓ | ✓ |

#### Dúo, individual, individual

| Precio | Compra | Cobrado | Crédito usado | Crédito nuevo | Contribución del pedido | Acumulada | Anteojos | Acumulada por anteojo | Margen acumulado | 22 % | $ 24.000 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $ 89.900 | 1ª (Dúo) | $ 157.325 | $ 0 | $ 15.733 | $ 37.763 | $ 37.763 | 2 | $ 18.882 | 29,0 % | ✓ | ✗ |
|  | 2ª (individual) | $ 74.167 | $ 15.733 | $ 3.708 | $ 17.304 | $ 55.067 | 3 | $ 18.356 | 27,0 % | ✓ | ✗ |
|  | 3ª (individual) | $ 86.192 | $ 3.708 | $ 4.310 | $ 14.862 | $ 69.929 | 4 | $ 17.482 | 25,1 % | ✓ | ✗ |
| $ 99.900 | 1ª (Dúo) | $ 174.825 | $ 0 | $ 17.483 | $ 47.516 | $ 47.516 | 2 | $ 23.758 | 32,9 % | ✓ | ✗ |
|  | 2ª (individual) | $ 82.417 | $ 17.483 | $ 4.121 | $ 23.645 | $ 71.161 | 3 | $ 23.720 | 31,3 % | ✓ | ✗ |
|  | 3ª (individual) | $ 95.779 | $ 4.121 | $ 4.789 | $ 20.932 | $ 92.094 | 4 | $ 23.023 | 29,7 % | ✓ | ✗ |
| $ 104.900 | 1ª (Dúo) | $ 183.575 | $ 0 | $ 18.358 | $ 52.393 | $ 52.393 | 2 | $ 26.196 | 34,5 % | ✓ | ✓ |
|  | 2ª (individual) | $ 86.542 | $ 18.358 | $ 4.327 | $ 26.816 | $ 79.209 | 3 | $ 26.403 | 33,2 % | ✓ | ✓ |
|  | 3ª (individual) | $ 100.573 | $ 4.327 | $ 5.029 | $ 23.967 | $ 103.176 | 4 | $ 25.794 | 31,7 % | ✓ | ✓ |
| $ 109.900 | 1ª (Dúo) | $ 192.325 | $ 0 | $ 19.233 | $ 57.269 | $ 57.269 | 2 | $ 28.635 | 36,0 % | ✓ | ✓ |
|  | 2ª (individual) | $ 90.667 | $ 19.233 | $ 4.533 | $ 29.987 | $ 87.256 | 3 | $ 29.085 | 34,9 % | ✓ | ✓ |
|  | 3ª (individual) | $ 105.367 | $ 4.533 | $ 5.268 | $ 27.003 | $ 114.259 | 4 | $ 28.565 | 33,5 % | ✓ | ✓ |

