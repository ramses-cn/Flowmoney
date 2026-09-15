import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { query } from '../db/cloudsql.ts';
import { simplifyFromBalances } from '../debts.ts';
import { emitRealtimeEvent } from '../lib/realtime-events.ts';
import { logAdminAction } from '../middleware/admin.middleware.ts';

const router = Router();

router.use(requireFirebaseAuth);

/**
 * GET /api/groups
 * Lista los grupos a los que pertenece el usuario autenticado con saldo neto individual y último gasto.
 *
 * Corregido (F15): Originalmente usaba Promise.all con N queries por grupo (N+1).
 * Ahora usa una sola query con LATERAL JOIN para traer balances y último gasto en batch.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;

    // F15 — Query única con LATERAL JOIN para evitar N+1
    const sql = `
      SELECT
        g.*,
        gm.role as user_role,
        COALESCE(mc.members_count, 0) as members_count,
        COALESCE(ub.net_balance, 0) as net_balance,
        le.id as last_expense_id,
        le.description as last_expense_description,
        le.amount as last_expense_amount,
        le.currency as last_expense_currency,
        le.expense_date as last_expense_date
      FROM public.groups g
      JOIN public.group_members gm ON gm.group_id = g.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as members_count
        FROM public.group_members
        WHERE group_id = g.id
      ) mc ON TRUE
      LEFT JOIN LATERAL (
        SELECT (COALESCE(pe.amount_paid, 0) + COALESCE(so.amount_settled_paid, 0))
             - (COALESCE(os.amount_owed, 0) + COALESCE(si.amount_settled_received, 0)) as net_balance
        FROM public.group_members m
        LEFT JOIN (
          SELECT e.paid_by AS user_id, COALESCE(SUM(e.amount), 0) AS amount_paid
          FROM public.expenses e WHERE e.group_id = g.id GROUP BY e.paid_by
        ) pe ON pe.user_id = $2
        LEFT JOIN (
          SELECT es.user_id, COALESCE(SUM(es.owed_amount), 0) AS amount_owed
          FROM public.expense_shares es
          JOIN public.expenses e ON e.id = es.expense_id
          WHERE e.group_id = g.id GROUP BY es.user_id
        ) os ON os.user_id = $2
        LEFT JOIN (
          SELECT s.payer_id AS user_id, COALESCE(SUM(s.amount), 0) AS amount_settled_paid
          FROM public.settlements s WHERE s.group_id = g.id GROUP BY s.payer_id
        ) so ON so.user_id = $2
        LEFT JOIN (
          SELECT s.payee_id AS user_id, COALESCE(SUM(s.amount), 0) AS amount_settled_received
          FROM public.settlements s WHERE s.group_id = g.id GROUP BY s.payee_id
        ) si ON si.user_id = $2
        WHERE m.group_id = g.id AND m.user_id = $2
        LIMIT 1
      ) ub ON TRUE
      LEFT JOIN LATERAL (
        SELECT id, description, amount, currency, expense_date
        FROM public.expenses
        WHERE group_id = g.id
        ORDER BY expense_date DESC
        LIMIT 1
      ) le ON TRUE
      WHERE gm.user_id = $2
      ORDER BY g.created_at DESC
    `;

    const result = await query(sql, [uid, uid]);

    // Mapear resultado a la estructura esperada por el frontend
    const enriched = result.rows.map((grp: any) => {
      let lastExpense = null;
      if (grp.last_expense_id) {
        lastExpense = {
          id: grp.last_expense_id,
          description: grp.last_expense_description,
          amount: Number(grp.last_expense_amount),
          currency: grp.last_expense_currency,
          expense_date: grp.last_expense_date,
        };
      }
      return {
        ...grp,
        net_balance: Number(grp.net_balance || 0),
        last_expense: lastExpense,
      };
    });

    return res.json({ groups: enriched });
  } catch (error: any) {
    console.error('[API Groups GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener grupos', message: error.message });
  }
});

/**
 * POST /api/groups
 * Crea un nuevo grupo e inserta al usuario creador como miembro admin.
 *
 * Corregido (F12): Wrapping transaccional BEGIN/COMMIT/ROLLBACK.
 * En el original, el grupo y el miembro admin se insertaban en dos queries
 * separadas sin transacción. Si la segunda fallaba, el grupo quedaba huérfano.
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      name,
      description,
      type = 'trip',
      currency = 'PEN',
      cover_url,
      auto_archive_days = 0,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del grupo es requerido' });
    }

    let newGroup: any = null;

    // F12 — Transacción explícita BEGIN/COMMIT/ROLLBACK
    await query('BEGIN');
    try {
      // 1. Insertar grupo
      const insertGroupSql = `
        INSERT INTO public.groups (name, description, type, currency, cover_url, auto_archive_days, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const groupRes = await query(insertGroupSql, [
        name.trim(),
        description ? description.trim() : null,
        type,
        currency,
        cover_url || null,
        Number(auto_archive_days) || 0,
        uid,
      ]);
      newGroup = groupRes.rows[0];

      // 2. Insertar creador como miembro admin
      const insertMemberSql = `
        INSERT INTO public.group_members (group_id, user_id, role)
        VALUES ($1, $2, 'admin')
      `;
      await query(insertMemberSql, [newGroup.id, uid]);

      await query('COMMIT');
    } catch (txErr: any) {
      await query('ROLLBACK');
      console.error('[API Groups POST TX Error]:', txErr);
      return res.status(500).json({ error: 'Error transaccional al crear grupo', message: txErr.message });
    }

    // Notificación en tiempo real a Firestore (Fase 5)
    emitRealtimeEvent(
      {
        type: 'group_updated',
        group_id: newGroup.id,
        actor_uid: uid,
      },
      req.headers.authorization
    ).catch((e) => console.warn('[Realtime Event Group Create Error]:', e));

    return res.status(201).json({
      success: true,
      group: {
        ...newGroup,
        user_role: 'admin',
        members_count: 1,
        net_balance: 0,
        last_expense: null,
      },
    });
  } catch (error: any) {
    console.error('[API Groups POST Error]:', error);
    return res.status(500).json({ error: 'Error al crear grupo', message: error.message });
  }
});

/**
 * GET /api/groups/:id
 * Obtiene los detalles de un grupo específico
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const memberCheck = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este grupo' });
    }

    const groupRes = await query('SELECT * FROM public.groups WHERE id = $1', [id]);
    if (groupRes.rows.length === 0) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const group = groupRes.rows[0];
    const userRole = memberCheck.rows[0].role;

    // Conteo de miembros
    const countRes = await query(
      'SELECT COUNT(*) as count FROM public.group_members WHERE group_id = $1',
      [id]
    );
    const membersCount = parseInt(countRes.rows[0]?.count || '1', 10);

    return res.json({
      group: {
        ...group,
        user_role: userRole,
        members_count: membersCount,
      },
    });
  } catch (error: any) {
    console.error('[API Group GET by ID Error]:', error);
    return res.status(500).json({ error: 'Error al obtener grupo', message: error.message });
  }
});

/**
 * PUT /api/groups/:id
 * Actualiza la información y configuración del grupo (requiere rol admin)
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { name, description, cover_url, currency, auto_archive_days } = req.body;

    // Verificar rol admin
    const memberCheck = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden editar el grupo' });
    }

    const updateSql = `
      UPDATE public.groups
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          cover_url = COALESCE($3, cover_url),
          currency = COALESCE($4, currency),
          auto_archive_days = COALESCE($5, auto_archive_days),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;

    const result = await query(updateSql, [
      name || null,
      description !== undefined ? description : null,
      cover_url !== undefined ? cover_url : null,
      currency || null,
      auto_archive_days !== undefined ? Number(auto_archive_days) : null,
      id,
    ]);

    // Notificación en tiempo real a Firestore (Fase 5)
    emitRealtimeEvent(
      {
        type: 'group_updated',
        group_id: id,
        actor_uid: uid,
      },
      req.headers.authorization
    ).catch((e) => console.warn('[Realtime Event Group Update Error]:', e));

    return res.json({
      success: true,
      group: result.rows[0],
    });
  } catch (error: any) {
    console.error('[API Group Update Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar grupo', message: error.message });
  }
});

/**
 * DELETE /api/groups/:id
 * Elimina un grupo por completo (solo creador/admin)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const memberCheck = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar el grupo' });
    }

    await query('DELETE FROM public.groups WHERE id = $1', [id]);

    logAdminAction({
      actor_uid: uid,
      actor_email: req.user?.email,
      action: 'delete_group',
      resource_type: 'group',
      resource_id: id,
      ip_address: req.ip,
      status: 'success',
    }).catch((e) => console.warn('[Admin Audit Log Warning]:', e));

    return res.json({ success: true, message: 'Grupo eliminado correctamente' });
  } catch (error: any) {
    console.error('[API Group DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar grupo', message: error.message });
  }
});

/**
 * POST /api/groups/:id/leave
 * Permite a un miembro abandonar el grupo
 */
router.post('/:id/leave', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    // Verificar balance del usuario antes de salir: si tiene deudas pendientes no debería salir
    try {
      const balRes = await query('SELECT * FROM public.calculate_group_balances($1)', [id]);
      const userBal = balRes.rows.find((b: any) => b.user_id === uid);
      if (userBal && Math.abs(Number(userBal.net_balance)) > 0.05) {
        return res.status(400).json({
          error: 'No puedes abandonar el grupo si tienes saldos pendientes por pagar o cobrar.',
        });
      }
    } catch (_) {}

    await query('DELETE FROM public.group_members WHERE group_id = $1 AND user_id = $2', [id, uid]);

    // Notificación en tiempo real a Firestore (Fase 5)
    emitRealtimeEvent(
      {
        type: 'members_changed',
        group_id: id,
        actor_uid: uid,
      },
      req.headers.authorization
    ).catch((e) => console.warn('[Realtime Event Member Leave Error]:', e));

    return res.json({ success: true, message: 'Has abandonado el grupo exitosamente' });
  } catch (error: any) {
    console.error('[API Group Leave Error]:', error);
    return res.status(500).json({ error: 'Error al salir del grupo', message: error.message });
  }
});

/**
 * GET /api/groups/:id/balances
 * Ejecuta la función SQL calculate_group_balances(group_uuid)
 */
router.get('/:id/balances', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const memberCheck = await query(
      'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a los balances de este grupo' });
    }

    const balancesRes = await query('SELECT * FROM public.calculate_group_balances($1)', [id]);

    return res.json({
      group_id: id,
      balances: balancesRes.rows,
    });
  } catch (error: any) {
    console.error('[API Group Balances Error]:', error);
    return res.status(500).json({ error: 'Error al calcular balances del grupo', message: error.message });
  }
});

/**
 * POST /api/groups/:id/simplify-debts
 * Algoritmo greedy y determinista para minimizar transferencias entre miembros.
 *
 * Corregido (F6): Envuelve la lectura de balances en una transacción con
 * advisory lock compartido, garantizando que ningún settlement se esté
 * ejecutando concurrentemente sobre el mismo grupo.
 */
router.post('/:id/simplify-debts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const memberCheck = await query(
      'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No tienes acceso a este grupo' });
    }

    // F6 — Obtener clave determinista del grupo para advisory lock
    const groupIdNumeric = await query(
      `SELECT ('x' || left($1::text, 16))::bit(64)::bigint AS group_key`,
      [id]
    );
    const groupLockKey = groupIdNumeric.rows[0]?.group_key;

    let currency = 'PEN';
    let balances: any[] = [];

    // F6 — Transacción read-only con advisory lock compartido
    await query('BEGIN');
    try {
      if (groupLockKey) {
        // pg_advisory_xact_lock_shared permite que múltiples lecturas coexistan
        // pero bloquea writers (settlements) que usan pg_advisory_xact_lock exclusivo.
        await query('SELECT pg_advisory_xact_lock_shared($1)', [groupLockKey]);
      }

      const grpRes = await query('SELECT currency FROM public.groups WHERE id = $1', [id]);
      currency = grpRes.rows[0]?.currency || 'PEN';

      const balancesRes = await query('SELECT * FROM public.calculate_group_balances($1)', [id]);
      balances = balancesRes.rows;

      await query('COMMIT');
    } catch (txErr: any) {
      await query('ROLLBACK');
      throw txErr;
    }

    // Ejecutar simplificación greedy determinista (post-transacción)
    const simplifiedDebts = simplifyFromBalances(balances, currency);

    return res.json({
      group_id: id,
      currency,
      simplified_debts: simplifiedDebts,
    });
  } catch (error: any) {
    console.error('[API Simplify Debts Error]:', error);
    return res.status(500).json({ error: 'Error al simplificar deudas', message: error.message });
  }
});

/**
 * GET /api/groups/:id/members
 * Devuelve la lista combinada de miembros activos e invitaciones pendientes
 */
router.get('/:id/members', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const memberCheck = await query(
      'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No perteneces a este grupo' });
    }

    // Miembros confirmados
    const membersRes = await query(
      `SELECT gm.id as membership_id, gm.role, gm.joined_at,
              p.id as user_id, p.full_name, p.email, p.avatar_url
       FROM public.group_members gm
       JOIN public.profiles p ON p.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [id]
    );

    const activeMembers = membersRes.rows.map((m: any) => ({
      membership_id: m.membership_id,
      group_id: id,
      user_id: m.user_id,
      email: m.email,
      full_name: m.full_name,
      avatar_url: m.avatar_url,
      role: m.role,
      joined_at: m.joined_at,
      is_pending: false,
    }));

    // Invitaciones pendientes
    let pendingInvitations: any[] = [];
    try {
      const invRes = await query(
        `SELECT id as invitation_id, group_id, email, role, created_at as joined_at
         FROM public.group_invitations
         WHERE group_id = $1 AND status = 'pending'
         ORDER BY created_at ASC`,
        [id]
      );
      pendingInvitations = invRes.rows.map((inv: any) => ({
        membership_id: 'pending_' + (inv.invitation_id || inv.id),
        group_id: id,
        user_id: 'pending_' + (inv.invitation_id || inv.id),
        invitation_id: inv.invitation_id || inv.id,
        email: inv.email,
        full_name: (inv.name || inv.email?.split('@')[0] || 'Participante invitado'),
        avatar_url: null,
        role: inv.role || 'member',
        joined_at: inv.joined_at,
        is_pending: true,
      }));
    } catch (_) {}

    return res.json({
      members: [...activeMembers, ...pendingInvitations],
    });
  } catch (error: any) {
    console.error('[API Group Members Error]:', error);
    return res.status(500).json({ error: 'Error al obtener miembros del grupo', message: error.message });
  }
});

/**
 * POST /api/groups/:id/invite
 * Invita a un miembro por email o lo agrega por nombre de contacto (sin requerir registro previo).
 * Si ya existe un perfil con ese correo se le asocia de inmediato;
 * si no, se guarda en invitaciones pendientes o se registra como participante invitado.
 */
router.post('/:id/invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { email, name, role = 'member' } = req.body;

    const rawInput = (email || name || '').trim();
    if (!rawInput) {
      return res.status(400).json({ error: 'Introduce un correo electrónico o nombre de participante' });
    }

    // Verificar que quien invita es miembro del grupo
    const callerMember = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );
    if (callerMember.rows.length === 0) {
      return res.status(403).json({ error: 'No perteneces a este grupo' });
    }

    // Prevención de escalada de privilegios: solo un administrador del grupo puede invitar o asignar rol 'admin'
    const callerRole = callerMember.rows[0]?.role;
    const sanitizedRole = role === 'admin' && callerRole === 'admin' ? 'admin' : 'member';

    // CASO A: Es un nombre de contacto / invitado sin correo electrónico (no restrictivo)
    if (!rawInput.includes('@')) {
      const participantName = rawInput;
      const guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
      const guestEmail = `${participantName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_guest@flowmoney.local`;

      // Insertar perfil de participante local
      await query(
        `INSERT INTO public.profiles (id, email, full_name, avatar_url, default_currency)
         VALUES ($1, $2, $3, null, 'PEN')
         ON CONFLICT (id) DO NOTHING`,
        [guestId, guestEmail, participantName]
      );

      // Insertar en group_members
      const addRes = await query(
        `INSERT INTO public.group_members (group_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, guestId, sanitizedRole]
      );

      emitRealtimeEvent(
        {
          type: 'members_changed',
          group_id: id,
          actor_uid: uid,
        },
        req.headers.authorization
      ).catch((e) => console.warn('[Realtime Event Guest Add Error]:', e));

      return res.status(201).json({
        success: true,
        message: `Participante "${participantName}" añadido al grupo`,
        member: {
          membership_id: addRes.rows[0].id,
          group_id: id,
          user_id: guestId,
          email: null,
          full_name: participantName,
          avatar_url: null,
          role: sanitizedRole,
          joined_at: addRes.rows[0].joined_at || new Date().toISOString(),
          is_pending: false,
          is_guest: true,
        },
      });
    }

    // CASO B: Es un correo electrónico
    const cleanEmail = rawInput.toLowerCase();

    // 1. Verificar si el usuario ya es miembro activo
    const existingMemberCheck = await query(
      `SELECT gm.id FROM public.group_members gm
       JOIN public.profiles p ON p.id = gm.user_id
       WHERE gm.group_id = $1 AND LOWER(p.email) = $2`,
      [id, cleanEmail]
    );

    if (existingMemberCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya es miembro de este grupo' });
    }

    // 2. Comprobar si existe un perfil registrado con ese email
    const profileRes = await query(
      'SELECT id, full_name, email, avatar_url FROM public.profiles WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    if (profileRes.rows.length > 0) {
      const existingUser = profileRes.rows[0];
      // Agregar directamente al grupo
      const addRes = await query(
        `INSERT INTO public.group_members (group_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, existingUser.id, sanitizedRole]
      );

      // Notificación en tiempo real a Firestore (Fase 5)
      emitRealtimeEvent(
        {
          type: 'members_changed',
          group_id: id,
          actor_uid: uid,
        },
        req.headers.authorization
      ).catch((e) => console.warn('[Realtime Event Member Add Error]:', e));

      return res.status(201).json({
        success: true,
        message: 'Usuario añadido al grupo exitosamente',
        member: {
          membership_id: addRes.rows[0].id,
          group_id: id,
          user_id: existingUser.id,
          email: existingUser.email,
          full_name: existingUser.full_name,
          avatar_url: existingUser.avatar_url,
          role: sanitizedRole,
          joined_at: addRes.rows[0].joined_at || new Date().toISOString(),
          is_pending: false,
        },
      });
    }

    // 3. Si aún no está registrado, guardar invitación pendiente (se puede dividir gastos con él inmediatamente)
    const insertInvSql = `
      INSERT INTO public.group_invitations (group_id, email, role, invited_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const invRes = await query(insertInvSql, [id, cleanEmail, sanitizedRole, uid]);
    const inv = invRes.rows[0];

    // Notificación en tiempo real a Firestore (Fase 5)
    emitRealtimeEvent(
      {
        type: 'members_changed',
        group_id: id,
        actor_uid: uid,
      },
      req.headers.authorization
    ).catch((e) => console.warn('[Realtime Event Invitation Error]:', e));

    return res.status(201).json({
      success: true,
      message: 'Invitación pendiente guardada. Ya puedes dividir gastos con este participante y se vinculará en cuanto cree su cuenta.',
      member: {
        membership_id: 'pending_' + inv.id,
        invitation_id: inv.id,
        user_id: 'pending_' + inv.id,
        group_id: id,
        email: cleanEmail,
        full_name: cleanEmail.split('@')[0],
        avatar_url: null,
        role,
        joined_at: inv.created_at,
        is_pending: true,
      },
    });
  } catch (error: any) {
    console.error('[API Group Invite Error]:', error);
    return res.status(500).json({ error: 'Error al enviar invitación', message: error.message });
  }
});

/**
 * DELETE /api/groups/:id/members/:userId
 * Expulsa a un miembro del grupo (admin only)
 */
router.delete('/:id/members/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id, userId } = req.params;

    const adminCheck = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden remover miembros' });
    }

    if (userId === uid) {
      return res.status(400).json({ error: 'No puedes expulsarte a ti mismo. Utiliza abandonar grupo.' });
    }

    await query('DELETE FROM public.group_members WHERE group_id = $1 AND user_id = $2', [id, userId]);

    logAdminAction({
      actor_uid: uid,
      actor_email: req.user?.email,
      action: 'remove_group_member',
      resource_type: 'group_member',
      resource_id: userId,
      details: { group_id: id },
      ip_address: req.ip,
      status: 'success',
    }).catch((e) => console.warn('[Admin Audit Log Warning]:', e));

    // Notificación en tiempo real a Firestore (Fase 5)
    emitRealtimeEvent(
      {
        type: 'members_changed',
        group_id: id,
        actor_uid: uid,
      },
      req.headers.authorization
    ).catch((e) => console.warn('[Realtime Event Member Remove Error]:', e));

    return res.json({ success: true, message: 'Miembro eliminado del grupo' });
  } catch (error: any) {
    console.error('[API Group Remove Member Error]:', error);
    return res.status(500).json({ error: 'Error al remover miembro', message: error.message });
  }
});

/**
 * DELETE /api/groups/:id/invitations/:invitationId
 * Cancela una invitación pendiente
 */
router.delete('/:id/invitations/:invitationId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id, invitationId } = req.params;

    const adminCheck = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );

    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Solo los administradores pueden cancelar invitaciones' });
    }

    await query('DELETE FROM public.group_invitations WHERE id = $1 AND group_id = $2', [invitationId, id]);

    return res.json({ success: true, message: 'Invitación cancelada' });
  } catch (error: any) {
    console.error('[API Cancel Invitation Error]:', error);
    return res.status(500).json({ error: 'Error al cancelar invitación', message: error.message });
  }
});

/**
 * GET /api/groups/:id/expenses
 * Devuelve todos los gastos del grupo con desglose
 */
router.get('/:id/expenses', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const memberCheck = await query(
      'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [id, uid]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No perteneces a este grupo' });
    }

    const sql = `
      SELECT e.*,
             c.name as category_name, c.icon as category_icon, c.color as category_color,
             p.full_name as paid_by_name, p.avatar_url as paid_by_avatar
      FROM public.expenses e
      LEFT JOIN public.categories c ON c.id = e.category_id
      LEFT JOIN public.profiles p ON p.id = e.paid_by
      WHERE e.group_id = $1
      ORDER BY e.expense_date DESC
    `;

    const result = await query(sql, [id]);
    return res.json({ expenses: result.rows });
  } catch (error: any) {
    console.error('[API Group Expenses Error]:', error);
    return res.status(500).json({ error: 'Error al obtener gastos del grupo', message: error.message });
  }
});

export default router;
