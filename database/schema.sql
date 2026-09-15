-- ==============================================================================
-- FLOWMONEY - FASE 1: ESQUEMA DE BASE DE DATOS POSTGRESQL (CLOUD SQL)
-- Autenticación: Firebase Authentication (profiles.id = Firebase Auth UID)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. TABLA: PROFILES
-- Nota clave: 'id' es el UID de texto de Firebase Auth (no UUID de Supabase)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    default_currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    theme VARCHAR(10) NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. TABLA: CATEGORIES
-- Categorías financieras personales (8 categorías iniciales creadas en upsert)
-- ------------------------------------------------------------------------------
-- Corregido (F17): Añadidas columnas is_active, is_custom, sort_order
-- que eran referenciadas en categories.routes.ts pero faltaban en el schema.
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'tag',
    color VARCHAR(7) NOT NULL DEFAULT '#4F46E5',
    type VARCHAR(10) NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
    monthly_budget NUMERIC(12,2) DEFAULT 0.00 CHECK (monthly_budget >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,        -- F17 — visibilidad
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,      -- F17 — creada por usuario vs default
    sort_order INTEGER NOT NULL DEFAULT 99,        -- F17 — orden en UI
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. TABLA: ACCOUNTS
-- Cuentas de origen de fondos (bancarias, efectivo, tarjetas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'cash', 'wallet', 'other')),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    color VARCHAR(7) NOT NULL DEFAULT '#4F46E5',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. TABLA: GROUPS
-- Grupos de gastos (pareja, viajes, piso compartido, proyectos)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'trip' CHECK (type IN ('couple', 'trip', 'home', 'project', 'other')),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    cover_url TEXT,
    auto_archive_days INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 5. TABLA: GROUP_MEMBERS
-- Miembros asociados a un grupo y sus roles
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_group_member UNIQUE (group_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 5.1 TABLA: GROUP_INVITATIONS
-- Invitaciones pendientes a grupos por email
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    invited_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(15) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMPTZ,
    CONSTRAINT unique_group_email_pending UNIQUE (group_id, email, status)
);

-- ------------------------------------------------------------------------------
-- 6. TABLA: EXPENSES
-- Registro central de movimientos (personal, pareja o grupal)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    paid_by TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    description TEXT NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    lens VARCHAR(15) NOT NULL DEFAULT 'personal' CHECK (lens IN ('personal', 'couple', 'group')),
    receipt_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 7. TABLA: EXPENSE_SHARES
-- Participaciones / splits por miembro en cada gasto
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    owed_amount NUMERIC(12,2) NOT NULL CHECK (owed_amount >= 0),
    percentage NUMERIC(5,2),
    is_settled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_expense_user_share UNIQUE (expense_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 8. TABLA: SETTLEMENTS
-- Pagos entre usuarios para saldar deudas en un grupo
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    payer_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    payee_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    payment_method VARCHAR(20) NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'cash', 'yape', 'mercadopago', 'bizum', 'pix', 'paypal', 'other')),
    notes TEXT,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_settlement_distinct_users CHECK (payer_id <> payee_id)
);

-- ------------------------------------------------------------------------------
-- 9. TABLA: SUBSCRIPTIONS
-- Gastos fijos recurrentes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    billing_cycle VARCHAR(15) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    next_billing_date DATE,
    status VARCHAR(15) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- ÍNDICES DE ALTO RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses(expense_date DESC);
-- Corregido (F16): Índice faltante en expenses.user_id
-- Casi todas las queries filtran WHERE e.user_id = $1 OR e.paid_by = $1
-- Sin este índice, el planner hace seq scan sobre expenses para dashboards.
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);
-- F16 — Índice compuesto para el query más común del dashboard
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_shares_user_id ON public.expense_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);

-- ==============================================================================
-- FUNCIÓN SQL: calculate_group_balances(group_uuid)
-- Agregación SQL directa del balance neto por usuario en un grupo.
-- Nota: La simplificación voraz de deudas se ejecutará en la Fase 3 en el backend.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.calculate_group_balances(group_uuid UUID)
RETURNS TABLE (
    user_id TEXT,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    total_paid NUMERIC(12,2),
    total_owed NUMERIC(12,2),
    settlements_paid NUMERIC(12,2),
    settlements_received NUMERIC(12,2),
    net_balance NUMERIC(12,2)
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
    RETURN QUERY
    WITH members AS (
        SELECT gm.user_id, p.full_name, p.email, p.avatar_url
        FROM public.group_members gm
        JOIN public.profiles p ON p.id = gm.user_id
        WHERE gm.group_id = group_uuid
    ),
    paid_expenses AS (
        SELECT e.paid_by AS user_id, COALESCE(SUM(e.amount), 0.00) AS amount_paid
        FROM public.expenses e
        WHERE e.group_id = group_uuid
        GROUP BY e.paid_by
    ),
    owed_shares AS (
        SELECT es.user_id, COALESCE(SUM(es.owed_amount), 0.00) AS amount_owed
        FROM public.expense_shares es
        JOIN public.expenses e ON e.id = es.expense_id
        WHERE e.group_id = group_uuid
        GROUP BY es.user_id
    ),
    settled_out AS (
        SELECT s.payer_id AS user_id, COALESCE(SUM(s.amount), 0.00) AS amount_settled_paid
        FROM public.settlements s
        WHERE s.group_id = group_uuid
        GROUP BY s.payer_id
    ),
    settled_in AS (
        SELECT s.payee_id AS user_id, COALESCE(SUM(s.amount), 0.00) AS amount_settled_received
        FROM public.settlements s
        WHERE s.group_id = group_uuid
        GROUP BY s.payee_id
    )
    SELECT 
        m.user_id,
        m.full_name,
        m.email,
        m.avatar_url,
        ROUND(COALESCE(pe.amount_paid, 0.00), 2) AS total_paid,
        ROUND(COALESCE(os.amount_owed, 0.00), 2) AS total_owed,
        ROUND(COALESCE(so.amount_settled_paid, 0.00), 2) AS settlements_paid,
        ROUND(COALESCE(si.amount_settled_received, 0.00), 2) AS settlements_received,
        ROUND(
            (COALESCE(pe.amount_paid, 0.00) + COALESCE(so.amount_settled_paid, 0.00))
            - (COALESCE(os.amount_owed, 0.00) + COALESCE(si.amount_settled_received, 0.00)),
            2
        ) AS net_balance
    FROM members m
    LEFT JOIN paid_expenses pe ON pe.user_id = m.user_id
    LEFT JOIN owed_shares os ON os.user_id = m.user_id
    LEFT JOIN settled_out so ON so.user_id = m.user_id
    LEFT JOIN settled_in si ON si.user_id = m.user_id
    ORDER BY net_balance DESC, m.full_name ASC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. TABLA: USER_DASHBOARD_PREFERENCES
-- Preferencias de widgets y período por defecto del dashboard por usuario
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_dashboard_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    default_period VARCHAR(30) NOT NULL DEFAULT 'month',
    widgets JSONB NOT NULL DEFAULT '[
        {"id": "balance", "enabled": true, "order": 1},
        {"id": "income", "enabled": true, "order": 2},
        {"id": "expenses", "enabled": true, "order": 3},
        {"id": "savings", "enabled": true, "order": 4},
        {"id": "budget", "enabled": true, "order": 5},
        {"id": "recent_expenses", "enabled": true, "order": 6},
        {"id": "categories", "enabled": true, "order": 7},
        {"id": "upcoming_payments", "enabled": true, "order": 8},
        {"id": "alerts", "enabled": true, "order": 9},
        {"id": "subscriptions", "enabled": true, "order": 10},
        {"id": "debts", "enabled": true, "order": 11}
    ]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_dashboard_pref_user_id ON public.user_dashboard_preferences(user_id);

-- ------------------------------------------------------------------------------
-- 12. TABLA: USER_CATEGORY_SELECTIONS
-- Mapeo de categorías visibles / activas seleccionadas por usuario
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_category_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 99,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_user_cat_sel_user_id ON public.user_category_selections(user_id);

-- ------------------------------------------------------------------------------
-- 13. TABLA: ALERT_RULES (Alertas de Presupuesto y Notificaciones)
-- Configuración de alertas por umbral porcentual configurable (50%, 75%, 80%, 90%, 100%, exceso)
-- Canales: dentro de la app (in_app) y correo electrónico (email)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE, -- NULL significa presupuesto global
    threshold_percent INTEGER NOT NULL CHECK (threshold_percent >= 1 AND threshold_percent <= 500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notify_in_app BOOLEAN NOT NULL DEFAULT TRUE,
    notify_email BOOLEAN NOT NULL DEFAULT FALSE,
    target_email TEXT,
    last_triggered_at TIMESTAMPTZ,
    last_triggered_amount NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_category_threshold UNIQUE (user_id, category_id, threshold_percent)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_user_id ON public.alert_rules(user_id);

-- ------------------------------------------------------------------------------
-- 14. TABLA: SCHEDULED_REPORTS (Reportes Programados Automáticos)
-- Reportes periódicos: diario, semanal, quincenal, mensual, personalizado
-- Configuración: día, hora, período, tipo, categorías, cuentas, formato, email
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Reporte Periódico',
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
    schedule_day_of_week INT DEFAULT 1 CHECK (schedule_day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 1=Lunes
    schedule_day_of_month INT DEFAULT 1 CHECK (schedule_day_of_month BETWEEN 1 AND 31),
    schedule_time VARCHAR(5) NOT NULL DEFAULT '08:00', -- Formato HH:mm
    period_type VARCHAR(20) NOT NULL DEFAULT 'month' CHECK (period_type IN ('today', 'week', 'month', 'year', 'last_7_days', 'last_30_days', 'last_90_days', 'custom')),
    report_type VARCHAR(30) NOT NULL DEFAULT 'financial_summary' CHECK (report_type IN ('financial_summary', 'expense_audit', 'category_breakdown', 'budget_status', 'complete_balance')),
    include_sections JSONB NOT NULL DEFAULT '["income", "expenses", "balance", "categories", "budgets", "variation", "subscriptions", "debts"]'::jsonb,
    format VARCHAR(10) NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'excel', 'csv')),
    export_destination VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (export_destination IN ('email', 'download_only', 'google_drive', 'google_sheets')),
    recipient_email TEXT NOT NULL,
    category_ids JSONB DEFAULT '[]'::jsonb, -- Lista de IDs o vacío para todas
    account_ids JSONB DEFAULT '[]'::jsonb,  -- Lista de IDs o vacío para todas
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sched_reports_user_id ON public.scheduled_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_sched_reports_next_run ON public.scheduled_reports(next_run_at);

-- ------------------------------------------------------------------------------
-- 15. TABLA: REPORT_EXECUTION_LOGS (Auditoría y Trazabilidad de Envíos)
-- Registro inmutable de cada ejecución de reporte programado
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.scheduled_reports(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    recipient_email TEXT NOT NULL,
    format VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending', 'skipped')),
    file_name TEXT,
    file_size_bytes INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_report_logs_user_id ON public.report_execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_report_logs_report_id ON public.report_execution_logs(report_id);

-- ------------------------------------------------------------------------------
-- 16. TABLAS: LICENSES Y FEATURE_FLAGS (Control de Licenciamiento Master Admin)
-- Validación estricta por backend de planes y capacidades avanzadas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id VARCHAR(30) PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    plan_id VARCHAR(30) NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'trial', 'cancelled', 'suspended')),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMPTZ,
    custom_features JSONB NOT NULL DEFAULT '{}'::jsonb, -- Sobrescritura de features por Master Admin
    assigned_by TEXT, -- Email del Master Admin que asignó la licencia
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_licenses_user_id ON public.user_licenses(user_id);

-- ------------------------------------------------------------------------------
-- 17. TABLA: ADMIN_AUDIT_LOGS (Auditoría de Seguridad y Acciones Administrativas)
-- Registro inmutable de eventos de seguridad y operaciones de Master Admin
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_uid TEXT NOT NULL,
    actor_email TEXT,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs(actor_uid);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 18. TABLA: USER_AUDIT_LOGS (F13 — Auditoría de acciones de usuario normal)
-- Registra acciones sensibles: gastos creados/editados/eliminados, groups, settlements, etc.
-- Diferente de admin_audit_logs (que es para acciones admin).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_uid TEXT NOT NULL,
    action VARCHAR(50) NOT NULL,         -- expense_created, group_left, settlement_recorded, etc.
    resource_type VARCHAR(50) NOT NULL,  -- expense, group, settlement, account, etc.
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user ON public.user_audit_logs(user_uid);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_action ON public.user_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_created_at ON public.user_audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 19. MIGRACIÓN F17: Añadir columnas faltantes a categories si ya existe
-- (Para bases de datos ya desplegadas con el schema anterior)
-- ------------------------------------------------------------------------------
-- Nota: ALTER TABLE ... ADD COLUMN IF NOT EXISTS requiere PostgreSQL 9.6+
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 99;

-- ------------------------------------------------------------------------------
-- 20. PLAN POR DEFECTO: 'free' (F4 — seeding para que nuevos usuarios no hereden Pro)
-- ------------------------------------------------------------------------------
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


