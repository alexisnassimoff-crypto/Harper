# Harper Web

Next.js (App Router) + Airtable, con deploys automáticos en Vercel.

## Stack

- Next.js 15 / React 19 / TypeScript
- Airtable vía REST API (`lib/airtable.ts`, sin dependencias externas)
- Hosting: Vercel

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar AIRTABLE_TOKEN
npm run dev
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `AIRTABLE_TOKEN` | Personal Access Token de Airtable (scopes `data.records:read`, `data.records:write`) |
| `AIRTABLE_BASE_ID` | ID de la base Harper: `appcFfhxM8uVdVKoP` |

Se cargan en Vercel desde **Project Settings → Environment Variables** (Production, Preview y Development).

## Deploy

Vercel está conectado al repo de GitHub: cada push a la rama de producción dispara un deploy,
y cada push a otra rama genera un Preview Deployment.

## Health check

`GET /api/health` devuelve el estado del servicio y si Airtable tiene sus variables cargadas.
