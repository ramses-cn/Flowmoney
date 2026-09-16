import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { isMasterAdmin } from '../middleware/admin.middleware.ts';
import { query } from '../db/cloudsql.ts';
import { emitRealtimeEvent } from '../lib/realtime-events.ts';
import { auditUserAction } from '../middleware/audit.middleware.ts';  // F13

const router = Router();

router.use(requireFirebaseAuth);

/**
 * POST /api/settlements
 * Registra un pago/liquidación manual entre dos miembros de un grupo
 *
 * Corregido (F6): Wrapping transaccional completo BEGIN/COMMIT/ROLLBACK
 * y bloqueo advisory del grupo para prevenir race conditions con simplify-debts.
 */
router.post('/', auditUserAction('settlement_recorded', 'settlement'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      group_id,
      payer_id,
      payee_id,
      amount,
      currency = 'PEN',
      payment_method = 'transfer',
      notes,
    } = req.body;

    if (!group_id || !payer_id || !payee_id || !amount) {
      return res.status(400).json({ error: 'group_id, payer_id, payee_id y amount son obligatorios' });
    }

    if (payer_id === payee_id) {
      return res.status(400).json({ error: 'El pagador y el receptor deben ser personas distintas' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser un número positivo' });
    }

    // Verificar que el usuario pertenece al grupo
    let membershipCheck = await query(
      'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [group_id, uid]
    );

    if (membershipCheck.rows.length === 0) {
      if (isMasterAdmin(req.user)) {
        membershipCheck = { rows: [{ role: 'admin' }], rowCount: 1 };
      } else {
        const grpRes = await query('SELECT created_by FROM public.groups WHERE id = $1', [group_id]);
        if (grpRes.rows.length > 0 && grpRes.rows[0].created_by === uid) {
          await query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [group_id, uid, 'admin']);
          membershipCheck = { rows: [{ role: 'admin' }], rowCount: 1 };
        } else {
          return res.status(403).json({ error: 'No perteneces a este grupo' });
        }
      }
    }

    const callerRole = membershipCheck.rows[0]?.role;
    if (uid !== payer_id && uid !== payee_id && callerRole !== 'admin') {
      return res.status(403).json({
        error: 'No tienes autorización para registrar una liquidación entre terceros si no eres administrador del grupo',
      });
    }

    // Corregido (F6): Transacción explícita con BEGIN/COMMIT y advisory lock
    // El pg_advisory_xact_lock bloquea al grupo completo hasta COMMIT/ROLLBACK,
    // evitando que simplify-debts y settlements se ejecuten concurrentemente.
    // El lock se libera automáticamente al hacer COMMIT o ROLLBACK.
    // Generamos una clave determinista a partir del UUID del grupo.
    const groupIdNumeric = await query(
      `SELECT ('x' || left($1::text, 16))::bit(64)::bigint AS group_key`,
      [group_id]
    );
    const groupLockKey = groupIdNumeric.rows[0]?.group_key;

    await query('BEGIN');
    try {
      // F6 — advisory lock exclusivo para el grupo durante la transacción
      if (groupLockKey) {
        await query('SELECT pg_advisory_xact_lock($1)', [groupLockKey]);
      }

      // Verificar nuevamente membresía dentro de la transacción (double-check)
      const membershipRecheck = await query(
        'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
        [group_id, payer_id]
      );
      if (membershipRecheck.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(400).json({ error: 'El pagador ya no es miembro del grupo' });
      }

      const membershipRecheck2 = await query(
        'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
        [group_id, payee_id]
      );
      if (membershipRecheck2.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(400).json({ error: 'El receptor ya no es miembro del grupo' });
      }

      // Insertar liquidación
      const insertSql = `
        INSERT INTO public.settlements (group_id, payer_id, payee_id, amount, currency, payment_method, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await query(insertSql, [
        group_id,
        payer_id,
        payee_id,
        numericAmount,
        currency,
        payment_method,
        notes || null,
      ]);

      await query('COMMIT');

      // Notificación en tiempo real a Firestore (Fase 5)
      emitRealtimeEvent(
        {
          type: 'settlement_created',
          group_id,
          actor_uid: uid,
        },
        req.headers.authorization
      ).catch((e) => console.warn('[Realtime Event Settlement Error]:', e));

      return res.status(201).json({
        success: true,
        settlement: result.rows[0],
      });
    } catch (txErr: any) {
      await query('ROLLBACK');
      throw txErr;
    }
  } catch (error: any) {
    console.error('[API Settlements POST Error]:', error);
    return res.status(500).json({ error: 'Error al registrar la liquidación', message: error.message });
  }
});

/**
 * GET /api/settlements?group_id=:id
 * Obtiene el historial de liquidaciones de un grupo
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const groupId = req.query.group_id as string;

    if (!groupId) {
      return res.status(400).json({ error: 'El parámetro group_id es requerido' });
    }

    let membershipCheck = await query(
      'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, uid]
    );

    if (membershipCheck.rows.length === 0) {
      if (isMasterAdmin(req.user)) {
        membershipCheck = { rows: [{ role: 'admin' }], rowCount: 1 };
      } else {
        const grpRes = await query('SELECT created_by FROM public.groups WHERE id = $1', [groupId]);
        if (grpRes.rows.length > 0 && grpRes.rows[0].created_by === uid) {
          await query('INSERT INTO public.group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [groupId, uid, 'admin']);
          membershipCheck = { rows: [{ role: 'admin' }], rowCount: 1 };
        } else {
          return res.status(403).json({ error: 'No perteneces a este grupo' });
        }
      }
    }

    const sql = `
      SELECT s.*,
             payer.full_name as payer_name, payer.avatar_url as payer_avatar,
             payee.full_name as payee_name, payee.avatar_url as payee_avatar
      FROM public.settlements s
      JOIN public.profiles payer ON payer.id = s.payer_id
      JOIN public.profiles payee ON payee.id = s.payee_id
      WHERE s.group_id = $1
      ORDER BY s.settled_at DESC
    `;

    const result = await query(sql, [groupId]);
    return res.json({ settlements: result.rows });
  } catch (error: any) {
    console.error('[API Settlements GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener liquidaciones', message: error.message });
  }
});

export default router;
