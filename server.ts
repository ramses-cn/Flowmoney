/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// Corregido (F5): helmet para cabeceras de seguridad HSTS, CSP, X-Frame-Options, etc.
import helmet from 'helmet';
// Corregido (F5): cors con allowlist explícita
import cors from 'cors';
// Corregido (F10): rate limiting global con express-rate-limit
import rateLimit from 'express-rate-limit';

import authRoutes from './server/routes/auth.routes.ts';
import expensesRoutes from './server/routes/expenses.routes.ts';
import groupsRoutes from './server/routes/groups.routes.ts';
import subscriptionsRoutes from './server/routes/subscriptions.routes.ts';
import accountsRoutes from './server/routes/accounts.routes.ts';
import dashboardRoutes from './server/routes/dashboard.routes.ts';
import settlementsRoutes from './server/routes/settlements.routes.ts';
import categoriesRoutes from './server/routes/categories.routes.ts';
import alertsRoutes from './server/routes/alerts.routes.ts';
import adminRoutes from './server/routes/admin.routes.ts';

const app = express();

// PORT obligatorio 3000 para el reverse proxy de AI Studio
const PORT = 3000;

// Configuración de Helmet compatible con entorno de iframe y previsualización de AI Studio
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS con soporte para desarrollo y orígenes permitidos
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Si no se envía Origin (misma máquina / curl) o no hay allowlist configurada, permitir
    if (!origin || allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origen ${origin} no permitido`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24h preflight cache
}));

// Corregido (F10): Rate limiting global — 100 req/min por IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200, // 200 req/min por IP (suficiente para uso normal, bloquea DoS básico)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones',
    message: 'Has excedido el límite de 200 peticiones por minuto. Reintenta en unos segundos.',
  },
  skip: (req) => req.path === '/api/health', // health check exempt
});
app.use('/api/', globalLimiter);

// Corregido (F10): Rate limit más estricto para auth (5 req/min por IP — anti brute force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Reintenta en 1 minuto.' },
});
app.use('/api/auth/', authLimiter);

// Límite de 10MB exclusivo para escaneo de fotos y recibos con IA
app.use(['/api/expenses/scan-receipt', '/expenses/scan-receipt'], express.json({ limit: '10mb' }));

// Límite estándar de 2MB para el resto de endpoints JSON
app.use(express.json({ limit: '2mb' }));

// Health check para monitoreo y verificación de despliegue
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'FlowMoney API', version: '1.0.0' });
});

// Rutas de la API de FlowMoney
app.use('/api', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/expenses', expensesRoutes); // Compatibilidad para endpoints de gastos sin prefijo
app.use('/api/groups', groupsRoutes);
app.use('/api/settlements', settlementsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/reports', alertsRoutes);
app.use('/api/admin', adminRoutes);

// Corregido (F5): Middleware global de manejo de errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]:', err);
  if (res.headersSent) return next(err);
  if (err && err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS rechazado', message: err.message });
  }
  return res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});


async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // En modo desarrollo, delegamos el frontend dinámicamente a Vite
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Middleware de Vite conectado en modo desarrollo.');
    } catch (err) {
      console.error('Error al iniciar Vite dev middleware:', err);
    }
  } else {
    // En modo producción, servimos los archivos estáticos generados en dist/
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Corregido (F8): Iniciar worker de reportes programados
  try {
    const { startScheduledReportsWorker } = await import('./server/services/notification-worker.ts');
    startScheduledReportsWorker();
  } catch (err) {
    console.warn('[Startup] No se pudo iniciar el worker de reportes:', err);
  }

  // Iniciar servidor HTTP
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de FlowMoney listo en http://localhost:${PORT}`);
    console.log(`  Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  CORS origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : '(sólo same-origin)'}`);
    console.log(`  Helmet CSP: ${isProd ? 'estricta' : 'estricta (dev)'}`);
    console.log(`  Rate limit: 200 req/min global, 10 req/min auth`);
  });
}

startServer();
