# Harper.ar

Tienda online de Harper: anteojos y estuches, con checkout de Mercado Pago y
mails automáticos. Reemplaza a Tienda Nube con costo de infraestructura cero.

## Stack

| Capa | Qué usa |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Datos | Airtable (base `Harper`) |
| Fotos y videos | Vercel Blob, espejados desde Airtable |
| Pagos | Mercado Pago Checkout Pro |
| Mails | Resend |
| Hosting | Vercel |
| Importación | API pública de Mercado Libre |

## Cómo funciona

**Airtable es el panel de administración.** No hay backoffice propio: los
precios, el stock, las fotos y los pedidos se manejan desde Airtable, que ya
sabés usar y no cuesta nada.

**Las fotos no vencen.** Las URLs de attachment de Airtable expiran a las ~2
horas. `/api/sync-media` copia cada archivo a Vercel Blob y escribe la URL
permanente de vuelta en Airtable. Vos subís la foto en Airtable y listo.

**El pedido se confirma desde el webhook, no desde el navegador.** Si el
cliente cierra la pestaña después de pagar, la venta igual queda registrada y
el mail igual sale.

**Los precios salen siempre del servidor.** El navegador guarda solo IDs y
cantidades; los precios los pone Airtable. Un precio manipulado del lado del
cliente no tiene efecto.

## Tablas de Airtable

| Tabla | Para qué |
|---|---|
| `Productos` | Un registro por modelo: nombre, precio, categoría, video |
| `Variantes` | Un registro por modelo×color: stock y fotos |
| `Importacion ML` | Publicaciones traídas de Mercado Libre, para revisar |
| `Pedidos` | Se crean solos. Filtrá por `Estado = pagado` para despachar |
| `Clientes` | Lista de compradores y de mails capturados sin compra |
| `Config` | Costo de envío, textos y datos legales, sin tocar código |
| `Descuentos` | Tramos de descuento por cantidad. Cambiar un valor acá cambia la web |

## Puesta en marcha

### 1. Variables de entorno en Vercel

Copiá las de `.env.example` en **Project Settings → Environment Variables**,
para Production, Preview y Development.

### 2. Vercel Blob

**Storage → Create → Blob**, y conectalo al proyecto. `BLOB_READ_WRITE_TOKEN`
se agrega solo.

### 3. Resend

1. Crear la cuenta y verificar el dominio `harper.ar`
2. Cargar en el DNS los registros que indique Resend: **SPF**, **DKIM** y
   **DMARC**
3. Copiar la API key en `RESEND_API_KEY`

### 4. Mercado Pago

Panel → Tus integraciones → crear una aplicación de tipo Checkout Pro. Los pasos
exactos y el orden en que hay que hacerlos están en
[Activar el cobro](#activar-el-cobro).

Sin `MP_WEBHOOK_SECRET` el webhook rechaza todas las notificaciones. Es a
propósito: sin firma no se puede distinguir una venta real de una falsificada.

### 5. Automations de Airtable

**Espejar fotos al subirlas** — trigger: *When record updated* en `Variantes`
(campo `Fotos`) y en `Productos` (campo `Video`). Acción: *Send web request*

```
POST https://harper.ar/api/sync-media
Header: x-sync-token: <SYNC_TOKEN>
```

**Avisar al cliente que su pedido salió** — trigger: *When record updated* en
`Pedidos`, campo `Tracking`. Acción: *Send web request*

```
POST https://harper.ar/api/pedidos/notificar-envio
Header: x-sync-token: <SYNC_TOKEN>
Body:   { "pedidoId": "<Record ID>" }
```

Además hay un cron diario a las 06:00 UTC que espeja lo que haya quedado
pendiente, por si una automation falla.

## Traer las fotos desde Mercado Libre

Mercado Libre cerró su API pública: hace falta conectar la cuenta del vendedor
una única vez.

**Paso 0 — conectar la cuenta (una sola vez)**

1. En [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar)
   → Mis aplicaciones → **Crear aplicación**: nombre `Harper Web`, redirect URI
   exactamente `https://harperar.vercel.app/api/ml/callback`, y tildar el scope
   **offline_access** (además de read)
2. Copiar el **App ID** y la **Secret Key** en Vercel como `ML_APP_ID` y
   `ML_APP_SECRET`, y redeployar
3. Abrir `https://harperar.vercel.app/api/ml/conectar?token=<SYNC_TOKEN>`,
   iniciar sesión con la cuenta vendedora y autorizar

Los tokens quedan guardados en la tabla Config y se renuevan solos.

**Paso 1 — traer las publicaciones**

```
https://harper.ar/api/importar-ml?token=<SYNC_TOKEN>
```

Llena la tabla `Importacion ML` con el título, el precio, el link y todas las
fotos de cada publicación, en máxima resolución. La columna `Sugerencia` trae
el SKU que detectó a partir del título.

**Paso 2 — revisar y asignar**

En Airtable, en cada fila enlazá la columna `Variante` a la variante que
corresponde. La `Sugerencia` es solo eso: verificala antes de seguir. Lo que no
quieras importar, marcalo como `ignorar`.

**Peso y medidas para el envío**

```
https://harperar.vercel.app/api/importar-ml?token=<SYNC_TOKEN>&medidas=1
```

Trae el peso y las medidas del paquete que ya están cargados en cada publicación
de Mercado Libre y los escribe en `Productos`. Usa el mismo enlace publicación →
variante de la tabla `Importacion ML`, y resuelve la variante a su producto.

No pisa lo que ya esté cargado: un número medido a mano gana sobre el de Mercado
Libre. Con `&forzar=1` se sobrescribe.

La respuesta dice qué escribió, qué respetó, qué publicaciones no tenían medidas
cargadas y **qué productos siguen faltando** — esos hay que completarlos a mano.

**Paso 3 — aplicar**

```
https://harper.ar/api/importar-ml?token=<SYNC_TOKEN>&aplicar=1
```

Copia las fotos de cada fila enlazada a su variante. Después corré
`/api/sync-media` para pasarlas a almacenamiento permanente.

El importador **nunca asigna una foto a un producto por su cuenta**: sin el
enlace manual del paso 2 no toca nada.

## Cargar un producto

1. En `Productos`, crear el registro: nombre, slug (minúscula y sin espacios),
   categoría, precio, orden, y tildar **Activo**
2. En `Variantes`, crear un registro por color: SKU, enlazar al producto,
   nombre del color, `Color_hex` para el círculo del selector, stock, subir las
   fotos y tildar **Activo**
3. Esperar hasta un minuto: el sitio se actualiza solo

Un producto sin variantes activas no aparece en la web.

**Categorías.** El campo `Categoria` acepta exactamente estas, definidas en
`lib/categorias.ts`: `Anteojos`, `Anteojos de sol`, `Clip-On`,
`Anteojos de receta`, `Estuches` y `Paños`. Para la primera carga de una nueva
(por ejemplo, unos de sol), primero se agrega esa opción al campo `Categoria` de
`Productos` (y al de `Descuentos`, solo si se decide darle una promoción). Una
categoría sin productos activos no aparece en el menú, el footer, la portada ni
el sitemap, y su página da 404. Un producto con una categoría que no está en la
lista no se publica: queda un aviso en el log.

**Características confirmadas.** "Filtro azul · Fotocromáticos · UV400", la lista de la
ficha y la consulta por cristales graduados se muestran solo en los modelos
confirmados de `lib/caracteristicas.ts` (AMATISTA, OBSIDIANA, CUARZO y
CITRINO). Un modelo nuevo no hereda nada: hay que confirmarlo y sumarlo ahí. Mientras haya
un anteojo publicado sin confirmar, la portada no muestra el subtítulo por
defecto (que afirma filtro azul y fotocromáticos), salvo que se cargue
`portada_subtitulo` en `Config`.

Campos opcionales de `Productos` que la ficha muestra solo si están cargados
(nada se inventa si faltan):

| Campo | Qué es | Ejemplo |
|---|---|---|
| `Incluye` | Qué viene en la caja, un renglón por ítem | `Estuche rígido Harper` ⏎ `Paño de microfibra` |
| `Frente_mm`, `Puente_mm`, `Patilla_mm` | Medidas del anteojo, en milímetros | `140`, `19`, `145` |
| `Material` | Material del armazón | `Acetato` |
| `Lentes` | Tipo de lentes | `Fotocromáticos` |

En `Config`, tres claves opcionales cambian la portada sin tocar código:
`portada_titulo`, `portada_subtitulo` y `portada_imagen` (ruta o URL de una
foto editorial aprobada). Vacías, la portada usa sus textos por defecto, que
se arman con lo que hay publicado, y muestra la foto de catálogo del primer
anteojo.

`plazo_entrega` se guarda pero no se le muestra al comprador en ningún lado
hasta que haya un operador logístico contratado y confirmado.

Datos fiscales en `Config` (vacíos = no se muestra nada; nunca se suponen):

| Clave | Qué es | De dónde sale |
|---|---|---|
| `data_fiscal` | El código del Formulario 960/D (Data Fiscal) para harper.ar. Se muestra el logo con su enlace al pie de todas las páginas, al lado de los medios de pago | ARCA → Mis Servicios → "Formulario 960 D" → sitio web → campo "Script", pegado tal cual. Solo se usan el enlace `qr.afip.gob.ar`/`qr.arca.gob.ar` y el logo de ARCA |
| `impuestos_nacionales` | Porcentaje que suman el IVA y otros impuestos nacionales indirectos sobre el precio neto (por ejemplo `21`). Debajo de cada precio aparece "Precio sin impuestos nacionales" (Res. SIyC 4/2025) | El contador |
| `impuestos_nacionales_<categoría>` | El mismo dato para una categoría con otra alícuota (`anteojos`, `estuches`, `panos`…) | El contador |
| `condicion_iva` | La condición de FOCUS VISION SRL frente al IVA: `Responsable Inscripto`, `Monotributo` o `Exento`. Decide la clase de cada factura (ver "Datos de facturación") | El contador |

**Cuotas.** `NEXT_PUBLIC_CUOTAS` dice cuántas cuotas sin interés se quieren
anunciar, pero se anuncian solo si Mercado Pago lo confirma: el servidor
consulta `/v1/payment_methods/installments` (Visa y Mastercard, cache de una
hora) y exige esas cuotas en todos los bancos, sin interés y con CFT 0. Se
muestran el monto por cuota que calcula Mercado Pago (con centavos), el
precio de contado y el CFTEA. Si no lo confirma, no se anuncian cuotas.

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /api/health` | Muestra qué integraciones están conectadas |
| `POST /api/carrito/resolver` | Devuelve el carrito con precios y stock reales |
| `POST /api/envio/cotizar` | Opciones de envío a domicilio de Envia para una dirección, con su comprobante |
| `GET /api/envio/sucursales` | Sucursales donde retirar, por provincia |
| `POST /api/checkout` | Crea el pedido y la preferencia de Mercado Pago |
| `POST /api/mercadopago/webhook` | Confirma el pago, descuenta stock y manda mails |
| `POST /api/sync-media` | Espeja fotos y videos a Blob |
| `POST /api/pedidos/notificar-envio` | Manda el mail con el tracking |
| `GET /api/importar-ml` | Trae las publicaciones de Mercado Libre |

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar las credenciales
npm run dev
```

Sin credenciales ni red, la tienda corre contra un catálogo de prueba en
memoria (`lib/fixtures`), que es una copia del catálogo real:

```bash
npm run dev:fixtures         # HARPER_FIXTURES=1 next dev
```

Sirve para ver cambios de diseño, sacar capturas y probar el recorrido hasta
el checkout. Nunca se activa en producción.

Antes de subir cambios:

```bash
npm run typecheck            # TypeScript
npm test                     # pruebas de lib/ (node --test)
npm run build
```

## Activar el cobro

Tres variables, en Vercel > Settings > Environment Variables, entorno **Production**.
Los secretos no van nunca al repositorio.

1. `NEXT_PUBLIC_SITE_URL` = `https://harperar.vercel.app`
   El día que `harper.ar` esté conectado, se cambia acá.
2. `MP_ACCESS_TOKEN` — Mercado Pago > Tus integraciones > la aplicación >
   Credenciales de producción. Empieza con `APP_USR-`.
3. `MP_WEBHOOK_SECRET` — en el mismo panel, Webhooks:
   - URL: `https://harperar.vercel.app/api/mercadopago/webhook`
   - Evento: **Pagos** (`payment`), nada más.
   - Al guardar aparece la **clave secreta**, una sola vez. Esa va acá.

Después hay que hacer un **redeploy**: las variables no se aplican solas a un
deploy ya hecho. Se comprueba en `/api/health`, que tiene que devolver
`mercadopago: true` y la lista `avisos` vacía.

> Las dos variables de Mercado Pago son obligatorias. Con el token pero sin el
> secreto se cobra la plata y el webhook rechaza todas las notificaciones con
> 401: ningún pedido pasa a `pagado`, no baja el stock y no sale ningún mail.

**Cuotas:** en el panel de Mercado Pago existe la opción *"Cuotas sin interés"*.
Si está activada, el interés lo paga el vendedor. Por defecto lo paga el
comprador.

## Antes de salir a producción

**El circuito de venta está cerrado y verificado con plata real** (24/08/2026).

- [x] Compra completa verificada contra el código: firma del webhook, cuerpo de la
      preferencia y casos borde del checkout
- [x] `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL` y
      `RESEND_API_KEY` cargadas — `/api/health` sin avisos
- [x] **Compra real** (HARPER-8812049): preferencia creada con credenciales de
      producción, firma del webhook validada, pago re-consultado contra la API de
      Mercado Pago, monto verificado, `Estado = pagado`, stock descontado y cliente
      registrado
- [x] **Mails** (HARPER-956523Y): dominio `harper.ar` verificado en Resend con SPF y
      DKIM. El aviso de venta llegó a Recibidos, no a spam, con la foto del producto
      renderizando — o sea que el `.jpg` que reemplaza al WebP funciona en un cliente
      real
- [x] `domicilio`, `razon_social` y `cuit` completos en `Config`
- [ ] Confirmar la casilla del comprador (el mail de confirmación es distinto del
      aviso interno; si falta, se revisa en Resend → Logs)
- [ ] Cargar el stock real de los paños (hoy son valores provisorios)
- [ ] Cargar `Peso_g`, `Largo_cm`, `Ancho_cm` y `Alto_cm` de cada producto
- [x] Cotización real del envío con Envia (`ENVIA_TOKEN` en Vercel)
- [ ] Generar la etiqueta de despacho con Envia desde Airtable
- [ ] Conectar `harper.ar` a Vercel: `NEXT_PUBLIC_SITE_URL`, la URL del webhook en
      Mercado Pago y redeploy, los tres juntos

## Descuentos por cantidad

Los tramos viven en la tabla `Descuentos`: categoría, unidades mínimas y porcentaje.
Aplica el más alto que alcance el pedido.

**Al público se le cuenta solo el primer tramo, en una línea** (en anteojos:
"Llevá 2 pares y obtenés 5% off en cada uno"). No hay tablas de tramos en las
fichas ni en el carrito. Los tramos mayores se siguen aplicando igual en el
servidor y el carrito los muestra como "Descuento".

**Las unidades se cuentan por categoría, no por producto ni por color.** Alguien que
lleva un M500 negro, un O300 rojo y un R100 marrón está comprando tres estuches. Exigir
que sean iguales mataría justo la venta variada que interesa.

Existen por una razón concreta: **el envío se paga por paquete, no por unidad.** Cuatro
estuches entran en el mismo sobre que uno y cuestan lo mismo de despachar, así que cada
unidad extra amortiza un costo ya pagado. Sin eso, un estuche de $6.990 con $10.100 de
envío no lo compra nadie.

El descuento se calcula **en el servidor**, en `resolverCarrito()`, igual que los
precios: del navegador vienen IDs y cantidades, nunca montos. Y viaja a Mercado Pago
como `unit_price` ya descontado, porque MP no acepta importes negativos.

Si la tabla está vacía o Airtable no responde, se cobra el precio de lista. Degradar
hacia el precio completo es lo correcto: cobrar de más se reclama, cobrar de menos no
se descubre nunca.

## Cookies y Meta

La primera visita ve un aviso abajo con **Aceptar**, **Rechazar opcionales** y
**Preferencias**. No bloquea la navegación ni la compra. La elección queda en
el navegador (`harper.consentimiento.v1`) y se cambia desde "Preferencias de
cookies" en el footer.

Sin el "sí" a medición y publicidad no se carga el Meta Pixel, no se crean las
cookies `_fbp`/`_fbc`, no se guarda de qué anuncio vino y el pedido no lleva
atribución. El webhook solo avisa la compra a Meta por la Conversions API si el
pedido trae `publicidad: true` en `Origen`, que el checkout marca únicamente con
consentimiento. Si la persona retira el consentimiento (en esa pestaña o en
otra), el píxel se revoca y se borran esas cookies. Sin consentimiento, también
se borran al entrar las que pudo haber dejado una versión anterior de la tienda.

Límite conocido: para la Conversions API cuenta la elección vigente al enviar
el checkout. Si alguien revoca entre el envío y la acreditación del pago (por
ejemplo, un pago en efectivo que tarda días), esa compra igual se le avisa a
Meta.

Mientras el aviso está abierto, en celular la barra fija de compra no se
esconde: el aviso tapa la parte de abajo y el botón real podría quedar debajo.

## Mayoría de edad y Términos

El checkout pide una casilla obligatoria: "Soy mayor de edad o cuento con
autorización de mi representante legal, y acepto los Términos y condiciones."
Sin fecha de nacimiento. El servidor rechaza el pedido sin esa casilla
(`validarCliente`). No se guarda entre visitas: se confirma en cada compra.

## Datos de facturación

Por defecto se compra como consumidor final. En el checkout, la sección
"Datos de facturación" permite pedir la factura a nombre de una empresa u otro
titular con CUIT: razón social o nombre, CUIT (se valida el dígito
verificador), condición frente al IVA y domicilio fiscal. Son datos de la
factura, aparte del comprador y de la dirección de entrega, y no van a
Mercado Pago ni a Meta.

Cada pedido los guarda en `Pedidos`: `Factura_condicion_IVA`, `Factura_clase`,
`Factura_razon_social`, `Factura_CUIT` y `Factura_domicilio` (los tres últimos
solo si la factura va a un CUIT). El aviso interno de venta los muestra en un
bloque propio y, si es a un CUIT, lo dice en el asunto.

La clase sale de las dos condiciones frente al IVA, la de Harper
(`Config.condicion_iva`) y la del receptor, no de que sea una empresa
(`lib/facturacion.ts`). Harper responsable inscripto: A a responsables
inscriptos y monotributistas (RG 5003/2021, con la leyenda de la Ley 27.618) y
B al resto. Harper monotributista o exento: siempre C. Sin `condicion_iva`
cargada, la clase queda "A confirmar". No hay facturación automática con ARCA:
la factura se hace desde el sistema contable.

Si `Pedidos` no tuviera esos campos, la venta no se frena: el pedido se crea
como antes y, si la factura va a un CUIT, los datos quedan en `Notas` y el
aviso interno los lee de ahí.

## Datos de quien no termina la compra

El email y los datos del checkout se guardan en Airtable recién cuando la
persona envía el pedido (botón "Pagar"), no mientras escribe. Quien no
termina la compra no queda registrado, y la tienda no manda campañas de
recuperación ni promociones: las novedades solo van a quien marcó la casilla
(`Clientes.Acepta_promos`). Cada pedido guarda en `Pedidos.Terminos_aceptados`
la versión de los Términos aceptada y el momento exacto (`lib/legales.ts`; al
publicar otra versión de los Términos se cambia `VERSION_TERMINOS`).

## Consultas por cristales graduados

Las fichas de los modelos confirmados, la página de gracias y el mail de compra
aprobada invitan a consultar por WhatsApp (`Config.whatsapp`). El mensaje lleva
solo el nombre del modelo o el número de pedido: nunca datos personales ni
recetas. Harper no vende graduaciones desde la web: es una consulta.

## Dirección con Google

En el checkout la dirección es **un solo casillero**: el comprador escribe, Google
sugiere, elige una de la lista y de ahí salen calle, número, localidad, provincia y
código postal. La clave de Google vive **solo en el servidor** (`/api/direcciones`):
el navegador nunca habla con Google y no se carga el JavaScript de Google Maps.

Lo que Google no garantiza en Argentina se pide aparte, y solo eso: el código postal
(en pueblos chicos a veces no viene) y el número (si eligió una avenida sin altura).
El piso o depto se pide siempre, opcional, porque nunca forma parte de la sugerencia.
Si el comprador no encuentra su dirección, "Cargala a mano" muestra los campos de
siempre. **Sin la clave configurada, el checkout muestra directamente los campos
manuales y se vende igual.** `/api/health` lo informa en `integraciones.googlePlaces`.

### Configurarlo (una vez)

1. Entrar a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta
   de Google de Harper y crear un proyecto (p. ej. `harper-web`).
2. **Facturación**: vincular una cuenta de facturación con tarjeta. Google exige
   facturación habilitada aunque el uso quede dentro de la cuota gratis (hace una
   retención de verificación en la tarjeta, no un cobro). Las cuentas nuevas reciben
   USD 300 de crédito por 90 días.
3. **APIs y servicios → Biblioteca**: habilitar **Places API (New)**. Solo esa.
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API.** En la
   clave: *Restricciones de API → Restringir clave →* marcar solo **Places API (New)**.
   No hace falta restricción por sitio ni por IP: la clave no sale del servidor.
5. **Google Maps Platform → Cuotas → Places API (New)**: ponerle un tope diario a
   `Autocomplete requests` y a `Place Details requests` (p. ej. 1.000 por día). Es el
   techo real del gasto: si alguien abusa, Google corta y el checkout cae a los campos
   manuales hasta el día siguiente.
6. **Vercel → el proyecto → Settings → Environment Variables**: `GOOGLE_PLACES_API_KEY`
   con la clave, tildando **Production y Preview**. Redeploy. En `/api/health` tiene que
   aparecer `googlePlaces: true`.

### Costo (lista de precios de Google, octubre de 2026)

| SKU | Gratis por mes | Después |
|---|---|---|
| Autocomplete Requests (cada tecla consultada) | 10.000 | USD 2,83 por 1.000 |
| Place Details Essentials (la dirección elegida) | 10.000 | USD 5,00 por 1.000 |

Cada búsqueda del checkout son unas 6 consultas de autocompletado más 1 detalle, en
una **sesión** (token que genera el navegador y cierra el detalle): dentro de una
sesión Google cobra como máximo 12 consultas de autocompletado. Con eso, hasta
**~1.600 checkouts por mes el costo es USD 0**; 3.000 checkouts rondan USD 23. La
tienda solo consulta desde los 4 caracteres y 250 ms después de la última tecla.

El servidor pone sus propios topes, por si alguien abusa (`app/api/direcciones/route.ts`):
60 consultas por minuto por IP (o por /64 en IPv6; pasado, 429 y el comprador espera),
600 por minuto entre todos y 2.500 por día (pasados, el checkout pide la dirección a
mano hasta que se renueve la ventana). Solo atiende pedidos del propio sitio
(`Sec-Fetch-Site`): una página ajena no puede hacer gastar consultas. Los contadores
viven en memoria y en el mismo Upstash del cerrojo del webhook; pasado un tope ya no
se gasta ningún comando de Redis, así que una inundación no agota el plan del que
depende el cobro.

Google exige mostrar su logo junto a las sugerencias cuando no hay un mapa: es el
`Google Maps` gris al pie de la lista (`public/google-maps-atribucion.svg`, del
paquete oficial de atribución, sin modificar). Los datos de la dirección se guardan en
el pedido como siempre (Direccion, Ciudad, Provincia, CP); no se guarda nada más de
Google.

## Comprador que vuelve

En el mismo navegador, el checkout ya recuerda los datos de la última compra y
los muestra resumidos («Tus datos» y «Entrega», cada uno con «Cambiar»): quien
vuelve solo revisa y paga.

En otro navegador o celular, debajo del mail aparece «¿Ya compraste con este
mail? Completá tus datos con un código». Si ese mail tiene una compra
confirmada, le llega un código de 6 números (`/api/clientes/codigo`); con el
código (`/api/clientes/datos`) se completan nombre, teléfono, DNI y la
dirección de su última compra. **Con el mail solo no se muestra nada**:
cualquiera puede escribir el mail de otro. La respuesta es la misma haya
comprado o no, el código vence a los 10 minutos y los intentos están
limitados por mail y por IP (lib/reconocer-cliente.ts). El código no se guarda:
viaja firmado con una clave que sale de `MP_WEBHOOK_SECRET`.

Si ya compró, la ficha y la portada dejan de ofrecerle HARPER10 (es solo
para la primera compra) y, si lo tenía aplicado, se le avisa antes de pagar.

## Envíos

El envío a domicilio se cotiza con la API de **[Envia](https://docs.envia.com)** apenas
el comprador completa su dirección (calle y número, localidad, provincia y código
postal). El checkout muestra **una sola opción, «Envío a domicilio»**, con el plazo
(«Llega en 24 h hábiles», «Llega en 2 a 7 días hábiles») y el precio. **El comprador no
ve con quién despachamos**: ni en la página, ni en la respuesta del cotizador, ni en
Mercado Pago, ni en su mail. Harper sí lo ve en el pedido y en el mail de venta. Sirve
igual para uno, dos o más pares: se cotiza el paquete del pedido entero.

**Qué opción se ofrece.** Si cotiza el reparto de AMBA (`rueddo`, el de 24 h), ese: la
dirección es **AMBA**. Si no, la más barata de las demás: **resto del país**. O sea, AMBA
es donde llega el reparto, según su cobertura real.

Solo se usa la ruta de **cotizar** (`POST /ship/rate/`). La tienda no genera etiquetas,
no da de alta envíos ni pide retiros: eso sigue a mano.

**Qué se configura en `Config`:**

| Clave | Qué es |
|---|---|
| `envio_transportistas` | Con quién cotizar, separados por coma, con el código de Envia: `rueddo, andreani, correoArgentino` |
| `envio_origen_nombre`, `_telefono`, `_calle`, `_numero`, `_piso`, `_ciudad`, `_provincia`, `_cp` | Desde dónde sale el paquete. Todos obligatorios menos el piso |
| `envio_peso_kg` | Peso mínimo del paquete en kg (`0.5`). Si el calculado es mayor, va el calculado |
| `envio_gratis_desde` | Desde qué subtotal el envío es gratis en todo el país (`150000`) |
| `envio_gratis_amba_desde` | Desde qué subtotal es gratis en AMBA (`60000`). Vacío o 0: sin regla propia para AMBA |
| `costo_envio` | La tarifa plana de respaldo |

Y en Vercel, `ENVIA_TOKEN` (ver `.env.example`). El token vive solo en el servidor:
no llega nunca al navegador, ni a los logs, ni a `/api/health` (que solo dice si está).

**Solo entregas a domicilio.** Se descartan los servicios a sucursal y Mercado Libre
Flex. Si un transportista no llega a ese código postal, simplemente no aparece.

**El precio lo fija el servidor, con un comprobante cifrado.** La opción cotizada viaja
con un comprobante (AES-256-GCM, válido 30 minutos) atado al destino, al carrito, a ese
precio y a la zona; el navegador no lo puede leer (adentro está el transportista) ni
cambiar. Al pagar, el navegador manda solo el comprobante, nunca cuánto sale. Si el comprobante no corresponde —vencido, tocado, de otra dirección u otro
carrito—, el servidor vuelve a cotizar y, si el total cambió, frena la compra con un 409
para que el comprador vea el total nuevo.

**Mercado Pago cobra exactamente lo que dice el resumen.** El envío va como un renglón
más («Envío a domicilio», sin transportista) y antes de crear la preferencia se comprueba que la
suma de los renglones dé el total del pedido. El webhook vuelve a comparar lo pagado con
el total guardado.

**Envío gratis, según la zona.** En AMBA desde `envio_gratis_amba_desde` y en todo el
país desde `envio_gratis_desde`, siempre sobre el subtotal antes de cupones (el cupón no
cambia quién tiene envío gratis). Se cotiza igual, se muestra el precio tachado y «Envío
gratis», y el envío se cobra $ 0. Lo que cuesta de verdad queda en el pedido: es lo que
paga Harper. Si no llega, el checkout le dice cuánto le falta («Agregá $ X más y tu
envío es gratis»); en el carrito y en el panel lateral, sin dirección todavía, se dice
«Gratis en AMBA» o cuánto falta para eso. Sin cotizar (Envia caído), la Ciudad cuenta
como AMBA; el resto de la provincia, no.

**Qué queda en cada pedido** (`Pedidos`): `Envio_transportista`,
`Envio_servicio_codigo` (por ejemplo `andreani:ground`), `Envio_costo_real` (lo que
cobra Envia, con centavos), `Envio_bonificado`, `Envio_plazo`, `Envio_cotizado_en`,
`Envio_cotizacion` (la consulta y la respuesta de Envia, sin la calle del comprador) y
la dirección separada en `Direccion_calle`, `Direccion_numero` y `Direccion_piso`. Con
eso, generar la etiqueta más adelante es una sola llamada más. Si a la tabla le faltara
algún campo, el pedido se crea igual sin ese campo y el envío queda escrito también en
`Notas`.

**Si Envia no puede cotizar, la tienda cobra el `costo_envio` plano de la tabla
`Config` y sigue vendiendo.** Eso pasa cuando falta el token, el origen o los
transportistas (o la provincia de origen no es una de las 24), cuando a un producto le
faltan el peso o las medidas, o cuando Envia no responde (8 segundos). Es a propósito: una caída de Envia puede costar unos pesos de
diferencia en un envío, nunca la venta entera. En el pedido queda «Tarifa plana (sin
cotizar)».

**Límites.** `/api/envio/cotizar` y `/api/checkout` atienden solo al propio sitio, hasta
30 y 20 pedidos por minuto por IP. Para toda la tienda, como mucho 200 consultas nuevas
a Envia por minuto: pasado eso, la tarifa plana, nunca un error. Cada cotización se
guarda 10 minutos por código postal, provincia y localidad: corregir la calle o el número
no vuelve a consultar a Envia (el precio no depende de eso).

Para probar contra el entorno de pruebas de Envia: `ENVIA_ENTORNO=prueba` (con un token
de ese entorno).

**El embalaje se suma aparte.** Lo que viaja nunca es el producto desnudo: va dentro de
un sobre o una caja. Como los transportistas cobran por peso volumétrico —el espacio que
ocupa el bulto, no lo que pesa—, ignorarlo sería cobrarle al cliente menos de lo que
después paga Harper. Se configura en `Config` con `embalaje_margen_cm` (cm que se suman
a cada lado) y `embalaje_peso_g`. Los valores por defecto, `1` y `30`, corresponden a
un sobre de burbuja; con caja van en `2` y `80`. El margen se suma **una sola vez** al
bulto final, no por producto: el sobre es uno solo lleve una unidad o cinco.

El peso y las medidas se cargan en `Productos` y son **de una unidad**, sin embalaje.
`Alto_cm` es el lado que se apila: para un pedido de varias unidades la web suma los
altos y deja largo y ancho en el mayor de los productos.

Las rutas de MiCorreo que ya existían (`/api/envio/sucursales` y
`/api/pedidos/importar-envio`) no se tocaron.
