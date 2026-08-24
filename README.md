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

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /api/health` | Muestra qué integraciones están conectadas |
| `POST /api/carrito/resolver` | Devuelve el carrito con precios y stock reales |
| `POST /api/lead` | Guarda el mail apenas se escribe en el checkout |
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

- [x] Compra completa end-to-end verificada contra el código (firma, preferencia
      y casos borde del checkout)
- [x] `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `NEXT_PUBLIC_SITE_URL` cargadas en
      Vercel — `/api/health` da `mercadopago: true`
- [x] **Compra real verificada** (24/08/2026, pedido HARPER-8812049): preferencia
      creada con credenciales de producción, firma del webhook validada, pago
      re-consultado contra la API de MP, monto verificado, `Estado = pagado`,
      stock descontado y cliente registrado
- [ ] `RESEND_API_KEY` cargada y dominio verificado, o no sale ningún mail
- [ ] Segunda compra de prueba para verificar que los mails llegan
- [ ] Mail de confirmación recibido y sin caer en spam
- [ ] Subir una foto en Airtable y verificar que aparece en el sitio
- [ ] Completar `domicilio` y `razon_social` en `Config` (obligatorio por ley)
- [ ] Confirmar `costo_envio` y `envio_gratis_desde` en `Config`
- [ ] Cargar el stock real de los paños (hoy son valores provisorios)
