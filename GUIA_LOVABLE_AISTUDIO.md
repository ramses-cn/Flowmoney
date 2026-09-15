# 📱 FlowMoney — Guía de carga a Lovable y Google AI Studio

Este documento te guía para cargar el proyecto FlowMoney en cualquiera de las dos plataformas: **Lovable** o **Google AI Studio**.

---

## 🚀 Opción A — Cargar en Lovable

### Requisitos previos
1. Cuenta en [lovable.dev](https://lovable.dev)
2. API key de Gemini AI Studio ([obtener aquí](https://aistudio.google.com/apikey))
3. Proyecto Firebase con Auth + Firestore habilitados

### Pasos

1. **Crear nuevo proyecto en Lovable**
   - Ve a https://lovable.dev → "New Project"
   - Selecciona "Import from GitHub" o "Upload ZIP"
   - Sube el archivo `flowmoney-corregido.zip`

2. **Configurar variables de entorno**
   En Lovable → Project Settings → Environment Variables, añade:

   | Variable | Valor | Obligatoria |
   |----------|-------|-------------|
   | `GEMINI_API_KEY` | Tu key de AI Studio | ✅ |
   | `GEMINI_MODEL` | `gemini-2.5-flash` | ✅ |
   | `FIREBASE_PROJECT_ID` | `symbolic-melody-kw532` | ✅ |
   | `ALLOW_DEMO_AUTH` | `false` | ✅ |
   | `NODE_ENV` | `production` | ✅ |
   | `PORT` | `8080` | ✅ |
   | `CORS_ALLOWED_ORIGINS` | URL pública de Lovable | ✅ |
   | `SMTP_HOST` | `smtp.sendgrid.net` | Opcional |
   | `SMTP_PORT` | `587` | Opcional |
   | `SMTP_USER` | `apikey` | Opcional |
   | `SMTP_PASS` | Tu SendGrid API key | Opcional |
   | `SMTP_FROM` | `FlowMoney <noreply@tudominio.com>` | Opcional |

3. **Configurar el archivo `.lovable/config.json`** (incluido en el ZIP)
   Lovable detecta automáticamente este archivo y aplica la configuración.

4. **Build y Deploy**
   - Lovable ejecuta automáticamente `npm install && npm run build`
   - El preview se genera en una URL tipo `https://tu-proyecto.lovable.app`

5. **Verificar**
   - Visita la URL pública generada por Lovable
   - Verifica `/api/health` → `{"status":"ok"}`
   - Prueba login con Google
   - Escanea un ticket real

### Notas específicas de Lovable
- Lovable detecta automáticamente Vite + React + Tailwind
- El archivo `.lovable/config.json` define los features e integraciones
- Las environment variables se inyectan en runtime (no en build time)
- Para Cloud SQL, configura `INSTANCE_CONNECTION_NAME` y credenciales DB

---

## ☁️ Opción B — Cargar en Google AI Studio

### Requisitos previos
1. Cuenta Google con acceso a [AI Studio](https://aistudio.google.com)
2. Proyecto Firebase (el default del repo es `symbolic-melody-kw532`)
3. Opcional: instancia Cloud SQL PostgreSQL

### Pasos

#### Paso 1 — Subir el código

**Método A: Upload ZIP**
1. Ve a https://aistudio.google.com/apps
2. Click en "Create new app" → "Import from ZIP"
3. Sube `flowmoney-corregido.zip`
4. AI Studio detecta automáticamente:
   - `metadata.json` → define capabilities y permisos
   - `firebase-applet-config.json` → config Firebase (lo rellena AI Studio)
   - `package.json` → scripts npm

**Método B: Conectar GitHub**
1. Sube el repo a GitHub
2. En AI Studio → "Create new app" → "Connect GitHub repo"
3. Selecciona el repo y la rama `main`

#### Paso 2 — Configurar secrets

En AI Studio → tu app → "Secrets" panel:

| Secret | Valor |
|--------|-------|
| `GEMINI_API_KEY` | Tu Gemini API key |
| `DB_PASS` | Password de Cloud SQL (si usas) |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASS` | Password SMTP |

#### Paso 3 — Configurar Firebase

AI Studio inyecta automáticamente `firebase-applet-config.json` con los valores de tu proyecto Firebase vinculado:
- `projectId`, `apiKey`, `authDomain`, `storageBucket`, `appId`, `messagingSenderId`

Si no está vinculado:
1. Ve a AI Studio → tu app → "Firebase" → "Link project"
2. Selecciona o crea un proyecto Firebase
3. AI Studio generará el archivo automáticamente

#### Paso 4 — Deploy a Cloud Run

Click en "Deploy" → AI Studio ejecuta:
1. `npm install`
2. `npm run build` (Vite + esbuild)
3. Build de imagen Docker con el `Dockerfile` incluido
4. Deploy a Cloud Run con las variables y secrets configurados

URL final: `https://flowmoney-xxxx-uc.a.run.app`

#### Paso 5 — Post-deploy verification

```bash
SERVICE_URL=https://flowmoney-xxxx-uc.a.run.app

# Health check
curl $SERVICE_URL/api/health

# Headers de seguridad
curl -I $SERVICE_URL | grep -E "Strict-Transport-Security|Content-Security-Policy|X-Frame"

# Rate limit (debe dar 429 tras 200 requests)
for i in {1..201}; do curl -s -o /dev/null -w "%{http_code} " $SERVICE_URL/api/health; done
```

---

## 🔄 Diferencias entre Lovable y AI Studio

| Aspecto | Lovable | Google AI Studio |
|---------|---------|------------------|
| **Hosting** | Lovable infra | Google Cloud Run |
| **Build** | Automático (Vite) | Automático (Vite + Dockerfile) |
| **Env vars** | UI dashboard | Secrets panel |
| **Firebase** | Manual config | Auto-injected |
| **Cloud SQL** | Self-managed | Integrado con GCP |
| **Custom domain** | Lovable subdomain | Cloud Run URL or custom |
| **CI/CD** | Built-in | Cloud Build (cloudbuild.yaml incluido) |
| **Free tier** | Generoso | $300 credit + Always Free |

---

## 🎨 Design System Apple

El proyecto usa el design system Apple iOS 17 con:

- **Tipografía**: SF Pro Display/Text con tracking -0.022em
- **Paleta**: 11 colores system iOS (blue, indigo, purple, pink, red, orange, yellow, green, mint, teal, cyan)
- **Glassmorphism**: `backdrop-filter: blur(24px) saturate(180%)`
- **Componentes**: AppleCard, AppleListRow, AppleToggle, AppleButton, AppleLargeTitle, AppleBadge, AppleStatCard, AppleEmptyState (en `src/components/ui/ApplePrimitives.tsx`)
- **Animaciones**: cubic-bezier Apple (0.32, 0.72, 0, 1)
- **Sombras**: 6 niveles multicapa
- **Border radius**: 12-32pt generosos

Para ver el showcase completo del design system, importa temporalmente:
```tsx
import { AppleDesignShowcase } from './components/AppleDesignShowcase.tsx';
// <AppleDesignShowcase />
```

---

## 📋 Checklist final antes de cargar

- [ ] Tienes el archivo `flowmoney-corregido.zip` (descargado de `/home/z/my-project/download/`)
- [ ] Tienes tu Gemini API key
- [ ] Tienes un proyecto Firebase con Auth (Google + Email Link) y Firestore habilitados
- [ ] Si usas Cloud SQL: instancia creada y schema aplicado (`database/schema.sql` + `database/migration_fixes.sql`)
- [ ] Si usas SMTP: credenciales de SendGrid/Mailgun/SES
- [ ] Dominio CORS configurado (URL pública de Lovable o Cloud Run)

---

## 🆘 Troubleshooting

| Problema | Solución |
|----------|----------|
| Build falla en Lovable | Verifica que el ZIP no tenga `node_modules` incluido. Ejecuta `npm install` localmente antes para validar. |
| `Cannot find module helmet` | Ejecuta `npm install` (las nuevas deps: helmet, cors, express-rate-limit, nodemailer, vitest) |
| Login Google no funciona | Verifica que el `authDomain` en `firebase-applet-config.json` coincida con tu proyecto Firebase. En AI Studio se inyecta automáticamente. |
| Gemini 404 | Asegúrate que `GEMINI_MODEL=gemini-2.5-flash` (no `gemini-3.8-flash`) |
| CORS error | Agrega tu URL pública a `CORS_ALLOWED_ORIGINS` |
| Emails no se envían | Configura todas las variables `SMTP_*`. Sin SMTP, los emails se loguean en consola pero no se envían. |
| Cloud SQL connection refused | Verifica `INSTANCE_CONNECTION_NAME` formato `project:region:instance` y que la service account tenga rol `cloudsql.client` |

---

## 📚 Archivos clave del proyecto

```
.
├── .lovable/config.json          # Config Lovable
├── .github/workflows/ci.yml      # CI GitHub Actions
├── metadata.json                  # Config AI Studio
├── firebase-applet-config.json   # Config Firebase (AI Studio lo inyecta)
├── Dockerfile                     # Para Cloud Run
├── cloudbuild.yaml                # Pipeline Cloud Build
├── database/
│   ├── schema.sql                 # Schema PostgreSQL completo
│   └── migration_fixes.sql        # Migración de correcciones F1-F20
├── firestore.rules                # Reglas Firestore con filtro visible_to
├── server.ts                      # Entry point Express
├── server/
│   ├── routes/                    # 10 routers REST
│   ├── middleware/                # auth, licensing, admin, audit
│   ├── lib/                       # firebase-admin, realtime-events, url-safety
│   ├── services/                  # gemini, report-generator, notification-worker
│   └── tests/                     # Vitest suite
├── src/
│   ├── components/
│   │   ├── ui/ApplePrimitives.tsx  # Design system componentes
│   │   ├── AppleDesignShowcase.tsx  # Showcase visual
│   │   ├── auth/LoginScreen.tsx     # Rediseñado Apple
│   │   ├── layout/BottomNav.tsx    # Rediseñado iOS tab bar
│   │   └── dashboard/
│   │       ├── HeaderHome.tsx       # Rediseñado segmented control
│   │       ├── HomeView.tsx
│   │       ├── ExpensesView.tsx     # Rediseñado Apple
│   │       ├── GroupsView.tsx       # Rediseñado Apple
│   │       └── ProfileView.tsx      # Rediseñado Apple
│   ├── store/useAuthStore.ts       # Zustand con token en sessionStorage
│   ├── hooks/useReceiptScan.ts     # Hook refactor F11
│   ├── utils/theme.ts              # Tokens Apple
│   └── index.css                   # Design system completo
└── package.json
```

---

## ✅ Listo para producción

El proyecto incluye:
- ✅ 20 correcciones críticas aplicadas (F1-F20)
- ✅ Design system Apple iOS 17 completo
- ✅ CI/CD con GitHub Actions
- ✅ Dockerfile optimizado para Cloud Run
- ✅ Tests con Vitest
- ✅ Documentación completa
- ✅ Soporte dual Lovable + AI Studio

¡Carga el ZIP y despliega! 🚀
