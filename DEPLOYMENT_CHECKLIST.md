# Checklist de Variables de Entorno para Despliegue en Producción (Cloud Run)

Este documento detalla todas las variables de entorno requeridas para el despliegue de **FlowMoney** en **Google Cloud Run**, su valor esperado para producción y su fuente de configuración.

> **Actualizado con correcciones F1-F20**: ver sección 4 "Cambios de Seguridad Aplicados".

---

## 1. Verificación de Variables de Entorno

| Variable | Valor Esperado en Producción | Dónde se Configura | Descripción / Requisito Crítico |
| :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | `"production"` | Variables de entorno de Cloud Run (`--set-env-vars NODE_ENV=production`) | Fija el entorno de Node.js a producción. Habilita optimizaciones del servidor Express, desactiva el middleware Vite de desarrollo y sirve los estáticos compilados desde `dist/`. |
| **`PORT`** | `8080` (Cloud Run) o `3000` (dev) | Cloud Run la inyecta automáticamente | **Corregido (F5)**: Antes estaba hardcodeado a 3000, incompatible con Cloud Run que inyecta `$PORT=8080`. Ahora usa `process.env.PORT \|\| '3000'`. |
| **`ALLOW_DEMO_AUTH`** | Sin definir (omitida) o `"false"` | Variables de entorno de Cloud Run | **Seguridad crítica (F19)**: En el backend, el modo demo ahora se deniega por defecto en cualquier entorno. Debe ser explícitamente `'true'` para activarse. En producción **debe quedar sin definir o en `'false'`**. |
| **`VITE_ALLOW_DEMO_AUTH`** | Sin definir (omitida) o `"false"` | Build-time de Vite (`npm run build`) | **Seguridad de interfaz**: Controla el renderizado del botón *"Explorar en Modo Demo"* en `LoginScreen.tsx`. |
| **`INSTANCE_CONNECTION_NAME`** | Cadena de conexión real de Cloud SQL (ej: `project-id:region:instance-name`) | Variables de entorno de Cloud Run | Identificador de la instancia Cloud SQL de PostgreSQL en GCP para el Cloud SQL Connector. |
| **`DB_USER`** | Usuario de base de datos de producción | Variables de entorno de Cloud Run / Secret Manager | Usuario con permisos en la base de datos de producción. |
| **`DB_PASS`** | Contraseña segura de la base de datos | Cloud Run Secret Manager / Variables protegidas | Contraseña de producción de PostgreSQL. |
| **`DB_NAME`** | Nombre de la BD de producción (ej: `flowmoney`) | Variables de entorno de Cloud Run | Base de datos PostgreSQL que contiene el esquema ejecutado de `database/schema.sql`. |
| **`DATABASE_URL`** | *(Opcional)* URL de conexión completa `postgresql://...` | Variables de entorno de Cloud Run / Secret Manager | Alternativa a las variables individuales. |
| **`FIREBASE_PROJECT_ID`** | ID del proyecto de Firebase de producción | Variables de entorno de Cloud Run | Identificador del proyecto de Firebase para inicializar Firebase Admin SDK y validar tokens JWT contra Google Auth. |
| **`GEMINI_API_KEY`** | Clave de API de Gemini válida | Panel de Secrets de AI Studio / Secret Manager | Se inyecta de forma segura a nivel de servidor (`server/gemini.ts`). **No está hardcodeada** en el código fuente. |
| **`GEMINI_MODEL`** | `"gemini-2.5-flash"` (default) | Variables de entorno de Cloud Run | **Corregido (F2)**: Antes usaba `gemini-3.8-flash` que no existe públicamente. Alternativas: `gemini-2.0-flash`, `gemini-2.5-pro`. |
| **`APP_URL`** | URL canónica del servicio Cloud Run | Variables de entorno de Cloud Run | URL pública del servicio desplegado. |
| **`CORS_ALLOWED_ORIGINS`** | Lista separada por comas | Variables de entorno de Cloud Run | **Corregido (F5)**: Allowlist de orígenes permitidos. Ej: `https://app.flowmoney.com,https://staging.flowmoney.com`. Vacío = sólo same-origin. |
| **`SMTP_HOST`** | Host SMTP del proveedor | Secret Manager | **Corregido (F8)**: Host del servidor SMTP para envío de emails (SendGrid/Mailgun/SES). Vacío en desarrollo = mock console.log. |
| **`SMTP_PORT`** | `"587"` (STARTTLS) o `"465"` (SSL) | Secret Manager | Puerto SMTP. |
| **`SMTP_USER`** | Usuario SMTP | Secret Manager | Usuario de autenticación SMTP. |
| **`SMTP_PASS`** | Contraseña SMTP | Secret Manager | Contraseña o API key del proveedor. |
| **`SMTP_FROM`** | `"FlowMoney <noreply@flowmoney.app>"` | Variables de entorno de Cloud Run | Email remitente por defecto. |
| **`MASTER_ADMIN_EMAILS`** | Lista separada por comas | Variables de entorno de Cloud Run | Emails Master Admin adicionales (además del hardcoded por defecto). |

---

## 2. Comportamiento del Frontend (`LoginScreen.tsx`)

El botón de acceso en modo demo está condicionado de la siguiente forma:

```tsx
{(!import.meta.env.PROD || import.meta.env.VITE_ALLOW_DEMO_AUTH === 'true') && (
  <div id="demo-login-card">
    <button id="demo-login-btn" ...>
      Explorar en Modo Demo (Carlos Sandoval)
    </button>
  </div>
)}
```

- En el comando de build de producción (`npm run build`), `import.meta.env.PROD` es evaluado por Vite como `true`.
- El botón de demo solo aparecerá en producción si `VITE_ALLOW_DEMO_AUTH` fue seteado explícitamente en `'true'` durante el build, lo cual no debería ocurrir en producción.

---

## 3. Reglas de Firestore

El archivo `firestore.rules` define el acceso a la colección `/events`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;   // Deny por defecto
    }
    match /events/{eventId} {
      // Corregido (F7): sólo permite leer eventos donde el usuario es actor
      // o está en visible_to (miembro del grupo).
      allow read: if request.auth != null
        && (
          resource.data.actor_uid == request.auth.uid
          || request.auth.uid in resource.data.visible_to
          || !('group_id' in resource.data)
        );
      allow write: if false;   // Sólo Admin SDK puede escribir
    }
  }
}
```

---

## 4. Cambios de Seguridad Aplicados (F1-F20)

### F1 — SSRF Mitigation en /scan-receipt
- Nuevo archivo: `server/lib/url-safety.ts`
- Validación completa de URL: protocolo, allowlist de hosts, DNS lookup, bloqueo de IPs privadas/RFC1918/link-local
- `fetch(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(10000) })`
- Límite de tamaño de respuesta: 8MB

### F2 — Modelo Gemini corregido
- `gemini-3.8-flash` (no existe) → `gemini-2.5-flash` (configurable via `GEMINI_MODEL`)
- Añadidos parámetros deterministas: `temperature=0`, `topP=0.1`, `maxOutputTokens=1024`
- Cache LRU de 100 imágenes para evitar re-escaneo billable
- Retry exponencial con backoff ante 429/5xx (máx 2 reintentos)

### F3 — Token migrado a sessionStorage
- `localStorage.getItem('flowmoney_token')` → `sessionStorage.getItem('flowmoney_token')`
- Reducida la ventana de exposición a XSS persistente
- Pendiente: migración completa a cookies httpOnly+Secure+SameSite=Strict

### F4 — Licensing middleware con fail-closed
- Default: usuarios sin licencia = plan FREE (no Pro)
- Lista `PRO_ONLY_FEATURES`: scheduled_reports, email_delivery, excel_export, cloud_backup, custom_alerts
- En producción, errores de BD deniegan por defecto (fail-closed)

### F5 — Helmet + CORS + CSP + Rate Limiting global
- `helmet()` con CSP estricta, HSTS 1 año, frame-ancestors 'none'
- `cors()` con allowlist explícita vía `CORS_ALLOWED_ORIGINS`
- `express-rate-limit` global: 200 req/min por IP
- `express-rate-limit` para `/api/auth/*`: 10 req/min por IP
- Middleware global de manejo de errores
- PORT configurable (Cloud Run compatible)

### F6 — Race condition en simplify-debts + settlements
- Transacciones explícitas `BEGIN/COMMIT/ROLLBACK`
- `pg_advisory_xact_lock` exclusivo en settlements (writer)
- `pg_advisory_xact_lock_shared` en simplify-debts (reader)
- Double-check de membresía dentro de la transacción

### F7 — Firestore rules con filtro por group_id
- Eventos incluyen campo `visible_to: string[]` con UIDs de miembros del grupo
- `realtime-events.ts` hace query a `group_members` para poblar visible_to
- Rules sólo permiten lectura si el usuario es actor o está en visible_to

### F8 — Nodemailer SMTP real + Worker programado
- `notification-worker.ts` ahora usa Nodemailer con config SMTP
- Fallback a modo dev (console.log) si no hay SMTP configurado
- Nuevo `startScheduledReportsWorker()` corre cada 5 minutos
- Procesa reportes con `next_run_at <= now()` automáticamente

### F9 — Eliminado bypass 'test-token'
- Removida la rama `if (!isProduction && idToken === 'test-token')` en `firebase-admin.ts`
- Cualquier token no-demo debe pasar por `verifyIdToken` de Firebase Admin

### F10 — Rate limiting global
- `express-rate-limit` en `/api/*`: 200 req/min por IP
- Auth endpoint: 10 req/min por IP (anti brute force)
- Health check exempt

### F12 — POST /api/groups transaccional
- `BEGIN` → INSERT group → INSERT member → `COMMIT`
- `ROLLBACK` automático en caso de error

### F13 — user_audit_logs + middleware
- Nueva tabla `user_audit_logs` en schema.sql
- Nuevo middleware `audit.middleware.ts` con función `auditUserAction(action, resourceType)`
- Aplicado a endpoint POST /api/settlements

### F14 — Workflow CI/CD
- `.github/workflows/ci.yml`: lint + typecheck + tests + npm audit en cada PR
- Build verification (frontend + backend)
- Artifact upload

### F15 — Optimización N+1 en GET /api/groups
- Reemplazado `Promise.all` con N queries por una sola query con `LATERAL JOIN`
- Trae members_count, net_balance y last_expense en batch

### F16 — Índices en expenses.user_id
- `CREATE INDEX idx_expenses_user_id ON public.expenses(user_id)`
- `CREATE INDEX idx_expenses_user_date ON public.expenses(user_id, expense_date DESC)`

### F17 — Schema categories sincronizado
- Añadidas columnas `is_active`, `is_custom`, `sort_order` a `categories`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para DBs ya desplegadas

### F18 — Suite de tests Vitest
- `vitest.config.ts` configurado
- `server/tests/debts.test.ts`: tests del algoritmo greedy
- `server/tests/url-safety.test.ts`: tests del validador SSRF
- `server/tests/middleware.test.ts`: smoke tests
- Scripts en package.json: `test`, `test:watch`, `test:coverage`, `audit`

### F19 — ALLOW_DEMO_AUTH=false por defecto
- El modo demo ahora se deniega por defecto en cualquier entorno
- Debe ser explícitamente `'true'` para activarse

### F20 — Eliminada dependencia `sonner`
- Removida de `package.json` (no era usada en código)

---

## 5. Procedimiento de Despliegue

### Pre-deploy:
1. Verificar que todas las variables de entorno requeridas estén configuradas.
2. Ejecutar `npm run lint` (tsc --noEmit) — no debe fallar.
3. Ejecutar `npm test` — debe pasar.
4. Ejecutar `npm run audit` — sin vulnerabilidades high.
5. Build: `npm run build` — genera `dist/` con frontend y backend.

### Deploy:
```bash
gcloud run deploy flowmoney \
  --source . \
  --region us-central1 \
  --set-env-vars NODE_ENV=production,ALLOW_DEMO_AUTH=false \
  --set-secrets GEMINI_API_KEY=gemini-key:latest,DB_PASS=flowmoney-db-pass:latest \
  --set-env-vars CORS_ALLOWED_ORIGINS=https://app.flowmoney.com \
  --set-env-vars FIREBASE_PROJECT_ID=symbolic-melody-kw532 \
  --set-env-vars SMTP_HOST=smtp.sendgrid.net,SMTP_PORT=587 \
  --set-secrets SMTP_USER=smtp-user:latest,SMTP_PASS=smtp-pass:latest \
  --min-instances 0 --max-instances 10 \
  --memory 1Gi --cpu 1 \
  --timeout 60
```

### Post-deploy:
1. Verificar health: `curl https://app.flowmoney.com/api/health` → `{"status":"ok"}`
2. Verificar headers de seguridad: `curl -I https://app.flowmoney.com` debe incluir `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: DENY`
3. Smoke test: login + crear gasto + simplificar deudas en grupo

### Rollback:
```bash
gcloud run services update-traffic flowmoney --to-revisions=LATEST=0,PREVIOUS=100 --region us-central1
```
