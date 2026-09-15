# ============================================================
# FlowMoney — Dockerfile para Google Cloud Run
# ============================================================
# Imagen base Node.js 20 (LTS). Cloud Run requiere que el contenedor
# escuche en $PORT (8080 por defecto en Cloud Run).
# ============================================================

FROM node:20-slim AS builder

WORKDIR /app

# Copiar lockfile y package.json primero para cache de layers
COPY package.json package-lock.json* bun.lock* ./

# Instalar dependencias
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copiar el resto del código
COPY . .

# Build del frontend (Vite) y backend (esbuild)
RUN npm run build

# ------------------------------------------------------------
# Imagen final — runtime mínimo
# ------------------------------------------------------------
FROM node:20-slim AS runner

WORKDIR /app

# Instalar curl para healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Copiar package.json y lockfile para instalar solo dependencias de producción
COPY package.json package-lock.json* ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# Copiar el build (frontend + backend bundle)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database ./database
COPY --from=builder /app/firestore.rules ./firestore.rules
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=builder /app/firebase-blueprint.json ./firebase-blueprint.json
COPY --from=builder /app/metadata.json ./metadata.json

# Variables de entorno por defecto (deben sobreescribirse en Cloud Run)
ENV NODE_ENV=production
ENV PORT=8080
ENV ALLOW_DEMO_AUTH=false

# Cloud Run expone $PORT=8080
EXPOSE 8080

# Usuario no-root por seguridad
USER node

# Comando de inicio
CMD ["node", "dist/server.cjs"]

# Healthcheck cada 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health || exit 1
