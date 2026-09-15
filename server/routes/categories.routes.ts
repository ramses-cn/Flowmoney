import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

const router = Router();
router.use(requireFirebaseAuth);

/**
 * GET /api/categories
 * Obtiene las categorías del usuario.
 * Query param: ?all=true para obtener tanto activas como inactivas (para la vista de gestión).
 * Por defecto, solo devuelve las activas para mantener interfaces limpias.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const includeAll = req.query.all === 'true' || req.query.include_inactive === 'true';

    let sql = 'SELECT id, user_id, name, icon, color, type, monthly_budget, is_active, is_custom, sort_order, created_at FROM public.categories WHERE user_id = $1';
    if (!includeAll) {
      sql += ' AND is_active = true';
    }
    sql += ' ORDER BY sort_order ASC, name ASC';

    const result = await query(sql, [uid]);
    return res.json({ categories: result.rows });
  } catch (error: any) {
    console.error('[API Categories GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener categorías', message: error.message });
  }
});

/**
 * POST /api/categories
 * Crea una nueva categoría personalizada para el usuario
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { name, icon, color, type, monthly_budget } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
    }

    const trimmedName = name.trim();
    const categoryIcon = (icon && typeof icon === 'string' && icon.trim()) ? icon.trim() : 'tag';
    const categoryColor = (color && typeof color === 'string' && color.trim()) ? color.trim() : '#6366F1';
    const categoryType = type === 'income' ? 'income' : 'expense';
    const budgetNum = Math.max(0, Number(monthly_budget || 0));

    // Obtener el mayor sort_order para agregar al final
    const existingCats = await query(
      'SELECT id, sort_order FROM public.categories WHERE user_id = $1',
      [uid]
    );
    const maxOrder = existingCats.rows.reduce((max: number, c: any) => Math.max(max, Number(c.sort_order || 0)), 0);
    const newSortOrder = maxOrder + 1;

    const insertResult = await query(
      `INSERT INTO public.categories (user_id, name, icon, color, type, monthly_budget, is_active, is_custom, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [uid, trimmedName, categoryIcon, categoryColor, categoryType, budgetNum, true, true, newSortOrder]
    );

    return res.status(201).json({
      success: true,
      category: insertResult.rows[0],
      message: 'Categoría personalizada creada exitosamente',
    });
  } catch (error: any) {
    console.error('[API Categories POST Error]:', error);
    return res.status(500).json({ error: 'Error al crear la categoría', message: error.message });
  }
});

/**
 * PUT /api/categories/:id
 * Actualiza los datos de una categoría (nombre, ícono, color, presupuesto)
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { name, icon, color, monthly_budget } = req.body;

    const budgetNum = monthly_budget !== undefined ? Math.max(0, Number(monthly_budget)) : undefined;

    const result = await query(
      `UPDATE public.categories
       SET name = COALESCE($1, name),
           icon = COALESCE($2, icon),
           color = COALESCE($3, color),
           monthly_budget = COALESCE($4, monthly_budget)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name ? name.trim() : null, icon || null, color || null, budgetNum, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada o no pertenece al usuario' });
    }

    return res.json({
      success: true,
      category: result.rows[0],
      message: 'Categoría actualizada exitosamente',
    });
  } catch (error: any) {
    console.error('[API Categories PUT Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar categoría', message: error.message });
  }
});

/**
 * PATCH /api/categories/:id/toggle
 * Activa o desactiva la visibilidad de una categoría para el usuario
 */
router.patch('/:id/toggle', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'El campo is_active (booleano) es requerido' });
    }

    const result = await query(
      'UPDATE public.categories SET is_active = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [is_active, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada o no pertenece al usuario' });
    }

    return res.json({
      success: true,
      category: result.rows[0],
      message: is_active ? 'Categoría activada correctamente' : 'Categoría desactivada correctamente',
    });
  } catch (error: any) {
    console.error('[API Categories PATCH Toggle Error]:', error);
    return res.status(500).json({ error: 'Error al cambiar estado de la categoría', message: error.message });
  }
});

/**
 * PUT /api/categories/reorder
 * Actualiza el orden (sort_order) de una lista de categorías del usuario
 */
router.put('/reorder', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'Se requiere una lista de orderedIds' });
    }

    for (let index = 0; index < orderedIds.length; index++) {
      const catId = orderedIds[index];
      await query(
        'UPDATE public.categories SET sort_order = $1 WHERE id = $2 AND user_id = $3',
        [index + 1, catId, uid]
      );
    }

    return res.json({ success: true, message: 'Orden de categorías guardado correctamente' });
  } catch (error: any) {
    console.error('[API Categories Reorder Error]:', error);
    return res.status(500).json({ error: 'Error al reordenar categorías', message: error.message });
  }
});

/**
 * DELETE /api/categories/:id
 * Elimina una categoría personalizada del usuario
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    // Verificar si la categoría pertenece al usuario
    const checkRes = await query(
      'SELECT id, is_custom, name FROM public.categories WHERE id = $1 AND user_id = $2',
      [id, uid]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const cat = checkRes.rows[0];
    if (!cat.is_custom) {
      // Las categorías de sistema se desactivan en lugar de destruirse para conservar integridad histórica
      await query(
        'UPDATE public.categories SET is_active = false WHERE id = $1 AND user_id = $2',
        [id, uid]
      );
      return res.json({
        success: true,
        message: 'Las categorías del sistema se desactivan para mantener consistencia histórica.',
        wasDeactivated: true,
      });
    }

    // Eliminar categoría personalizada
    await query('DELETE FROM public.categories WHERE id = $1 AND user_id = $2', [id, uid]);

    return res.json({
      success: true,
      message: 'Categoría personalizada eliminada exitosamente',
    });
  } catch (error: any) {
    console.error('[API Categories DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar la categoría', message: error.message });
  }
});

/**
 * PUT /api/categories/:id/budget
 * Actualiza el presupuesto mensual de una categoría específica
 */
router.put('/:id/budget', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { monthly_budget } = req.body;

    if (monthly_budget === undefined || monthly_budget === null || isNaN(Number(monthly_budget))) {
      return res.status(400).json({ error: 'El monto de presupuesto mensual es requerido y debe ser un número' });
    }

    const budgetNum = Math.max(0, Number(monthly_budget));

    const result = await query(
      'UPDATE public.categories SET monthly_budget = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [budgetNum, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada o no pertenece al usuario' });
    }

    return res.json({
      success: true,
      category: result.rows[0],
      message: 'Presupuesto actualizado correctamente',
    });
  } catch (error: any) {
    console.error('[API Categories PUT Budget Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar presupuesto', message: error.message });
  }
});

/**
 * GET /api/categories/spending
 * Retorna la distribución real de gasto por categoría para gráfico de dona y presupuestos.
 * Solo incluye categorías activas para respetar la preferencia del usuario.
 */
router.get('/spending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const startOfMonth = req.query.start_date
      ? String(req.query.start_date)
      : new Date(year, month, 1).toISOString().slice(0, 10);
    const endOfMonth = req.query.end_date
      ? String(req.query.end_date)
      : new Date(year, month + 1, 0).toISOString().slice(0, 10);

    // 1. Obtener categorías activas del usuario
    const catRes = await query(
      'SELECT id, name, icon, color, monthly_budget, is_active, is_custom, sort_order FROM public.categories WHERE user_id = $1 AND is_active = true ORDER BY sort_order ASC, name ASC',
      [uid]
    );
    const categories = catRes.rows;

    // 2. Obtener gastos del período
    const expensesRes = await query(
      `SELECT e.category_id, e.amount
       FROM public.expenses e
       WHERE (e.user_id = $1 OR e.paid_by = $1)
         AND e.expense_date >= $2 AND e.expense_date <= $3`,
      [uid, startOfMonth, endOfMonth]
    );

    // 3. Agrupar gastos por categoría
    const spentMap = new Map<string, number>();
    let totalSpent = 0;

    for (const exp of expensesRes.rows) {
      const amt = Number(exp.amount || 0);
      totalSpent += amt;
      if (exp.category_id) {
        spentMap.set(exp.category_id, (spentMap.get(exp.category_id) || 0) + amt);
      }
    }

    const totalBudget = categories.reduce((sum, c) => sum + Number(c.monthly_budget || 0), 0);

    const spendingDistribution = categories.map((cat) => {
      const spent = Math.round((spentMap.get(cat.id) || 0) * 100) / 100;
      const budget = Number(cat.monthly_budget || 0);
      const percentageOfTotal = totalSpent > 0 ? Math.round((spent / totalSpent) * 100) : 0;
      const budgetUsagePercentage = budget > 0 ? Math.round((spent / budget) * 100) : 0;

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        monthly_budget: budget,
        spent,
        percentage_of_total: percentageOfTotal,
        budget_usage_percentage: budgetUsagePercentage,
        is_over: spent > budget && budget > 0,
        is_active: cat.is_active !== false,
        is_custom: Boolean(cat.is_custom),
        sort_order: cat.sort_order ?? 99,
      };
    });

    // Ordenar de mayor a menor gasto para el gráfico de dona
    spendingDistribution.sort((a, b) => b.spent - a.spent);

    return res.json({
      period: { start_date: startOfMonth, end_date: endOfMonth },
      total_spent: Math.round(totalSpent * 100) / 100,
      total_budget: Math.round(totalBudget * 100) / 100,
      categories: spendingDistribution,
    });
  } catch (error: any) {
    console.error('[API Categories Spending Error]:', error);
    return res.status(500).json({ error: 'Error al calcular distribución de gasto', message: error.message });
  }
});

export default router;
