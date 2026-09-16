/**
 * FlowMoney - Tipos de Datos TypeScript
 * Correspondientes con el esquema de base de datos PostgreSQL (Cloud SQL)
 * y la autenticación de Firebase (UID como id de Profile).
 */

export interface Profile {
  id: string; // Firebase Auth UID
  email: string;
  full_name: string;
  avatar_url?: string | null;
  default_currency: string;
  theme: 'light' | 'dark' | 'system';
  is_suspended?: boolean;
  suspended_reason?: string | null;
  access_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income';
  monthly_budget: number;
  is_active?: boolean;
  is_custom?: boolean;
  sort_order?: number;
  created_at: string;
}

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'cash' | 'wallet' | 'other';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  current_balance: number;
  color: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type GroupType = 'couple' | 'trip' | 'home' | 'project' | 'other';

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  type: GroupType;
  currency: string;
  cover_url?: string | null;
  icon?: string;
  auto_archive_days?: number;
  is_archived?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  user_role?: 'admin' | 'member';
  members_count?: number;
  member_count?: number;
  net_balance?: number;
  last_expense?: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    expense_date: string;
  } | null;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  email: string;
  role: 'admin' | 'member';
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  accepted_at?: string | null;
}

export interface GroupMemberItem {
  membership_id?: string;
  invitation_id?: string;
  group_id: string;
  user_id?: string;
  email: string;
  full_name?: string;
  avatar_url?: string | null;
  role: 'admin' | 'member';
  joined_at?: string;
  is_pending?: boolean;
}

export interface SimplifiedDebt {
  debtor_id: string;
  debtor_name: string;
  debtor_avatar?: string | null;
  creditor_id: string;
  creditor_name: string;
  creditor_avatar?: string | null;
  amount: number;
  currency: string;
  from_name?: string;
  to_name?: string;
}

export type ExpenseLens = 'personal' | 'couple' | 'group';
export type LensType = ExpenseLens;

export interface Expense {
  id: string;
  user_id: string;
  paid_by: string;
  group_id?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  amount: number;
  currency: string;
  description: string;
  expense_date: string;
  lens: ExpenseLens;
  receipt_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  account_name?: string;
  paid_by_name?: string;
}

export interface ExpenseShare {
  id: string;
  expense_id: string;
  user_id: string;
  owed_amount: number;
  percentage?: number | null;
  is_settled: boolean;
  created_at: string;
}

export interface Settlement {
  id: string;
  group_id: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  notes?: string | null;
  settled_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  category_id?: string | null;
  account_id?: string | null;
  start_date: string;
  next_billing_date?: string | null;
  status: 'active' | 'paused' | 'cancelled';
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_color?: string;
  account_name?: string;
}

export interface GroupBalance {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
  total_paid: number;
  total_owed: number;
  settlements_paid: number;
  settlements_received: number;
  net_balance: number;
}

export interface SmartAlert {
  id: string;
  type: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  targetTab?: 'home' | 'expenses' | 'groups' | 'profile';
  targetLens?: 'personal' | 'couple' | 'group';
  targetGroupId?: string;
}

export interface DashboardCategoryWithSpent {
  id: string;
  name: string;
  icon: string;
  color: string;
  monthly_budget: number;
  spent: number;
  remaining: number;
  is_over: boolean;
  percentage: number;
}

export interface DashboardPersonalData {
  monthLabel: string;
  totalSpent: number;
  totalBudget: number;
  budgetProgress: number;
  daysRemaining: number;
  totalDays: number;
  currentDay: number;
  dailyAverage: number;
  categories: DashboardCategoryWithSpent[];
  recentExpenses: Expense[];
  subscriptions: Subscription[];
  totalSubscriptionsMonthly: number;
}

export interface DashboardCoupleData {
  hasCoupleGroup: boolean;
  coupleGroup: Group | null;
  couple_group?: Group | null;
  partnerInfo: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  netBalance: number;
  partnerOwesMe: number;
  iOwePartner: number;
  sharedExpenses: Expense[];
  myPersonalExpenses: Expense[];
  myPersonalTotal: number;
}

export interface DashboardGroupsData {
  totalOwedToMe: number;
  totalIOwe: number;
  netSummary: number;
  dominantCurrency?: string;
  currencyTotals?: Record<string, { owedToMe: number; iOwe: number }>;
  groups: (Group & { net_balance: number })[];
}

export type DashboardPeriod =
  | 'today'
  | 'week'
  | 'month'
  | 'year'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom';

export type PeriodType = DashboardPeriod;

export type DashboardWidgetId =
  | 'balance'
  | 'income'
  | 'expenses'
  | 'savings'
  | 'budget'
  | 'recent_expenses'
  | 'categories'
  | 'upcoming_payments'
  | 'alerts'
  | 'subscriptions'
  | 'debts';

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  enabled: boolean;
  order: number;
}

export interface UserDashboardPreferences {
  default_period: DashboardPeriod;
  widgets: DashboardWidgetConfig[];
}

export interface DynamicFilters {
  dateRange?: { start?: string; end?: string };
  categoryId?: string;
  accountId?: string;
  type?: 'expense' | 'income' | 'all';
  personId?: string;
  groupId?: string;
  budgetStatus?: 'all' | 'within' | 'exceeded';
  minAmount?: number;
  maxAmount?: number;
}

// ==============================================================================
// SISTEMA PROFESIONAL DE ALERTAS, NOTIFICACIONES Y REPORTES PROGRAMADOS
// ==============================================================================

export type AlertThreshold = 50 | 75 | 80 | 90 | 100 | 110 | 120 | number;

export interface AlertRule {
  id: string;
  user_id: string;
  category_id: string | null; // null = presupuesto global
  category_name?: string;
  threshold_percent: number; // 50, 75, 80, 90, 100, 105, etc.
  is_active: boolean;
  notify_in_app: boolean;
  notify_email: boolean;
  target_email?: string | null;
  last_triggered_at?: string | null;
  last_triggered_amount?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type ScheduledReportFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type ScheduledReportFormat = 'pdf' | 'excel' | 'csv';
export type ScheduledReportType = 'financial_summary' | 'expense_audit' | 'category_breakdown' | 'budget_status' | 'complete_balance';

export type ReportSectionItem =
  | 'income'
  | 'expenses'
  | 'balance'
  | 'categories'
  | 'budgets'
  | 'variation'
  | 'subscriptions'
  | 'debts';

export interface ScheduledReport {
  id: string;
  user_id: string;
  name: string;
  frequency: ScheduledReportFrequency;
  schedule_day_of_week?: number; // 0=Domingo, 1=Lunes
  schedule_day_of_month?: number; // 1-31
  schedule_time: string; // '08:00'
  period_type: DashboardPeriod;
  report_type: ScheduledReportType;
  include_sections: ReportSectionItem[];
  format: ScheduledReportFormat;
  export_destination: 'email' | 'download_only' | 'google_drive' | 'google_sheets';
  recipient_email: string;
  category_ids: string[]; // IDs seleccionados o vacío para todos
  account_ids: string[];  // IDs seleccionados o vacío para todos
  is_active: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReportExecutionLog {
  id: string;
  report_id?: string | null;
  user_id: string;
  generated_at: string;
  sent_at?: string | null;
  recipient_email: string;
  format: string;
  status: 'success' | 'failed' | 'pending' | 'skipped';
  file_name?: string | null;
  file_size_bytes?: number;
  error_message?: string | null;
  metadata?: Record<string, any>;
}

export interface UserLicense {
  user_id: string;
  plan_id: 'free' | 'pro' | 'business' | 'enterprise';
  plan_name: string;
  status: 'active' | 'expired' | 'trial' | 'cancelled';
  features: {
    scheduled_reports: boolean;
    custom_alerts: boolean;
    email_delivery: boolean;
    excel_export: boolean;
    unlimited_categories: boolean;
    cloud_backup: boolean;
  };
}


