import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

const router = Router();

router.use(requireFirebaseAuth);

/**
 * GET /api/subscriptions
 * Lista las suscripciones activas del usuario autenticado
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;

    const sql = `
      SELECT s.*, c.name as category_name, c.color as category_color, a.name as account_name
      FROM public.subscriptions s
      LEFT JOIN public.categories c ON c.id = s.category_id
      LEFT JOIN public.accounts a ON a.id = s.account_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `;

    const result = await query(sql, [uid]);
    return res.json({ subscriptions: result.rows });
  } catch (error: any) {
    console.error('[API Subscriptions GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener suscripciones', message: error.message });
  }
});

/**
 * POST /api/subscriptions
 * Añade una suscripción fija para el usuario
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { name, amount, currency = 'PEN', billing_cycle = 'monthly', category_id, account_id, next_billing_date } = req.body;

    if (!name || !amount) {
      return res.status(400).json({ error: 'Nombre y monto requeridos' });
    }

    const sql = `
      INSERT INTO public.subscriptions (
        user_id, name, amount, currency, billing_cycle, category_id, account_id, next_billing_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await query(sql, [
      uid,
      name,
      Number(amount),
      currency,
      billing_cycle,
      category_id || null,
      account_id || null,
      next_billing_date || null,
    ]);

    return res.status(201).json({
      success: true,
      subscription: result.rows[0],
    });
  } catch (error: any) {
    console.error('[API Subscriptions POST Error]:', error);
    return res.status(500).json({ error: 'Error al registrar suscripción', message: error.message });
  }
});

/**
 * DELETE /api/subscriptions/:id
 * Elimina una suscripción
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM public.subscriptions WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Suscripción no encontrada o no pertenece al usuario' });
    }

    return res.json({ success: true, message: 'Suscripción eliminada con éxito' });
  } catch (error: any) {
    console.error('[API Subscriptions DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar suscripción', message: error.message });
  }
});

/**
 * PATCH /api/subscriptions/:id/status
 * Cambia el estado de una suscripción (active, paused, cancelled)
 */
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'paused', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido (active, paused, cancelled)' });
    }

    const result = await query(
      'UPDATE public.subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Suscripción no encontrada o no pertenece al usuario' });
    }

    return res.json({ success: true, subscription: result.rows[0] });
  } catch (error: any) {
    console.error('[API Subscriptions PATCH Status Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar estado', message: error.message });
  }
});

export default router;
