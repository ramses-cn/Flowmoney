import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

const router = Router();

router.use(requireFirebaseAuth);

/**
 * GET /api/accounts
 * Lista las cuentas financieras del usuario autenticado
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const result = await query(
      'SELECT * FROM public.accounts WHERE user_id = $1 AND is_archived = false ORDER BY created_at ASC',
      [uid]
    );
    return res.json({ accounts: result.rows });
  } catch (error: any) {
    console.error('[API Accounts GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener cuentas', message: error.message });
  }
});

/**
 * POST /api/accounts
 * Registra una nueva cuenta bancaria / billetera
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { name, type = 'checking', currency = 'PEN', current_balance = 0, color = '#4F46E5' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre de la cuenta es requerido' });
    }

    const sql = `
      INSERT INTO public.accounts (user_id, name, type, currency, current_balance, color)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await query(sql, [uid, name, type, currency, Number(current_balance), color]);
    return res.status(201).json({
      success: true,
      account: result.rows[0],
    });
  } catch (error: any) {
    console.error('[API Accounts POST Error]:', error);
    return res.status(500).json({ error: 'Error al crear cuenta', message: error.message });
  }
});

/**
 * DELETE /api/accounts/:id
 * Elimina o archiva una cuenta del usuario
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM public.accounts WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cuenta no encontrada o no pertenece al usuario' });
    }

    return res.json({ success: true, message: 'Cuenta eliminada correctamente' });
  } catch (error: any) {
    console.error('[API Accounts DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar cuenta', message: error.message });
  }
});

/**
 * GET /api/categories
 * Lista las categorías del usuario autenticado
 */
router.get('/categories/list', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const result = await query(
      'SELECT * FROM public.categories WHERE user_id = $1 ORDER BY name ASC',
      [uid]
    );
    return res.json({ categories: result.rows });
  } catch (error: any) {
    console.error('[API Categories GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener categorías', message: error.message });
  }
});

export default router;
