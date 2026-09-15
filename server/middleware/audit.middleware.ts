/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * User Audit Log Middleware (F13)
 *
 * Registra acciones sensibles de usuarios normales en la tabla
 * user_audit_logs para trazabilidad y detección de anomalías.
 * Diferente de admin_audit_logs (que es para acciones de Master Admin).
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

export interface UserAuditEntry {
  user_uid: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  details?: Record<string, any>;
  ip_address?: string | null;
  user_agent?: string | null;
}

/**
 * Registra una acción de usuario en user_audit_logs.
 * No lanza errores si falla — sólo loguea warning para no bloquear la request.
 */
export async function logUserAction(entry: UserAuditEntry): Promise<void> {
  try {
    const sql = `
      INSERT INTO public.user_audit_logs (
        user_uid, action, resource_type, resource_id, details, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await query(sql, [
      entry.user_uid,
      entry.action,
      entry.resource_type,
      entry.resource_id || null,
      JSON.stringify(entry.details || {}),
      entry.ip_address || null,
      entry.user_agent || null,
    ]);
  } catch (error) {
    console.warn('[User Audit Log Storage Warning]:', error);
  }
}

/**
 * Middleware factory para auditar acciones.
 * Uso:
 *   router.post('/', auditUserAction('expense_created', 'expense'), handler);
 *
 * Registra la acción DESPUÉS de que el handler se ejecuta exitosamente.
 */
export function auditUserAction(action: string, resourceType: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Hook al finish para registrar la acción sólo si fue exitosa (2xx)
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const uid = req.user?.uid;
        if (!uid) return;

        // Extraer resource_id del path o body
        const resourceId =
          req.params?.id ||
          req.params?.groupId ||
          (res as any).locals?.createdId ||
          null;

        logUserAction({
          user_uid: uid,
          action,
          resource_type: resourceType,
          resource_id: resourceId ? String(resourceId) : null,
          details: {
            method: req.method,
            path: req.originalUrl,
            ...(Object.keys(req.body || {}).length > 0 ? { body_keys: Object.keys(req.body) } : {}),
          },
          ip_address: req.ip || req.socket.remoteAddress,
          user_agent: req.headers['user-agent']?.toString().slice(0, 500),
        });
      }
    });
    next();
  };
}
