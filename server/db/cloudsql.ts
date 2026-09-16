import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let connector: Connector | null = null;
let useLocalMemoryFallback = false;

// Almacén en memoria de respaldo para desarrollo ágil y previsualizaciones
export const memoryStore = {
  profiles: new Map<string, any>(),
  categories: new Map<string, any>(),
  accounts: new Map<string, any>(),
  groups: new Map<string, any>(),
  group_members: new Map<string, any>(),
  group_invitations: new Map<string, any>(),
  expenses: new Map<string, any>(),
  expense_shares: new Map<string, any>(),
  settlements: new Map<string, any>(),
  subscriptions: new Map<string, any>(),
  user_dashboard_preferences: new Map<string, any>(),
  user_category_selections: new Map<string, any>(),
  alert_rules: new Map<string, any>(),
  scheduled_reports: new Map<string, any>(),
  report_execution_logs: new Map<string, any>(),
  user_licenses: new Map<string, any>(),
  admin_audit_logs: new Map<string, any>(),
};

// ============================================================================
// PERSISTENCIA DURADERA EN DISCO PARA ENTORNO DE DESARROLLO Y ACTUALIZACIONES
// Evita que la información de los usuarios se borre al actualizar código o reiniciar
// ============================================================================
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'flowmoney_store.json');
let saveTimeout: NodeJS.Timeout | null = null;

export function persistStoreToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dump: Record<string, any[]> = {};
    for (const [key, map] of Object.entries(memoryStore)) {
      dump[key] = Array.from((map as Map<string, any>).entries());
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(dump, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Storage] Error al persistir almacén en disco:', err);
  }
}

export function scheduleSaveStore(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    persistStoreToDisk();
  }, 100);
}

export function loadStoreFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!raw.trim()) return;
    const dump = JSON.parse(raw);
    for (const [key, entries] of Object.entries(dump)) {
      if ((memoryStore as any)[key] && Array.isArray(entries)) {
        const targetMap = (memoryStore as any)[key] as Map<string, any>;
        targetMap.clear();
        for (const [k, v] of entries as [string, any][]) {
          if (key === 'categories' && v) {
            if (v.is_active === undefined) v.is_active = true;
            if (v.is_custom === undefined) v.is_custom = false;
            if (v.sort_order === undefined) v.sort_order = 99;
          }
          if (key === 'profiles' && v) {
            if (v.is_suspended === undefined) v.is_suspended = false;
            if (v.suspended_reason === undefined) v.suspended_reason = null;
            if (v.access_expires_at === undefined) v.access_expires_at = null;
          }
          targetMap.set(k, v);
        }
      }
    }

    // Auto-sanar cualquier grupo existente sin membresía de su creador
    for (const [gid, g] of memoryStore.groups.entries()) {
      if (g.created_by) {
        const hasMem = Array.from(memoryStore.group_members.values()).some(
          (gm) => gm.group_id === gid && gm.user_id === g.created_by
        );
        if (!hasMem) {
          const newGmId = 'gm_' + Math.random().toString(36).substr(2, 9);
          memoryStore.group_members.set(newGmId, {
            id: newGmId,
            group_id: gid,
            user_id: g.created_by,
            role: 'admin',
            joined_at: g.created_at || new Date().toISOString(),
          });
        }
      }
    }

    console.log(
      `[Storage] Almacén persistente cargado con éxito: ${memoryStore.profiles.size} usuarios, ${memoryStore.groups.size} grupos, ${memoryStore.expenses.size} gastos.`
    );
  } catch (err) {
    console.error('[Storage] Error al cargar almacén desde disco:', err);
  }
}

// Cargar estado persistente automáticamente al inicio
loadStoreFromDisk();

// Guardar de forma garantizada ante señales de terminación o reinicio
process.on('beforeExit', () => persistStoreToDisk());
process.on('SIGINT', () => {
  persistStoreToDisk();
  process.exit(0);
});
process.on('SIGTERM', () => {
  persistStoreToDisk();
  process.exit(0);
});

export const DEFAULT_CATEGORIES = [
  { name: 'Comida', icon: 'utensils', color: '#F59E0B', type: 'expense', monthly_budget: 650.0, is_active: true, is_custom: false, sort_order: 1 },
  { name: 'Transporte', icon: 'car', color: '#3B82F6', type: 'expense', monthly_budget: 220.0, is_active: true, is_custom: false, sort_order: 2 },
  { name: 'Ocio', icon: 'film', color: '#8B5CF6', type: 'expense', monthly_budget: 250.0, is_active: true, is_custom: false, sort_order: 3 },
  { name: 'Casa', icon: 'home', color: '#6366F1', type: 'expense', monthly_budget: 1200.0, is_active: true, is_custom: false, sort_order: 4 },
  { name: 'Salud', icon: 'heart-pulse', color: '#EF4444', type: 'expense', monthly_budget: 150.0, is_active: true, is_custom: false, sort_order: 5 },
  { name: 'Compras', icon: 'shopping-bag', color: '#EC4899', type: 'expense', monthly_budget: 250.0, is_active: true, is_custom: false, sort_order: 6 },
  { name: 'Suscripciones', icon: 'repeat', color: '#10B981', type: 'expense', monthly_budget: 90.0, is_active: true, is_custom: false, sort_order: 7 },
  { name: 'Otros', icon: 'tag', color: '#64748B', type: 'expense', monthly_budget: 150.0, is_active: true, is_custom: false, sort_order: 8 },
];

export async function getDbPool(): Promise<pg.Pool | null> {
  if (useLocalMemoryFallback) {
    return null;
  }
  if (pool) return pool;

  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
  const databaseUrl = process.env.DATABASE_URL;

  // 1. Si hay una URL de conexión de Postgres directa
  if (databaseUrl) {
    try {
      pool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
      });
      console.log('[Cloud SQL] Conectado mediante DATABASE_URL');
      return pool;
    } catch (err) {
      console.warn('[Cloud SQL] No se pudo conectar vía DATABASE_URL:', err);
    }
  }

  // 2. Si se provee la instancia de Cloud SQL oficial de GCP
  if (instanceConnectionName) {
    try {
      connector = new Connector();
      const clientOpts = await connector.getOptions({
        instanceConnectionName,
        ipType: IpAddressTypes.PUBLIC,
      });

      pool = new Pool({
        ...clientOpts,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'flowmoney',
        max: 10,
      });
      console.log('[Cloud SQL] Conectado mediante Google Cloud SQL Connector');
      return pool;
    } catch (err) {
      console.warn('[Cloud SQL] Fallo al iniciar conector Cloud SQL:', err);
    }
  }

  useLocalMemoryFallback = true;
  console.log('[Storage] Operando con almacenamiento persistente en disco (archivo local durable).');
  return null;
}

/**
 * Ejecuta una consulta SQL segura en PostgreSQL (o el almacén local persistente si no hay conexión externa)
 */
export async function query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  try {
    const p = await getDbPool();
    if (p) {
      const res = await p.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
    }
  } catch (error) {
    console.warn('[Cloud SQL Query Fallback]:', error);
  }

  return executeInMemoryQuery(text, params);
}

// Emulador en memoria para desarrollo ágil cuando no hay base de datos conectada
function isFromTable(queryText: string, table: string): boolean {
  const fromRegex = new RegExp(`\\bfrom\\s+(?:public\\.)?${table}(?:\\s+|,|$)`, 'i');
  return fromRegex.test(queryText);
}

function executeInMemoryQuery(text: string, params: any[]): { rows: any[]; rowCount: number } {
  const result = runMemoryQuery(text, params);
  const normalized = text.trim().toLowerCase();
  if (
    normalized.startsWith('insert') ||
    normalized.startsWith('update') ||
    normalized.startsWith('delete') ||
    normalized.includes('insert into') ||
    normalized.includes('update ') ||
    normalized.includes('delete from')
  ) {
    scheduleSaveStore();
  }
  return result;
}

function runMemoryQuery(text: string, params: any[]): { rows: any[]; rowCount: number } {
  const normalized = text.trim().toLowerCase();

  // 1. SELECT profiles
  if (normalized.includes('select') && isFromTable(normalized, 'profiles')) {
    if (normalized.includes('where id =') || normalized.includes('where id=$1')) {
      const uid = params[0];
      const profile = memoryStore.profiles.get(uid);
      return { rows: profile ? [profile] : [], rowCount: profile ? 1 : 0 };
    }
    const rows = Array.from(memoryStore.profiles.values());
    return { rows, rowCount: rows.length };
  }

  // 2. INSERT / UPSERT profiles
  if (normalized.includes('insert into') && normalized.includes('profiles')) {
    const [id, email, full_name, avatar_url, default_currency, theme] = params;
    const existing = memoryStore.profiles.get(id);
    const updated = {
      id,
      email,
      full_name: full_name || existing?.full_name || email.split('@')[0],
      avatar_url: avatar_url || existing?.avatar_url || null,
      default_currency: default_currency || existing?.default_currency || 'PEN',
      theme: theme || existing?.theme || 'system',
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.profiles.set(id, updated);
    return { rows: [updated], rowCount: 1 };
  }

  // 2.1 UPDATE profiles
  if (normalized.includes('update') && normalized.includes('profiles')) {
    if (normalized.includes('is_suspended') || normalized.includes('access_expires_at')) {
      const [is_suspended, suspended_reason, access_expires_at, uid] = params;
      const existing = memoryStore.profiles.get(uid);
      if (existing) {
        existing.is_suspended = !!is_suspended;
        existing.suspended_reason = suspended_reason !== undefined ? suspended_reason : existing.suspended_reason;
        existing.access_expires_at = access_expires_at !== undefined ? access_expires_at : existing.access_expires_at;
        existing.updated_at = new Date().toISOString();
        memoryStore.profiles.set(uid, existing);
        return { rows: [existing], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    const [newName, newAvatar, newCurrency, newTheme, uid] = params;
    const existing = memoryStore.profiles.get(uid);
    if (existing) {
      existing.full_name = newName !== undefined ? newName : existing.full_name;
      existing.avatar_url = newAvatar !== undefined ? newAvatar : existing.avatar_url;
      existing.default_currency = newCurrency !== undefined ? newCurrency : existing.default_currency;
      existing.theme = newTheme !== undefined ? newTheme : existing.theme;
      existing.updated_at = new Date().toISOString();
      memoryStore.profiles.set(uid, existing);
      return { rows: [existing], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 3. SELECT categories by user_id
  if (normalized.includes('select') && isFromTable(normalized, 'categories')) {
    const uid = params[0];
    let rows = Array.from(memoryStore.categories.values()).filter((c) => c.user_id === uid);
    // Filtrar por active si se solicita en la query
    if (normalized.includes('is_active = true')) {
      rows = rows.filter((c) => c.is_active !== false);
    }
    // Ordenar por sort_order asc, name asc
    rows.sort((a, b) => {
      const soA = a.sort_order ?? 99;
      const soB = b.sort_order ?? 99;
      if (soA !== soB) return soA - soB;
      return (a.name || '').localeCompare(b.name || '');
    });

    if (normalized.includes('sum(e.amount)') || normalized.includes('total_spent')) {
      const expenses = Array.from(memoryStore.expenses.values());
      const startDate = params[1];
      const endDate = params[2];
      const enriched = rows.map((c) => {
        const spent = expenses
          .filter((e) => e.category_id === c.id && (!startDate || e.expense_date >= startDate) && (!endDate || e.expense_date <= endDate))
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        return {
          ...c,
          total_spent: spent,
        };
      });
      return { rows: enriched, rowCount: enriched.length };
    }
    return { rows, rowCount: rows.length };
  }

  // 3.1 UPDATE category monthly_budget
  if (normalized.includes('update') && normalized.includes('categories') && normalized.includes('monthly_budget')) {
    const [budget, catId, uid] = params;
    for (const [id, cat] of memoryStore.categories.entries()) {
      if (id === catId && (cat.user_id === uid || !uid)) {
        cat.monthly_budget = Number(budget);
        memoryStore.categories.set(id, cat);
        return { rows: [cat], rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 3.2 UPDATE category is_active (toggle status)
  if (normalized.includes('update') && normalized.includes('categories') && normalized.includes('is_active')) {
    const [isActive, catId, uid] = params;
    for (const [id, cat] of memoryStore.categories.entries()) {
      if (id === catId && (cat.user_id === uid || !uid)) {
        cat.is_active = Boolean(isActive);
        memoryStore.categories.set(id, cat);
        return { rows: [cat], rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 3.3 UPDATE category details (name, icon, color, monthly_budget)
  if (normalized.includes('update') && normalized.includes('categories') && normalized.includes('name =')) {
    const [name, icon, color, monthly_budget, catId, uid] = params;
    for (const [id, cat] of memoryStore.categories.entries()) {
      if (id === catId && (cat.user_id === uid || !uid)) {
        cat.name = name ?? cat.name;
        cat.icon = icon ?? cat.icon;
        cat.color = color ?? cat.color;
        cat.monthly_budget = monthly_budget !== undefined ? Number(monthly_budget) : cat.monthly_budget;
        memoryStore.categories.set(id, cat);
        return { rows: [cat], rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 3.4 UPDATE category sort_order
  if (normalized.includes('update') && normalized.includes('categories') && normalized.includes('sort_order =')) {
    const [sortOrder, catId, uid] = params;
    for (const [id, cat] of memoryStore.categories.entries()) {
      if (id === catId && (cat.user_id === uid || !uid)) {
        cat.sort_order = Number(sortOrder);
        memoryStore.categories.set(id, cat);
        return { rows: [cat], rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 3.5 INSERT INTO categories
  if (normalized.includes('insert into') && normalized.includes('categories')) {
    const [userId, name, icon, color, type, monthlyBudget, isActive, isCustom, sortOrder] = params;
    const catId = 'cat_' + Math.random().toString(36).substr(2, 9);
    const newCat = {
      id: catId,
      user_id: userId,
      name,
      icon: icon || 'tag',
      color: color || '#6366F1',
      type: type || 'expense',
      monthly_budget: Number(monthlyBudget || 0),
      is_active: isActive !== undefined ? Boolean(isActive) : true,
      is_custom: isCustom !== undefined ? Boolean(isCustom) : true,
      sort_order: sortOrder !== undefined ? Number(sortOrder) : 99,
      created_at: new Date().toISOString(),
    };
    memoryStore.categories.set(catId, newCat);
    return { rows: [newCat], rowCount: 1 };
  }

  // 3.6 DELETE FROM categories
  if (normalized.includes('delete') && normalized.includes('categories')) {
    const [catId, uid] = params;
    const cat = memoryStore.categories.get(catId);
    if (cat && (cat.user_id === uid || !uid)) {
      memoryStore.categories.delete(catId);
      return { rows: [cat], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 4. SELECT accounts
  if (normalized.includes('select') && isFromTable(normalized, 'accounts')) {
    if (normalized.includes('where id =') || normalized.includes('where id=$1')) {
      const accId = params[0];
      const uid = params[1];
      const acc = memoryStore.accounts.get(accId);
      if (acc && (!uid || acc.user_id === uid)) {
        return { rows: [acc], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (params.length > 0 && params[0]) {
      const uid = params[0];
      const rows = Array.from(memoryStore.accounts.values()).filter((a) => a.user_id === uid && !a.is_archived);
      return { rows, rowCount: rows.length };
    }
    // Si no hay parámetros (ej. admin o listado global), retornar todas las cuentas activas
    const allRows = Array.from(memoryStore.accounts.values()).filter((a) => !a.is_archived);
    return { rows: allRows, rowCount: allRows.length };
  }

  // 4.1 INSERT INTO accounts
  if (normalized.includes('insert into') && normalized.includes('accounts')) {
    const [userId, name, type, currency, currentBalance, color] = params;
    const id = 'acc_' + Math.random().toString(36).substr(2, 9);
    const acc = {
      id,
      user_id: userId,
      name,
      type: type || 'checking',
      currency: currency || 'PEN',
      current_balance: Number(currentBalance || 0),
      color: color || '#4F46E5',
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.accounts.set(id, acc);
    return { rows: [acc], rowCount: 1 };
  }

  // 4.2 DELETE / ARCHIVE accounts
  if (normalized.includes('delete from') && normalized.includes('accounts')) {
    const [accId, userId] = params;
    const acc = memoryStore.accounts.get(accId);
    if (acc && (acc.user_id === userId || !userId)) {
      memoryStore.accounts.delete(accId);
      return { rows: [acc], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 5. UPDATE accounts balance
  if (normalized.includes('update') && normalized.includes('accounts') && normalized.includes('current_balance')) {
    const isAddition = normalized.includes('current_balance +') || normalized.includes('current_balance+');
    const [amount, accountId] = params;
    const acc = memoryStore.accounts.get(accountId);
    if (acc) {
      if (isAddition) {
        acc.current_balance = Number(acc.current_balance) + Number(amount);
      } else {
        acc.current_balance = Number(acc.current_balance) - Number(amount);
      }
      acc.updated_at = new Date().toISOString();
      memoryStore.accounts.set(accountId, acc);
      return { rows: [acc], rowCount: 1 };
    }
  }

  // 6. SELECT subscriptions
  if (normalized.includes('select') && isFromTable(normalized, 'subscriptions')) {
    const uid = params[0];
    const subs = Array.from(memoryStore.subscriptions.values())
      .filter((s) => s.user_id === uid)
      .map((s) => {
        const cat = s.category_id ? memoryStore.categories.get(s.category_id) : null;
        return {
          ...s,
          category_name: cat?.name || 'Suscripción',
          category_color: cat?.color || '#10B981',
        };
      });
    return { rows: subs, rowCount: subs.length };
  }

  // 6.1 INSERT INTO subscriptions
  if (normalized.includes('insert into') && normalized.includes('subscriptions')) {
    const [userId, name, amount, currency, billingCycle, categoryId, accountId, nextBillingDate] = params;
    const id = 'sub_' + Math.random().toString(36).substr(2, 9);
    const sub = {
      id,
      user_id: userId,
      name,
      amount: Number(amount),
      currency: currency || 'PEN',
      billing_cycle: billingCycle || 'monthly',
      category_id: categoryId || null,
      account_id: accountId || null,
      next_billing_date: nextBillingDate || null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.subscriptions.set(id, sub);
    return { rows: [sub], rowCount: 1 };
  }

  // 6.2 DELETE subscriptions
  if (normalized.includes('delete from') && normalized.includes('subscriptions')) {
    const [subId, userId] = params;
    const sub = memoryStore.subscriptions.get(subId);
    if (sub && (sub.user_id === userId || !userId)) {
      memoryStore.subscriptions.delete(subId);
      return { rows: [sub], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 6.3 UPDATE subscriptions status
  if (normalized.includes('update') && normalized.includes('subscriptions')) {
    const [status, subId, userId] = params;
    const sub = memoryStore.subscriptions.get(subId);
    if (sub && (sub.user_id === userId || !userId)) {
      sub.status = status;
      sub.updated_at = new Date().toISOString();
      memoryStore.subscriptions.set(subId, sub);
      return { rows: [sub], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 7. SELECT expenses
  if (normalized.includes('select') && isFromTable(normalized, 'expenses')) {
    let list = Array.from(memoryStore.expenses.values());

    // Si la consulta es por id directo
    if (normalized.includes('where id = $1') || normalized.includes('where e.id = $1')) {
      const expId = params[0];
      list = list.filter((e) => e.id === expId);
    }
    // Si la consulta es por grupo (Lens Grupo o Grupo específico)
    else if (normalized.includes('where e.group_id = $1') || normalized.includes('where group_id = $1')) {
      const groupId = params[0];
      list = list.filter((e) => e.group_id === groupId);
    }
    // Si la consulta es para el Lente Pareja con grupo
    else if (normalized.includes('(e.group_id = $1 or e.lens = \'couple\')') || normalized.includes('(group_id = $1 or lens = \'couple\')')) {
      const groupId = params[0];
      list = list.filter((e) => e.group_id === groupId || e.lens === 'couple');
    }
    // Si la consulta es por usuario
    else if (params[0] && typeof params[0] === 'string') {
      const p0 = params[0];
      if (p0.startsWith('grp_')) {
        list = list.filter((e) => e.group_id === p0);
      } else {
        list = list.filter((e) => e.user_id === p0 || e.paid_by === p0);
      }
    }

    // Filtro por lente
    if (params.includes('personal') || normalized.includes("e.lens = 'personal'") || normalized.includes("lens = 'personal'")) {
      list = list.filter((e) => e.lens === 'personal');
    } else if (params.includes('couple') || normalized.includes("e.lens = 'couple'") || normalized.includes("lens = 'couple'")) {
      list = list.filter((e) => e.lens === 'couple');
    } else if (params.includes('group') || normalized.includes("e.lens = 'group'") || normalized.includes("lens = 'group'")) {
      list = list.filter((e) => e.lens === 'group');
    }

    // Filtro por group_id adicional
    if (normalized.includes('e.group_id =') || normalized.includes('group_id =')) {
      const gParam = params.find((p) => typeof p === 'string' && (p.startsWith('grp_') || p.length > 10));
      if (gParam) {
        list = list.filter((e) => e.group_id === gParam);
      }
    }

    // Filtro por rango de fechas
    const dateParams = params.filter((p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p));
    if (dateParams.length >= 2) {
      const [start, end] = dateParams;
      list = list.filter((e) => e.expense_date >= start && e.expense_date <= end);
    } else if (dateParams.length === 1) {
      list = list.filter((e) => e.expense_date >= dateParams[0]);
    }

    // Mapear con datos de categoría y cuenta
    const enriched = list.map((e) => {
      const cat = e.category_id ? memoryStore.categories.get(e.category_id) : null;
      const acc = e.account_id ? memoryStore.accounts.get(e.account_id) : null;
      const payer = e.paid_by ? memoryStore.profiles.get(e.paid_by) : null;
      return {
        ...e,
        category_name: cat?.name || 'General',
        category_icon: cat?.icon || 'tag',
        category_color: cat?.color || '#6366F1',
        account_name: acc?.name || 'Cuenta Principal',
        paid_by_name: payer?.full_name || 'Tú',
      };
    });

    // Ordenar desc
    enriched.sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());

    // Limitar si hay limit
    const limitMatch = normalized.match(/limit\s+(\d+)/);
    const sqlLimit = limitMatch ? parseInt(limitMatch[1], 10) : undefined;
    const paramLimit = params.find((p) => typeof p === 'number');
    const limit = paramLimit || sqlLimit;
    const resultRows = limit ? enriched.slice(0, limit) : enriched;
    return { rows: resultRows, rowCount: resultRows.length };
  }

  // 8. INSERT expenses
  if (normalized.includes('insert into') && normalized.includes('expenses')) {
    const id = 'exp_' + Math.random().toString(36).substr(2, 9);
    let exp: any;

    const colMatch = normalized.match(/insert into public\.expenses\s*\(([^)]+)\)/i);
    if (colMatch) {
      const cols = colMatch[1].split(',').map((c) => c.trim().toLowerCase());
      exp = {
        id,
        user_id: '',
        paid_by: '',
        group_id: null,
        account_id: null,
        category_id: null,
        amount: 0,
        currency: 'PEN',
        description: 'Gasto',
        expense_date: new Date().toISOString().slice(0, 10),
        lens: 'personal',
        receipt_url: null,
        notes: null,
        created_at: new Date().toISOString(),
      };
      cols.forEach((col, idx) => {
        if (params[idx] !== undefined) {
          if (col === 'amount') exp.amount = Number(params[idx]);
          else (exp as any)[col] = params[idx];
        }
      });
      if (!exp.paid_by) exp.paid_by = exp.user_id;
    } else {
      const [userId, paidBy, groupId, accountId, categoryId, amount, currency, description, expenseDate, lens, receiptUrl, notes] = params;
      exp = {
        id,
        user_id: userId,
        paid_by: paidBy || userId,
        group_id: groupId || null,
        account_id: accountId || null,
        category_id: categoryId || null,
        amount: Number(amount),
        currency: currency || 'PEN',
        description,
        expense_date: expenseDate || new Date().toISOString().slice(0, 10),
        lens: lens || 'personal',
        receipt_url: receiptUrl || null,
        notes: notes || null,
        created_at: new Date().toISOString(),
      };
    }
    memoryStore.expenses.set(id, exp);
    return { rows: [exp], rowCount: 1 };
  }

  // 8.1 INSERT expense_shares
  if (normalized.includes('insert into') && normalized.includes('expense_shares')) {
    const id = 'share_' + Math.random().toString(36).substr(2, 9);
    let share: any = {
      id,
      expense_id: '',
      user_id: '',
      owed_amount: 0,
      percentage: null,
      is_settled: false,
    };
    const colMatch = normalized.match(/insert into public\.expense_shares\s*\(([^)]+)\)/i);
    const valMatch = normalized.match(/values\s*\(([^)]+)\)/i);
    const valTokens = valMatch ? valMatch[1].split(',').map((v) => v.trim()) : [];
    if (colMatch) {
      const cols = colMatch[1].split(',').map((c) => c.trim().toLowerCase());
      let paramIdx = 0;
      cols.forEach((col, idx) => {
        const rawToken = valTokens[idx];
        let val: any = undefined;
        if (rawToken && rawToken.startsWith('$')) {
          val = params[paramIdx++];
        } else if (rawToken) {
          const num = Number(rawToken);
          val = !isNaN(num) ? num : rawToken.replace(/^['"]|['"]$/g, '');
        } else if (params[idx] !== undefined) {
          val = params[idx];
        }

        if (val !== undefined) {
          if (col === 'owed_amount' || col === 'percentage') (share as any)[col] = Number(val);
          else if (col === 'is_settled') (share as any)[col] = Boolean(val);
          else (share as any)[col] = val;
        }
      });
    } else {
      const [expenseId, userId, owedAmount, percentage] = params;
      share = {
        id,
        expense_id: expenseId,
        user_id: userId,
        owed_amount: Number(owedAmount || 0),
        percentage: percentage !== undefined && percentage !== null ? Number(percentage) : null,
        is_settled: false,
      };
    }
    memoryStore.expense_shares.set(id, share);
    return { rows: [share], rowCount: 1 };
  }

  // 8.2 SELECT expense_shares
  if (normalized.includes('select') && isFromTable(normalized, 'expense_shares')) {
    let list = Array.from(memoryStore.expense_shares.values());
    if (normalized.includes('where expense_id = $1') || normalized.includes('where expense_id =')) {
      const expId = params[0];
      list = list.filter((s) => s.expense_id === expId);
    }
    return { rows: list, rowCount: list.length };
  }

  // 8.3 DELETE expense_shares
  if (normalized.includes('delete from') && normalized.includes('expense_shares')) {
    if (normalized.includes('where expense_id = $1') || normalized.includes('where expense_id =')) {
      const expId = params[0];
      let deleted = 0;
      for (const [sId, s] of memoryStore.expense_shares.entries()) {
        if (s.expense_id === expId) {
          memoryStore.expense_shares.delete(sId);
          deleted++;
        }
      }
      return { rows: [], rowCount: deleted };
    }
  }

  // 8.4 DELETE expenses
  if (normalized.includes('delete from') && normalized.includes('expenses')) {
    const expId = params[0];
    const exp = memoryStore.expenses.get(expId);
    if (exp) {
      memoryStore.expenses.delete(expId);
      // Eliminar también las participaciones asociadas
      for (const [sId, s] of memoryStore.expense_shares.entries()) {
        if (s.expense_id === expId) {
          memoryStore.expense_shares.delete(sId);
        }
      }
      return { rows: [exp], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 8.5 UPDATE expenses
  if (normalized.includes('update') && normalized.includes('expenses') && !normalized.includes('expense_shares')) {
    // Buscar el ID del gasto entre los parámetros
    const expId = params.find((p) => typeof p === 'string' && memoryStore.expenses.has(p)) || params[params.length - 2] || params[params.length - 1];
    const exp = memoryStore.expenses.get(expId);
    if (exp) {
      // Extraer columnas actualizadas si vienen mapeadas
      if (normalized.includes('description = $1') || params.length >= 9) {
        // Formato estándar: [description, amount, currency, expense_date, category_id, account_id, lens, notes, receipt_url, expId]
        if (params[0] !== undefined) exp.description = String(params[0]);
        if (params[1] !== undefined) exp.amount = Number(params[1]);
        if (params[2] !== undefined) exp.currency = String(params[2]);
        if (params[3] !== undefined) exp.expense_date = String(params[3]);
        if (params[4] !== undefined) exp.category_id = params[4] || null;
        if (params[5] !== undefined) exp.account_id = params[5] || null;
        if (params[6] !== undefined) exp.lens = params[6] || 'personal';
        if (params[7] !== undefined) exp.notes = params[7] || null;
        if (params[8] !== undefined) exp.receipt_url = params[8] || null;
      }
      exp.updated_at = new Date().toISOString();
      memoryStore.expenses.set(expId, exp);
      return { rows: [exp], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 9. SELECT groups
  if (normalized.includes('select') && isFromTable(normalized, 'groups')) {
    if (normalized.includes('where id = $1') || normalized.includes('where g.id = $1') || normalized.includes('where id =')) {
      const groupId = params[0];
      const grp = memoryStore.groups.get(groupId);
      if (grp) {
        const membersCount = Array.from(memoryStore.group_members.values()).filter((gm) => gm.group_id === groupId).length;
        return { rows: [{ ...grp, members_count: membersCount }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    const uid = params[0];
    const userMemberships = Array.from(memoryStore.group_members.values()).filter((gm) => gm.user_id === uid);
    const groupIds = new Set(userMemberships.map((gm) => gm.group_id));

    // Incluir de forma garantizada los grupos creados por este usuario
    for (const g of memoryStore.groups.values()) {
      if (g.created_by === uid) {
        groupIds.add(g.id);
        if (!userMemberships.some((gm) => gm.group_id === g.id)) {
          const gmId = 'gm_' + Math.random().toString(36).substr(2, 9);
          const gm = {
            id: gmId,
            group_id: g.id,
            user_id: uid,
            role: 'admin',
            joined_at: g.created_at || new Date().toISOString(),
          };
          memoryStore.group_members.set(gmId, gm);
          userMemberships.push(gm);
        }
      }
    }

    let groups = Array.from(memoryStore.groups.values()).filter((g) => groupIds.has(g.id));

    if (normalized.includes("type = 'couple'")) {
      groups = groups.filter((g) => g.type === 'couple');
    }

    const enriched = groups.map((g) => {
      const membership = userMemberships.find((gm) => gm.group_id === g.id);
      const membersCount = Array.from(memoryStore.group_members.values()).filter((gm) => gm.group_id === g.id).length;

      // Calcular saldo neto del usuario en este grupo
      const groupExpenses = Array.from(memoryStore.expenses.values()).filter((e) => e.group_id === g.id);
      const userPaid = groupExpenses
        .filter((e) => e.paid_by === uid)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const userShares = Array.from(memoryStore.expense_shares.values())
        .filter((s) => s.user_id === uid && groupExpenses.some((e) => e.id === s.expense_id))
        .reduce((sum, s) => sum + Number(s.owed_amount || 0), 0);

      const groupSettlements = Array.from(memoryStore.settlements.values()).filter((s) => s.group_id === g.id);
      const settPaid = groupSettlements
        .filter((s) => s.payer_id === uid)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);
      const settReceived = groupSettlements
        .filter((s) => s.payee_id === uid)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);

      const netBalance = Math.round(((userPaid + settPaid) - (userShares + settReceived)) * 100) / 100;

      // Obtener el último gasto registrado
      const sortedExp = [...groupExpenses].sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
      const lastExp = sortedExp.length > 0 ? {
        id: sortedExp[0].id,
        description: sortedExp[0].description,
        amount: Number(sortedExp[0].amount),
        currency: sortedExp[0].currency || g.currency,
        expense_date: sortedExp[0].expense_date,
      } : null;

      return {
        ...g,
        user_role: membership?.role || 'member',
        members_count: membersCount,
        net_balance: netBalance,
        last_expense: lastExp,
      };
    });

    return { rows: enriched, rowCount: enriched.length };
  }

  // 9.1 INSERT groups
  if (normalized.includes('insert into') && normalized.includes('groups')) {
    const id = 'grp_' + Math.random().toString(36).substr(2, 9);
    const [name, description, type, currency, coverUrl, autoArchiveDays, createdBy] = params;
    const grp = {
      id,
      name,
      description: description || null,
      type: type || 'trip',
      currency: currency || 'PEN',
      cover_url: coverUrl || null,
      auto_archive_days: Number(autoArchiveDays || 0),
      is_archived: false,
      created_by: createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.groups.set(id, grp);
    // Asegurar inmediatamente que el creador quede registrado como admin en group_members
    if (createdBy) {
      const gmId = 'gm_' + Math.random().toString(36).substr(2, 9);
      memoryStore.group_members.set(gmId, {
        id: gmId,
        group_id: id,
        user_id: createdBy,
        role: 'admin',
        joined_at: new Date().toISOString(),
      });
    }
    scheduleSaveStore();
    return { rows: [grp], rowCount: 1 };
  }

  // 9.2 UPDATE groups
  if (normalized.includes('update') && normalized.includes('groups')) {
    const groupId = params[params.length - 1];
    const grp = memoryStore.groups.get(groupId);
    if (grp) {
      // Params varían según campos
      const updated = {
        ...grp,
        name: params[0] !== undefined ? params[0] : grp.name,
        description: params[1] !== undefined ? params[1] : grp.description,
        cover_url: params[2] !== undefined ? params[2] : grp.cover_url,
        currency: params[3] !== undefined ? params[3] : grp.currency,
        auto_archive_days: params[4] !== undefined ? Number(params[4]) : grp.auto_archive_days,
        updated_at: new Date().toISOString(),
      };
      memoryStore.groups.set(groupId, updated);
      return { rows: [updated], rowCount: 1 };
    }
  }

  // 9.3 DELETE groups
  if (normalized.includes('delete from') && normalized.includes('groups')) {
    const groupId = params[0];
    memoryStore.groups.delete(groupId);
    // Cascada
    for (const [key, val] of memoryStore.group_members.entries()) {
      if (val.group_id === groupId) memoryStore.group_members.delete(key);
    }
    for (const [key, val] of memoryStore.expenses.entries()) {
      if (val.group_id === groupId) memoryStore.expenses.delete(key);
    }
    for (const [key, val] of memoryStore.settlements.entries()) {
      if (val.group_id === groupId) memoryStore.settlements.delete(key);
    }
    for (const [key, val] of memoryStore.group_invitations.entries()) {
      if (val.group_id === groupId) memoryStore.group_invitations.delete(key);
    }
    return { rows: [], rowCount: 1 };
  }

  // 10. SELECT calculate_group_balances
  if (normalized.includes('calculate_group_balances')) {
    const groupId = params[0];
    const members = Array.from(memoryStore.group_members.values()).filter((gm) => gm.group_id === groupId);

    const groupExpenses = Array.from(memoryStore.expenses.values()).filter((e) => e.group_id === groupId);
    const shares = Array.from(memoryStore.expense_shares.values());
    const groupSettlements = Array.from(memoryStore.settlements.values()).filter((s) => s.group_id === groupId);

    // Incluir también participantes e invitaciones pendientes
    const pendingInvs = Array.from(memoryStore.group_invitations.values())
      .filter((inv) => inv.group_id === groupId && inv.status === 'pending');

    const participantList: Array<{
      user_id: string;
      full_name: string;
      email: string;
      avatar_url: string | null;
      is_pending?: boolean;
    }> = [];

    for (const m of members) {
      const p = memoryStore.profiles.get(m.user_id);
      participantList.push({
        user_id: m.user_id,
        full_name: p?.full_name || 'Miembro',
        email: p?.email || '',
        avatar_url: p?.avatar_url || null,
        is_pending: false,
      });
    }

    for (const inv of pendingInvs) {
      const invUserId = 'pending_' + inv.id;
      if (!participantList.some((p) => p.user_id === invUserId || (inv.email && p.email.toLowerCase() === inv.email.toLowerCase()))) {
        participantList.push({
          user_id: invUserId,
          full_name: (inv.name || (inv.email ? inv.email.split('@')[0] : 'Invitado')) + ' (Pendiente)',
          email: inv.email || '',
          avatar_url: null,
          is_pending: true,
        });
      }
    }

    const balances = participantList.map((m) => {
      const totalPaid = groupExpenses
        .filter((e) => e.paid_by === m.user_id)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const totalOwed = shares
        .filter((s) => {
          const matchUser = s.user_id === m.user_id;
          const matchPending = m.is_pending && (s.user_id === m.user_id.replace('pending_', 'inv_') || s.user_id === m.user_id.replace('pending_', ''));
          return (matchUser || matchPending) && groupExpenses.some((e) => e.id === s.expense_id);
        })
        .reduce((sum, s) => sum + Number(s.owed_amount || 0), 0);

      const settlementsPaid = groupSettlements
        .filter((s) => s.payer_id === m.user_id)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);

      const settlementsReceived = groupSettlements
        .filter((s) => s.payee_id === m.user_id)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);

      const netBalance = Math.round(((totalPaid + settlementsPaid) - (totalOwed + settlementsReceived)) * 100) / 100;

      return {
        user_id: m.user_id,
        full_name: m.full_name,
        email: m.email,
        avatar_url: m.avatar_url,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_owed: Math.round(totalOwed * 100) / 100,
        settlements_paid: Math.round(settlementsPaid * 100) / 100,
        settlements_received: Math.round(settlementsReceived * 100) / 100,
        net_balance: netBalance,
        is_pending: m.is_pending,
      };
    });

    return { rows: balances, rowCount: balances.length };
  }

  // 11. GROUP MEMBERS (INSERT, DELETE, SELECT)
  if (normalized.includes('group_members')) {
    if (normalized.includes('insert into') && normalized.includes('group_members')) {
      const [groupId, userId, role] = params;
      const roleVal = (role && typeof role === 'string' && role.trim()) ? role.trim() : (normalized.includes('admin') ? 'admin' : 'member');
      // Verificar si ya existe membresía para evitar duplicados
      const existing = Array.from(memoryStore.group_members.values()).find(
        (gm) => gm.group_id === groupId && gm.user_id === userId
      );
      if (existing) {
        if (roleVal) existing.role = roleVal;
        scheduleSaveStore();
        return { rows: [existing], rowCount: 1 };
      }
      const id = 'gm_' + Math.random().toString(36).substr(2, 9);
      const gm = {
        id,
        group_id: groupId,
        user_id: userId,
        role: roleVal,
        joined_at: new Date().toISOString(),
      };
      memoryStore.group_members.set(id, gm);
      scheduleSaveStore();
      return { rows: [gm], rowCount: 1 };
    }

    if (normalized.includes('delete from') && normalized.includes('group_members')) {
      const [groupId, userId] = params;
      for (const [key, gm] of memoryStore.group_members.entries()) {
        if (gm.group_id === groupId && gm.user_id === userId) {
          memoryStore.group_members.delete(key);
          scheduleSaveStore();
          return { rows: [], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // Consulta específica de verificación: WHERE group_id = $1 AND user_id = $2
    if ((normalized.includes('user_id = $2') || normalized.includes('user_id =')) && params.length >= 2) {
      const [groupId, userId] = params;
      let match = Array.from(memoryStore.group_members.values()).filter(
        (gm) => gm.group_id === groupId && gm.user_id === userId
      );
      // Si no existe pero el usuario es el creador del grupo, asegurar membresía admin al vuelo
      if (match.length === 0) {
        const grp = memoryStore.groups.get(groupId);
        if (grp && grp.created_by === userId) {
          const gmId = 'gm_' + Math.random().toString(36).substr(2, 9);
          const gm = {
            id: gmId,
            group_id: groupId,
            user_id: userId,
            role: 'admin',
            joined_at: grp.created_at || new Date().toISOString(),
          };
          memoryStore.group_members.set(gmId, gm);
          scheduleSaveStore();
          match = [gm];
        }
      }
      return {
        rows: match.map((gm) => ({
          membership_id: gm.id,
          role: gm.role,
          joined_at: gm.joined_at,
          user_id: gm.user_id,
          group_id: gm.group_id,
        })),
        rowCount: match.length,
      };
    }

    const groupId = params[0];
    const grp = memoryStore.groups.get(groupId);
    if (grp?.created_by) {
      const hasCreator = Array.from(memoryStore.group_members.values()).some(
        (gm) => gm.group_id === groupId && gm.user_id === grp.created_by
      );
      if (!hasCreator) {
        const gmId = 'gm_' + Math.random().toString(36).substr(2, 9);
        memoryStore.group_members.set(gmId, {
          id: gmId,
          group_id: groupId,
          user_id: grp.created_by,
          role: 'admin',
          joined_at: grp.created_at || new Date().toISOString(),
        });
        scheduleSaveStore();
      }
    }

    const members = Array.from(memoryStore.group_members.values())
      .filter((gm) => gm.group_id === groupId)
      .map((gm) => {
        const p = memoryStore.profiles.get(gm.user_id);
        return {
          membership_id: gm.id,
          role: gm.role,
          joined_at: gm.joined_at,
          user_id: gm.user_id,
          full_name: p?.full_name || 'Miembro',
          email: p?.email || '',
          avatar_url: p?.avatar_url || null,
        };
      });
    return { rows: members, rowCount: members.length };
  }

  // 12. GROUP INVITATIONS
  if (normalized.includes('group_invitations')) {
    if (normalized.includes('insert into')) {
      const [groupId, email, role, invitedBy] = params;
      const id = 'inv_' + Math.random().toString(36).substr(2, 9);
      const inv = {
        id,
        group_id: groupId,
        email: (email || '').toLowerCase().trim(),
        role: role || 'member',
        invited_by: invitedBy,
        status: 'pending',
        created_at: new Date().toISOString(),
        accepted_at: null,
      };
      memoryStore.group_invitations.set(id, inv);
      return { rows: [inv], rowCount: 1 };
    }

    if (normalized.includes('delete from')) {
      const invId = params[0];
      memoryStore.group_invitations.delete(invId);
      return { rows: [], rowCount: 1 };
    }

    if (normalized.includes('select')) {
      const groupId = params[0];
      const invs = Array.from(memoryStore.group_invitations.values())
        .filter((inv) => inv.group_id === groupId && inv.status === 'pending');
      return { rows: invs, rowCount: invs.length };
    }
  }

  // 13. SETTLEMENTS
  if (normalized.includes('settlements')) {
    if (normalized.includes('insert into')) {
      const [groupId, payerId, payeeId, amount, currency, paymentMethod, notes] = params;
      const id = 'sett_' + Math.random().toString(36).substr(2, 9);
      const settlement = {
        id,
        group_id: groupId,
        payer_id: payerId,
        payee_id: payeeId,
        amount: Number(amount),
        currency: currency || 'PEN',
        payment_method: paymentMethod || 'transfer',
        notes: notes || null,
        settled_at: new Date().toISOString(),
      };
      memoryStore.settlements.set(id, settlement);
      return { rows: [settlement], rowCount: 1 };
    }

    if (normalized.includes('select')) {
      const groupId = params[0];
      const list = Array.from(memoryStore.settlements.values())
        .filter((s) => s.group_id === groupId)
        .map((s) => {
          const payer = memoryStore.profiles.get(s.payer_id);
          const payee = memoryStore.profiles.get(s.payee_id);
          return {
            ...s,
            payer_name: payer?.full_name || 'Miembro',
            payer_avatar: payer?.avatar_url || null,
            payee_name: payee?.full_name || 'Miembro',
            payee_avatar: payee?.avatar_url || null,
          };
        });
      list.sort((a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime());
      return { rows: list, rowCount: list.length };
    }
  }

  // 14. USER_DASHBOARD_PREFERENCES
  if (normalized.includes('user_dashboard_preferences')) {
    if (normalized.includes('select')) {
      const uid = params[0];
      const pref = memoryStore.user_dashboard_preferences.get(uid);
      return { rows: pref ? [pref] : [], rowCount: pref ? 1 : 0 };
    }
    if (normalized.includes('insert into') || normalized.includes('update')) {
      const [uid, defaultPeriod, widgetsJson] = params;
      const parsedWidgets = typeof widgetsJson === 'string' ? JSON.parse(widgetsJson) : widgetsJson;
      const pref = {
        id: 'pref_' + uid,
        user_id: uid,
        default_period: defaultPeriod || 'month',
        widgets: parsedWidgets,
        updated_at: new Date().toISOString(),
      };
      memoryStore.user_dashboard_preferences.set(uid, pref);
      return { rows: [pref], rowCount: 1 };
    }
  }

  // 15. USER_CATEGORY_SELECTIONS
  if (normalized.includes('user_category_selections')) {
    if (normalized.includes('select')) {
      const uid = params[0];
      const selections = Array.from(memoryStore.user_category_selections.values()).filter((s) => s.user_id === uid);
      return { rows: selections, rowCount: selections.length };
    }
    if (normalized.includes('insert into')) {
      const [uid, categoryId, isVisible, sortOrder] = params;
      const key = `${uid}_${categoryId}`;
      const item = {
        id: 'ucs_' + Math.random().toString(36).substr(2, 9),
        user_id: uid,
        category_id: categoryId,
        is_visible: isVisible !== undefined ? Boolean(isVisible) : true,
        sort_order: Number(sortOrder || 99),
        created_at: new Date().toISOString(),
      };
      memoryStore.user_category_selections.set(key, item);
      return { rows: [item], rowCount: 1 };
    }
    if (normalized.includes('update')) {
      const [isVisible, sortOrder, uid, categoryId] = params;
      const key = `${uid}_${categoryId}`;
      let item = memoryStore.user_category_selections.get(key);
      if (!item) {
        item = {
          id: 'ucs_' + Math.random().toString(36).substr(2, 9),
          user_id: uid,
          category_id: categoryId,
          is_visible: isVisible !== undefined ? Boolean(isVisible) : true,
          sort_order: Number(sortOrder || 99),
          created_at: new Date().toISOString(),
        };
      } else {
        if (isVisible !== undefined) item.is_visible = Boolean(isVisible);
        if (sortOrder !== undefined) item.sort_order = Number(sortOrder);
      }
      memoryStore.user_category_selections.set(key, item);
      return { rows: [item], rowCount: 1 };
    }
  }

  // 16. ALERT_RULES
  if (normalized.includes('alert_rules')) {
    if (normalized.includes('select')) {
      const uid = params[0];
      const rules = Array.from(memoryStore.alert_rules.values()).filter((r) => r.user_id === uid);
      // Enriquecer con nombre de categoría si aplica
      const enriched = rules.map((r) => {
        const cat = r.category_id ? memoryStore.categories.get(r.category_id) : null;
        return {
          ...r,
          category_name: cat?.name || (r.category_id ? 'Categoría' : 'Presupuesto Total'),
          category_color: cat?.color || '#6366F1',
        };
      });
      enriched.sort((a, b) => a.threshold_percent - b.threshold_percent);
      return { rows: enriched, rowCount: enriched.length };
    }
    if (normalized.includes('insert into')) {
      const [userId, categoryId, thresholdPercent, isActive, notifyInApp, notifyEmail, targetEmail] = params;
      const id = 'alert_' + Math.random().toString(36).substr(2, 9);
      const rule = {
        id,
        user_id: userId,
        category_id: categoryId || null,
        threshold_percent: Number(thresholdPercent),
        is_active: isActive !== undefined ? Boolean(isActive) : true,
        notify_in_app: notifyInApp !== undefined ? Boolean(notifyInApp) : true,
        notify_email: notifyEmail !== undefined ? Boolean(notifyEmail) : false,
        target_email: targetEmail || null,
        last_triggered_at: null,
        last_triggered_amount: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Evitar duplicados del mismo usuario/categoría/umbral
      for (const [k, existing] of memoryStore.alert_rules.entries()) {
        if (existing.user_id === userId && existing.category_id === rule.category_id && existing.threshold_percent === rule.threshold_percent) {
          memoryStore.alert_rules.delete(k);
        }
      }
      memoryStore.alert_rules.set(id, rule);
      return { rows: [rule], rowCount: 1 };
    }
    if (normalized.includes('update')) {
      const id = params[params.length - 1];
      const rule = memoryStore.alert_rules.get(id);
      if (rule) {
        if (params[0] !== undefined) rule.threshold_percent = Number(params[0]);
        if (params[1] !== undefined) rule.is_active = Boolean(params[1]);
        if (params[2] !== undefined) rule.notify_in_app = Boolean(params[2]);
        if (params[3] !== undefined) rule.notify_email = Boolean(params[3]);
        if (params[4] !== undefined) rule.target_email = params[4];
        rule.updated_at = new Date().toISOString();
        memoryStore.alert_rules.set(id, rule);
        return { rows: [rule], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (normalized.includes('delete from')) {
      const id = params[0];
      const rule = memoryStore.alert_rules.get(id);
      if (rule) {
        memoryStore.alert_rules.delete(id);
        return { rows: [rule], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  }

  // 17. SCHEDULED_REPORTS
  if (normalized.includes('scheduled_reports')) {
    if (normalized.includes('select')) {
      if (normalized.includes('where id =') || normalized.includes('where id=$1')) {
        const reportId = params[0];
        const r = memoryStore.scheduled_reports.get(reportId);
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
      }
      const uid = params[0];
      let reports = Array.from(memoryStore.scheduled_reports.values());
      if (uid) {
        reports = reports.filter((r) => r.user_id === uid);
      }
      reports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { rows: reports, rowCount: reports.length };
    }
    if (normalized.includes('insert into')) {
      const [
        userId, name, frequency, dayOfWeek, dayOfMonth, scheduleTime,
        periodType, reportType, includeSections, format, exportDestination,
        recipientEmail, categoryIds, accountIds, isActive, nextRunAt
      ] = params;
      const id = 'rep_' + Math.random().toString(36).substr(2, 9);
      const rep = {
        id,
        user_id: userId,
        name: name || 'Reporte Programado',
        frequency: frequency || 'monthly',
        schedule_day_of_week: Number(dayOfWeek ?? 1),
        schedule_day_of_month: Number(dayOfMonth ?? 1),
        schedule_time: scheduleTime || '08:00',
        period_type: periodType || 'month',
        report_type: reportType || 'financial_summary',
        include_sections: typeof includeSections === 'string' ? JSON.parse(includeSections) : includeSections || [
          'income', 'expenses', 'balance', 'categories', 'budgets', 'variation'
        ],
        format: format || 'pdf',
        export_destination: exportDestination || 'email',
        recipient_email: recipientEmail,
        category_ids: typeof categoryIds === 'string' ? JSON.parse(categoryIds) : categoryIds || [],
        account_ids: typeof accountIds === 'string' ? JSON.parse(accountIds) : accountIds || [],
        is_active: isActive !== undefined ? Boolean(isActive) : true,
        last_run_at: null,
        next_run_at: nextRunAt || new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryStore.scheduled_reports.set(id, rep);
      return { rows: [rep], rowCount: 1 };
    }
    if (normalized.includes('update') && normalized.includes('last_run_at')) {
      const [lastRunAt, nextRunAt, reportId] = params;
      const rep = memoryStore.scheduled_reports.get(reportId);
      if (rep) {
        rep.last_run_at = lastRunAt;
        rep.next_run_at = nextRunAt;
        rep.updated_at = new Date().toISOString();
        memoryStore.scheduled_reports.set(reportId, rep);
        return { rows: [rep], rowCount: 1 };
      }
    }
    if (normalized.includes('update')) {
      const id = params[params.length - 1];
      const rep = memoryStore.scheduled_reports.get(id);
      if (rep) {
        // Actualizar campos
        if (params[0] !== undefined) rep.name = params[0];
        if (params[1] !== undefined) rep.frequency = params[1];
        if (params[2] !== undefined) rep.schedule_time = params[2];
        if (params[3] !== undefined) rep.is_active = Boolean(params[3]);
        if (params[4] !== undefined) rep.recipient_email = params[4];
        rep.updated_at = new Date().toISOString();
        memoryStore.scheduled_reports.set(id, rep);
        return { rows: [rep], rowCount: 1 };
      }
    }
    if (normalized.includes('delete from')) {
      const id = params[0];
      const rep = memoryStore.scheduled_reports.get(id);
      if (rep) {
        memoryStore.scheduled_reports.delete(id);
        return { rows: [rep], rowCount: 1 };
      }
    }
  }

  // 18. REPORT_EXECUTION_LOGS
  if (normalized.includes('report_execution_logs')) {
    if (normalized.includes('select')) {
      const uid = params[0];
      const logs = Array.from(memoryStore.report_execution_logs.values()).filter((l) => l.user_id === uid);
      logs.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
      return { rows: logs.slice(0, 50), rowCount: logs.length };
    }
    if (normalized.includes('insert into')) {
      const [reportId, userId, recipientEmail, format, status, fileName, fileSizeBytes, errorMessage, metadata] = params;
      const id = 'log_' + Math.random().toString(36).substr(2, 9);
      const log = {
        id,
        report_id: reportId || null,
        user_id: userId,
        generated_at: new Date().toISOString(),
        sent_at: status === 'success' ? new Date().toISOString() : null,
        recipient_email: recipientEmail,
        format: format || 'pdf',
        status: status || 'success',
        file_name: fileName || null,
        file_size_bytes: Number(fileSizeBytes || 0),
        error_message: errorMessage || null,
        metadata: typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {},
      };
      memoryStore.report_execution_logs.set(id, log);
      return { rows: [log], rowCount: 1 };
    }
  }

  // 19. USER_LICENSES & PLANS
  if (normalized.includes('user_licenses') || normalized.includes('plans')) {
    if (normalized.includes('select')) {
      const uid = params[0];
      let lic = memoryStore.user_licenses.get(uid);
      if (!lic) {
        // Licencia activa por defecto (Plan Pro completo para usuarios autorizados)
        lic = {
          user_id: uid,
          plan_id: 'pro',
          plan_name: 'FlowMoney Pro',
          status: 'active',
          valid_from: new Date().toISOString(),
          valid_until: null,
          features: {
            scheduled_reports: true,
            custom_alerts: true,
            email_delivery: true,
            excel_export: true,
            unlimited_categories: true,
            cloud_backup: true,
          },
        };
        memoryStore.user_licenses.set(uid, lic);
      }
      return { rows: [lic], rowCount: 1 };
    }
  }

  // 20. ADMIN_AUDIT_LOGS
  if (normalized.includes('admin_audit_logs')) {
    if (normalized.includes('count(*)')) {
      const count = memoryStore.admin_audit_logs.size;
      return { rows: [{ total: count }], rowCount: 1 };
    }
    if (normalized.includes('select')) {
      const logs = Array.from(memoryStore.admin_audit_logs.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const limit = Number(params[0] || 50);
      const offset = Number(params[1] || 0);
      const sliced = logs.slice(offset, offset + limit);
      return { rows: sliced, rowCount: sliced.length };
    }
    if (normalized.includes('insert into')) {
      const id = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const [actor_uid, actor_email, action, resource_type, resource_id, details, ip_address, status] = params;
      const entry = {
        id,
        actor_uid,
        actor_email: actor_email || null,
        action,
        resource_type,
        resource_id: resource_id || null,
        details: typeof details === 'string' ? JSON.parse(details) : details || {},
        ip_address: ip_address || null,
        status: status || 'success',
        created_at: new Date().toISOString(),
      };
      memoryStore.admin_audit_logs.set(id, entry);
      return { rows: [entry], rowCount: 1 };
    }
  }

  return { rows: [], rowCount: 0 };
}

/**
 * Inyecta datos de demostración en Cloud SQL exclusivamente cuando se entra en Modo Demo.
 */
async function seedDemoData(
  client: pg.PoolClient,
  userId: string,
  currency: string,
  mainAccountId: string,
  categoryMap: Map<string, string>
) {
  // 1. Asignar saldo de prueba a la cuenta principal del usuario demo
  await client.query('UPDATE public.accounts SET current_balance = 1450.00 WHERE id = $1', [mainAccountId]);

  // 2. Perfil de pareja simulado (Sofía Morales)
  const partnerId = 'usr_partner_sofia';
  await client.query(
    `INSERT INTO public.profiles (id, email, full_name, avatar_url, default_currency)
     VALUES ($1, 'sofia.morales@flowmoney.app', 'Sofía Morales', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80', $2)
     ON CONFLICT (id) DO NOTHING`,
    [partnerId, currency]
  );

  // 3. Crear grupo de pareja inicial
  const coupleGroupRes = await client.query(
    `INSERT INTO public.groups (name, description, type, currency, created_by)
     VALUES ('Finanzas con Sofía', 'Gastos compartidos del hogar y citas', 'couple', $1, $2)
     RETURNING id`,
    [currency, userId]
  );
  const coupleGroupId = coupleGroupRes.rows[0].id;
  await client.query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [
    coupleGroupId,
    userId,
    'admin',
  ]);
  await client.query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [
    coupleGroupId,
    partnerId,
    'member',
  ]);

  // 4. Crear grupo de viaje inicial
  const tripGroupRes = await client.query(
    `INSERT INTO public.groups (name, description, type, currency, created_by)
     VALUES ('Viaje a Bariloche', 'Cabaña, transporte y cenas grupales', 'trip', $1, $2)
     RETURNING id`,
    [currency, userId]
  );
  const tripGroupId = tripGroupRes.rows[0].id;
  await client.query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [
    tripGroupId,
    userId,
    'admin',
  ]);
  await client.query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [
    tripGroupId,
    partnerId,
    'member',
  ]);

  // 5. Suscripciones activas iniciales
  await client.query(
    `INSERT INTO public.subscriptions (user_id, name, amount, currency, billing_cycle, next_billing_date)
     VALUES ($1, 'Netflix 4K', 15.99, $2, 'monthly', CURRENT_DATE + INTERVAL '4 days'),
            ($1, 'Spotify Dúo', 12.00, $2, 'monthly', CURRENT_DATE + INTERVAL '12 days'),
            ($1, 'Gimnasio SmartFit', 35.00, $2, 'monthly', CURRENT_DATE + INTERVAL '2 days')`,
    [userId, currency]
  );

  // 6. Gastos iniciales y participaciones
  const exp1Res = await client.query(
    `INSERT INTO public.expenses (user_id, paid_by, account_id, category_id, amount, currency, description, expense_date, lens)
     VALUES ($1, $1, $2, $3, 85.50, $4, 'Supermercado semanal', CURRENT_DATE - INTERVAL '1 day', 'personal')
     RETURNING id`,
    [userId, mainAccountId, categoryMap.get('Comida'), currency]
  );

  await client.query(
    `INSERT INTO public.expenses (user_id, paid_by, account_id, category_id, amount, currency, description, expense_date, lens)
     VALUES ($1, $1, $2, $3, 32.00, $4, 'Carga de combustible', CURRENT_DATE - INTERVAL '3 days', 'personal')`,
    [userId, mainAccountId, categoryMap.get('Transporte'), currency]
  );

  const exp3Res = await client.query(
    `INSERT INTO public.expenses (user_id, paid_by, group_id, account_id, category_id, amount, currency, description, expense_date, lens)
     VALUES ($1, $1, $2, $3, $4, 90.00, $5, 'Cena de aniversario en Bistro', CURRENT_DATE, 'couple')
     RETURNING id`,
    [userId, coupleGroupId, mainAccountId, categoryMap.get('Comida'), currency]
  );
  await client.query(
    `INSERT INTO public.expense_shares (expense_id, user_id, owed_amount, percentage, is_settled)
     VALUES ($1, $2, 45.00, 50, false), ($1, $3, 45.00, 50, false)`,
    [exp3Res.rows[0].id, userId, partnerId]
  );

  const exp4Res = await client.query(
    `INSERT INTO public.expenses (user_id, paid_by, group_id, account_id, category_id, amount, currency, description, expense_date, lens)
     VALUES ($1, $1, $2, $3, $4, 120.00, $5, 'Combustible y peajes hacia cabaña', CURRENT_DATE - INTERVAL '1 day', 'group')
     RETURNING id`,
    [userId, tripGroupId, mainAccountId, categoryMap.get('Transporte'), currency]
  );
  await client.query(
    `INSERT INTO public.expense_shares (expense_id, user_id, owed_amount, percentage, is_settled)
     VALUES ($1, $2, 60.00, 50, false), ($1, $3, 60.00, 50, false)`,
    [exp4Res.rows[0].id, userId, partnerId]
  );
}

/**
 * Inyecta datos de demostración en el almacén en memoria para modo preview.
 */
function seedDemoDataInMemory(
  userId: string,
  currency: string,
  mainAccountId: string,
  categoryMap: Map<string, string>
) {
  // Ajustar saldo de prueba para usuario demo
  const acc = memoryStore.accounts.get(mainAccountId);
  if (acc) {
    acc.current_balance = 1450.0;
  }

  // Pareja demo y grupo de pareja
  const partnerId = 'usr_partner_sofia';
  memoryStore.profiles.set(partnerId, {
    id: partnerId,
    email: 'sofia.morales@flowmoney.app',
    full_name: 'Sofía Morales',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80',
    default_currency: currency,
    theme: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const coupleGroupId = 'grp_couple_sofia';
  memoryStore.groups.set(coupleGroupId, {
    id: coupleGroupId,
    name: 'Finanzas con Sofía',
    description: 'Gastos compartidos del hogar y citas',
    type: 'couple',
    currency: currency,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  memoryStore.group_members.set('gm_1', { id: 'gm_1', group_id: coupleGroupId, user_id: userId, role: 'admin', joined_at: new Date().toISOString() });
  memoryStore.group_members.set('gm_2', { id: 'gm_2', group_id: coupleGroupId, user_id: partnerId, role: 'member', joined_at: new Date().toISOString() });

  // Grupo de viaje
  const tripGroupId = 'grp_trip_bariloche';
  memoryStore.groups.set(tripGroupId, {
    id: tripGroupId,
    name: 'Viaje a Bariloche',
    description: 'Cabaña, transporte y cenas grupales',
    type: 'trip',
    currency: currency,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  memoryStore.group_members.set('gm_3', { id: 'gm_3', group_id: tripGroupId, user_id: userId, role: 'admin', joined_at: new Date().toISOString() });
  memoryStore.group_members.set('gm_4', { id: 'gm_4', group_id: tripGroupId, user_id: partnerId, role: 'member', joined_at: new Date().toISOString() });

  // Suscripciones activas
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 4);
  const nextTwoWeeks = new Date();
  nextTwoWeeks.setDate(nextTwoWeeks.getDate() + 12);

  memoryStore.subscriptions.set('sub_1', {
    id: 'sub_1',
    user_id: userId,
    name: 'Netflix 4K',
    amount: 15.99,
    currency: currency,
    billing_cycle: 'monthly',
    category_id: categoryMap.get('Suscripciones'),
    account_id: mainAccountId,
    start_date: '2026-01-01',
    next_billing_date: nextWeek.toISOString().slice(0, 10),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  memoryStore.subscriptions.set('sub_2', {
    id: 'sub_2',
    user_id: userId,
    name: 'Spotify Dúo',
    amount: 12.00,
    currency: currency,
    billing_cycle: 'monthly',
    category_id: categoryMap.get('Suscripciones'),
    account_id: mainAccountId,
    start_date: '2026-01-01',
    next_billing_date: nextTwoWeeks.toISOString().slice(0, 10),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  memoryStore.subscriptions.set('sub_3', {
    id: 'sub_3',
    user_id: userId,
    name: 'Gimnasio SmartFit',
    amount: 35.00,
    currency: currency,
    billing_cycle: 'monthly',
    category_id: categoryMap.get('Salud'),
    account_id: mainAccountId,
    start_date: '2026-01-01',
    next_billing_date: new Date().toISOString().slice(0, 10),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Gastos iniciales para demostración
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);

  const exp1Id = 'exp_seed_1';
  memoryStore.expenses.set(exp1Id, {
    id: exp1Id,
    user_id: userId,
    paid_by: userId,
    account_id: mainAccountId,
    category_id: categoryMap.get('Comida'),
    amount: 85.50,
    currency: currency,
    description: 'Supermercado semanal',
    expense_date: yesterday,
    lens: 'personal',
    created_at: yesterday,
  });

  const exp2Id = 'exp_seed_2';
  memoryStore.expenses.set(exp2Id, {
    id: exp2Id,
    user_id: userId,
    paid_by: userId,
    account_id: mainAccountId,
    category_id: categoryMap.get('Transporte'),
    amount: 32.00,
    currency: currency,
    description: 'Carga de combustible',
    expense_date: threeDaysAgo,
    lens: 'personal',
    created_at: threeDaysAgo,
  });

  const exp3Id = 'exp_seed_3';
  memoryStore.expenses.set(exp3Id, {
    id: exp3Id,
    user_id: userId,
    paid_by: userId,
    group_id: coupleGroupId,
    account_id: mainAccountId,
    category_id: categoryMap.get('Comida'),
    amount: 90.00,
    currency: currency,
    description: 'Cena de aniversario en Bistro',
    expense_date: today,
    lens: 'couple',
    created_at: today,
  });
  memoryStore.expense_shares.set('share_1', {
    id: 'share_1',
    expense_id: exp3Id,
    user_id: userId,
    owed_amount: 45.00,
    percentage: 50,
    is_settled: false,
  });
  memoryStore.expense_shares.set('share_2', {
    id: 'share_2',
    expense_id: exp3Id,
    user_id: partnerId,
    owed_amount: 45.00,
    percentage: 50,
    is_settled: false,
  });

  const exp4Id = 'exp_seed_4';
  memoryStore.expenses.set(exp4Id, {
    id: exp4Id,
    user_id: userId,
    paid_by: userId,
    group_id: tripGroupId,
    account_id: mainAccountId,
    category_id: categoryMap.get('Transporte'),
    amount: 120.00,
    currency: currency,
    description: 'Combustible y peajes hacia cabaña',
    expense_date: yesterday,
    lens: 'group',
    created_at: yesterday,
  });
  memoryStore.expense_shares.set('share_3', {
    id: 'share_3',
    expense_id: exp4Id,
    user_id: userId,
    owed_amount: 60.00,
    percentage: 50,
    is_settled: false,
  });
  memoryStore.expense_shares.set('share_4', {
    id: 'share_4',
    expense_id: exp4Id,
    user_id: partnerId,
    owed_amount: 60.00,
    percentage: 50,
    is_settled: false,
  });
}

/**
 * Operación transaccional para Upsert de Perfil en el primer inicio de sesión:
 * - Para usuario real: crea su perfil, las 8 categorías por defecto y la cuenta principal con saldo en 0.
 * - Para usuario demo: invoca adicionalmente seedDemoData para enriquecer la visualización de prueba.
 */
export async function upsertUserProfile(data: {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  default_currency?: string;
  is_demo?: boolean;
}) {
  const p = await getDbPool();

  if (p) {
    const client = await p.connect();
    try {
      await client.query('BEGIN');

      const existingRes = await client.query('SELECT * FROM public.profiles WHERE id = $1', [data.id]);
      let isNewUser = existingRes.rows.length === 0;
      let profile;

      if (isNewUser) {
        const insertProfileRes = await client.query(
          `INSERT INTO public.profiles (id, email, full_name, avatar_url, default_currency)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [data.id, data.email, data.full_name, data.avatar_url || null, data.default_currency || 'PEN']
        );
        profile = insertProfileRes.rows[0];

        // Insertar categorías por defecto (8 categorías canónicas)
        const categoryMap = new Map<string, string>();
        for (const cat of DEFAULT_CATEGORIES) {
          const catRes = await client.query(
            `INSERT INTO public.categories (user_id, name, icon, color, type, monthly_budget)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name`,
            [data.id, cat.name, cat.icon, cat.color, cat.type, cat.monthly_budget]
          );
          if (catRes.rows.length > 0) {
            categoryMap.set(catRes.rows[0].name, catRes.rows[0].id);
          }
        }

        // Cuenta bancaria inicial con saldo en 0.00 para usuario real
        const accRes = await client.query(
          `INSERT INTO public.accounts (user_id, name, type, currency, current_balance, color)
           VALUES ($1, 'Cuenta Principal', 'checking', $2, 0.00, '#4F46E5')
           RETURNING id`,
          [data.id, data.default_currency || 'PEN']
        );
        const mainAccountId = accRes.rows[0].id;

        // Solo inyectar datos ficticios si la sesión es expresamente modo demo
        if (data.is_demo) {
          await seedDemoData(client, data.id, data.default_currency || 'PEN', mainAccountId, categoryMap);
        }
      } else {
        const updateRes = await client.query(
          `UPDATE public.profiles
           SET full_name = COALESCE($2, full_name),
               avatar_url = COALESCE($3, avatar_url),
               default_currency = COALESCE($4, default_currency),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [data.id, data.full_name, data.avatar_url || null, data.default_currency]
        );
        profile = updateRes.rows[0];
      }

      const categoriesRes = await client.query(
        'SELECT * FROM public.categories WHERE user_id = $1 ORDER BY name ASC',
        [data.id]
      );
      const accountsRes = await client.query(
        'SELECT * FROM public.accounts WHERE user_id = $1 ORDER BY created_at ASC',
        [data.id]
      );

      // Auto-vincular invitaciones pendientes por email
      if (data.email) {
        try {
          const pendingInvs = await client.query(
            "SELECT * FROM public.group_invitations WHERE LOWER(email) = LOWER($1) AND status = 'pending'",
            [data.email]
          );
          for (const inv of pendingInvs.rows) {
            await client.query(
              `INSERT INTO public.group_members (group_id, user_id, role)
               VALUES ($1, $2, $3)
               ON CONFLICT (group_id, user_id) DO NOTHING`,
              [inv.group_id, data.id, inv.role || 'member']
            );
            await client.query(
              "UPDATE public.group_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = $1",
              [inv.id]
            );
          }
        } catch (invErr) {
          console.warn('[Cloud SQL] Aviso al vincular invitaciones pendientes:', invErr);
        }
      }

      await client.query('COMMIT');
      return { profile, categories: categoriesRes.rows, accounts: accountsRes.rows, isNewUser };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn('[Cloud SQL] Error en upsertUserProfile en PostgreSQL, usando almacenamiento local persistente:', err);
    } finally {
      client.release();
    }
  }

  // Almacén persistente (respaldado en disco en .data/flowmoney_store.json)
  let existingProfile = memoryStore.profiles.get(data.id);
  const isNewUser = !existingProfile;

  if (isNewUser) {
    existingProfile = {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      avatar_url: data.avatar_url || null,
      default_currency: data.default_currency || 'PEN',
      theme: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.profiles.set(data.id, existingProfile);

    // Insertar categorías
    const categoryMap = new Map<string, string>();
    for (const cat of DEFAULT_CATEGORIES) {
      const catId = 'cat_' + Math.random().toString(36).substr(2, 9);
      categoryMap.set(cat.name, catId);
      memoryStore.categories.set(catId, {
        id: catId,
        user_id: data.id,
        ...cat,
        created_at: new Date().toISOString(),
      });
    }

    // Cuenta inicial con saldo 0.00 para usuario real
    const accId = 'acc_' + Math.random().toString(36).substr(2, 9);
    memoryStore.accounts.set(accId, {
      id: accId,
      user_id: data.id,
      name: 'Cuenta Principal',
      type: 'checking',
      currency: data.default_currency || 'PEN',
      current_balance: 0.0,
      color: '#4F46E5',
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Solo inyectar datos de demostración si es modo demo
    if (data.is_demo) {
      seedDemoDataInMemory(data.id, data.default_currency || 'PEN', accId, categoryMap);
    }
  } else {
    existingProfile = {
      ...existingProfile,
      full_name: data.full_name || existingProfile.full_name,
      avatar_url: data.avatar_url !== undefined ? data.avatar_url : existingProfile.avatar_url,
      default_currency: data.default_currency || existingProfile.default_currency,
      updated_at: new Date().toISOString(),
    };
    memoryStore.profiles.set(data.id, existingProfile);
  }

  // Auto-vincular invitaciones pendientes por email en memoria
  if (data.email) {
    for (const [invId, inv] of memoryStore.group_invitations.entries()) {
      if (inv.email && inv.email.toLowerCase() === data.email.toLowerCase() && inv.status === 'pending') {
        inv.status = 'accepted';
        inv.accepted_at = new Date().toISOString();
        const memId = 'gm_' + Math.random().toString(36).substr(2, 9);
        memoryStore.group_members.set(memId, {
          id: memId,
          group_id: inv.group_id,
          user_id: data.id,
          role: inv.role || 'member',
          joined_at: new Date().toISOString(),
        });
        // Migrar shares asignados previamente al invitado pendiente
        for (const [sId, s] of memoryStore.expense_shares.entries()) {
          if (
            s.user_id === inv.id ||
            s.user_id === `inv_${inv.id}` ||
            s.user_id === `pending_${inv.id}`
          ) {
            s.user_id = data.id;
          }
        }
      }
    }
  }

  // Persistir en disco para que ningún reinicio o cambio borre datos
  persistStoreToDisk();

  const userCategories = Array.from(memoryStore.categories.values()).filter((c) => c.user_id === data.id);
  const userAccounts = Array.from(memoryStore.accounts.values()).filter((a) => a.user_id === data.id);

  return {
    profile: existingProfile,
    categories: userCategories,
    accounts: userAccounts,
    isNewUser,
  };
}

/**
 * Operación transaccional para eliminar completamente un perfil de usuario y todos sus datos asociados:
 * - Grupos donde es único miembro: se eliminan íntegramente.
 * - Grupos con co-miembros: se remueve al usuario y se reasigna la administración/autoría si correspondía.
 * - Categorías, cuentas, suscripciones, gastos personales y perfil.
 */
export async function deleteUserProfile(userId: string, force: boolean = false): Promise<{
  success: boolean;
  message: string;
  groupsWithBalance?: Array<{ id: string; name: string; balance: number }>;
}> {
  const p = await getDbPool();

  if (p) {
    const client = await p.connect();
    try {
      // 0. ANTES DE INICIAR LA TRANSACCIÓN (antes del BEGIN):
      // Obtener los grupos donde el usuario es miembro y verificar si tiene saldos pendientes
      const memberGroupsRes = await client.query(
        `SELECT g.id, g.name
         FROM public.group_members gm
         JOIN public.groups g ON g.id = gm.group_id
         WHERE gm.user_id = $1`,
        [userId]
      );

      const groupsWithBalance: Array<{ id: string; name: string; balance: number }> = [];

      for (const grp of memberGroupsRes.rows) {
        const balRes = await client.query(
          'SELECT * FROM public.calculate_group_balances($1)',
          [grp.id]
        );
        const userBalRow = balRes.rows.find((r: any) => r.user_id === userId);
        if (userBalRow) {
          const netBalance = Number(userBalRow.net_balance || 0);
          if (Math.abs(netBalance) > 0.01) {
            groupsWithBalance.push({
              id: grp.id,
              name: grp.name || 'Grupo',
              balance: Math.round(netBalance * 100) / 100,
            });
          }
        }
      }

      if (!force && groupsWithBalance.length > 0) {
        return {
          success: false,
          message:
            'No puedes eliminar tu cuenta porque tienes saldos pendientes en uno o más grupos. Salda tus deudas primero.',
          groupsWithBalance,
        };
      }

      await client.query('BEGIN');

      // 1. Obtener los IDs de grupos donde el usuario es miembro
      const groupIds = memberGroupsRes.rows.map((r: any) => r.id);

      for (const gid of groupIds) {
        // Contar miembros totales en el grupo
        const countRes = await client.query(
          'SELECT user_id FROM public.group_members WHERE group_id = $1',
          [gid]
        );
        const members = countRes.rows;
        const otherMembers = members.filter((m: any) => m.user_id !== userId);

        if (otherMembers.length === 0) {
          // El usuario es el único miembro: eliminar el grupo por completo
          await client.query('DELETE FROM public.groups WHERE id = $1', [gid]);
        } else {
          // Hay co-miembros: remover únicamente la membresía del usuario
          await client.query(
            'DELETE FROM public.group_members WHERE group_id = $1 AND user_id = $2',
            [gid, userId]
          );

          // Si el usuario era el creador del grupo, transferir created_by a uno de los miembros restantes
          await client.query(
            `UPDATE public.groups
             SET created_by = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND created_by = $3`,
            [otherMembers[0].user_id, gid, userId]
          );
        }
      }

      // También verificar si es created_by de algún grupo huérfano sin membresía
      const orphanGroupsRes = await client.query(
        'SELECT id FROM public.groups WHERE created_by = $1',
        [userId]
      );
      for (const og of orphanGroupsRes.rows) {
        const remainingMem = await client.query(
          'SELECT user_id FROM public.group_members WHERE group_id = $1 LIMIT 1',
          [og.id]
        );
        if (remainingMem.rows.length > 0) {
          await client.query('UPDATE public.groups SET created_by = $1 WHERE id = $2', [
            remainingMem.rows[0].user_id,
            og.id,
          ]);
        } else {
          await client.query('DELETE FROM public.groups WHERE id = $1', [og.id]);
        }
      }

      // 2. Eliminar settlements donde participe el usuario
      await client.query(
        'DELETE FROM public.settlements WHERE payer_id = $1 OR payee_id = $1',
        [userId]
      );

      // 3. Eliminar gastos creados o pagados por el usuario
      await client.query(
        'DELETE FROM public.expenses WHERE user_id = $1 OR paid_by = $1',
        [userId]
      );

      // 4. Eliminar suscripciones
      await client.query('DELETE FROM public.subscriptions WHERE user_id = $1', [userId]);

      // 5. Eliminar cuentas
      await client.query('DELETE FROM public.accounts WHERE user_id = $1', [userId]);

      // 6. Eliminar categorías
      await client.query('DELETE FROM public.categories WHERE user_id = $1', [userId]);

      // 7. Eliminar invitaciones creadas o vinculadas al usuario
      await client.query(
        'DELETE FROM public.group_invitations WHERE invited_by = $1',
        [userId]
      );

      // 8. Eliminar perfil
      const deleteProfileRes = await client.query(
        'DELETE FROM public.profiles WHERE id = $1 RETURNING id',
        [userId]
      );

      if (deleteProfileRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'Perfil no encontrado para eliminar' };
      }

      await client.query('COMMIT');
      return { success: true, message: 'Cuenta y datos asociados eliminados exitosamente' };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn('[Cloud SQL] Error en deleteUserProfile en PostgreSQL, usando almacenamiento local persistente:', err);
    } finally {
      client.release();
    }
  }

  // Fallback en memoria local para desarrollo
  // 0. Chequeo idéntico de saldos pendientes en memoria antes de borrar
  const userGroupMemberships = Array.from(memoryStore.group_members.entries()).filter(
    ([, gm]) => gm.user_id === userId
  );

  const memoryGroupsWithBalance: Array<{ id: string; name: string; balance: number }> = [];

  for (const [, gm] of userGroupMemberships) {
    const grp = memoryStore.groups.get(gm.group_id);
    const balRes = await runMemoryQuery('SELECT * FROM public.calculate_group_balances($1)', [gm.group_id]);
    const userBalRow = balRes.rows.find((r: any) => r.user_id === userId);
    if (userBalRow) {
      const netBalance = Number(userBalRow.net_balance || 0);
      if (Math.abs(netBalance) > 0.01) {
        memoryGroupsWithBalance.push({
          id: gm.group_id,
          name: grp?.name || 'Grupo',
          balance: Math.round(netBalance * 100) / 100,
        });
      }
    }
  }

  if (!force && memoryGroupsWithBalance.length > 0) {
    return {
      success: false,
      message:
        'No puedes eliminar tu cuenta porque tienes saldos pendientes en uno o más grupos. Salda tus deudas primero.',
      groupsWithBalance: memoryGroupsWithBalance,
    };
  }

  // 1. Grupos

  for (const [memId, gm] of userGroupMemberships) {
    const allMembersInGrp = Array.from(memoryStore.group_members.values()).filter(
      (m) => m.group_id === gm.group_id
    );
    const others = allMembersInGrp.filter((m) => m.user_id !== userId);

    if (others.length === 0) {
      // Eliminar grupo y todo lo asociado
      memoryStore.groups.delete(gm.group_id);
      memoryStore.group_members.delete(memId);
      for (const [expId, exp] of memoryStore.expenses.entries()) {
        if (exp.group_id === gm.group_id) {
          memoryStore.expenses.delete(expId);
        }
      }
    } else {
      memoryStore.group_members.delete(memId);
      const grp = memoryStore.groups.get(gm.group_id);
      if (grp && grp.created_by === userId) {
        grp.created_by = others[0].user_id;
      }
    }
  }

  // 2. Gastos personales
  for (const [expId, exp] of memoryStore.expenses.entries()) {
    if (exp.user_id === userId || exp.paid_by === userId) {
      memoryStore.expenses.delete(expId);
    }
  }

  // 3. Suscripciones
  for (const [subId, sub] of memoryStore.subscriptions.entries()) {
    if (sub.user_id === userId) {
      memoryStore.subscriptions.delete(subId);
    }
  }

  // 4. Cuentas
  for (const [accId, acc] of memoryStore.accounts.entries()) {
    if (acc.user_id === userId) {
      memoryStore.accounts.delete(accId);
    }
  }

  // 5. Categorías
  for (const [catId, cat] of memoryStore.categories.entries()) {
    if (cat.user_id === userId) {
      memoryStore.categories.delete(catId);
    }
  }

  // 6. Perfil
  memoryStore.profiles.delete(userId);

  return { success: true, message: 'Cuenta eliminada en memoria' };
}

/**
 * Operación para reiniciar todos los registros del usuario a 0 sin eliminar su cuenta:
 * - Elimina todos los gastos personales y compartidos asociados al usuario.
 * - Elimina todas las liquidaciones y deudas.
 * - Elimina todas las suscripciones fijas.
 * - Limpia o elimina grupos creados o membresías.
 * - Reemplaza cuentas bancarias por una nueva 'Cuenta Principal' con saldo 0.00 y moneda 'PEN'.
 * - Asegura las 8 categorías estándar con presupuestos configurados en Soles ('PEN').
 * - Actualiza el perfil del usuario fijando 'default_currency' en 'PEN' (Soles).
 */
export async function resetUserData(userId: string): Promise<{
  success: boolean;
  message: string;
  profile: any;
  accounts: any[];
  categories: any[];
}> {
  const p = await getDbPool();
  if (p) {
    const client = await p.connect();
    try {
      await client.query('BEGIN');

      // 1. Eliminar participaciones y gastos del usuario
      await client.query(
        `DELETE FROM public.expense_shares 
         WHERE user_id = $1 
            OR expense_id IN (SELECT id FROM public.expenses WHERE user_id = $1 OR paid_by = $1)`,
        [userId]
      );
      await client.query(
        `DELETE FROM public.expenses WHERE user_id = $1 OR paid_by = $1`,
        [userId]
      );

      // 2. Eliminar liquidaciones (settlements)
      await client.query(
        `DELETE FROM public.settlements WHERE payer_id = $1 OR payee_id = $1`,
        [userId]
      );

      // 3. Eliminar suscripciones
      await client.query(
        `DELETE FROM public.subscriptions WHERE user_id = $1`,
        [userId]
      );

      // 4. Limpiar invitaciones y grupos
      await client.query(
        `DELETE FROM public.group_invitations WHERE invited_by = $1`,
        [userId]
      );

      // Grupos creados por el usuario
      const grpRes = await client.query(
        `SELECT g.id, count(gm.id) as member_count
         FROM public.groups g
         JOIN public.group_members gm ON gm.group_id = g.id
         WHERE g.created_by = $1
         GROUP BY g.id`,
        [userId]
      );
      for (const row of grpRes.rows) {
        if (Number(row.member_count) <= 2) {
          await client.query('DELETE FROM public.group_members WHERE group_id = $1', [row.id]);
          await client.query('DELETE FROM public.groups WHERE id = $1', [row.id]);
        }
      }
      await client.query('DELETE FROM public.group_members WHERE user_id = $1', [userId]);

      // 5. Eliminar cuentas bancarias previas
      await client.query('DELETE FROM public.accounts WHERE user_id = $1', [userId]);

      // 6. Crear una nueva Cuenta Principal limpia en Soles (PEN) con balance 0.00
      const newAccRes = await client.query(
        `INSERT INTO public.accounts (user_id, name, type, currency, current_balance, color)
         VALUES ($1, 'Cuenta Principal', 'checking', 'PEN', 0.00, '#4F46E5')
         RETURNING *`,
        [userId]
      );

      // 7. Restablecer categorías estándar en Soles (PEN)
      const existingCatsRes = await client.query(
        'SELECT * FROM public.categories WHERE user_id = $1',
        [userId]
      );
      if (existingCatsRes.rows.length === 0) {
        for (const cat of DEFAULT_CATEGORIES) {
          await client.query(
            `INSERT INTO public.categories (user_id, name, icon, color, type, monthly_budget)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, cat.name, cat.icon, cat.color, cat.type, cat.monthly_budget]
          );
        }
      } else {
        // Actualizar presupuestos por defecto al estándar en Soles
        for (const cat of DEFAULT_CATEGORIES) {
          await client.query(
            `UPDATE public.categories 
             SET monthly_budget = $1 
             WHERE user_id = $2 AND name = $3`,
            [cat.monthly_budget, userId, cat.name]
          );
        }
      }

      // 8. Actualizar perfil fijando moneda por defecto en Soles ('PEN')
      const profRes = await client.query(
        `UPDATE public.profiles
         SET default_currency = 'PEN', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [userId]
      );

      const allCatsRes = await client.query(
        'SELECT * FROM public.categories WHERE user_id = $1 ORDER BY name ASC',
        [userId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Registros reiniciados exitosamente. Ahora puedes comenzar desde 0 en Soles (PEN).',
        profile: profRes.rows[0],
        accounts: newAccRes.rows,
        categories: allCatsRes.rows,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn('[Cloud SQL] Error en resetUserData en PostgreSQL, usando almacenamiento local persistente:', err);
    } finally {
      client.release();
    }
  }

  // Fallback en memoria local
  // 1. Gastos y participaciones
  for (const [expId, exp] of memoryStore.expenses.entries()) {
    if (exp.user_id === userId || exp.paid_by === userId) {
      memoryStore.expenses.delete(expId);
    }
  }
  for (const [sId, s] of memoryStore.expense_shares.entries()) {
    if (s.user_id === userId) {
      memoryStore.expense_shares.delete(sId);
    }
  }

  // 2. Liquidaciones (settlements)
  for (const [settId, s] of memoryStore.settlements.entries()) {
    if (s.payer_id === userId || s.payee_id === userId) {
      memoryStore.settlements.delete(settId);
    }
  }

  // 3. Suscripciones
  for (const [subId, sub] of memoryStore.subscriptions.entries()) {
    if (sub.user_id === userId) {
      memoryStore.subscriptions.delete(subId);
    }
  }

  // 4. Grupos (eliminar demo groups o grupos creados por el usuario)
  for (const [memId, gm] of memoryStore.group_members.entries()) {
    if (gm.user_id === userId) {
      memoryStore.group_members.delete(memId);
    }
  }
  for (const [grpId, grp] of memoryStore.groups.entries()) {
    if (grp.created_by === userId || grpId.startsWith('grp_couple_') || grpId.startsWith('grp_trip_')) {
      memoryStore.groups.delete(grpId);
    }
  }

  // 5. Cuentas: eliminar anteriores y crear una limpia con saldo 0.00 en Soles
  for (const [accId, acc] of memoryStore.accounts.entries()) {
    if (acc.user_id === userId) {
      memoryStore.accounts.delete(accId);
    }
  }
  const cleanAccId = 'acc_' + Math.random().toString(36).substr(2, 9);
  const cleanAcc = {
    id: cleanAccId,
    user_id: userId,
    name: 'Cuenta Principal',
    type: 'checking',
    currency: 'PEN',
    current_balance: 0.0,
    color: '#4F46E5',
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memoryStore.accounts.set(cleanAccId, cleanAcc);

  // 6. Categorías: asegurar las 8 estándar con presupuesto en Soles
  const existingCats = Array.from(memoryStore.categories.values()).filter((c) => c.user_id === userId);
  if (existingCats.length === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      const catId = 'cat_' + Math.random().toString(36).substr(2, 9);
      memoryStore.categories.set(catId, {
        id: catId,
        user_id: userId,
        ...cat,
        created_at: new Date().toISOString(),
      });
    }
  } else {
    for (const cat of existingCats) {
      const standard = DEFAULT_CATEGORIES.find((d) => d.name === cat.name);
      if (standard) {
        cat.monthly_budget = standard.monthly_budget;
      }
    }
  }

  // 7. Perfil: actualizar default_currency a PEN
  let prof = memoryStore.profiles.get(userId);
  if (prof) {
    prof = {
      ...prof,
      default_currency: 'PEN',
      updated_at: new Date().toISOString(),
    };
    memoryStore.profiles.set(userId, prof);
  }

  const finalCats = Array.from(memoryStore.categories.values()).filter((c) => c.user_id === userId);

  // Persistir cambios del reset inmediatamente
  persistStoreToDisk();

  return {
    success: true,
    message: 'Registros reiniciados exitosamente. Ahora puedes comenzar desde 0 en Soles (PEN).',
    profile: prof,
    accounts: [cleanAcc],
    categories: finalCats,
  };
}

