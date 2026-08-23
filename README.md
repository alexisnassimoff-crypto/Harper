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

1. Panel → Tus integraciones → crear una aplicación de tipo Checkout Pro
2. Copiar el **Access Token** en `MP_ACCESS_TOKEN` (arrancar con el de prueba)
3. Configurar el webhook apuntando a
   `https://harper.ar/api/mercadopago/webhook`, evento **Pagos**
4. Copiar la **clave secreta** del webhook en `MP_WEBHOOK_SECRET`

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

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar las credenciales
npm run dev
```

## Antes de salir a producción

- [ ] Compra completa end-to-end con las credenciales de **prueba** de Mercado Pago
- [ ] Webhook probado con el simulador del panel de MP
- [ ] Mail de confirmación recibido y sin caer en spam
- [ ] Subir una foto en Airtable y verificar que aparece en el sitio
- [ ] Completar `domicilio` y `razon_social` en `Config` (obligatorio por ley)
- [ ] Confirmar `costo_envio` y `envio_gratis_desde` en `Config`
- [ ] Compra real de prueba por un monto chico
