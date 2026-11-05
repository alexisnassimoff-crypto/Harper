# Contribución por pedido: escenarios de referencia

Generado por `lib/contribucion.ts` (Tarea 01). No editar a mano: lo vuelve a escribir
`ACTUALIZAR_MATRIZ=1 npm test`.

Precio $ 89.900 por par (con IVA). Costo $ 9.570 por par (sin IVA). Preparación $ 2.000. Publicidad (CAC) $ 20.000 por pedido. Mercado Pago 3,39 %; 3 cuotas +4,50 %; 6 cuotas +10,30 %. IIBB 3 %. Devoluciones 3 %. Envío gratis para el comprador. Cashback: un porcentaje de lo pagado en productos (después de descuentos y saldo, sin envío), redondeado al peso, sin tope. La bienvenida no se acumula con el Dúo.

Cada celda: contribución sobre la venta neta de IVA, después de publicidad, y cuánto deja en pesos. ✓ llega al 22 %; ✗ no llega.

## Escenarios obligatorios

Con el costo de envío informado **con IVA** (Harper recupera ese IVA) y **sin IVA** (ya neto).

| Escenario | Envío informado | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 |
|---|---|---|---|---|
| 1 par a precio completo, 6 cuotas, sin cashback | con IVA | ✓ 28,8 % · $ 21.417 | ✓ 23,8 % · $ 17.698 | ✗ 18,3 % · $ 13.566 |
|  | sin IVA | ✓ 27,5 % · $ 20.462 | ✗ 21,5 % · $ 15.962 | ✗ 14,8 % · $ 10.962 |
| 1 par a precio completo, 6 cuotas, cashback 10 % | con IVA | ✗ 18,8 % · $ 13.987 | ✗ 13,8 % · $ 10.268 | ✗ 8,3 % · $ 6.136 |
|  | sin IVA | ✗ 17,5 % · $ 13.033 | ✗ 11,5 % · $ 8.533 | ✗ 4,8 % · $ 3.533 |
| 1 par con bienvenida $ 5.000, 6 cuotas, sin cashback | con IVA | ✓ 26,0 % · $ 18.217 | ✗ 20,7 % · $ 14.498 | ✗ 14,8 % · $ 10.366 |
|  | sin IVA | ✓ 24,6 % · $ 17.263 | ✗ 18,2 % · $ 12.763 | ✗ 11,1 % · $ 7.763 |
| 1 par con bienvenida $ 5.000, 6 cuotas, cashback 10 % | con IVA | ✗ 16,0 % · $ 11.201 | ✗ 10,7 % · $ 7.482 | ✗ 4,8 % · $ 3.349 |
|  | sin IVA | ✗ 14,6 % · $ 10.246 | ✗ 8,2 % · $ 5.746 | ✗ 1,1 % · $ 746 |
| 2 pares, Dúo −25 %, cashback 10 % sin tope, 6 cuotas | con IVA | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
|  | sin IVA | ✓ 31,6 % · $ 41.039 | ✓ 28,1 % · $ 36.539 | ✓ 24,3 % · $ 31.539 |
| Recompra de 1 par con $ 15.733 de crédito, 3 cuotas | con IVA | ✓ 29,8 % · $ 22.133 | ✓ 24,8 % · $ 18.414 | ✗ 19,2 % · $ 14.282 |
|  | sin IVA | ✓ 28,5 % · $ 21.178 | ✓ 22,4 % · $ 16.678 | ✗ 15,7 % · $ 11.678 |
| Recompra de 1 par con $ 15.733 de crédito, 6 cuotas | con IVA | ✓ 24,0 % · $ 17.831 | ✗ 19,0 % · $ 14.112 | ✗ 13,4 % · $ 9.980 |
|  | sin IVA | ✓ 22,7 % · $ 16.877 | ✗ 16,7 % · $ 12.377 | ✗ 9,9 % · $ 7.377 |

## El cliente en dos compras

Primera compra: 2 pares con Dúo −25 % (productos $ 157.325), cashback 10 % sin tope ($ 15.733 de crédito, provisionado como costo en esta compra), 6 cuotas. Recompra: 1 par a precio completo que usa los $ 15.733 de crédito (paga $ 74.167) y promete su propio cashback del 10 %. En la recompra el crédito no resta otra vez: ya se contó en la primera.

Envío informado con IVA. La recompra, con la misma publicidad que cualquier pedido y sin publicidad (si vuelve sola, por el mail o el crédito).

| Cuotas de la recompra | Publicidad de la recompra | Qué | Envío $ 5.500 | Envío $ 10.000 | Envío $ 15.000 |
|---|---|---|---|---|---|
| 3 cuotas | $ 20.000 | Primera compra | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
| | | Recompra (incremental) | ✓ 29,8 % · $ 22.133 | ✓ 24,8 % · $ 18.414 | ✗ 19,2 % · $ 14.282 |
| | | **Acumulado del cliente** | **✓ 31,4 % · $ 64.126** | **✓ 27,7 % · $ 56.688** | **✓ 23,7 % · $ 48.424** |
| 3 cuotas | $ 0 | Primera compra | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
| | | Recompra (incremental) | ✓ 56,7 % · $ 42.133 | ✓ 51,7 % · $ 38.414 | ✓ 46,1 % · $ 34.282 |
| | | **Acumulado del cliente** | **✓ 41,2 % · $ 84.126** | **✓ 37,5 % · $ 76.688** | **✓ 33,5 % · $ 68.424** |
| 6 cuotas | $ 20.000 | Primera compra | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
| | | Recompra (incremental) | ✓ 24,0 % · $ 17.831 | ✗ 19,0 % · $ 14.112 | ✗ 13,4 % · $ 9.980 |
| | | **Acumulado del cliente** | **✓ 29,3 % · $ 59.825** | **✓ 25,6 % · $ 52.387** | **✗ 21,6 % · $ 44.122** |
| 6 cuotas | $ 0 | Primera compra | ✓ 32,3 % · $ 41.994 | ✓ 29,4 % · $ 38.275 | ✓ 26,3 % · $ 34.142 |
| | | Recompra (incremental) | ✓ 50,9 % · $ 37.831 | ✓ 45,9 % · $ 34.112 | ✓ 40,4 % · $ 29.980 |
| | | **Acumulado del cliente** | **✓ 39,1 % · $ 79.825** | **✓ 35,4 % · $ 72.387** | **✓ 31,4 % · $ 64.122** |

## Cuánto pesa el IVA del envío

| Envío | Costo neto si viene con IVA | Costo neto si viene sin IVA | Diferencia por pedido |
|---|---|---|---|
| $ 5.500 | $ 4.545 | $ 5.500 | $ 955 menos de contribución |
| $ 10.000 | $ 8.264 | $ 10.000 | $ 1.736 menos de contribución |
| $ 15.000 | $ 12.397 | $ 15.000 | $ 2.603 menos de contribución |

En la matriz de abajo, 10 escenarios cambian de ✓ a ✗ si el envío viene sin IVA (están marcados con *).

## Cashback 10 % sin tope (principal)

Llegan al 22 %: **34 de 54** con el envío con IVA; 32 de 54 si viene sin IVA.

| Estrategia | 1 pago · $ 5.500 | 1 pago · $ 10.000 | 1 pago · $ 15.000 | 3 cuotas · $ 5.500 | 3 cuotas · $ 10.000 | 3 cuotas · $ 15.000 | 6 cuotas · $ 5.500 | 6 cuotas · $ 10.000 | 6 cuotas · $ 15.000 |
|---|---|---|---|---|---|---|---|---|---|
| 1 par, precio completo | ✓ 31,3 % | ✓ 26,3 % | ✗ 20,7 % | ✓ 25,8 % | ✗ 20,8 % | ✗ 15,3 % | ✗ 18,8 % | ✗ 13,8 % | ✗ 8,3 % |
| 1 par, bienvenida $ 5.000 | ✓ 28,4 % | ✓ 23,1 %* | ✗ 17,2 % | ✓ 23,0 %* | ✗ 17,7 % | ✗ 11,8 % | ✗ 16,0 % | ✗ 10,7 % | ✗ 4,8 % |
| 1 par, bienvenida $ 10.000 | ✓ 25,2 % | ✗ 19,6 % | ✗ 13,3 % | ✗ 19,8 % | ✗ 14,1 % | ✗ 7,9 % | ✗ 12,7 % | ✗ 7,1 % | ✗ 0,9 % |
| 2 pares, Dúo −20 % | ✓ 45,7 % | ✓ 43,0 % | ✓ 39,9 % | ✓ 40,3 % | ✓ 37,5 % | ✓ 34,4 % | ✓ 33,3 % | ✓ 30,5 % | ✓ 27,4 % |
| 2 pares, Dúo −25 % | ✓ 44,8 % | ✓ 41,9 % | ✓ 38,7 % | ✓ 39,3 % | ✓ 36,5 % | ✓ 33,3 % | ✓ 32,3 % | ✓ 29,4 % | ✓ 26,3 % |
| 2 pares, Dúo −30 % | ✓ 43,7 % | ✓ 40,8 % | ✓ 37,5 % | ✓ 38,3 % | ✓ 35,3 % | ✓ 32,1 % | ✓ 31,3 % | ✓ 28,3 % | ✓ 25,0 % |

## Cashback 5 % sin tope (alternativa experimental)

Llegan al 22 %: **41 de 54** con el envío con IVA; 38 de 54 si viene sin IVA.

| Estrategia | 1 pago · $ 5.500 | 1 pago · $ 10.000 | 1 pago · $ 15.000 | 3 cuotas · $ 5.500 | 3 cuotas · $ 10.000 | 3 cuotas · $ 15.000 | 6 cuotas · $ 5.500 | 6 cuotas · $ 10.000 | 6 cuotas · $ 15.000 |
|---|---|---|---|---|---|---|---|---|---|
| 1 par, precio completo | ✓ 36,3 % | ✓ 31,3 % | ✓ 25,7 % | ✓ 30,8 % | ✓ 25,8 % | ✗ 20,3 % | ✓ 23,8 % | ✗ 18,8 % | ✗ 13,3 % |
| 1 par, bienvenida $ 5.000 | ✓ 33,4 % | ✓ 28,1 % | ✓ 22,2 %* | ✓ 28,0 % | ✓ 22,7 %* | ✗ 16,8 % | ✗ 21,0 % | ✗ 15,7 % | ✗ 9,8 % |
| 1 par, bienvenida $ 10.000 | ✓ 30,2 % | ✓ 24,6 %* | ✗ 18,3 % | ✓ 24,8 % | ✗ 19,1 % | ✗ 12,9 % | ✗ 17,7 % | ✗ 12,1 % | ✗ 5,9 % |
| 2 pares, Dúo −20 % | ✓ 50,7 % | ✓ 48,0 % | ✓ 44,9 % | ✓ 45,3 % | ✓ 42,5 % | ✓ 39,4 % | ✓ 38,3 % | ✓ 35,5 % | ✓ 32,4 % |
| 2 pares, Dúo −25 % | ✓ 49,8 % | ✓ 46,9 % | ✓ 43,7 % | ✓ 44,3 % | ✓ 41,5 % | ✓ 38,3 % | ✓ 37,3 % | ✓ 34,4 % | ✓ 31,3 % |
| 2 pares, Dúo −30 % | ✓ 48,7 % | ✓ 45,8 % | ✓ 42,5 % | ✓ 43,3 % | ✓ 40,3 % | ✓ 37,1 % | ✓ 36,3 % | ✓ 33,3 % | ✓ 30,0 % |

## Sin cashback (referencia)

Llegan al 22 %: **47 de 54** con el envío con IVA; 42 de 54 si viene sin IVA.

| Estrategia | 1 pago · $ 5.500 | 1 pago · $ 10.000 | 1 pago · $ 15.000 | 3 cuotas · $ 5.500 | 3 cuotas · $ 10.000 | 3 cuotas · $ 15.000 | 6 cuotas · $ 5.500 | 6 cuotas · $ 10.000 | 6 cuotas · $ 15.000 |
|---|---|---|---|---|---|---|---|---|---|
| 1 par, precio completo | ✓ 41,3 % | ✓ 36,3 % | ✓ 30,7 % | ✓ 35,8 % | ✓ 30,8 % | ✓ 25,3 %* | ✓ 28,8 % | ✓ 23,8 %* | ✗ 18,3 % |
| 1 par, bienvenida $ 5.000 | ✓ 38,4 % | ✓ 33,1 % | ✓ 27,2 % | ✓ 33,0 % | ✓ 27,7 % | ✗ 21,8 % | ✓ 26,0 % | ✗ 20,7 % | ✗ 14,8 % |
| 1 par, bienvenida $ 10.000 | ✓ 35,2 % | ✓ 29,6 % | ✓ 23,3 %* | ✓ 29,8 % | ✓ 24,1 %* | ✗ 17,9 % | ✓ 22,7 %* | ✗ 17,1 % | ✗ 10,9 % |
| 2 pares, Dúo −20 % | ✓ 55,7 % | ✓ 53,0 % | ✓ 49,9 % | ✓ 50,3 % | ✓ 47,5 % | ✓ 44,4 % | ✓ 43,3 % | ✓ 40,5 % | ✓ 37,4 % |
| 2 pares, Dúo −25 % | ✓ 54,8 % | ✓ 51,9 % | ✓ 48,7 % | ✓ 49,3 % | ✓ 46,5 % | ✓ 43,3 % | ✓ 42,3 % | ✓ 39,4 % | ✓ 36,3 % |
| 2 pares, Dúo −30 % | ✓ 53,7 % | ✓ 50,8 % | ✓ 47,5 % | ✓ 48,3 % | ✓ 45,3 % | ✓ 42,1 % | ✓ 41,3 % | ✓ 38,3 % | ✓ 35,0 % |
