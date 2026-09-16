/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { requireMasterAdmin, isMasterAdmin, logAdminAction } from '../middleware/admin.middleware.ts';
import { query, deleteUserProfile } from '../db/cloudsql.ts';

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
 * GET /api/admin/users
 * Lista todos los usuarios registrados en el sistema junto con estadísticas, estado de suspensión y vigencia de acceso
 */
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').toLowerCase().trim();
    const filterStatus = (req.query.status as string) || 'all'; // all, active, suspended, expired
    const profilesRes = await query('SELECT * FROM public.profiles');
    let users = profilesRes.rows || [];

    if (search) {
      users = users.filter(
        (u: any) =>
          (u.email && u.email.toLowerCase().includes(search)) ||
          (u.full_name && u.full_name.toLowerCase().includes(search)) ||
          (u.id && u.id.toLowerCase().includes(search))
      );
    }

    // Enriquecer con métricas de uso de cada usuario
    const membersRes = await query('SELECT * FROM public.group_members');
    const expensesRes = await query('SELECT user_id, amount FROM public.expenses');
    const accountsRes = await query('SELECT user_id, current_balance FROM public.accounts');

    const nowTime = Date.now();

    const enriched = users.map((u: any) => {
      const userGroups = membersRes.rows.filter((m: any) => m.user_id === u.id);
      const userExpenses = expensesRes.rows.filter((e: any) => e.user_id === u.id);
      const userAccounts = accountsRes.rows.filter((a: any) => a.user_id === u.id);

      const totalSpent = userExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0);
      const totalBalance = userAccounts.reduce((acc: number, curr: any) => acc + Number(curr.current_balance || 0), 0);

      const isMaster = isMasterAdmin({ uid: u.id, email: u.email });
      const isSuspended = !!u.is_suspended;
      const accessExpiresAt = u.access_expires_at || null;

      let status = 'active';
      let daysRemaining: number | null = null;

      if (isSuspended) {
        status = 'suspended';
      } else if (accessExpiresAt) {
        const expTime = new Date(accessExpiresAt).getTime();
        if (!isNaN(expTime)) {
          const diffDays = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));
          daysRemaining = diffDays;
          if (expTime < nowTime) {
            status = 'expired';
          } else {
            status = 'active';
          }
        }
      }

      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name || 'Sin nombre',
        avatar_url: u.avatar_url,
        default_currency: u.default_currency || 'PEN',
        theme: u.theme || 'system',
        created_at: u.created_at,
        is_master_admin: isMaster,
        is_suspended: isSuspended,
        suspended_reason: u.suspended_reason || null,
        access_expires_at: accessExpiresAt,
        access_status: status,
        days_remaining: daysRemaining,
        stats: {
          groups_count: userGroups.length,
          expenses_count: userExpenses.length,
          total_spent: Math.round(totalSpent * 100) / 100,
          accounts_count: userAccounts.length,
          total_balance: Math.round(totalBalance * 100) / 100,
        },
      };
    });

    // Conteo resumen general
    const statsSummary = {
      total: enriched.length,
      active: enriched.filter((u) => u.access_status === 'active' && !u.is_suspended).length,
      suspended: enriched.filter((u) => u.is_suspended).length,
      expired: enriched.filter((u) => u.access_status === 'expired').length,
    };

    // Aplicar filtro si se solicitó
    let filtered = enriched;
    if (filterStatus === 'active') {
      filtered = enriched.filter((u) => u.access_status === 'active' && !u.is_suspended);
    } else if (filterStatus === 'suspended') {
      filtered = enriched.filter((u) => u.is_suspended);
    } else if (filterStatus === 'expired') {
      filtered = enriched.filter((u) => u.access_status === 'expired');
    }

    return res.json({
      total: filtered.length,
      users: filtered,
      summary: statsSummary,
    });
  } catch (error: any) {
    console.error('[API Admin Users Error]:', error);
    return res.status(500).json({ error: 'Error al listar usuarios', message: error.message });
  }
});

/**
 * PATCH /api/admin/users/:id/access
 * Permite al Master Admin modificar la vigencia de acceso, suspender o reactivar a un usuario
 */
router.patch('/users/:id/access', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { is_suspended, suspended_reason, access_expires_at } = req.body;

    // Verificar usuario objetivo
    const userCheck = await query('SELECT * FROM public.profiles WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado en la base de datos' });
    }

    const targetUser = userCheck.rows[0];

    // Protección de seguridad: Ningún Master Admin puede ser suspendido o tener vigencia limitada
    if (isMasterAdmin({ uid: targetUser.id, email: targetUser.email })) {
      return res.status(400).json({
        error: 'Operación denegada: Un Administrador Master no puede ser suspendido ni tener vigencia restringida.',
      });
    }

    const newSuspended = is_suspended !== undefined ? !!is_suspended : !!targetUser.is_suspended;
    const newReason = suspended_reason !== undefined ? suspended_reason : targetUser.suspended_reason;
    const newExpiresAt = access_expires_at !== undefined ? access_expires_at : targetUser.access_expires_at;

    // Ejecutar actualización
    const updateRes = await query(
      `UPDATE public.profiles
       SET is_suspended = $1, suspended_reason = $2, access_expires_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [newSuspended, newReason || null, newExpiresAt || null, id]
    );

    // Registro inmutable de auditoría
    await logAdminAction({
      actor_uid: req.user!.uid,
      actor_email: req.user!.email,
      action: newSuspended ? 'SUSPEND_USER_ACCESS' : 'UPDATE_USER_ACCESS',
      resource_type: 'user_profile',
      resource_id: id,
      details: {
        user_email: targetUser.email,
        is_suspended: newSuspended,
        suspended_reason: newReason,
        access_expires_at: newExpiresAt,
      },
      status: 'success',
    });

    return res.json({
      success: true,
      message: newSuspended
        ? 'El acceso del usuario ha sido suspendido correctamente.'
        : 'Vigencia y estado de acceso actualizados correctamente.',
      user: updateRes.rows[0],
    });
  } catch (error: any) {
    console.error('[API Admin Update Access Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar acceso del usuario', message: error.message });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Elimina completamente un usuario y todos sus datos relacionados (transaccional forzado)
 */
router.delete('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Verificar existencia
    const userCheck = await query('SELECT * FROM public.profiles WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'El usuario no existe o ya fue eliminado' });
    }

    const targetUser = userCheck.rows[0];

    // 2. Protecciones de seguridad
    if (isMasterAdmin({ uid: targetUser.id, email: targetUser.email })) {
      return res.status(400).json({
        error: 'Seguridad del sistema: No está permitido eliminar a un Administrador Master.',
      });
    }

    if (targetUser.id === req.user!.uid) {
      return res.status(400).json({
        error: 'Operación no válida: No puedes eliminar tu propia cuenta desde el panel de administración.',
      });
    }

    // 3. Ejecutar eliminación forzada transaccional
    const deleteResult = await deleteUserProfile(id, true);
    if (!deleteResult.success) {
      return res.status(400).json({
        error: deleteResult.message || 'No se pudo eliminar el usuario',
      });
    }

    // 4. Registro inmutable de auditoría
    await logAdminAction({
      actor_uid: req.user!.uid,
      actor_email: req.user!.email,
      action: 'DELETE_USER_PERMANENTLY',
      resource_type: 'user_profile',
      resource_id: id,
      details: {
        deleted_email: targetUser.email,
        deleted_name: targetUser.full_name,
      },
      status: 'success',
    });

    return res.json({
      success: true,
      message: `El usuario ${targetUser.full_name || targetUser.email} ha sido eliminado permanentemente del sistema.`,
    });
  } catch (error: any) {
    console.error('[API Admin Delete User Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar usuario', message: error.message });
  }
});

/**
 * GET /api/admin/invitations
 * Obtiene todas las invitaciones, enlaces activos y códigos generados para vinculación de usuarios
 */
router.get('/invitations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invRes = await query('SELECT * FROM public.group_invitations');
    const groupsRes = await query('SELECT id, name, type, currency FROM public.groups');
    const profilesRes = await query('SELECT id, email, full_name FROM public.profiles');

    const groupsMap = new Map(groupsRes.rows.map((g: any) => [g.id, g]));
    const profilesMap = new Map(profilesRes.rows.map((p: any) => [p.id, p]));

    const invitations = (invRes.rows || []).map((inv: any) => {
      const group = groupsMap.get(inv.group_id);
      const inviter = profilesMap.get(inv.invited_by);
      const inviteCode = inv.token || `INV-${(inv.id || '').substring(0, 8).toUpperCase()}`;

      return {
        id: inv.id,
        group_id: inv.group_id,
        group_name: group?.name || 'Grupo',
        group_type: group?.type || 'trip',
        email: inv.email,
        role: inv.role || 'member',
        status: inv.status || 'pending',
        invite_code: inviteCode,
        invite_link: `/join?token=${inviteCode}&groupId=${inv.group_id}`,
        invited_by_name: inviter?.full_name || inviter?.email || 'Administrador',
        invited_by_email: inviter?.email || '',
        created_at: inv.created_at,
      };
    });

    return res.json({
      total: invitations.length,
      invitations,
    });
  } catch (error: any) {
    console.error('[API Admin Invitations Error]:', error);
    return res.status(500).json({ error: 'Error al listar invitaciones y enlaces', message: error.message });
  }
});

/**
 * POST /api/admin/generate-invite
 * Genera un enlace o código de acceso/invitación para vincular un usuario a un grupo
 */
router.post('/generate-invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { group_id, email, role = 'member' } = req.body;
    if (!group_id) {
      return res.status(400).json({ error: 'Debes seleccionar un grupo' });
    }

    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Introduce un correo electrónico válido' });
    }

    // Verificar grupo
    const groupCheck = await query('SELECT id, name FROM public.groups WHERE id = $1', [group_id]);
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    // Comprobar si ya es miembro
    const existingCheck = await query(
      `SELECT gm.id FROM public.group_members gm
       JOIN public.profiles p ON p.id = gm.user_id
       WHERE gm.group_id = $1 AND LOWER(p.email) = $2`,
      [group_id, cleanEmail]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya es miembro activo de este grupo' });
    }

    // Generar código único alfanumérico
    const uniqueToken = 'FLW-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const invRes = await query(
      `INSERT INTO public.group_invitations (group_id, email, role, invited_by, token, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [group_id, cleanEmail, role === 'admin' ? 'admin' : 'member', req.user!.uid, uniqueToken]
    );

    const inv = invRes.rows[0];
    const inviteLink = `${req.protocol}://${req.get('host')}/join?token=${uniqueToken}&groupId=${group_id}`;

    return res.status(201).json({
      success: true,
      message: 'Invitación y código generados exitosamente',
      invitation: {
        id: inv.id,
        group_id: inv.group_id,
        group_name: groupCheck.rows[0].name,
        email: cleanEmail,
        role: inv.role,
        status: 'pending',
        invite_code: uniqueToken,
        invite_link: inviteLink,
        created_at: inv.created_at || new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[API Admin Generate Invite Error]:', error);
    return res.status(500).json({ error: 'Error al generar código o enlace', message: error.message });
  }
});

/**
 * DELETE /api/admin/invitations/:id
 * Cancela una invitación o enlace de código pendiente
 */
router.delete('/invitations/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM public.group_invitations WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Invitación eliminada correctamente' });
  } catch (error: any) {
    console.error('[API Admin Delete Invite Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar invitación', message: error.message });
  }
});

/**
 * GET /api/admin/groups
 * Obtiene lista global de todos los grupos del sistema para gestión de asignación
 */
router.get('/groups', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupsRes = await query('SELECT * FROM public.groups ORDER BY created_at DESC');
    const membersRes = await query('SELECT group_id, user_id, role FROM public.group_members');

    const groups = (groupsRes.rows || []).map((g: any) => {
      const members = membersRes.rows.filter((m: any) => m.group_id === g.id);
      return {
        id: g.id,
        name: g.name,
        type: g.type,
        currency: g.currency,
        members_count: members.length,
        created_at: g.created_at,
      };
    });

    return res.json({ groups });
  } catch (error: any) {
    console.error('[API Admin Groups Error]:', error);
    return res.status(500).json({ error: 'Error al listar grupos', message: error.message });
  }
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
