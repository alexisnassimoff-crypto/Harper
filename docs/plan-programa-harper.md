# Programa Harper: reglas comerciales y transición (Tarea 02)

**Estado:** borrador con las decisiones de Ale del 05/11/2026 (revisión del
PR #60). No hay nada implementado. Este documento no cambia precios,
descuentos, créditos, checkout, Airtable ni las condiciones publicadas.

**Qué marca cada cosa:**

- **Definido:** lo decidió Ale.
- **A validar:** necesita una revisión legal u operativa antes de activar el
  programa. Están todas juntas en §14.
- **A confirmar:** es una lectura mía de algo que no quedó dicho. No se toma
  como regla hasta que Ale lo confirme.

---

## 0. Cómo leer los números

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
  Harper paga la tarifa de Rueddo con IVA, de Config: **CABA $ 4.488,
  GBA 1 $ 6.498 y GBA 2 y 3 $ 9.075**. Son las tres columnas de las filas de
  AMBA.
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
   6 cuotas sin interés**, cuando Mercado Pago las confirma. **Definido.**
2. **Seis cuotas también en las recompras**, siempre sujetas a la
   confirmación de Mercado Pago. **Definido.**
3. **Dúo.** Si suma un segundo anteojo, lleva **25 % de descuento en el de
   menor precio**. Se pueden combinar modelos y colores. **Definido.**
   - **Con 3 pares,** el 25 % va sobre uno de los más baratos.
   - **Con 4 pares,** sobre los dos más baratos.
   - La regla con precios distintos está en §5.3.
4. **Crédito Harper:**
   - **cada compra elegible de dos o más anteojos** genera **10 %** de
     crédito, sin tope;
   - se calcula sobre lo **efectivamente pagado en anteojos**, después de los
     descuentos y **sin contar el crédito usado**;
   - **una compra de un solo anteojo no genera crédito nuevo**;
   - no se genera sobre estuches, paños ni envío.

   **Definido.**
5. **Uso del crédito:**
   - total o parcial, en compras futuras de **anteojos**;
   - **no paga el envío**;
   - **no vence**, por ahora;
   - se puede usar **30 días después de la entrega confirmada**, sin
     devoluciones pendientes.

   **Definido.** La fecha de entrega queda **a validar**.
6. **Envío:**
   - **gratis en AMBA desde $ 60.000**;
   - **gratis a todo el país desde $ 150.000**;
   - si el pedido no llega al mínimo, el cliente paga el envío cotizado.

   **Definido.**
7. **Cupón de bienvenida de $ 10.000:** se elimina para las **altas nuevas**
   cuando entre en vigencia el programa nuevo. Los cupones ya dados se
   respetan. **Definido.**
8. **Lo ya ganado y lo ya aceptado:** se respetan los cupones y créditos ya
   dados y las condiciones aceptadas. **El crédito ya ganado sigue con sus
   condiciones originales.** **Definido.**
9. **10 % por pagar con dinero en Mercado Pago:** se mantiene por ahora,
   mientras el modelo confirme que es rentable. Lo confirma: ver §8.
   **Definido.**
10. **La cuenta y el crédito no dependen de aceptar publicidad** (los mails
    de novedades). **Definido.** Cómo se implementa queda **a validar**.
11. **Transición de los suscriptores actuales:** con aviso previo y **sin
    fecha todavía**. **Definido.** El detalle queda **a validar** (§11).
12. **Devoluciones:** todavía no hay ninguna regla de reintegro definitiva
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
| Quién recibe los beneficios | Solo quien se suscribe (mail y consentimiento para recibir mails) | Cualquier comprador con su cuenta (mail verificado). No depende de aceptar publicidad | **Definido**. Implementación: **a validar** |
| Primera compra de 1 par | Suscriptor: cupón de $ 10.000, cashback del 10 %, envío gratis y hasta 6 cuotas. Quien no se suscribe: hasta 3 cuotas | Precio de lista y hasta 6 cuotas sin interés. Sin crédito. Envío según las reglas | **Definido** |
| Dos o más anteojos | Sin descuento | **Dúo:** 25 % en el de menor precio. Con 3 pares, en uno de los más baratos. Con 4, en los dos más baratos | **Definido** |
| Cupón de bienvenida | $ 10.000 en la primera compra de cada suscriptor | Ya no se da en las altas nuevas. Los ya dados se respetan | **Definido** |
| Crédito | 10 % en **cada** compra como suscriptor | 10 % en **cada compra de dos o más anteojos**, sobre lo pagado en anteojos sin el crédito usado y sin tope. Un anteojo solo no genera | **Definido** |
| Cuándo se puede usar | 30 días después del pago | 30 días después de la **entrega confirmada**, sin devoluciones pendientes. Lo ya ganado sigue a 30 días del pago | **Definido**. Fecha de entrega: **a validar** |
| En qué se usa | En cualquier producto. Puede pagar la compra entera | En anteojos, total o parcial. No paga el envío. No vence | **Definido**. Estuches y paños: **a confirmar** (§10.3) |
| Cuotas | 3 para todos y 6 para suscriptores | Hasta 6, en primera compra y recompras, cuando Mercado Pago las confirma | **Definido**. Si son para todos o para quien entra con su cuenta: **a confirmar** (§14) |
| Envío | Suscriptor: siempre gratis. El resto: según los umbrales | Para todos: gratis en AMBA desde $ 60.000 y en el país desde $ 150.000. Si no, lo paga el cliente | **Definido** |
| 10 % por dinero en Mercado Pago | Se suma a todo | Se mantiene igual | **Definido**. Llega al 22 % (§8) |
| Baja de los mails | Corta los beneficios nuevos y conserva el saldo | Solo corta los mails de novedades. El crédito y la cuenta no cambian | **Definido** |
| Suscriptores actuales | — | Lo ganado y lo aceptado se respeta. Las reglas nuevas rigen después de un aviso previo, sin fecha todavía | **A validar** (§11) |
| Devoluciones | Anulan el cashback de esa compra | Sin regla de reintegro definitiva | **A validar** (§13.2) |
| Descuentos de estuches y paños | Activos | Sin cambios | Fuera de esta tarea |

---

## 4. Cuánto deja cada caso, hoy y con la política nueva

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
2. **Con la política nueva, todas las combinaciones con el precio de
   referencia llegan al 22 %**, pedido por pedido.
   - La única excepción no es nueva: el cupón ya dado usado en un par suelto
     con envío gratis caro (§7).
   - Los casos que con envío gratis no llegaban, el par suelto en 6 cuotas a
     $ 15.000, ya no se dan: fuera de AMBA ese envío lo paga el cliente.
3. **Hay dos riesgos para vigilar** (§9 y §14):
   - el costo del envío gratis;
   - un modelo más barato que $ 89.900.

---

## 5. La primera compra

### 5.1 Un par (6 cuotas, sin crédito)

| 1 par | Envío 1 | Envío 2 | Envío 3 | Envío máximo para llegar al 22 % |
|---|---|---|---|---|
| AMBA, envío gratis (CABA / GBA 1 / GBA 2 y 3) | ✓ 30,0 % · $ 22.253 | ✓ 27,7 % · $ 20.592 | ✓ 24,8 % · $ 18.462 | $ 11.636 |
| Resto del país, el cliente paga lo cotizado más 10 % ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 31,9 % · $ 25.289 | ✓ 29,7 % · $ 24.737 | ✓ 27,4 % · $ 24.125 | — |
| Ídem, sin el recargo del 10 % | ✓ 31,6 % | ✓ 29,2 % | ✓ 26,7 % | — |
| *Sensibilidad: un modelo hipotético de $ 69.900, AMBA* | ✗ 16,4 % · $ 9.454 | ✗ 13,5 % · $ 7.793 | ✗ 9,8 % · $ 5.663 | $ 549 |
| *Ídem, resto del país, el cliente paga el envío* | ✗ 19,9 % · $ 12.490 | ✗ 17,9 % · $ 11.938 | ✗ 15,9 % · $ 11.326 | — |

- **El par de $ 89.900 llega en todos los casos.** En AMBA tiene margen
  hasta un envío de $ 11.636, y hoy el más caro es $ 9.075.
- **Un par mucho más barato no llega en 6 cuotas, ni siquiera cuando el
  cliente paga el envío.** Con el costo y el CAC de hoy, un par suelto en
  6 cuotas necesita un precio de **$ 85.279 o más** para llegar con el
  envío de GBA 2 y 3.
- Si se suma un modelo más barato, hay que recalcular antes de lanzarlo
  (§14, O4).

### 5.2 Dúo y más pares (6 cuotas, con el crédito del 10 %)

| Pedido | Paga en anteojos | Crédito | Envío | Envío 1 | Envío 2 | Envío 3 | Envío máximo |
|---|---|---|---|---|---|---|---|
| Dúo $ 89.900 + $ 89.900 | $ 157.325 | $ 15.733 | Gratis en todo el país ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 | $ 21.701 |
| Ídem en AMBA (CABA / GBA 1 / GBA 2 y 3) | | | Gratis | ✓ 32,9 % · $ 42.830 | ✓ 31,7 % · $ 41.169 | ✓ 30,0 % · $ 39.039 | — |
| *Dúo $ 89.900 + $ 69.900 (hipotético)* | $ 142.325 | $ 14.233 | AMBA gratis | ✓ 29,3 % · $ 34.470 | ✓ 27,9 % · $ 32.809 | ✓ 26,1 % · $ 30.679 | $ 14.886 |
| *Ídem, resto del país* | | | No llega a $ 150.000: lo paga el cliente | ✓ 30,6 % · $ 37.506 | ✓ 29,2 % · $ 36.955 | ✓ 27,7 % · $ 36.342 | — |
| *Dúo $ 69.900 + $ 69.900 (hipotético)* | $ 122.325 | $ 12.233 | AMBA gratis | ✓ 23,1 % · $ 23.324 | ✗ 21,4 % · $ 21.663 | ✗ 19,3 % · $ 19.533 | $ 5.799 |
| *Ídem, resto del país* | | | Lo paga el cliente | ✓ 24,8 % · $ 26.360 | ✓ 23,4 % · $ 25.808 | ✗ 22,0 % · $ 25.196 (apenas por debajo) | — |
| 3 pares de $ 89.900 | $ 247.225 | $ 24.723 | Gratis ($ 5.500 / $ 10.000 / $ 15.000) | ✓ 40,4 % · $ 82.526 | ✓ 38,6 % · $ 78.807 | ✓ 36,5 % · $ 74.675 | $ 50.967 |
| *3 pares: $ 89.900, $ 89.900 y $ 69.900* | $ 232.225 | $ 23.223 | Gratis | ✓ 38,6 % · $ 74.167 | ✓ 36,7 % · $ 70.448 | ✓ 34,6 % · $ 66.315 | $ 44.152 |
| 4 pares de $ 89.900 | $ 314.650 | $ 31.465 | Gratis | ✓ 42,5 % · $ 110.534 | ✓ 41,1 % · $ 106.815 | ✓ 39,5 % · $ 102.682 | $ 70.023 |
| *4 pares: dos de $ 89.900 y dos de $ 69.900* | $ 284.650 | $ 28.465 | Gratis | ✓ 39,9 % · $ 93.814 | ✓ 38,3 % · $ 90.095 | ✓ 36,5 % · $ 85.963 | $ 56.392 |

- **Con el precio de referencia, el Dúo y los pedidos de 3 y 4 pares llegan
  en todos los casos.**
- **Un Dúo de dos pares baratos (hipotético) queda justo:** no llega con los
  envíos gratis más caros. Es el mismo aviso de §5.1.

### 5.3 Cómo se aplica el Dúo con precios distintos (definido)

**La regla:**

1. Se ordenan los anteojos del pedido por precio de lista.
2. Llevan el 25 % los **⌊n/2⌋ más baratos**, donde n es la cantidad de
   anteojos y ⌊n/2⌋ es la mitad redondeada hacia abajo. Es lo que hace
   `descuentoDelSegundo`.
3. Si hay precios iguales, da lo mismo cuál se elige.
4. Estuches y paños no cuentan para el Dúo.

| Anteojos en el pedido | Llevan el 25 % | Ejemplo con precios distintos | Descuento | Paga | Crédito (10 %) |
|---|---|---|---|---|---|
| 1 | Ninguno | $ 89.900 | — | $ 89.900 | No genera |
| 2 | El más barato | $ 89.900 + $ 69.900 | 25 % de $ 69.900 = $ 17.475 | $ 142.325 | $ 14.233 |
| 3 | Uno de los más baratos | $ 89.900 + $ 89.900 + $ 69.900 | 25 % de $ 69.900 = $ 17.475 | $ 232.225 | $ 23.223 |
| 4 | Los dos más baratos | $ 89.900 × 2 + $ 69.900 × 2 | 25 % de $ 69.900 × 2 = $ 34.950 | $ 284.650 | $ 28.465 |
| 5 o más | Los ⌊n/2⌋ más baratos: 2 con 5, 3 con 6 | — | — | — | — |

- **Más de 4 pares:** la regla de ⌊n/2⌋ sigue igual que con 3 y 4. Queda
  **a confirmar** (§14).
- **Envío:** el umbral de $ 150.000 se mide después del Dúo. Por eso un Dúo
  con un modelo más barato puede quedar debajo del umbral y pagar el envío
  fuera de AMBA, como en el ejemplo de $ 142.325.

---

## 6. Qué se combina y qué no

Todo en 6 cuotas, salvo donde se diga. Los rangos van del caso más exigente
al más favorable.

| Combinación | Estado | Cuánto deja |
|---|---|---|
| Dúo y hasta 6 cuotas | **Se combinan** (definido) | ✓ 26,3 % a 32,9 % |
| Dúo y crédito del 10 %, en cada compra de dos o más anteojos | **Se combinan** (definido) | Igual que la fila anterior |
| Dúo que usa crédito anterior y genera crédito nuevo | **Se combinan** (definido). El crédito nuevo va sobre lo pagado | ✓ 29,2 % a 35,3 % |
| Par suelto y 6 cuotas, sin crédito nuevo | **Definido** | AMBA ✓ 24,8 % a 30,0 %. Resto del país, paga el cliente: ✓ 27,4 % a 31,9 % |
| Par suelto que usa crédito | **Se combinan** (definido). No genera crédito nuevo | Con $ 15.733: ✓ 28,3 % a 35,1 % |
| Crédito y envío | **No**: el crédito no paga el envío (definido) | — |
| Crédito y estuches o paños | No se genera sobre ellos (definido). Si se puede usar en ellos: **a confirmar** | — |
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

**Conclusión.** El modelo confirma que es rentable: **todas las
combinaciones con dinero en Mercado Pago llegan al 22 %.** Incluso dejan más
que las mismas en 6 cuotas, porque el 10 % cuesta menos que la financiación
de 6 cuotas (10,3 %).

**Condición para mantenerlo.** Se supuso que la comisión es la misma con
dinero en cuenta. Si Mercado Pago cobra otra comisión o cambia la de
6 cuotas, hay que recalcular (§14, O5).

---

## 9. Envío (definido: AMBA desde $ 60.000, todo el país desde $ 150.000)

**Lo que cada combinación soporta.** Envío gratis máximo, con IVA, para
seguir en el 22 %:

| Combinación | Envío gratis máximo | Hoy |
|---|---|---|
| Par suelto, 6 cuotas: solo tiene envío gratis en AMBA | $ 11.636 | AMBA cuesta de $ 4.488 a $ 9.075: ✓ |
| Par suelto con cupón ya dado, 6 cuotas | $ 6.093 | GBA 1 y GBA 2 y 3 lo superan: ✗ (§7) |
| Recompra de 1 par con $ 15.733, 6 cuotas | $ 14.715 | ✓ en AMBA |
| Dúo con crédito, 6 cuotas: gratis en todo el país | $ 21.701 | No está medido fuera de AMBA |
| Recompra Dúo: usa $ 15.733 y genera crédito nuevo, 6 cuotas | $ 26.353 | No está medido fuera de AMBA |
| Dúo en el ciclo de §10.5, 6 cuotas | $ 25.930 | No está medido fuera de AMBA |
| *Dúo $ 89.900 + $ 69.900 (hipotético), AMBA gratis* | $ 14.886 | ✓ |

**Qué hay que vigilar:**

- **AMBA:** las tarifas de Rueddo se ajustan cada tres meses. El par suelto
  en 6 cuotas deja de llegar si el envío de AMBA pasa de $ 11.636.
- **Resto del país con Dúo gratis:** llega mientras el envío no pase de
  $ 21.701. **No tengo medido el costo real por provincia.** Hay que
  medirlo antes de activar el programa (§14, O2).
- **Cuando paga el cliente,** el envío también se financia en las cuotas y
  paga comisión. Aun así, el pedido llega, incluso sin el recargo del 10 %.

---

## 10. Crédito Harper

### 10.1 Quién genera crédito y cuándo

| Compra | ¿Genera crédito? | Estado |
|---|---|---|
| Un solo anteojo, con o sin estuches o paños | **No** | **Definido** |
| Dos o más anteojos, sea la primera compra o una recompra | **Sí**: 10 % de lo pagado en anteojos, sin tope | **Definido** |
| La parte de una compra que se paga con crédito | **No**: el 10 % va solo sobre lo pagado | **Definido** |
| Estuches, paños y envío | **No** | **Definido** |
| Quien no aceptó recibir publicidad o se dio de baja de los mails | **Sí**, igual que cualquier comprador: no depende de eso | **Definido** |
| Suscriptor del programa anterior | **Sí**, en sus compras de dos o más anteojos, cuando ya rijan las reglas nuevas para él (§11) | **Definido** (lo ganado se respeta) |
| Compra pagada entera con crédito | **No**: no se pagó nada en dinero | Sale de la regla |
| Compra sin cuenta | El crédito tiene que quedar en una cuenta: la del mail de la compra, verificado con código | **A validar** (§14, O7) |

**Qué es una compra elegible** (a confirmar):

- tiene dos o más anteojos;
- está pagada;
- se entregó, pasaron 30 días y no hay devoluciones pendientes.

Si una devolución deja menos de dos anteojos, ya no es una compra de dos
anteojos. Cómo se recalcula el crédito depende de la regla de reintegro, que
todavía no está definida (§13.2).

### 10.2 Cuándo se puede usar (definido: 30 días después de la entrega, sin devoluciones pendientes)

- **Plazos de devolución:** el arrepentimiento es de 10 días y los cambios
  de 30 (`lib/confianza.ts`). Con 30 días desde la entrega, el crédito se
  libera cuando ya pasaron los dos plazos. Así no queda saldo negativo por
  un arrepentimiento.
- **Devolución o cambio abiertos:** si hay uno pendiente, el plazo se frena
  hasta que se resuelve.
- **El crédito ya ganado con las reglas de hoy** se libera a los 30 días del
  pago, como se aceptó.
- **A validar: la fecha de entrega.**
  - El pedido tiene un estado «entregado» (`lib/mis-compras.ts`), pero no
    confirmé que se cargue siempre ni con fecha.
  - Hay que definir de dónde sale la fecha: del transportista o de una carga
    manual.
  - También hay que definir qué pasa si falta, por ejemplo contar desde el
    despacho más unos días fijos (§14, O1).
  - No cambia lo que deja el pedido.

### 10.3 En qué se usa (definido)

- En compras futuras de **anteojos**, total o parcial.
- **No paga el envío.**
- **No vence**, por ahora. El modelo ya supone que se usa entero: no cuenta
  con que venza.
- No se cambia por dinero ni se transfiere, como hoy.
- **A confirmar:** si «se usa en anteojos» quiere decir que no paga estuches
  ni paños. Mi lectura es que no.
- **El saldo ganado con las reglas de hoy** sigue con sus condiciones:
  - sirve en cualquier producto y puede pagar la compra entera;
  - si ahora paga el envío, hay que ver si ese saldo también puede pagarlo
    (§14, L4).

### 10.4 Recompras con crédito y 6 cuotas: verificación pedido por pedido

Se pidió verificar que superen el 22 % con estas reglas y sin apoyarse en el
acumulado del cliente. **Todas llegan.**

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
financiación y los IIBB. **El piso de cualquier recompra es la compra común
de un par**, que llega en todos los casos de arriba.

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

**Todos los topes superan los $ 20.000.** Por eso, con el CAC conservador,
todas las recompras llegan.

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

- solo generan crédito las compras de dos o más anteojos. El par suelto lo
  usa, pero no genera;
- el crédito nuevo es el 10 % de lo pagado en dinero, nunca del crédito
  usado. No hay crédito sobre crédito;
- no se genera sobre el envío, ni sobre estuches o paños;
- se libera 30 días después de la entrega, sin devoluciones pendientes, y se
  anula si se devuelve la compra.

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
| Cashback del 10 % en cada compra, también la de un par | Crédito solo en las compras de dos o más anteojos | El de hoy no llega al 22 % (§4) |
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
  - con 1 par, sin descuento ni crédito;
  - con 2, el 25 % al más barato;
  - con 3, a uno de los más baratos;
  - con 4, a los dos más baratos.
- **En todos los casos** el crédito es el 10 % de lo pagado en anteojos.
- **Estuches y paños:** no cuentan para el Dúo ni generan crédito, y siguen
  con sus propios descuentos.

### 13.2 Devoluciones (a validar: ninguna regla de reintegro es definitiva)

Lo que sigue son **alternativas con lo que deja cada una**, no una regla.
Antes de elegir, hace falta una **revisión legal**: el derecho de
arrepentimiento (Ley 24.240, art. 34), la garantía y la política de
devoluciones publicada no pueden quedar recortados por la promoción.

**Devolución total de un Dúo:**

- se reintegra lo pagado y se anula el crédito de esa compra;
- como el crédito se libera a los 30 días de la entrega, en un
  arrepentimiento todavía no se pudo usar.

Si se devuelve después de usarlo, por ejemplo por un reclamo tardío, hoy el
monto se descuenta del saldo, que puede quedar negativo. Hay que validar si
eso también rige para el crédito nuevo (§14, L5).

**Devolución de un par del Dúo, con precios distintos:**

- Ejemplo con un par A de $ 89.900 y un par B de $ 69.900 (hipotético).
- El 25 % va a B ($ 17.475): el cliente paga $ 142.325 y genera $ 14.233
  de crédito.
- Si se queda con un solo anteojo, ese pedido ya no genera crédito. Cómo se
  anula o recalcula también entra en la revisión legal.

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
| O1 | **Una fecha de entrega confiable** para cada pedido, y qué hacer si falta | El crédito se libera 30 días después de la entrega. Hay un estado «entregado», pero no confirmé que siempre tenga fecha (§10.2) |
| O2 | **El costo real del envío por provincia** fuera de AMBA | El Dúo con envío gratis a todo el país llega mientras el envío no pase de $ 21.701 (§9) |
| O3 | **Revisar las tarifas de AMBA** cada vez que Rueddo las ajuste | El par suelto en 6 cuotas llega mientras el envío de AMBA no pase de $ 11.636. Hoy el máximo es $ 9.075 |
| O4 | **Recalcular antes de lanzar un modelo más barato** | Con el costo y el CAC de hoy, un par suelto en 6 cuotas necesita un precio de $ 85.279 o más. Un Dúo de dos pares baratos queda justo (§5) |
| O5 | **La comisión de Mercado Pago con dinero en cuenta** | Se supuso igual a la de tarjeta (3,39 %). Mantener el 10 % depende de que el modelo siga llegando (§8) |
| O6 | **Contar suscriptores activos, saldo total, cashback pendiente y cupones sin usar** | Hace falta para fijar la fecha y el plazo del aviso. No lo medí: está fuera del alcance |
| O7 | **Compras sin cuenta:** cómo se acredita el crédito | Tiene que quedar en la cuenta del mail de la compra, verificado con código |

### A confirmar por Ale

Son detalles que no cambian los números de este documento:

- **Las 6 cuotas, ¿para todo comprador o para quien entra con su cuenta
  verificada?** Hoy son 3 para todos y 6 con la sesión de suscriptor. El
  modelo ya calcula todo en 6 cuotas.
- **Más de 4 pares:** seguir con la regla de ⌊n/2⌋, o sea 2 descuentos con
  5 pares y 3 con 6.
- **Si el crédito nuevo puede pagar estuches y paños.** Mi lectura de «se
  usa en anteojos» es que no.
- **Qué es una compra elegible:** la definición de §10.1.

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
- No empieza la Tarea 03.
