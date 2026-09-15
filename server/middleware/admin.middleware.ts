/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

/**
 * Lista de emails autorizados como Master Admin.
 * Por defecto incluye el correo del propietario de la app (Psico.Csar@gmail.com)
 * y cualquier lista blanca adicional configurada en variables de entorno del servidor.
 */
const DEFAULT_MASTER_ADMINS = ['psico.csar@gmail.com'];

export function isMasterAdmin(user?: { uid: string; email?: string; [key: string]: any }): boolean {
  if (!user) return false;

  // 1. Verificación por custom claim en Firebase Auth
  if (user.role === 'MASTER_ADMIN' || user.master_admin === true || user.is_master_admin === true) {
    return true;
  }

  // 2. Verificación por lista blanca inmutable de correos
  if (user.email) {
    const userEmail = user.email.toLowerCase().trim();
    if (DEFAULT_MASTER_ADMINS.includes(userEmail)) {
      return true;
    }

    const envAdmins = process.env.MASTER_ADMIN_EMAILS
      ? process.env.MASTER_ADMIN_EMAILS.toLowerCase().split(',').map((e) => e.trim())
      : [];

    if (envAdmins.includes(userEmail)) {
      return true;
    }
  }

  return false;
}

/**
 * Middleware para resguardar endpoints exclusivos del Master Admin.
 * No permite que usuarios no autorizados consulten logs globales de auditoría ni modifiquen licencias del sistema.
 */
export function requireMasterAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !isMasterAdmin(req.user)) {
    // Registrar intento no autorizado
    logAdminAction({
      actor_uid: req.user?.uid || 'anonymous',
      actor_email: req.user?.email || null,
      action: 'unauthorized_master_admin_attempt',
      resource_type: 'system_endpoint',
      resource_id: req.originalUrl,
      details: { method: req.method, ip: req.ip },
      ip_address: req.ip,
      status: 'rejected',
    }).catch((err) => console.warn('[Admin Audit Log Error]:', err));

    return res.status(403).json({
      error: 'Acceso denegado: se requieren privilegios de Master Admin',
    });
  }

  next();
}

export interface AdminAuditEntry {
  actor_uid: string;
  actor_email?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  details?: Record<string, any>;
  ip_address?: string | null;
  status?: 'success' | 'failed' | 'rejected';
}

/**
 * Registra de manera inmutable acciones administrativas y eventos críticos de seguridad
 */
export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const sql = `
      INSERT INTO public.admin_audit_logs (
        actor_uid, actor_email, action, resource_type, resource_id, details, ip_address, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await query(sql, [
      entry.actor_uid,
      entry.actor_email || null,
      entry.action,
      entry.resource_type,
      entry.resource_id || null,
      JSON.stringify(entry.details || {}),
      entry.ip_address || null,
      entry.status || 'success',
    ]);
  } catch (error) {
    console.warn('[Admin Audit Log Storage Warning]:', error);
  }
}
