/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { requireMasterAdmin, isMasterAdmin } from '../middleware/admin.middleware.ts';
import { query } from '../db/cloudsql.ts';

const router = Router();

// Todos los endpoints administrativos requieren Firebase Auth y confirmación inmutable de Master Admin
router.use(requireFirebaseAuth);
router.use(requireMasterAdmin);

/**
 * GET /api/admin/status
 * Verifica el estado del rol de Master Admin y parámetros del sistema
 */
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  return res.json({
    is_master_admin: true,
    actor_uid: req.user!.uid,
    actor_email: req.user!.email,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/audit-logs
 * Obtiene el registro inmutable de auditoría de seguridad y acciones administrativas
 */
router.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const countRes = await query('SELECT COUNT(*) as total FROM public.admin_audit_logs');
    const total = Number(countRes.rows[0]?.total || 0);

    const logsRes = await query(
      `SELECT * FROM public.admin_audit_logs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      total,
      limit,
      offset,
      logs: logsRes.rows,
    });
  } catch (error: any) {
    console.error('[API Admin Audit Logs Error]:', error);
    return res.status(500).json({ error: 'Error al obtener registros de auditoría', message: error.message });
  }
});

export default router;
