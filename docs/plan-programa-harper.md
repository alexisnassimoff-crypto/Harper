# Programa Harper: reglas comerciales y transición (Tarea 02)

**Estado:** borrador para que Ale apruebe. No hay nada implementado. Este
documento no cambia precios, descuentos, créditos, checkout, Airtable ni las
condiciones publicadas.

Lo que Ale ya definió está marcado como **definido**. Lo que falta definir
está marcado como **a decidir**: lleva alternativas con lo que deja cada
una y, a veces, una sugerencia. La sugerencia hay que confirmarla: no es una
política definitiva.

---

## 0. Cómo leer los números

- Los números salen de `lib/contribucion.ts`, el motor del PR #59, con sus
  parámetros de referencia:
  - precio de $ 89.900 por par y costo de $ 9.570 sin IVA;
  - preparación $ 2.000;
  - Mercado Pago 3,39 %, más 4,5 % en 3 cuotas y 10,3 % en 6 cuotas;
  - IIBB 3 % y reserva por devoluciones 3 %;
  - **publicidad (CAC) de $ 20.000 por pedido**, también en la recompra,
    salvo donde se diga;
  - **contribución mínima del 22 %** sobre la venta neta de IVA.
- **Cada celda** muestra si llega al 22 % (✓ llega, ✗ no llega), el margen
  después de publicidad y **cuánto deja el pedido en pesos**.
- **Las tres columnas** son lo que le cuesta el envío a Harper, con IVA:
  $ 5.500, $ 10.000 y $ 15.000. El comprador no paga envío, salvo donde se
  diga.
- **El crédito Harper** (lo que hoy se llama cashback o saldo):
  - se cuenta como costo una sola vez, en la compra que lo genera, y se
    supone que se usa todo;
  - en la recompra es un medio de pago que ya se pagó, así que no se vuelve
    a restar (la regla que Ale aprobó en el PR #59).
- **Hipótesis del modelo** (no son datos medidos):
  - todos los anteojos cuestan $ 89.900;
  - la comisión de Mercado Pago es la misma cuando se paga con dinero en
    cuenta;
  - la devolución de un par no suma costo de retiro;
  - estuches y paños no están modelados.

Las cuentas se pueden repetir con `calcularContribucion` y
`contribucionDelCliente`. Por ejemplo:

- el 10 % por dinero en Mercado Pago se modeló como un descuento fijo
  (`bienvenida`, con `acumularBienvenidaConDuo`);
- el crédito usado se modeló como `saldoAplicado`.

---

## 1. Las reglas de hoy

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
  después el saldo. El 10 % por dinero en Mercado Pago va sobre lo que
  queda.
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

Fuentes: Config y `lib/envio-gratis.ts`.

- Es gratis en AMBA desde $ 60.000, es decir, con cualquier anteojo.
- Es gratis en todo el país desde $ 150.000.
- El umbral se mide sobre el subtotal sin cupón.
- Si no es gratis, el comprador paga:
  - en AMBA, la tarifa por zona cargada en Config (de $ 3.709 a $ 7.500,
    antes del recargo);
  - en el resto del país, lo que cotiza el transportista, con un respaldo de
    $ 9.900.

### Otros

- **Descuentos por cantidad (tabla Descuentos de Airtable):**
  - en anteojos están todos apagados;
  - en estuches y paños están activos: 5 % desde 2, 10 % desde 4, 15 %
    desde 8 y 20 % desde 15.
- **Cupones:** HARPER10 está apagado desde el 30/10/2026 y no hay otros
  activos.
- **Transferencia:** no está activa.
- **Dúo:** hoy no existe. No hay ningún descuento por llevar dos anteojos.

---

## 2. Hoy contra la propuesta

| Tema | Hoy | Propuesta | Estado |
|---|---|---|---|
| Quién recibe los beneficios | Solo quien se suscribe (mail y consentimiento) | El Dúo y las cuotas, cualquier comprador. El crédito, el comprador identificado con su mail | Si el crédito exige la suscripción: **a decidir** (§11) |
| Primera compra de 1 par | Suscriptor: cupón de $ 10.000, cashback del 10 %, envío gratis y hasta 6 cuotas. Quien no se suscribe: hasta 3 cuotas | Precio de lista y hasta 6 cuotas sin interés cuando Mercado Pago las confirma. Sin crédito | **Definido**. El envío está **a decidir** (§8) |
| Dos o más anteojos | Sin descuento | **Dúo:** 25 % en el de menor precio de cada dos. Se pueden combinar modelos y colores | **Definido** |
| Cupón de bienvenida | $ 10.000 en la primera compra de cada suscriptor | No forma parte de la propuesta | Qué pasa con los ya dados y con los nuevos: **a decidir** (§6) |
| Cashback o crédito | 10 % en **cada** compra como suscriptor | 10 % solo en la **primera compra Dúo elegible**. Sobre lo pagado en productos después de descuentos, sin envío y sin tope | **Definido**. Quién es elegible: §9.1 |
| Cuándo se puede usar | 30 días después del pago | 30 días después de la **entrega confirmada**, sin devoluciones pendientes | **Definido**. Falta la fuente del dato de entrega (§9.2) |
| Cómo se usa | Total o parcial. No vence y puede pagar la compra entera | Total o parcial, en compras futuras | Vencimiento y si paga el envío: **a decidir** (§9.3) |
| Crédito nuevo en las recompras | Sí, otro 10 % en cada compra | No, en la propuesta base | **A decidir** (§9.4) |
| Cuotas en la recompra | Hasta 6 para suscriptores | Sin definir | **A decidir** (§9.3) |
| 10 % por dinero en Mercado Pago | Se suma a todo | Sin definir | **A decidir** (§7) |
| Envío | Suscriptor: siempre gratis. El resto: según los umbrales | Sin definir | **A decidir** (§8) |
| Baja de los mails | Corta los beneficios nuevos y conserva el saldo | Sin definir | **A decidir** (§11) |
| Devoluciones | Anulan el cashback de esa compra | Igual. Con el plazo nuevo, el crédito no se libera mientras se puede devolver | Devolución de un par del Dúo: **a decidir** (§12.2) |
| Descuentos de estuches y paños | Activos | Sin cambios | Fuera de esta tarea |

---

## 3. Cuánto deja cada caso, hoy y con la propuesta

Todo con CAC de $ 20.000. «Saldo» y «crédito» son lo mismo.

| Caso | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 |
|---|---|---|---|
| **Hoy:** 1 par sin suscripción, 3 cuotas, envío gratis (fuera de AMBA hoy lo paga el comprador) | ✓ 35,8 % · $ 26.631 | ✓ 30,8 % · $ 22.912 | ✓ 25,3 % · $ 18.780 |
| **Hoy:** 1 par con suscripción: cupón, cashback de $ 7.990 y 6 cuotas | ✗ 12,7 % · $ 8.414 | ✗ 7,1 % · $ 4.695 | ✗ 0,9 % · $ 563 |
| **Hoy:** 1 par con suscripción: cupón, dinero en Mercado Pago y cashback de $ 7.191 | ✗ 19,1 % · $ 11.368 | ✗ 12,9 % · $ 7.649 | ✗ 5,9 % · $ 3.517 |
| **Hoy:** 2 pares sin descuento, con suscripción: cupón, cashback y 6 cuotas | ✓ 34,9 % · $ 48.947 | ✓ 32,2 % · $ 45.228 | ✓ 29,3 % · $ 41.095 |
| **Hoy:** recompra de 1 par con suscripción: usa $ 7.990, gana otro 10 %, 6 cuotas | ✗ 21,5 % · $ 15.939 | ✗ 16,4 % · $ 12.220 | ✗ 10,9 % · $ 8.088 |
| **Hoy:** ese mismo suscriptor en las dos compras | ✗ 17,4 % · $ 24.353 | ✗ 12,1 % · $ 16.915 | ✗ 6,2 % · $ 8.651 |
| **Propuesta:** 1 par, 6 cuotas, sin crédito | ✓ 28,8 % · $ 21.417 | ✓ 23,8 % · $ 17.698 | ✗ 18,3 % · $ 13.566 |
| **Propuesta:** 1 par, 3 cuotas, sin crédito | ✓ 35,8 % · $ 26.631 | ✓ 30,8 % · $ 22.912 | ✓ 25,3 % · $ 18.780 |
| **Propuesta:** Dúo −25 % con crédito del 10 % ($ 15.733), 6 cuotas | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
| **Propuesta:** recompra de 1 par con $ 15.733 de crédito, sin crédito nuevo, 6 cuotas | ✓ 32,2 % · $ 23.961 | ✓ 27,2 % · $ 20.242 | ✗ 21,7 % · $ 16.110 |
| **Propuesta:** la misma recompra en 3 cuotas | ✓ 38,0 % · $ 28.263 | ✓ 33,0 % · $ 24.544 | ✓ 27,5 % · $ 20.411 |
| **Propuesta:** cliente con Dúo en 6 cuotas y recompra en 6 cuotas, las dos compras juntas | ✓ 32,3 % · $ 65.955 | ✓ 28,6 % · $ 58.517 | ✓ 24,6 % · $ 50.252 |

**Qué muestran estos números:**

1. **Hoy, la primera compra de un par con suscripción no llega al 22 % con
   ningún envío.** Deja entre $ 563 y $ 8.414. Lo que la hunde es la suma de
   cupón, cashback y 6 cuotas.
2. **La propuesta pasa el beneficio fuerte al segundo par.** El Dúo con
   crédito llega con todos los envíos y todas las cuotas: entre 26,3 % y
   44,8 % (§4.2).
3. **El par suelto en 6 cuotas no llega** cuando el envío le cuesta a Harper
   más de $ 11.636 (§4.1 y §8).
4. **La recompra sin crédito nuevo llega**, salvo en 6 cuotas con el envío de
   $ 15.000 (21,7 %). En ese caso, el cliente con sus dos compras juntas
   llega (24,6 %).

---

## 4. La primera compra

### 4.1 Un par (definido: hasta 6 cuotas, sin crédito)

| 1 par sin crédito | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 | Envío máximo para llegar al 22 % |
|---|---|---|---|---|
| 1 pago | ✓ 41,3 % · $ 30.677 | ✓ 36,3 % · $ 26.958 | ✓ 30,7 % · $ 22.825 | $ 22.841 |
| 3 cuotas | ✓ 35,8 % · $ 26.631 | ✓ 30,8 % · $ 22.912 | ✓ 25,3 % · $ 18.780 | $ 17.946 |
| 6 cuotas | ✓ 28,8 % · $ 21.417 | ✓ 23,8 % · $ 17.698 | ✗ 18,3 % · $ 13.566 | $ 11.636 |
| 6 cuotas, el comprador paga $ 9.900 de envío | ✓ 33,6 % · $ 27.753 | ✓ 29,1 % · $ 24.034 | ✓ 24,1 % · $ 19.901 | — |
| 3 cuotas, el comprador paga $ 9.900 de envío | ✓ 40,7 % · $ 33.541 | ✓ 36,2 % · $ 29.822 | ✓ 31,1 % · $ 25.690 | — |

El par suelto en 6 cuotas llega al 22 % mientras el envío no le cueste a
Harper más de $ 11.636. Qué hacer con el envío del par suelto está en §8
(decisión D1).

### 4.2 Dúo (definido: 25 % en el de menor precio de cada dos, más el 10 % de crédito)

| Dúo −25 % con crédito del 10 % | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 | Envío máximo para llegar al 22 % |
|---|---|---|---|---|
| 1 pago | ✓ 44,8 % · $ 58.198 | ✓ 41,9 % · $ 54.479 | ✓ 38,7 % · $ 50.347 | — |
| 3 cuotas | ✓ 39,3 % · $ 51.119 | ✓ 36,5 % · $ 47.400 | ✓ 33,3 % · $ 43.267 | — |
| 6 cuotas | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 | $ 21.701 |
| De referencia: Dúo sin crédito, 6 cuotas | ✓ 42,3 % · $ 54.996 | ✓ 39,4 % · $ 51.277 | ✓ 36,3 % · $ 47.145 | — |

- **Precios:** dos pares de lista suman $ 179.800. Con el 25 % sobre uno
  ($ 22.475), el cliente paga $ 157.325.
- **Crédito:** el 10 % de $ 157.325, redondeado al peso: **$ 15.733**.
- **Costo:** el crédito le cuesta al Dúo unos 10 puntos de margen (de 42,3 %
  a 32,3 % en 6 cuotas), unos $ 13.000 por pedido.
- **Envío:** $ 157.325 supera el umbral de envío gratis a todo el país
  ($ 150.000). Con la regla actual, el Dúo tiene envío gratis en todas
  partes y el par suelto solo en AMBA.

Los casos de 3 y 4 pares están en §12.1.

---

## 5. Qué se combina y qué no

Todo en 6 cuotas, salvo donde se diga.

| Combinación | Estado | Cuánto deja ($ 5.500 / $ 10.000 / $ 15.000) |
|---|---|---|
| Dúo y hasta 6 cuotas | **Se combinan** (definido) | ✓ 32,3 % / ✓ 29,4 % / ✓ 26,3 % |
| Dúo y crédito del 10 % (primera compra Dúo elegible) | **Se combinan** (definido) | Igual que la fila anterior |
| Dúo y cupón de bienvenida | **No se acumulan** (Ale, PR #59). Queda el que más descuenta, que siempre es el Dúo ($ 22.475 contra $ 10.000) | Igual que el Dúo solo |
| Dúo y cupón **acumulados**: alternativa solo para cupones ya dados (§6) | A decidir | ✓ 29,9 % / ✓ 26,9 % / ✓ 23,5 % |
| Dúo, dinero en Mercado Pago (1 pago) y crédito sobre lo que queda ($ 14.159) | **A decidir** (§7) | ✓ 40,9 % / ✓ 37,7 % / ✓ 34,1 % |
| Par suelto y dinero en Mercado Pago (1 pago) | **A decidir** (§7) | ✓ 35,9 % / ✓ 30,3 % / ✓ 24,1 % |
| Par suelto y cupón de bienvenida | Solo para cupones ya dados: **a decidir** (§6) | ✓ 22,7 % / ✗ 17,1 % / ✗ 10,9 % |
| Par suelto, cupón y dinero en Mercado Pago (1 pago) | **A decidir** (§6 y §7) | ✓ 29,1 % / ✓ 22,9 % / ✗ 15,9 % |
| Crédito usado en una compra futura, total o parcial | **Se combinan** (definido) | — |
| Recompra de 1 par con crédito, sin crédito nuevo, 6 cuotas | **A decidir** (§9.3) | ✓ 32,2 % / ✓ 27,2 % / ✗ 21,7 % |
| Recompra de 1 par con crédito, sin crédito nuevo, 3 cuotas | **A decidir** (§9.3) | ✓ 38,0 % / ✓ 33,0 % / ✓ 27,5 % |
| Recompra con crédito y dinero en Mercado Pago (1 pago) | **A decidir** (§7) | ✓ 38,3 % / ✓ 32,8 % / ✓ 26,8 % |
| Recompra de 1 par con crédito que **genera crédito nuevo** | Propuesta base: **no**. **A decidir** (§9.4) | ✓ 24,0 % / ✗ 19,0 % / ✗ 13,4 % |
| Recompra Dúo con crédito, sin crédito nuevo | **Se combinan** | ✓ 44,3 % / ✓ 41,4 % / ✓ 38,2 % |
| Recompra Dúo con crédito y **con crédito nuevo** | **A decidir** (§9.4) | ✓ 35,3 % / ✓ 32,4 % / ✓ 29,2 % |
| Cupón y crédito en la misma compra | **No pueden coincidir**: el cupón es de la primera compra y el crédito sale de una compra anterior | — |
| Descuentos de estuches y paños | Sin cambios: van sobre estuches y paños, no sobre anteojos | No modelado |

---

## 6. El cupón de bienvenida de $ 10.000

**Datos:**

- Las condiciones aceptadas dicen que el cupón es para la primera compra y
  de una sola vez. No le ponen vencimiento.
- Si se cambia, hay que publicar la versión nueva y avisar por mail antes de
  que rija (punto 9).
- En un par suelto en 6 cuotas, el cupón le saca unos $ 6.400 al pedido: de
  28,8 % a 22,7 % con el envío de $ 5.500.
- Con el cupón, el par suelto en 6 cuotas deja de llegar al 22 % cuando el
  envío cuesta más de $ 6.093.

**Para suscriptores nuevos.** La propuesta no lo incluye. Dejar de darlo
desde la fecha del cambio no afecta a nadie que ya lo tenga.

**Para quien ya lo tiene y no lo usó:**

| Alternativa | Qué pasa | Cuánto deja |
|---|---|---|
| **A.** Se respeta como se aceptó y no se acumula con el Dúo | Sirve en un par suelto. En un Dúo queda el Dúo y el cupón se pierde, porque la primera compra ya se hizo | Par suelto, 6 cuotas: ✓ 22,7 % / ✗ 17,1 % / ✗ 10,9 %. En 3 cuotas: ✓ 29,8 % / ✓ 24,1 % / ✗ 17,9 % |
| **B.** Se respeta y, si la primera compra es un Dúo, se suma al Dúo | Nadie pierde lo que aceptó, y el cupón empuja hacia el Dúo | Dúo con cupón, 6 cuotas: ✓ 29,9 % / ✓ 26,9 % / ✓ 23,5 %. Unos $ 5.600 menos que el Dúo solo. El par suelto queda como en A |
| **C.** Vence en una fecha, avisada antes por mail | Corta lo que falta por pagar. Puede generar reclamos y hay que mandar un mail | Hasta esa fecha, como en A o B |

**Sugerencia (a confirmar): B.**

- **Por qué:** respeta lo aceptado. Nunca baja del 22 % en el Dúo. La
  pérdida de A en el par suelto queda limitada a los cupones que ya se dieron.
- **Falta saber** cuántos cupones sin usar hay. No lo medí porque está fuera
  del alcance.
- **Qué mostraría que está mal:** muchos pares sueltos con cupón y envíos
  caros. Se mide con los pedidos con cupón por zona en el panel.

---

## 7. El 10 % por pagar con dinero en Mercado Pago

**Datos:**

- En un par suelto, el 10 % por dinero en Mercado Pago deja **$ 2.580 más**
  que las 6 cuotas, que cuestan 10,3 %, y $ 6.679 menos que pagar en 1 pago
  con tarjeta.
- En el Dúo cuesta $ 10.388 frente al Dúo en 1 pago con tarjeta. Aun así
  deja más que el Dúo en 6 cuotas.
- El crédito se calcula sobre lo que queda: **$ 14.159** en lugar de
  $ 15.733.
- Supuesto: la comisión de Mercado Pago es la misma con dinero en cuenta. Si
  es menor, estos casos dejan más.

| Alternativa | Par suelto (1 pago) | Dúo con crédito (1 pago) | Recompra con crédito (1 pago) |
|---|---|---|---|
| **A.** Como hoy: se suma a todo | ✓ 35,9 % / ✓ 30,3 % / ✓ 24,1 % | ✓ 40,9 % / ✓ 37,7 % / ✓ 34,1 % | ✓ 38,3 % / ✓ 32,8 % / ✓ 26,8 % |
| **B.** No se acumula con el Dúo: el cliente se queda con el Dúo | Igual que A | Como un Dúo en 1 pago: ✓ 44,8 % / ✓ 41,9 % / ✓ 38,7 % | Igual que A |
| **C.** Se baja al 5 % | Más que A, menos que el 1 pago con tarjeta | Entre A y B | Entre A y el 1 pago con tarjeta |
| **D.** Se elimina | Quien lo usaba puede pasarse a 6 cuotas, que deja **menos** (28,8 % / 23,8 % / ✗ 18,3 %) | Como B | Como el 1 pago con tarjeta |

Con A, todas las combinaciones con dinero en Mercado Pago llegan al 22 %.
La única que no llega es par suelto con cupón ya dado y envío de $ 15.000
(15,9 %).

**Sugerencia (a confirmar): A.**

- **Por qué:** llega en todos los casos de la propuesta, no obliga a cambiar
  condiciones y deja más que las 6 cuotas.
- **Cómo se mide:** qué parte de los pedidos se paga con dinero en Mercado
  Pago y cuánto deja de verdad cada medio de pago. Está en la tabla Pedidos,
  campo `Medio_pago`.

---

## 8. Envío

**Datos:**

- Envío máximo que soporta cada combinación para llegar al 22 %:
  - par suelto: $ 22.841 en 1 pago, $ 17.946 en 3 cuotas, $ 11.636 en
    6 cuotas y $ 16.737 con dinero en Mercado Pago;
  - Dúo con crédito en 6 cuotas: $ 21.701;
  - Dúo con dinero en Mercado Pago y crédito: $ 32.200;
  - recompra con crédito sin crédito nuevo: $ 19.920 en 3 cuotas y $ 14.715
    en 6 cuotas;
  - recompra con crédito nuevo: $ 12.503 en 3 cuotas y $ 7.298 en 6 cuotas.
- En AMBA, las tarifas de Config van de $ 3.709 a $ 7.500, por debajo de
  casi todos esos máximos.
- No tengo medido el costo promedio en el resto del país. $ 10.000 y
  $ 15.000 son valores de prueba.

**Decisión D1. ¿Qué envío lleva el par suelto?**

| Alternativa | Qué pasa | Cuánto deja el par suelto en 6 cuotas |
|---|---|---|
| **A.** Envío gratis siempre, para todos | Lo más simple y atractivo | ✓ 28,8 % / ✓ 23,8 % / ✗ 18,3 %: no llega cuando el envío pasa de $ 11.636 |
| **B.** Los umbrales de hoy para todos: gratis en AMBA desde $ 60.000 y en todo el país desde $ 150.000 | El par suelto es gratis en AMBA y fuera de AMBA paga el envío. El Dúo es gratis en todo el país | AMBA: ✓. Fuera de AMBA, si el comprador paga $ 9.900: ✓ 33,6 % / ✓ 29,1 % / ✓ 24,1 % |
| **C.** Envío gratis para todos, con 6 cuotas en el par suelto solo hasta cierto costo de envío y 3 cuotas para el resto | Llega siempre, pero es difícil de explicar | 3 cuotas con envío de $ 15.000: ✓ 25,3 % |

**Sugerencia (a confirmar): B.**

- **Por qué:** es la regla que ya existe para quien no se suscribe, y deja
  el envío gratis a todo el país como un motivo más para sumar el segundo
  par.
- **Qué mostraría que está mal:** que se abandonen muchas compras de un par
  fuera de AMBA en el paso del envío. Se mide con el embudo del panel por
  zona.

Los suscriptores actuales tienen prometido el envío gratis siempre. Qué pasa
con eso está en §10.

---

## 9. Crédito Harper

### 9.1 Quién genera crédito nuevo y cuándo

| Cliente o compra | ¿Genera crédito? | Estado y cuánto deja |
|---|---|---|
| Compra de 1 par | No | **Definido** (punto 3) |
| Primera compra, Dúo (2 o más anteojos) | **Sí**: 10 % de lo pagado en productos, sin envío y sin tope | **Definido**. 6 cuotas: ✓ 32,3 % / ✓ 29,4 % / ✓ 26,3 % |
| Ya compró un par antes y ahora hace su primer Dúo | **A decidir.** (a) Sí, es su primer Dúo. (b) No: solo genera crédito si el Dúo es la primera compra | El pedido deja lo mismo que una primera compra Dúo (✓). La diferencia está en cuántos pedidos generan crédito |
| Suscriptor del programa anterior, con saldo, que hace su primer Dúo | **A decidir** (§10) | Usa $ 7.990 de saldo y gana crédito, 6 cuotas: ✓ 33,8 % / ✓ 30,9 % / ✓ 27,8 % |
| Ya generó su crédito con un Dúo y vuelve | Propuesta base: **no** | **A decidir** (§9.4) |
| La parte de una compra que se paga con crédito | **No**: el crédito no genera crédito | Así se calcula hoy |
| La misma persona con otro mail | **No**: una sola vez por persona, controlada por mail y DNI, como hoy el cupón | Sugerencia |
| Quien compra sin suscribirse | **A decidir** (§11) | — |

**Qué es una «primera compra Dúo elegible»** (sugerencia, a confirmar):

- un pedido con 2 o más anteojos;
- pagado y entregado;
- que sigue teniendo 2 o más anteojos después de cualquier devolución;
- de una persona que todavía no generó este crédito.

### 9.2 Cuándo se puede usar (definido: 30 días después de la entrega, sin devoluciones pendientes)

- **Plazos de devolución:** el arrepentimiento es de 10 días y los cambios de
  30 (`lib/confianza.ts`). Con 30 días desde la entrega, el crédito se libera
  cuando ya pasaron los dos plazos. Así no queda saldo negativo por un
  arrepentimiento.
- **Devolución o cambio abiertos:** si hay uno pendiente, el plazo se
  frena hasta que se resuelve.
- **Falta un dato para implementarlo:**
  - el pedido tiene un estado «entregado» (`lib/mis-compras.ts`), pero no
    confirmé que se cargue siempre y con fecha;
  - si no hay fecha de entrega confiable, la alternativa es contar desde el
    despacho más unos días fijos, o desde el pago más 40 días;
  - es un detalle de implementación y no cambia lo que deja el pedido.

### 9.3 Cómo se usa el crédito en una recompra sin bajar del 22 %

**El principio.** El crédito ya se cargó como costo en el Dúo que lo
generó, y ese Dúo igual llega al 22 %. En la recompra, el crédito es un
medio de pago que ya se pagó: no se resta otra vez.

Por eso usar más crédito no baja el margen de la recompra. Se cobra menos
por Mercado Pago, entonces bajan la comisión, la financiación y los IIBB.

| Recompra de 1 par, 6 cuotas, sin crédito nuevo | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 |
|---|---|---|---|
| Usa $ 0 de crédito | ✓ 28,8 % · $ 21.417 | ✓ 23,8 % · $ 17.698 | ✗ 18,3 % · $ 13.566 |
| Usa $ 5.000 (uso parcial) | ✓ 29,9 % · $ 22.225 | ✓ 24,9 % · $ 18.506 | ✗ 19,3 % · $ 14.374 |
| Usa los $ 15.733 | ✓ 32,2 % · $ 23.961 | ✓ 27,2 % · $ 20.242 | ✗ 21,7 % · $ 16.110 |

En caja, la recompra que usa todo el crédito cobra $ 74.167. Los $ 15.733 ya
se cargaron en la primera compra. Por eso conviene mirar también al cliente
con sus dos compras juntas.

**Lo que sí puede bajar la recompra del 22 %:**

- el crédito nuevo (cerca de 8 puntos menos);
- las 6 cuotas (unos 6 puntos menos que 3 cuotas);
- el envío caro;
- la publicidad.

| Recompra de 1 par con $ 15.733, CAC $ 20.000 | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 |
|---|---|---|---|
| Sin crédito nuevo, 1 pago | ✓ 42,5 % · $ 31.600 | ✓ 37,5 % · $ 27.881 | ✓ 32,0 % · $ 23.749 |
| Sin crédito nuevo, 3 cuotas | ✓ 38,0 % · $ 28.263 | ✓ 33,0 % · $ 24.544 | ✓ 27,5 % · $ 20.411 |
| Sin crédito nuevo, 6 cuotas | ✓ 32,2 % · $ 23.961 | ✓ 27,2 % · $ 20.242 | ✗ 21,7 % · $ 16.110 |
| Con crédito nuevo, 3 cuotas | ✓ 29,8 % · $ 22.133 | ✓ 24,8 % · $ 18.414 | ✗ 19,2 % · $ 14.282 |
| Con crédito nuevo, 6 cuotas | ✓ 24,0 % · $ 17.831 | ✗ 19,0 % · $ 14.112 | ✗ 13,4 % · $ 9.980 |
| **Cliente con Dúo en 6 cuotas y recompra:** | | | |
| las dos compras, sin crédito nuevo, recompra en 3 cuotas | ✓ 34,4 % · $ 70.256 | ✓ 30,7 % · $ 62.818 | ✓ 26,7 % · $ 54.554 |
| las dos compras, sin crédito nuevo, recompra en 6 cuotas | ✓ 32,3 % · $ 65.955 | ✓ 28,6 % · $ 58.517 | ✓ 24,6 % · $ 50.252 |
| las dos compras, con crédito nuevo, recompra en 6 cuotas | ✓ 29,3 % · $ 59.825 | ✓ 25,6 % · $ 52.387 | ✗ 21,6 % · $ 44.122 |

**Decisión D6. ¿Cómo se mide el 22 % y cuántas cuotas lleva la recompra?**

| Alternativa | Regla | Resultado |
|---|---|---|
| **A.** Hasta 6 cuotas, sin crédito nuevo, y el 22 % se mide sobre el cliente con sus dos compras | Igual que una compra normal | El cliente llega siempre (24,6 % a 32,3 %). La recompra sola no llega solo en 6 cuotas con envío de $ 15.000 (21,7 %) |
| **B.** Recompra con crédito hasta 3 cuotas, y el 22 % se mide pedido por pedido | La recompra tiene menos cuotas que la primera compra | Llega siempre (27,5 % a 38,0 %). A los suscriptores actuales les quita cuotas, y hay que avisar (§10) |
| **C.** 6 cuotas solo si el envío cuesta hasta $ 14.715 | Llega siempre | Difícil de explicar y de mostrar en el checkout |

**Otras reglas de uso** (sugerencia, a confirmar):

- **Qué paga:** solo productos, no el envío. Así coincide con la base del
  crédito y con el modelo.
- **Cambio:** no se cambia por dinero ni se transfiere, como hoy.
- **Vencimiento:**
  - hoy el saldo no vence, y la propuesta no dice nada;
  - ponerle vencimiento no mejora estos números, porque el modelo ya supone
    que se usa todo;
  - para el crédito nuevo, sugiero que no venza, como el saldo de hoy.

### 9.4 Cómo evitar un ciclo de créditos que no se sostiene

**Datos del programa de hoy.** Hoy cada compra genera el 10 %. Un cliente
que siempre compra un par termina usando y generando unos $ 8.173 en cada
compra, y así no llega:

- en 6 cuotas: ✗ 21,5 % / ✗ 16,5 % / ✗ 10,9 %;
- en 3 cuotas: ✓ 27,9 % / ✓ 22,9 % / ✗ 17,3 %.

**Protecciones para cualquier alternativa:**

- el crédito se calcula solo sobre lo pagado en dinero, no sobre el crédito
  usado ni sobre el envío;
- una primera compra Dúo por persona, controlada por mail y DNI;
- el crédito se anula si se devuelve la compra que lo generó.

**Decisión D5. ¿Las recompras generan crédito nuevo?**

| Alternativa | Regla | Cuánto deja la recompra, 6 cuotas | Ciclo |
|---|---|---|---|
| **A.** Una sola vez por persona (la propuesta base) | Solo la primera compra Dúo elegible genera crédito | 1 par: ✓ 32,2 % / ✓ 27,2 % / ✗ 21,7 %. Dúo: ✓ 44,3 % / ✓ 41,4 % / ✓ 38,2 % | No hay ciclo |
| **B.** Cada Dúo genera crédito, también en las recompras. El par suelto no | Para ganar crédito de nuevo hay que llevar dos anteojos | Recompra Dúo que usa crédito y gana otro: ✓ 35,3 % / ✓ 32,4 % / ✓ 29,2 %. El cliente con sus dos Dúos: ✓ 33,8 % / ✓ 30,9 % / ✓ 27,7 % | Acotado: cada crédito nuevo exige un pedido de dos pares |
| **C.** Cada compra genera crédito, como hoy | — | 1 par: ✓ 24,0 % / ✗ 19,0 % / ✗ 13,4 % | No se sostiene |

**Sugerencia (a confirmar): A para empezar, con fecha de revisión, y B como
siguiente paso si los datos lo justifican.**

- **Qué mostraría que A se queda corta:** que pocos clientes con crédito
  vuelvan.
- **Cómo se mide:** qué parte de los clientes con crédito vuelve dentro de
  los 90 días y en cuánto tiempo.

### 9.5 Recompra con CAC de $ 20.000 y sin CAC nuevo

- El caso principal usa **CAC de $ 20.000 también en la recompra** (Ale,
  PR #59).
- La recompra que llega por los mails o por el crédito no tiene un CAC de
  adquisición nuevo, pero **tampoco cuesta cero**. Están los mails, la
  plataforma y el tiempo, y no está medido.
- Por eso, además de la referencia sin publicidad, la tabla muestra **el
  costo comercial máximo que soporta la recompra para seguir en el 22 %**.
  Cuando haya un costo real por recompra, se compara con estos topes.

| Recompra de 1 par con $ 15.733 | Sin publicidad (referencia) | Costo comercial máximo por recompra para llegar al 22 % |
|---|---|---|
| Sin crédito nuevo, 1 pago | ✓ 69,5 % / ✓ 64,4 % / ✓ 58,9 % | $ 35.255 / $ 31.536 / $ 27.403 |
| Sin crédito nuevo, 3 cuotas | ✓ 65,0 % / ✓ 60,0 % / ✓ 54,4 % | $ 31.917 / $ 28.198 / $ 24.066 |
| Sin crédito nuevo, 6 cuotas | ✓ 59,2 % / ✓ 54,2 % / ✓ 48,6 % | $ 27.615 / $ 23.896 / $ 19.764 |
| Con crédito nuevo, 3 cuotas | ✓ 56,7 % / ✓ 51,7 % / ✓ 46,1 % | $ 25.787 / $ 22.068 / $ 17.936 |
| Con crédito nuevo, 6 cuotas | ✓ 50,9 % / ✓ 45,9 % / ✓ 40,4 % | $ 21.486 / $ 17.767 / $ 13.634 |

**El cliente con Dúo en 6 cuotas y recompra sin publicidad**, de
referencia:

- recompra en 3 cuotas, sin crédito nuevo: 44,2 % / 40,5 % / 36,5 %;
- recompra en 6 cuotas, sin crédito nuevo: 42,1 % / 38,4 % / 34,4 %;
- recompra en 6 cuotas, con crédito nuevo: 39,1 % / 35,4 % / 31,4 %.

**Cómo se lee.** Con CAC de $ 20.000, la recompra llega donde el tope es de
$ 20.000 o más. Si el costo real de traer una recompra resulta menor, hay
más margen para dar 6 cuotas o crédito nuevo. Eso se decide con datos, no
de entrada.

---

## 10. Transición: créditos ganados y condiciones aceptadas

**Lo que ya se aceptó:**

- Cada suscriptor guarda la versión de las condiciones que aceptó.
- El punto 9 obliga a publicar la versión nueva con su fecha y a avisar por
  mail, antes de que rija, a quien le afecte.
- El mismo punto dice que **el saldo ya ganado se respeta**.

**Lo que se respeta tal cual** (sugerencia, a confirmar):

1. **El saldo ya disponible** queda intacto: no vence, se usa total o
   parcialmente y puede pagar una compra entera. Usarlo no genera crédito
   sobre ese saldo, como hoy.
2. **El cashback ya anotado que todavía no está disponible** (dentro de los
   30 días del pago) se libera con la regla con que se ganó: 30 días desde
   el pago, no desde la entrega.
3. **El cupón sin usar:** ver §6.
4. **Las compras con fecha de pago anterior al cambio** quedan con las
   reglas de hoy, incluidas las devoluciones.

**Decisión D7. ¿Desde cuándo rigen las reglas nuevas para los suscriptores
actuales?**

Hoy tienen prometido, en las compras futuras, el cashback del 10 % en cada
compra, el envío gratis siempre y hasta 6 cuotas.

| Alternativa | Regla | Cuánto deja una recompra de un suscriptor actual (usa $ 7.990 de saldo) |
|---|---|---|
| **A.** Las reglas nuevas rigen para todos desde una fecha, con aviso previo por mail. El plazo del aviso está a decidir, por ejemplo 30 días | Hasta esa fecha, las reglas de hoy | Con las reglas nuevas, sin crédito nuevo: 6 cuotas ✓ 30,6 % / ✓ 25,6 % / ✗ 20,0 %; 3 cuotas ✓ 37,0 % / ✓ 32,0 % / ✓ 26,4 % |
| **B.** Un período más largo para los suscriptores actuales, por ejemplo hasta el 31/01/2027 | Más tiempo con las reglas de hoy | Mientras dure, como hoy: 6 cuotas ✗ 21,5 % / ✗ 16,4 % / ✗ 10,9 % |
| **C.** Los suscriptores actuales mantienen las reglas de hoy para siempre | — | ✗: la primera compra queda entre 0,9 % y 12,7 % y el ciclo de §9.4 no se sostiene |

**Su primer Dúo con las reglas nuevas.** Sugiero que genere el crédito una
vez, como a cualquier cliente. Usando $ 7.990 de saldo y ganando el 10 %, en
6 cuotas deja ✓ 33,8 % / ✓ 30,9 % / ✓ 27,8 %.

**Falta saber, antes de elegir entre A y B:**

- cuántos suscriptores activos hay;
- cuánto saldo hay en total;
- cuántos cupones sin usar quedan.

No lo medí porque está fuera del alcance. Las condiciones publicadas se
cambian en otra tarea, con el texto aprobado por Ale.

---

## 11. Si el cliente se da de baja de los mails

**Hoy:**

- la baja corta los mails y los beneficios nuevos (el cupón sin usar, el
  envío gratis y el cashback que viene);
- se conserva el saldo ganado;
- si vuelve a suscribirse, recupera todo.

El código ya trata el saldo como algo que la baja no puede quitar. En
`lib/suscriptores.ts` dice: «darse de baja de los mails no puede costarle
nada: Ley 25.326, art. 27».

**Decisión D8. ¿El crédito depende de la suscripción a los mails?**

| Alternativa | Regla | Consecuencia |
|---|---|---|
| **A.** El crédito y el Dúo son beneficios de **compra**, atados a la cuenta (mail verificado con código) y no a la suscripción | La baja solo corta los mails de novedades. No toca el crédito ganado, el pendiente ni el que generaría el primer Dúo | No cambia lo que deja cada pedido, porque el costo ya está en el Dúo. Hay un motivo menos para seguir suscripto (hipótesis). Es más simple de explicar |
| **B.** Como hoy: la baja corta los beneficios nuevos | Quien se dio de baja y todavía no hizo su primer Dúo no genera crédito. Conserva el ganado y el pendiente | Algunos Dúos no generan crédito y dejan unos $ 13.000 más cada uno. El crédito queda atado a aceptar mails |

**En las dos alternativas:**

- el crédito ya ganado, disponible o pendiente, se respeta y se usa entrando
  con el código;
- los mails del pedido se siguen mandando;
- volver a suscribirse no genera un segundo crédito.

**Falta decidir** si el aviso de «tu crédito ya se puede usar» es un mail de
la cuenta, que se manda siempre, o uno de novedades. Conviene revisarlo con
quien lleve lo legal.

**Sugerencia (a confirmar): A.**

- **Por qué:** el crédito pasa a ser un premio por llevar dos anteojos, no
  por recibir mails, y evita la pregunta de si la baja «cuesta» algo.
- **Qué mostraría que está mal:** que la base de suscriptores deje de
  crecer. Se mide con las altas y bajas por mes en el panel.

---

## 12. Casos de borde

### 12.1 Uno, dos o más pares

Primera compra Dúo elegible, 6 cuotas, todos los pares a $ 89.900.

| Pares | Descuento | Crédito | Cuánto deja ($ 5.500 / $ 10.000 / $ 15.000) |
|---|---|---|---|
| 1 | Ninguno | No | ✓ 28,8 % / ✓ 23,8 % / ✗ 18,3 % |
| 2 | 25 % en el de menor precio: $ 22.475 | $ 15.733 | ✓ 32,3 % / ✓ 29,4 % / ✓ 26,3 % |
| 3, como está en el motor | 25 % en el más barato y el tercero a precio de lista: $ 22.475 | $ 24.723 | ✓ 40,4 % / ✓ 38,6 % / ✓ 36,5 % |
| 3, alternativa | 25 % en los dos más baratos: $ 44.950 | $ 22.475 | ✓ 37,7 % / ✓ 35,7 % / ✓ 33,5 % |
| 4 | 25 % en los dos más baratos (dos Dúos): $ 44.950 | $ 31.465 (sin tope) | ✓ 42,5 % / ✓ 41,1 % / ✓ 39,5 % |

- **Precios distintos:** el descuento va siempre al más barato de cada par
  de anteojos.
- **Dos iguales:** se pueden combinar modelos y colores. Nada impide llevar
  dos iguales.
- **Estuches y paños:** el Dúo es solo de anteojos. Siguen con sus propios
  descuentos.
- **Decisión menor (D10):** si el crédito se calcula sobre todos los
  productos o solo sobre los anteojos. Estuches y paños no están en el
  motor, porque no tengo su costo cargado.
- **3 pares (D11):** el motor aplica el 25 % a ⌊n/2⌋ pares. La alternativa
  de descontar dos de tres también llega al 22 % y es más generosa. Hay que
  elegir una.

### 12.2 Devoluciones

- **Arrepentimiento total del Dúo (10 días):** se anula el crédito. Como se
  libera a los 30 días de la entrega, todavía no se pudo usar y no queda
  saldo negativo.
- **Devolución total después de usar el crédito** (por ejemplo, un reclamo
  tardío):
  - hoy el monto se descuenta del saldo, que puede quedar negativo;
  - la alternativa es descontar del reintegro el crédito ya usado;
  - hay que elegir una.
- **Cambio de modelo o color dentro del Dúo:** sigue siendo un Dúo. Si cambia
  el precio, se recalculan el descuento (va al más barato) y el crédito
  sobre el monto final.
- **Devolución de una recompra pagada en parte con crédito:** el crédito
  usado vuelve al saldo cuando se concreta la devolución, como hoy. La parte
  pagada en dinero se reintegra por Mercado Pago.
- **Contracargo:** se trata como una devolución y anula el crédito.

**Decisión D9. Devolución de un par del Dúo: el cliente se queda con uno.**

La tabla muestra cuánto deja lo que queda, en 6 cuotas, sin contar el retiro
del par devuelto.

| Cómo se reintegra | Lo que queda | Crédito | Cuánto deja lo que queda |
|---|---|---|---|
| **A.** Se reintegra lo pagado menos el precio de lista del par que se queda: $ 157.325 − $ 89.900 = **$ 67.425**, sin importar qué par devuelve | 1 par a $ 89.900 | Se anula: ya no es Dúo | ✓ 28,8 % / ✓ 23,8 % / ✗ 18,3 %. Igual que vender un par suelto |
| **B.** El descuento se reparte entre los dos y se reintegran $ 78.662,50 | 1 par a $ 78.662,50 (12,5 % menos) | Se recalcula: $ 7.866 | ✗ 11,9 % / ✗ 6,2 % / ✗ −0,2 %. Sin crédito: ✗ 21,9 % / ✗ 16,2 % / ✗ 9,8 % |
| **C.** Se reintegra el precio de lista del par devuelto: $ 89.900 | 1 par a $ 67.425 (25 % menos) | Se anula | ✗ 12,6 % / ✗ 5,9 % / ✗ −1,5 %. Si se mantuviera el crédito: ✗ 2,6 % / ✗ −4,1 % / ✗ −11,5 % |

**Por qué importa.** Con C, cualquiera compra dos, devuelve uno y se queda
con un par al 25 % menos. A es la única que mantiene la economía.

**Sugerencia (a confirmar): A.**

- Las condiciones del Dúo tienen que decirlo claro antes de comprar.
- Antes de publicarlo, hay que revisarlo con quien lleve lo legal, por cómo
  se combina con el derecho de arrepentimiento (Ley 24.240).

### 12.3 Medios de pago

| Medio | Cuotas | Base del crédito en una primera compra Dúo | Crédito del Dúo de 2 pares |
|---|---|---|---|
| Tarjeta o Mercado Pago en 1 pago | 1 | Productos después del Dúo: $ 157.325 | $ 15.733 |
| Tarjeta en 3 o 6 cuotas sin interés, si Mercado Pago las confirma | 3 o 6 | Igual: las cuotas no cambian el crédito, cambian lo que deja el pedido | $ 15.733 |
| Dinero en Mercado Pago, si se mantiene el 10 % | 1 | Después del 10 %: $ 141.592,50 | $ 14.159 |
| Crédito más tarjeta, en una recompra | — | No genera crédito en la propuesta base. Con la alternativa B de §9.4, solo sobre lo pagado en dinero | — |
| Compra pagada entera con crédito | — | No genera crédito. No pasa por Mercado Pago | — |
| Transferencia | No está activa | Si se activa, se trata como el dinero en Mercado Pago (a decidir entonces) | — |

- **Cuotas:** si Mercado Pago no confirma 6 cuotas sin interés para ese
  monto, se ofrecen las que confirme, como hoy (`lib/cuotas.ts`).
- **Pago rechazado o vencido:** el crédito apartado se libera a los
  30 minutos, como hoy.

---

## 13. Decisiones que necesitan la aprobación de Ale

| # | Decisión | Alternativas | Sugerencia (a confirmar) | Dónde |
|---|---|---|---|---|
| D1 | Envío del par suelto | A: gratis siempre. B: los umbrales de hoy para todos. C: gratis con cuotas según el envío | **B** | §8 |
| D2 | Cupón de $ 10.000 | Para nuevos: dejar de darlo. Para los ya dados: A, B o C | **No darlo a los nuevos. B para los ya dados** | §6 |
| D3 | 10 % por dinero en Mercado Pago | A: como hoy. B: no se acumula con el Dúo. C: 5 %. D: se elimina | **A** | §7 |
| D4 | Quién genera crédito | Primer Dúo después de un par suelto: sí o no. Suscriptores anteriores: sí, una vez. Una vez por persona (mail y DNI) | **Sí, una vez por persona** | §9.1 |
| D5 | Crédito nuevo en las recompras | A: nunca. B: solo en Dúos. C: siempre | **A con fecha de revisión, después B si hay datos** | §9.4 |
| D6 | Cuotas de la recompra y cómo se mide el 22 % | A: 6 cuotas y se mide el cliente. B: 3 cuotas y se mide cada pedido. C: según el envío | Elige Ale: A es mejor para el cliente y B es más estricta con el piso | §9.3 |
| D7 | Desde cuándo rige para los suscriptores actuales | A: fecha con aviso. B: período más largo. C: para siempre | **A**, con el plazo del aviso a definir | §10 |
| D8 | Baja de los mails | A: el crédito va con la cuenta. B: como hoy | **A** | §11 |
| D9 | Devolución de un par del Dúo | A: el que queda pasa a precio de lista. B: se reparte el descuento. C: se reintegra el precio de lista | **A**, revisado por quien lleve lo legal | §12.2 |
| D10 | Detalles del crédito | Si vence, si paga el envío, si se gana sobre estuches y paños, de dónde sale la fecha de entrega | No vence. No paga el envío. Estuches y paños: elige Ale. Fecha de entrega: confirmar el dato | §9.2, §9.3, §12.1 |
| D11 | 3 pares | El 25 % en uno o en los dos más baratos | Elige Ale (las dos llegan al 22 %) | §12.1 |

**Para cada decisión aprobada, después de esta tarea:**

- va a la tabla Decisiones con fecha de revisión;
- lo que haya que hacer va a Pendientes;
- el texto de las condiciones se cambia en otra tarea, con aviso por mail
  antes de que rija.

---

## 14. Lo que este documento no hace

- No implementa nada.
- No cambia precios, descuentos, créditos, el checkout, Airtable, las
  condiciones publicadas ni la producción.
- No mide la cantidad de suscriptores, el saldo total ni los cupones sin
  usar. Se necesitan antes de D2 y D7.
- No empieza la Tarea 03.
