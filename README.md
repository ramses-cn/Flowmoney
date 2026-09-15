# FlowMoney — Centro financiero personal y grupal

Aplicación fullstack TypeScript para gestión de gastos personales, de pareja y en grupo, con escaneo inteligente de tickets usando Gemini AI, persistencia en Cloud SQL/PostgreSQL, y sincronización en tiempo real con Firestore.

<div align="center">
  <strong>Stack:</strong> React 19 · Vite 6 · Tailwind 4 · Zustand 5 · Express 4 · PostgreSQL 15 · Firebase Auth · Gemini AI
</div>

---

## ✨ Funcionalidades principales

- **Gestión de gastos** personales, de pareja y grupales (3 lentes).
- **Escaneo de tickets con Gemini AI** — OCR multimodal que extrae monto, comercio, fecha y categoría sugerida.
- **Grupos colaborativos** — invitaciones por email, 4 tipos de split (equal, exact, percentages, shares), simplificación greedy de deudas.
- **Dashboard inteligente** — widgets configurables, alertas de presupuesto, presupuestos por categoría.
- **Reportes programados** — generación automática de PDFs con envío por email (SMTP).
- **Multi-moneda** — soporte para PEN, MXN, ARS, USD, etc.
- **Tiempo real** — sincronización instantánea vía Firestore `/events`.

---

## 🚀 Inicio rápido (desarrollo local)

### Prerrequisitos

- Node.js 20+
- Una API key de Gemini AI Studio (https://aistudio.google.com/apikey)
- Un proyecto Firebase (puede ser el emulador o uno real)
- PostgreSQL local (opcional — si no, el backend usa un emulador en memoria)

### Pasos

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.local.example .env.local
# Edita .env.local con tus valores (especialmente GEMINI_API_KEY)

# 3. Aplicar schema de BD (si usas PostgreSQL real)
psql -f database/schema.sql
psql -f database/migration_fixes.sql  # migración de correcciones

# 4. Iniciar en modo desarrollo
npm run dev
# → http://localhost:3000
```

### Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Inicia el servidor Express + Vite middleware |
| `npm run build` | Build de producción (Vite + esbuild) |
| `npm start` | Ejecuta el bundle de producción |
| `npm run lint` | Type check con `tsc --noEmit` |
| `npm test` | Ejecuta la suite de tests con Vitest |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:coverage` | Tests con coverage report |
| `npm run audit` | `npm audit --audit-level=high` |

---

## 📦 Despliegue a Google AI Studio

Este proyecto fue generado originalmente en Google AI Studio. Para re-deployarlo:

### Opción A — Vía AI Studio UI

1. Visita https://aistudio.google.com/apps
2. Crea o abre tu app
3. Sube el código fuente (zip o conecta repo de GitHub)
4. En **Settings → Secrets**, configura:
   - `GEMINI_API_KEY` (obligatorio)
   - Las demás variables de `.env.example`
5. AI Studio inyectará automáticamente `firebase-applet-config.json` con los valores de tu proyecto Firebase vinculado
6. Click **Deploy** → Cloud Run

### Opción B — Vía CLI (gcloud)

Ver la siguiente sección "Despliegue a Cloud Run".

---

## ☁️ Despliegue a Google Cloud Run

### 1. Pre-requisitos en GCP

```bash
# Habilitar APIs necesarias
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com
```

### 2. Crear instancia Cloud SQL

```bash
gcloud sql instances create flowmoney-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create flowmoney --instance=flowmoney-db
gcloud sql users create flowmoney-app --instance=flowmoney-db --password="STRONG_PASSWORD_HERE"

# Aplicar schema
gcloud sql connect flowmoney-db --user=postgres
\i database/schema.sql
\i database/migration_fixes.sql
```

### 3. Crear secrets en Secret Manager

```bash
echo -n "YOUR_GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=-
echo -n "STRONG_DB_PASSWORD" | gcloud secrets create flowmoney-db-pass --data-file=-
echo -n "smtp_user" | gcloud secrets create smtp-user --data-file=-
echo -n "smtp_password" | gcloud secrets create smtp-pass --data-file=-

# Otorgar acceso a la service account de Cloud Run
for secret in gemini-api-key flowmoney-db-pass smtp-user smtp-pass; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4. Deploy con Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE_NAME=flowmoney
```

### 5. Deploy directo (sin Cloud Build)

```bash
gcloud run deploy flowmoney \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 \
  --min-instances 0 --max-instances 10 \
  --timeout 60 \
  --set-env-vars NODE_ENV=production,ALLOW_DEMO_AUTH=false \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-env-vars FIREBASE_PROJECT_ID=symbolic-melody-kw532 \
  --set-env-vars CORS_ALLOWED_ORIGINS=https://your-domain.com \
  --set-env-vars SMTP_HOST=smtp.sendgrid.net,SMTP_PORT=587,SMTP_FROM=FlowMoney\<noreply@flowmoney.app\> \
  --update-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --update-secrets DB_PASS=flowmoney-db-pass:latest \
  --update-secrets SMTP_USER=smtp-user:latest \
  --update-secrets SMTP_PASS=smtp-pass:latest \
  --add-cloudsql-instances=PROJECT_ID:us-central1:flowmoney-db
```

### 6. Smoke test post-deploy

```bash
SERVICE_URL=$(gcloud run services describe flowmoney --region=us-central1 --format='value(status.url)')

# Health check
curl $SERVICE_URL/api/health
# → {"status":"ok","service":"FlowMoney API","version":"1.0.0"}

# Verificar headers de seguridad
curl -I $SERVICE_URL | grep -E "Strict-Transport-Security|Content-Security-Policy|X-Frame"

# Verificar rate limit (debe dar 429 tras 11 intentos)
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $SERVICE_URL/api/auth/login -H "Content-Type: application/json" -d '{}'
done
```

---

## 🔑 Configuración Firebase

### 1. Habilitar proveedores de Auth

En Firebase Console → Authentication → Sign-in method:
- **Google** → Enable
- **Email link (passwordless)** → Enable

### 2. Configurar Firestore

```bash
# Crear Firestore database (si no existe)
gcloud firestore databases create --location=nam5

# Aplicar reglas de seguridad
firebase deploy --only firestore:rules
```

### 3. Poblar `firebase-applet-config.json`

AI Studio lo hace automáticamente, pero si despliegas manualmente, obtén los valores de:
**Firebase Console → Project Settings → Your apps → Web app**

```json
{
  "projectId": "your-project-id",
  "appId": "1:xxxx:web:xxxx",
  "apiKey": "AIzaSy...",
  "authDomain": "your-project-id.firebaseapp.com",
  "storageBucket": "your-project-id.appspot.com",
  "messagingSenderId": "xxxx",
  "firestoreDatabaseId": "(default)"
}
```

### 4. Asignar Master Admin (opcional)

Para autorizar acceso admin sin custom claims:

```bash
export MASTER_ADMIN_EMAILS="admin1@flowmoney.com,admin2@flowmoney.com"
# Reiniciar el servicio
```

O vía custom claims de Firebase:

```bash
firebase admin:auth:set-claims UID_HERE '{"role":"MASTER_ADMIN","master_admin":true}'
```

---

## 📁 Estructura del proyecto

```
.
├── server.ts                    # Entry point Express
├── server/
│   ├── routes/                  # 10 routers REST (auth, expenses, groups, ...)
│   ├── middleware/              # auth, licensing, admin, audit (F13)
│   ├── lib/
│   │   ├── firebase-admin.ts    # Firebase Admin SDK
│   │   ├── realtime-events.ts   # Firestore /events bus
│   │   └── url-safety.ts        # SSRF mitigation (F1)
│   ├── services/
│   │   ├── gemini.ts            # OCR multimodal con Gemini
│   │   ├── notification-worker.ts  # Nodemailer + worker cron (F8)
│   │   └── report-generator.ts  # PDFKit
│   ├── db/cloudsql.ts           # Pool PostgreSQL + Cloud SQL Connector
│   ├── debts.ts                 # Algoritmo greedy simplifyDebts
│   └── tests/                   # Vitest tests (F18)
├── src/                         # Frontend React 19
│   ├── components/              # auth, dashboard, groups, profile
│   ├── hooks/                   # useReceiptScan (F11), useRealtimeSync
│   ├── store/useAuthStore.ts    # Zustand store
│   ├── types/flowmoney.ts       # Tipos compartidos
│   └── lib/firebase.ts          # Firebase client SDK
├── database/
│   ├── schema.sql               # Schema completo (17+ tablas)
│   └── migration_fixes.sql      # Migración de correcciones F4/F13/F16/F17
├── firestore.rules              # Reglas con filtro visible_to (F7)
├── Dockerfile                   # Para Cloud Run (F5/F14)
├── cloudbuild.yaml              # Pipeline CI/CD
├── .github/workflows/ci.yml     # CI en GitHub Actions (F14)
├── metadata.json                # Config AI Studio
├── firebase-applet-config.json  # Config Firebase (AI Studio lo inyecta)
└── package.json
```

---

## 🧪 Testing y CI/CD

```bash
# Tests unitarios
npm test

# Coverage
npm run test:coverage

# Audit de seguridad
npm run audit
```

El workflow de GitHub Actions (`.github/workflows/ci.yml`) ejecuta automáticamente en cada PR:
- TypeScript type check
- Tests con Vitest
- npm audit (high severity)
- Build verification (Vite + esbuild)

---

## 📚 Documentación adicional

- `DEPLOYMENT_CHECKLIST.md` — Checklist completo de variables de entorno y procedimientos
- `database/schema.sql` — Schema completo de la base de datos
- `database/migration_fixes.sql` — Migración idempotente con correcciones
- `firestore.rules` — Reglas de seguridad Firestore

---

## 🔒 Seguridad

Este proyecto implementa las siguientes medidas de seguridad:

- **SSRF mitigation** en el endpoint de escaneo de tickets (allowlist de hosts + bloqueo IPs privadas)
- **Helmet + CSP estricta** para prevenir XSS, clickjacking y MIME-sniffing
- **CORS allowlist** explícita
- **Rate limiting** global (200 req/min) y específico para auth (10 req/min)
- **Licensing fail-closed** — usuarios sin licencia no acceden a features Pro
- **Transacciones atómicas** con advisory locks para prevenir race conditions
- **Auditoría** de acciones admin y de usuarios sensibles
- **Firestore rules** con filtrado por membresía de grupo (visible_to)

---

## 📄 Licencia

Apache-2.0
