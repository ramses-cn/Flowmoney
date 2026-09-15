import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { upsertUserProfile, deleteUserProfile, resetUserData, query } from '../db/cloudsql.ts';

const router = Router();

/**
 * POST /api/profile/upsert
 * Endpoint principal de sincronización al autenticarse en FlowMoney:
 * - Se ejecuta tras la verificación del ID Token de Firebase.
 * - Si el usuario no existe en PostgreSQL (Cloud SQL), crea el registro en `profiles`,
 *   las 8 categorías por defecto y la cuenta principal dentro de una transacción.
 * - Si ya existe, actualiza los datos modificados.
 */
router.post('/profile/upsert', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const verifiedUser = req.user!;
    const { full_name, avatar_url, default_currency } = req.body;

    const isDemo = !!verifiedUser.is_demo || verifiedUser.uid.startsWith('demo_');

    const result = await upsertUserProfile({
      id: verifiedUser.uid,
      email: verifiedUser.email || '',
      full_name: full_name || verifiedUser.name || (verifiedUser.email ? verifiedUser.email.split('@')[0] : 'Usuario FlowMoney'),
      avatar_url: avatar_url || verifiedUser.picture,
      default_currency: default_currency || 'PEN',
      is_demo: isDemo,
    });

    return res.status(200).json({
      success: true,
      message: result.isNewUser ? 'Perfil y categorías iniciales creadas con éxito' : 'Perfil sincronizado',
      data: result,
    });
  } catch (error: any) {
    console.error('[API Profile Upsert Error]:', error);
    return res.status(500).json({
      error: 'No se pudo sincronizar el perfil. Por favor, reintenta.',
      message: 'Error temporal al sincronizar el perfil.',
    });
  }
});

/**
 * GET /api/profile/me
 * Obtiene el perfil completo del usuario actual validando su UID
 */
router.get('/profile/me', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;

    const profileRes = await query('SELECT * FROM public.profiles WHERE id = $1', [uid]);
    if (profileRes.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado en Cloud SQL' });
    }

    const categoriesRes = await query('SELECT * FROM public.categories WHERE user_id = $1 ORDER BY name ASC', [uid]);
    const accountsRes = await query('SELECT * FROM public.accounts WHERE user_id = $1 ORDER BY created_at ASC', [uid]);

    return res.json({
      profile: profileRes.rows[0],
      categories: categoriesRes.rows,
      accounts: accountsRes.rows,
    });
  } catch (error: any) {
    console.error('[API Profile Me Error]:', error);
    return res.status(500).json({
      error: 'Error al obtener información de usuario',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/profile/me
 * Actualiza los datos personales y preferencias del usuario
 */
router.patch('/profile/me', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { full_name, avatar_url, default_currency, theme } = req.body;

    const existingRes = await query('SELECT * FROM public.profiles WHERE id = $1', [uid]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const current = existingRes.rows[0];
    const newName = full_name !== undefined ? full_name : current.full_name;
    const newAvatar = avatar_url !== undefined ? avatar_url : current.avatar_url;
    const newCurrency = default_currency !== undefined ? default_currency : current.default_currency;
    const newTheme = theme !== undefined ? theme : current.theme || 'system';

    const updateRes = await query(
      `UPDATE public.profiles
       SET full_name = $1, avatar_url = $2, default_currency = $3, theme = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [newName, newAvatar, newCurrency, newTheme, uid]
    );

    return res.json({
      success: true,
      profile: updateRes.rows[0],
    });
  } catch (error: any) {
    console.error('[API Profile PATCH Error]:', error);
    return res.status(500).json({
      error: 'Error al actualizar perfil',
      message: error.message,
    });
  }
});

/**
 * POST /api/profile/reset-data
 * Reinicia todos los registros y transacciones del usuario a 0 (gastos, grupos, deudas, suscripciones)
 * manteniendo la cuenta activa, saldo en 0.00 y fijando la moneda por defecto en Soles (PEN).
 */
router.post('/profile/reset-data', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const result = await resetUserData(uid);

    return res.json({
      success: true,
      message: result.message,
      profile: result.profile,
      accounts: result.accounts,
      categories: result.categories,
    });
  } catch (error: any) {
    console.error('[API Profile Reset Data Error]:', error);
    return res.status(500).json({
      error: 'Error al reiniciar los datos del usuario',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/profile/me
 * Elimina completamente la cuenta del usuario autenticado y sus datos asociados dentro de una transacción
 */
router.delete('/profile/me', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const result = await deleteUserProfile(uid);

    if (!result.success) {
      return res.status(400).json({
        error: result.message,
        message: result.message,
        groupsWithBalance: result.groupsWithBalance || [],
      });
    }

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('[API Profile DELETE Error]:', error);
    return res.status(500).json({
      error: 'Error al eliminar la cuenta y los datos de usuario',
      message: error.message,
    });
  }
});

export default router;
