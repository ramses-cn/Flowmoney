-- ============================================================
-- FlowMoney — Migración de correcciones F1-F20
-- ============================================================
-- Este script aplica los cambios de schema necesarios tras las
-- correcciones F4, F13, F16 y F17 sobre una base de datos que ya
-- tiene el schema.sql original aplicado.
--
-- Es IDEMPOTENTE: puede ejecutarse múltiples veces sin errores.
-- Ejecutar con: psql -f database/migration_fixes.sql
-- ============================================================

BEGIN;

-- ============================================================
-- F17 — Añadir columnas faltantes a categories
-- ============================================================
-- Estas columnas eran referenciadas en categories.routes.ts pero
-- no existían en el schema original.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 99;

-- ============================================================
-- F16 — Índices faltantes en expenses.user_id
-- ============================================================
-- La mayoría de queries del dashboard filtran WHERE user_id = $1
-- Sin este índice, el planner hace seq scan sobre la tabla completa.
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, expense_date DESC);

-- Marcar como válido también el índice por lens (común en filtros)
CREATE INDEX IF NOT EXISTS idx_expenses_user_lens ON public.expenses(user_id, lens);

-- ============================================================
-- F13 — Tabla user_audit_logs (auditoría de acciones de usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_uid TEXT NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user ON public.user_audit_logs(user_uid);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_action ON public.user_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_created_at ON public.user_audit_logs(created_at DESC);

-- ============================================================
-- F4 — Seed de planes free y pro en la tabla plans
-- ============================================================
-- Necesario porque el licensing middleware corregido deniega
-- features Pro si no hay registro de licencia activa.
INSERT INTO public.plans (id, name, description, price_monthly, features)
VALUES (
  'free',
  'Free',
  'Plan gratuito con funcionalidad básica',
  0.00,
  '{"scheduled_reports": false, "custom_alerts": false, "email_delivery": false, "excel_export": false, "unlimited_categories": false, "cloud_backup": false}'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.plans (id, name, description, price_monthly, features)
VALUES (
  'pro',
  'Pro',
  'Plan Pro con todas las funciones premium',
  9.99,
  '{"scheduled_reports": true, "custom_alerts": true, "email_delivery": true, "excel_export": true, "unlimited_categories": true, "cloud_backup": true}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- F4 — Asignar plan 'free' a usuarios existentes sin licencia
-- ============================================================
-- Los usuarios existentes que no tenían registro en user_licenses
-- heredaban Pro automáticamente (bug original). Ahora se les asigna
-- explícitamente el plan free.
INSERT INTO public.user_licenses (user_id, plan_id, status)
SELECT p.id, 'free', 'active'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_licenses ul WHERE ul.user_id = p.id
)
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación post-migración
-- ============================================================
DO $$
DECLARE
  cat_cols INTEGER;
  exp_idx INTEGER;
  ual_count INTEGER;
  plan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO cat_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'categories'
    AND column_name IN ('is_active', 'is_custom', 'sort_order');

  SELECT COUNT(*) INTO exp_idx
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'expenses'
    AND indexname IN ('idx_expenses_user_id', 'idx_expenses_user_date');

  SELECT COUNT(*) INTO ual_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_audit_logs';

  SELECT COUNT(*) INTO plan_count
  FROM public.plans WHERE id IN ('free', 'pro');

  RAISE NOTICE '─────────────────────────────────────────';
  RAISE NOTICE 'FlowMoney migration_fixes.sql — Verification';
  RAISE NOTICE '─────────────────────────────────────────';
  RAISE NOTICE 'F17 categories columns added: %/3', cat_cols;
  RAISE NOTICE 'F16 expenses indexes: %/2', exp_idx;
  RAISE NOTICE 'F13 user_audit_logs table: % (1 = OK)', ual_count;
  RAISE NOTICE 'F4 plans seeded: %/2', plan_count;
  RAISE NOTICE '─────────────────────────────────────────';
  RAISE NOTICE 'Si todos los valores son correctos, la migración fue exitosa.';
END;
$$;
