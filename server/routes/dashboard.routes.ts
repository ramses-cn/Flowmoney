import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

const router = Router();
router.use(requireFirebaseAuth);

/**
 * Helper para fechas y períodos del dashboard
 * Soporta: hoy, semana, mes, año, últimos 7 días, últimos 30 días, últimos 90 días, personalizado
 */
function getDateRangeForPeriod(period: string = 'month', customStart?: string, customEnd?: string) {
  const now = new Date();
  let startDate = '';
  let endDate = now.toISOString().slice(0, 10);
  let label = '';

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  switch (period) {
    case 'today': {
      startDate = endDate;
      label = `Hoy, ${now.getDate()} de ${monthNames[now.getMonth()]}`;
      break;
    }
    case 'week': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Lunes como inicio
      const monday = new Date(now.setDate(diff));
      startDate = monday.toISOString().slice(0, 10);
      endDate = new Date().toISOString().slice(0, 10);
      label = `Esta semana (${startDate} al ${endDate})`;
      break;
    }
    case 'last_7_days': {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 6);
      startDate = past7.toISOString().slice(0, 10);
      label = 'Últimos 7 días';
      break;
    }
    case 'last_30_days': {
      const past30 = new Date();
      past30.setDate(past30.getDate() - 29);
      startDate = past30.toISOString().slice(0, 10);
      label = 'Últimos 30 días';
      break;
    }
    case 'last_90_days': {
      const past90 = new Date();
      past90.setDate(past90.getDate() - 89);
      startDate = past90.toISOString().slice(0, 10);
      label = 'Últimos 90 días';
      break;
    }
    case 'year': {
      const y = now.getFullYear();
      startDate = `${y}-01-01`;
      endDate = `${y}-12-31`;
      label = `Año ${y}`;
      break;
    }
    case 'custom': {
      startDate = customStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      endDate = customEnd || now.toISOString().slice(0, 10);
      label = `Periodo: ${startDate} al ${endDate}`;
      break;
    }
    case 'month':
    default: {
      const year = now.getFullYear();
      const month = now.getMonth();
      startDate = new Date(year, month, 1).toISOString().slice(0, 10);
      const lastDay = new Date(year, month + 1, 0);
      endDate = lastDay.toISOString().slice(0, 10);
      label = `${monthNames[month]} ${year}`;
      break;
    }
  }

  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const diffTime = Math.abs(endD.getTime() - startD.getTime());
  const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
  const currentDay = Math.min(totalDays, Math.max(1, Math.ceil((new Date().getTime() - startD.getTime()) / (1000 * 60 * 60 * 24))));
  const daysRemaining = Math.max(0, totalDays - currentDay);

  return { startDate, endDate, totalDays, currentDay, daysRemaining, monthLabel: label };
}

function getMonthDateRange() {
  return getDateRangeForPeriod('month');
}

/**
 * GET /api/dashboard/personal
 * Datos para el Lente Personal:
 * - Saldo del mes (gastado vs presupuesto mensual, barra de progreso)
 * - Presupuestos por categoría (barras individuales)
 * - Últimos gastos (3-5)
 * - Suscripciones activas
 */
router.get('/personal', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const period = (req.query.period as string) || 'month';
    const customStart = req.query.startDate as string | undefined;
    const customEnd = req.query.endDate as string | undefined;
    const categoryIdFilter = req.query.categoryId as string | undefined;
    const accountIdFilter = req.query.accountId as string | undefined;

    const { startDate, endDate, totalDays, currentDay, daysRemaining, monthLabel } = getDateRangeForPeriod(
      period,
      customStart,
      customEnd
    );

    // 1. Obtener categorías activas con sus presupuestos
    const catRes = await query(
      'SELECT id, name, icon, color, type, monthly_budget FROM public.categories WHERE user_id = $1 AND is_active = true ORDER BY monthly_budget DESC, name ASC',
      [uid]
    );
    const categories = catRes.rows;

    // 2. Obtener gastos del período para el usuario con filtros dinámicos
    let expensesSql = `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
       FROM public.expenses e
       LEFT JOIN public.categories c ON c.id = e.category_id
       LEFT JOIN public.accounts a ON a.id = e.account_id
       WHERE (e.user_id = $1 OR e.paid_by = $1)
         AND e.expense_date >= $2 AND e.expense_date <= $3`;
    const filterParams: any[] = [uid, startDate, endDate];

    if (categoryIdFilter && categoryIdFilter !== 'all') {
      filterParams.push(categoryIdFilter);
      expensesSql += ` AND e.category_id = $${filterParams.length}`;
    }
    if (accountIdFilter && accountIdFilter !== 'all') {
      filterParams.push(accountIdFilter);
      expensesSql += ` AND e.account_id = $${filterParams.length}`;
    }

    expensesSql += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    const expensesRes = await query(expensesSql, filterParams);
    const monthExpenses = expensesRes.rows;

    // Calcular gastos por categoría
    const spentByCategoryMap = new Map<string, number>();
    let totalSpentMonth = 0;

    for (const exp of monthExpenses) {
      const amt = Number(exp.amount || 0);
      totalSpentMonth += amt;
      if (exp.category_id) {
        const prev = spentByCategoryMap.get(exp.category_id) || 0;
        spentByCategoryMap.set(exp.category_id, prev + amt);
      }
    }

    // Presupuesto mensual total
    const totalBudgetMonth = categories.reduce(
      (sum, cat) => sum + Number(cat.monthly_budget || 0),
      0
    );

    const categoriesWithSpent = categories.map((cat) => {
      const spent = spentByCategoryMap.get(cat.id) || 0;
      const budget = Number(cat.monthly_budget || 0);
      const percentage = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 150) : 0;
      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        monthly_budget: budget,
        spent: spent,
        remaining: Math.max(0, budget - spent),
        is_over: spent > budget && budget > 0,
        percentage,
      };
    });

    // 3. Últimos gastos del usuario en el rango
    const recentExpenses = monthExpenses.slice(0, 10);

    // 4. Suscripciones activas
    const subsRes = await query(
      `SELECT s.*, c.name as category_name, c.color as category_color
       FROM public.subscriptions s
       LEFT JOIN public.categories c ON c.id = s.category_id
       WHERE s.user_id = $1 AND s.status = 'active'
       ORDER BY s.amount DESC`,
      [uid]
    );

    const totalSubscriptionsMonthly = subsRes.rows.reduce((sum, s) => {
      const amt = Number(s.amount || 0);
      if (s.billing_cycle === 'yearly') return sum + amt / 12;
      if (s.billing_cycle === 'weekly') return sum + amt * 4;
      return sum + amt;
    }, 0);

    return res.json({
      period,
      startDate,
      endDate,
      monthLabel,
      totalSpent: totalSpentMonth,
      totalBudget: totalBudgetMonth,
      budgetProgress: totalBudgetMonth > 0 ? Math.min(Math.round((totalSpentMonth / totalBudgetMonth) * 100), 100) : 0,
      daysRemaining,
      totalDays,
      currentDay,
      dailyAverage: currentDay > 0 ? totalSpentMonth / currentDay : 0,
      categories: categoriesWithSpent,
      recentExpenses,
      subscriptions: subsRes.rows,
      totalSubscriptionsMonthly,
    });
  } catch (error: any) {
    console.error('[Dashboard Personal GET Error]:', error);
    return res.status(500).json({ error: 'Error obteniendo datos del lente personal', message: error.message });
  }
});

/**
 * GET /api/dashboard/preferences
 * Obtiene las preferencias de widgets y periodo del usuario
 */
router.get('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const prefRes = await query(
      'SELECT default_period, widgets FROM public.user_dashboard_preferences WHERE user_id = $1',
      [uid]
    );

    const defaultWidgets = [
      { id: 'balance', enabled: true, order: 1 },
      { id: 'income', enabled: true, order: 2 },
      { id: 'expenses', enabled: true, order: 3 },
      { id: 'savings', enabled: true, order: 4 },
      { id: 'budget', enabled: true, order: 5 },
      { id: 'recent_expenses', enabled: true, order: 6 },
      { id: 'categories', enabled: true, order: 7 },
      { id: 'upcoming_payments', enabled: true, order: 8 },
      { id: 'alerts', enabled: true, order: 9 },
      { id: 'subscriptions', enabled: true, order: 10 },
      { id: 'debts', enabled: true, order: 11 },
    ];

    if (prefRes.rows.length === 0) {
      return res.json({
        preferences: {
          default_period: 'month',
          widgets: defaultWidgets,
        },
      });
    }

    const row = prefRes.rows[0];
    const widgets = Array.isArray(row.widgets)
      ? row.widgets
      : (typeof row.widgets === 'string' ? JSON.parse(row.widgets) : defaultWidgets);

    return res.json({
      preferences: {
        default_period: row.default_period || 'month',
        widgets: widgets.length > 0 ? widgets : defaultWidgets,
      },
    });
  } catch (error: any) {
    console.error('[Dashboard Preferences GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener preferencias', message: error.message });
  }
});

/**
 * PUT /api/dashboard/preferences
 * Guarda las preferencias de widgets y periodo por usuario
 */
router.put('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { default_period, widgets } = req.body;

    const period = default_period || 'month';
    const widgetsJson = JSON.stringify(widgets || []);

    await query(
      `INSERT INTO public.user_dashboard_preferences (user_id, default_period, widgets, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET default_period = EXCLUDED.default_period,
                     widgets = EXCLUDED.widgets,
                     updated_at = CURRENT_TIMESTAMP`,
      [uid, period, widgetsJson]
    );

    return res.json({
      success: true,
      message: 'Preferencias de dashboard guardadas correctamente',
      preferences: {
        default_period: period,
        widgets: widgets || [],
      },
    });
  } catch (error: any) {
    console.error('[Dashboard Preferences PUT Error]:', error);
    return res.status(500).json({ error: 'Error al guardar preferencias', message: error.message });
  }
});

/**
 * GET /api/dashboard/couple
 * Datos para el Lente Pareja:
 * - Balance neto (quién debe a quién)
 * - Gastos compartidos recientes
 * - "Mi dinero" (gastos personales dentro de la relación para transparencia)
 */
router.get('/couple', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;

    // 1. Buscar grupo de tipo couple
    const groupRes = await query(
      `SELECT g.*
       FROM public.groups g
       JOIN public.group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1 AND g.type = 'couple'
       LIMIT 1`,
      [uid]
    );

    let coupleGroup = groupRes.rows[0] || null;
    let partnerInfo = null;
    let netBalance = 0;
    let partnerOwesMe = 0;
    let iOwePartner = 0;
    let sharedExpenses: any[] = [];

    if (coupleGroup) {
      // Buscar información de la pareja en el grupo
      const partnerRes = await query(
        `SELECT p.id, p.full_name, p.email, p.avatar_url
         FROM public.group_members gm
         JOIN public.profiles p ON p.id = gm.user_id
         WHERE gm.group_id = $1 AND gm.user_id != $2
         LIMIT 1`,
        [coupleGroup.id, uid]
      );
      partnerInfo = partnerRes.rows[0] || null;

      // Obtener balance del grupo
      const balanceRes = await query('SELECT * FROM public.calculate_group_balances($1)', [coupleGroup.id]);
      const myBalanceRow = balanceRes.rows.find((r: any) => r.user_id === uid);
      if (myBalanceRow) {
        netBalance = Number(myBalanceRow.net_balance || 0);
        if (netBalance > 0) {
          partnerOwesMe = netBalance;
        } else {
          iOwePartner = Math.abs(netBalance);
        }
      }

      // Gastos compartidos de este grupo / lente
      const sharedRes = await query(
        `SELECT e.*, c.name as category_name, c.color as category_color, p.full_name as paid_by_name
         FROM public.expenses e
         LEFT JOIN public.categories c ON c.id = e.category_id
         LEFT JOIN public.profiles p ON p.id = e.paid_by
         WHERE (e.group_id = $1 OR e.lens = 'couple')
         ORDER BY e.expense_date DESC, e.created_at DESC
         LIMIT 8`,
        [coupleGroup.id]
      );
      sharedExpenses = sharedRes.rows;
    } else {
      // Si aún no tiene grupo de pareja creado, buscar gastos con lens='couple'
      const sharedRes = await query(
        `SELECT e.*, c.name as category_name, c.color as category_color, p.full_name as paid_by_name
         FROM public.expenses e
         LEFT JOIN public.categories c ON c.id = e.category_id
         LEFT JOIN public.profiles p ON p.id = e.paid_by
         WHERE e.lens = 'couple' AND (e.user_id = $1 OR e.paid_by = $1)
         ORDER BY e.expense_date DESC, e.created_at DESC
         LIMIT 8`,
        [uid]
      );
      sharedExpenses = sharedRes.rows;
    }

    // "Mi dinero" (gastos con lens='personal' del usuario para transparencia en la relación)
    const myPersonalExpensesRes = await query(
      `SELECT e.*, c.name as category_name, c.color as category_color
       FROM public.expenses e
       LEFT JOIN public.categories c ON c.id = e.category_id
       WHERE e.user_id = $1 AND e.lens = 'personal'
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT 5`,
      [uid]
    );

    const myPersonalTotal = myPersonalExpensesRes.rows.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    return res.json({
      hasCoupleGroup: !!coupleGroup,
      coupleGroup,
      partnerInfo,
      netBalance,
      partnerOwesMe,
      iOwePartner,
      sharedExpenses,
      myPersonalExpenses: myPersonalExpensesRes.rows,
      myPersonalTotal,
    });
  } catch (error: any) {
    console.error('[Dashboard Couple GET Error]:', error);
    return res.status(500).json({ error: 'Error obteniendo datos del lente pareja', message: error.message });
  }
});

/**
 * GET /api/dashboard/groups
 * Datos para el Lente Grupos:
 * - Resumen total (me deben - debo)
 * - Lista de mis grupos con saldo neto de cada uno
 * - Accesos rápidos para simplificar deudas y crear grupo
 */
router.get('/groups', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;

    // 1. Obtener todos los grupos del usuario
    const groupsRes = await query(
      `SELECT g.*, gm.role as user_role,
              (SELECT COUNT(*) FROM public.group_members WHERE group_id = g.id) as members_count
       FROM public.groups g
       JOIN public.group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.updated_at DESC`,
      [uid]
    );

    const groups = groupsRes.rows;
    let totalOwedToMe = 0;
    let totalIOwe = 0;
    const currencyTotals: Record<string, { owedToMe: number; iOwe: number }> = {};
    const groupsWithBalances = [];

    for (const group of groups) {
      let groupNetBalance = 0;
      const gCurr = group.currency || 'PEN';
      if (!currencyTotals[gCurr]) {
        currencyTotals[gCurr] = { owedToMe: 0, iOwe: 0 };
      }

      try {
        const balRes = await query('SELECT * FROM public.calculate_group_balances($1)', [group.id]);
        const myBal = balRes.rows.find((r: any) => r.user_id === uid);
        if (myBal) {
          groupNetBalance = Number(myBal.net_balance || 0);
          if (groupNetBalance > 0) {
            totalOwedToMe += groupNetBalance;
            currencyTotals[gCurr].owedToMe += groupNetBalance;
          } else if (groupNetBalance < 0) {
            totalIOwe += Math.abs(groupNetBalance);
            currencyTotals[gCurr].iOwe += Math.abs(groupNetBalance);
          }
        }
      } catch (e) {
        console.warn('Error calculando balance para grupo', group.id, e);
      }

      groupsWithBalances.push({
        ...group,
        net_balance: groupNetBalance,
      });
    }

    const netSummary = totalOwedToMe - totalIOwe;
    const currenciesUsed = Object.keys(currencyTotals);
    const dominantCurrency = currenciesUsed.length === 1 ? currenciesUsed[0] : (groups[0]?.currency || 'PEN');

    return res.json({
      totalOwedToMe,
      totalIOwe,
      netSummary,
      currencyTotals,
      dominantCurrency,
      groups: groupsWithBalances,
    });
  } catch (error: any) {
    console.error('[Dashboard Groups GET Error]:', error);
    return res.status(500).json({ error: 'Error obteniendo datos del lente grupos', message: error.message });
  }
});

/**
 * GET /api/dashboard/alerts
 * Alertas inteligentes calculadas a partir de datos reales del backend
 */
router.get('/alerts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { startDate, endDate } = getMonthDateRange();

    // Obtener la moneda del perfil del usuario para coherencia absoluta
    const profileRes = await query('SELECT default_currency FROM public.profiles WHERE id = $1', [uid]);
    const userCurrency = profileRes.rows[0]?.default_currency || 'PEN';

    const alerts: Array<{
      id: string;
      type: 'warning' | 'danger' | 'info' | 'success';
      title: string;
      message: string;
      actionUrl?: string;
      actionLabel?: string;
      targetTab?: 'home' | 'expenses' | 'groups' | 'profile';
      targetLens?: 'personal' | 'couple' | 'group';
      targetGroupId?: string;
    }> = [];

    // 1. Alertas de presupuestos dinámicas configuradas por el usuario (ALERT_RULES)
    const alertRulesRes = await query(
      'SELECT * FROM public.alert_rules WHERE user_id = $1 AND is_active = true AND notify_in_app = true ORDER BY threshold_percent DESC',
      [uid]
    );

    const catRes = await query(
      `SELECT c.id, c.name, c.monthly_budget,
              COALESCE(SUM(e.amount), 0) as total_spent
       FROM public.categories c
       LEFT JOIN public.expenses e ON e.category_id = c.id
            AND e.expense_date >= $2 AND e.expense_date <= $3
       WHERE c.user_id = $1 AND c.monthly_budget > 0
       GROUP BY c.id, c.name, c.monthly_budget`,
      [uid, startDate, endDate]
    );

    // Calcular gasto total y presupuesto global
    let totalSpent = 0;
    let totalBudget = 0;
    const catMap = new Map<string, any>();
    for (const cat of catRes.rows) {
      totalSpent += Number(cat.total_spent || 0);
      totalBudget += Number(cat.monthly_budget || 0);
      catMap.set(cat.id, cat);
    }

    if (alertRulesRes.rows.length > 0) {
      // Usar reglas configuradas por el usuario
      for (const rule of alertRulesRes.rows) {
        let budget = 0;
        let spent = 0;
        let name = 'Presupuesto Total';
        let categoryId = rule.category_id;

        if (categoryId) {
          const c = catMap.get(categoryId);
          if (!c) continue;
          budget = Number(c.monthly_budget || 0);
          spent = Number(c.total_spent || 0);
          name = c.name;
        } else {
          budget = totalBudget;
          spent = totalSpent;
        }

        if (budget <= 0) continue;
        const currentPercent = Math.round((spent / budget) * 100);
        const threshold = Number(rule.threshold_percent);

        if (currentPercent >= threshold) {
          const isExcess = threshold >= 100;
          const remaining = (budget - spent).toFixed(2);
          const excess = (spent - budget).toFixed(2);

          alerts.push({
            id: `rule-${rule.id}-${threshold}`,
            type: isExcess ? 'danger' : threshold >= 80 ? 'warning' : 'info',
            title: isExcess
              ? `Límite superado en ${name} (${currentPercent}%)`
              : `Alerta de presupuesto (${threshold}%): ${name}`,
            message: isExcess
              ? `Has superado tu presupuesto en ${userCurrency} ${excess} (${currentPercent}% de la meta).`
              : `Consumido el ${currentPercent}% de ${name}. Te restan ${userCurrency} ${remaining} para este período.`,
            actionLabel: 'Ver detalle',
            actionUrl: '/expenses',
            targetTab: 'expenses',
            targetLens: 'personal',
          });
        }
      }
    } else {
      // Fallback predeterminado si el usuario aún no configuró reglas
      for (const cat of catRes.rows) {
        const budget = Number(cat.monthly_budget);
        const spent = Number(cat.total_spent);

        if (spent >= budget) {
          alerts.push({
            id: `budget-over-${cat.id}`,
            type: 'danger',
            title: `Límite superado en ${cat.name}`,
            message: `Has superado tu presupuesto mensual por ${userCurrency} ${(spent - budget).toFixed(2)}.`,
            actionLabel: 'Ver gastos',
            actionUrl: '/expenses',
            targetTab: 'expenses',
            targetLens: 'personal',
          });
        } else if (spent >= budget * 0.8) {
          const remaining = (budget - spent).toFixed(2);
          alerts.push({
            id: `budget-warn-${cat.id}`,
            type: 'warning',
            title: `Presupuesto de ${cat.name}`,
            message: `Te quedan solo ${userCurrency} ${remaining} para este mes (${Math.round((spent / budget) * 100)}% consumido).`,
            actionLabel: 'Ver gastos',
            actionUrl: '/expenses',
            targetTab: 'expenses',
            targetLens: 'personal',
          });
        }
      }
    }

    // 2. Alertas de balances en grupos y parejas (quién te debe o si debes)
    const groupsRes = await query(
      `SELECT g.id, g.name, g.type, g.currency
       FROM public.groups g
       JOIN public.group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1`,
      [uid]
    );

    for (const grp of groupsRes.rows) {
      try {
        const balRes = await query('SELECT * FROM public.calculate_group_balances($1)', [grp.id]);
        const myBal = balRes.rows.find((r: any) => r.user_id === uid);
        if (myBal) {
          const net = Number(myBal.net_balance || 0);
          const isCouple = grp.type === 'couple';
          if (net > 0) {
            alerts.push({
              id: `group-owed-${grp.id}`,
              type: 'info',
              title: isCouple ? `Saldo a tu favor con tu pareja` : `Saldo a tu favor en ${grp.name}`,
              message: `Te deben ${grp.currency} ${net.toFixed(2)} en ${grp.name}.`,
              actionLabel: isCouple ? 'Ver en Pareja' : 'Ver grupo',
              actionUrl: isCouple ? '/couple' : '/groups',
              targetTab: isCouple ? 'home' : 'groups',
              targetLens: isCouple ? 'couple' : 'group',
              targetGroupId: grp.id,
            });
          } else if (net < -5) {
            alerts.push({
              id: `group-owe-${grp.id}`,
              type: 'warning',
              title: isCouple ? `Saldo pendiente con tu pareja` : `Saldo pendiente en ${grp.name}`,
              message: `Tienes un saldo pendiente de ${grp.currency} ${Math.abs(net).toFixed(2)} en ${grp.name}.`,
              actionLabel: isCouple ? 'Saldar en Pareja' : 'Ver deudas de grupo',
              actionUrl: isCouple ? '/couple' : '/groups',
              targetTab: isCouple ? 'home' : 'groups',
              targetLens: isCouple ? 'couple' : 'group',
              targetGroupId: grp.id,
            });
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 3. Suscripciones con cobro en los próximos días
    const subRes = await query(
      `SELECT name, amount, currency, next_billing_date
       FROM public.subscriptions
       WHERE user_id = $1 AND status = 'active' AND next_billing_date IS NOT NULL
       ORDER BY next_billing_date ASC
       LIMIT 2`,
      [uid]
    );

    for (const sub of subRes.rows) {
      if (sub.next_billing_date) {
        const diffDays = Math.ceil(
          (new Date(sub.next_billing_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays >= 0 && diffDays <= 5) {
          alerts.push({
            id: `sub-renewal-${sub.name}`,
            type: 'info',
            title: `Próximo cobro de ${sub.name}`,
            message: `Cobro programado de ${sub.currency} ${Number(sub.amount).toFixed(2)} en ${diffDays === 0 ? 'hoy' : `${diffDays} días`}.`,
            actionLabel: 'Ver suscripciones',
            actionUrl: '/profile',
            targetTab: 'profile',
            targetLens: 'personal',
          });
        }
      }
    }

    return res.json({ alerts });
  } catch (error: any) {
    console.error('[Dashboard Alerts GET Error]:', error);
    return res.status(500).json({ error: 'Error obteniendo alertas inteligentes', message: error.message });
  }
});

export default router;
