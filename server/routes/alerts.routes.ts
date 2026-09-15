import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { requireFeature } from '../middleware/licensing.middleware.ts';
import { query } from '../db/cloudsql.ts';
import {
  executeScheduledReport,
  evaluateBudgetAlerts,
  sendEmailNotification,
} from '../services/notification-worker.ts';
import { generateFinancialReport } from '../services/report-generator.ts';

const router = Router();
router.use(requireFirebaseAuth);

// ==============================================================================
// 1. ALERTAS DE PRESUPUESTO (ALERT_RULES)
// Configuración de umbrales: 50%, 75%, 80%, 90%, 100%, exceso (>100%)
// Canales: Notificación dentro de la app (in_app) y por correo (email)
// ==============================================================================

/**
 * GET /api/alerts/rules
 * Obtiene todas las reglas de alerta configuradas por el usuario
 */
router.get('/rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const rulesRes = await query(
      'SELECT * FROM public.alert_rules WHERE user_id = $1 ORDER BY threshold_percent ASC',
      [uid]
    );

    // Si el usuario no tiene reglas de alerta iniciales, crear las reglas estándar recomendadas
    if (rulesRes.rows.length === 0) {
      const defaultThresholds = [
        { threshold: 50, inApp: true, email: false },
        { threshold: 75, inApp: true, email: false },
        { threshold: 80, inApp: true, email: false },
        { threshold: 90, inApp: true, email: true },
        { threshold: 100, inApp: true, email: true },
        { threshold: 110, inApp: true, email: true }, // Exceso
      ];

      for (const d of defaultThresholds) {
        await query(
          `INSERT INTO public.alert_rules 
           (user_id, category_id, threshold_percent, is_active, notify_in_app, notify_email, target_email)
           VALUES ($1, NULL, $2, TRUE, $3, $4, $5)`,
          [uid, d.threshold, d.inApp, d.email, req.user!.email || null]
        );
      }

      const freshRes = await query(
        'SELECT * FROM public.alert_rules WHERE user_id = $1 ORDER BY threshold_percent ASC',
        [uid]
      );
      return res.json({ rules: freshRes.rows });
    }

    return res.json({ rules: rulesRes.rows });
  } catch (error: any) {
    console.error('[Alert Rules GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener alertas de presupuesto', message: error.message });
  }
});

/**
 * POST /api/alerts/rules
 * Crea una nueva regla de alerta con porcentaje personalizable
 */
router.post('/rules', requireFeature('custom_alerts'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      category_id,
      threshold_percent,
      is_active = true,
      notify_in_app = true,
      notify_email = false,
      target_email,
    } = req.body;

    const threshold = Number(threshold_percent);
    if (!threshold || threshold < 1 || threshold > 500) {
      return res.status(400).json({ error: 'El porcentaje debe estar entre 1% y 500%' });
    }

    const emailToUse = notify_email ? (target_email || req.user!.email || null) : null;

    const result = await query(
      `INSERT INTO public.alert_rules 
       (user_id, category_id, threshold_percent, is_active, notify_in_app, notify_email, target_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [uid, category_id || null, threshold, Boolean(is_active), Boolean(notify_in_app), Boolean(notify_email), emailToUse]
    );

    return res.status(201).json({ success: true, rule: result.rows[0] });
  } catch (error: any) {
    console.error('[Alert Rules POST Error]:', error);
    return res.status(500).json({ error: 'Error al crear alerta', message: error.message });
  }
});

/**
 * PUT /api/alerts/rules/:id
 * Actualiza una regla de alerta existente
 */
router.put('/rules/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { threshold_percent, is_active, notify_in_app, notify_email, target_email } = req.body;

    const result = await query(
      `UPDATE public.alert_rules 
       SET threshold_percent = $1, is_active = $2, notify_in_app = $3, notify_email = $4, target_email = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        threshold_percent !== undefined ? Number(threshold_percent) : 80,
        is_active !== undefined ? Boolean(is_active) : true,
        notify_in_app !== undefined ? Boolean(notify_in_app) : true,
        notify_email !== undefined ? Boolean(notify_email) : false,
        target_email || req.user!.email || null,
        id,
        uid,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla de alerta no encontrada' });
    }

    return res.json({ success: true, rule: result.rows[0] });
  } catch (error: any) {
    console.error('[Alert Rules PUT Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar alerta', message: error.message });
  }
});

/**
 * DELETE /api/alerts/rules/:id
 * Elimina una regla de alerta
 */
router.delete('/rules/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM public.alert_rules WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla no encontrada' });
    }

    return res.json({ success: true, message: 'Alerta eliminada correctamente' });
  } catch (error: any) {
    console.error('[Alert Rules DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar alerta', message: error.message });
  }
});

/**
 * GET /api/alerts/active-triggered
 * Evalúa en tiempo real las alertas activadas por consumo actual de presupuesto
 */
router.get('/active-triggered', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const triggered = await evaluateBudgetAlerts(uid);
    return res.json({ alerts: triggered });
  } catch (error: any) {
    console.error('[Alerts Active Triggered Error]:', error);
    return res.status(500).json({ error: 'Error al evaluar alertas activas', message: error.message });
  }
});

// ==============================================================================
// 2. REPORTES PROGRAMADOS (SCHEDULED_REPORTS)
// Frecuencia: Diario, Semanal, Quincenal, Mensual, Personalizado
// Configuración: Día, Hora, Período, Tipo, Categorías, Cuentas, Formato, Email
// ==============================================================================

/**
 * GET /api/reports/scheduled
 * Lista los reportes programados del usuario
 */
router.get('/scheduled', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const reportsRes = await query(
      'SELECT * FROM public.scheduled_reports WHERE user_id = $1 ORDER BY created_at DESC',
      [uid]
    );
    return res.json({ reports: reportsRes.rows });
  } catch (error: any) {
    console.error('[Scheduled Reports GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener reportes programados', message: error.message });
  }
});

/**
 * POST /api/reports/scheduled
 * Programa un nuevo reporte automatizado
 */
router.post('/scheduled', requireFeature('scheduled_reports'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      name = 'Reporte Financiero',
      frequency = 'monthly',
      schedule_day_of_week = 1,
      schedule_day_of_month = 1,
      schedule_time = '08:00',
      period_type = 'month',
      report_type = 'financial_summary',
      include_sections = ['income', 'expenses', 'balance', 'categories', 'budgets', 'variation'],
      format = 'pdf',
      export_destination = 'email',
      recipient_email,
      category_ids = [],
      account_ids = [],
      is_active = true,
    } = req.body;

    const email = recipient_email || req.user!.email;
    if (!email) {
      return res.status(400).json({ error: 'Se requiere un correo electrónico destinatario' });
    }

    const nextRun = new Date(Date.now() + 86400000).toISOString();

    const result = await query(
      `INSERT INTO public.scheduled_reports 
       (user_id, name, frequency, schedule_day_of_week, schedule_day_of_month, schedule_time,
        period_type, report_type, include_sections, format, export_destination,
        recipient_email, category_ids, account_ids, is_active, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        uid,
        name,
        frequency,
        Number(schedule_day_of_week),
        Number(schedule_day_of_month),
        schedule_time,
        period_type,
        report_type,
        JSON.stringify(include_sections),
        format,
        export_destination,
        email,
        JSON.stringify(category_ids),
        JSON.stringify(account_ids),
        Boolean(is_active),
        nextRun,
      ]
    );

    return res.status(201).json({ success: true, report: result.rows[0] });
  } catch (error: any) {
    console.error('[Scheduled Reports POST Error]:', error);
    return res.status(500).json({ error: 'Error al programar reporte', message: error.message });
  }
});

/**
 * PUT /api/reports/scheduled/:id
 * Modifica un reporte programado
 */
router.put('/scheduled/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { name, frequency, schedule_time, is_active, recipient_email } = req.body;

    const result = await query(
      `UPDATE public.scheduled_reports 
       SET name = $1, frequency = $2, schedule_time = $3, is_active = $4, recipient_email = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, frequency, schedule_time, is_active, recipient_email, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    return res.json({ success: true, report: result.rows[0] });
  } catch (error: any) {
    console.error('[Scheduled Reports PUT Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar reporte programado', message: error.message });
  }
});

/**
 * DELETE /api/reports/scheduled/:id
 * Elimina una programación
 */
router.delete('/scheduled/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM public.scheduled_reports WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    return res.json({ success: true, message: 'Reporte programado cancelado y eliminado' });
  } catch (error: any) {
    console.error('[Scheduled Reports DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar reporte', message: error.message });
  }
});

/**
 * POST /api/reports/scheduled/:id/run-now
 * Dispara la ejecución inmediata y envío de prueba del reporte programado
 */
router.post('/scheduled/:id/run-now', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    // Validación estricta contra IDOR: el reporte debe pertenecer al usuario autenticado
    const checkRes = await query(
      'SELECT id FROM public.scheduled_reports WHERE id = $1 AND user_id = $2',
      [id, uid]
    );

    if (!checkRes.rows || checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte programado no encontrado o no autorizado' });
    }

    const execution = await executeScheduledReport(id, true);
    return res.json({
      success: true,
      message: 'Reporte generado y enviado con éxito',
      execution: execution.log,
    });
  } catch (error: any) {
    console.error('[Run Scheduled Report Error]:', error);
    return res.status(500).json({ error: 'Error ejecutando reporte', message: error.message });
  }
});

/**
 * GET /api/reports/logs
 * Obtiene el historial de auditoría de reportes generados y despachados
 */
router.get('/logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const logsRes = await query(
      'SELECT * FROM public.report_execution_logs WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 30',
      [uid]
    );
    return res.json({ logs: logsRes.rows });
  } catch (error: any) {
    console.error('[Report Execution Logs GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener bitácora de reportes', message: error.message });
  }
});

/**
 * GET /api/reports/license
 * Consulta la licencia activa del usuario y características habilitadas
 */
router.get('/license', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const licRes = await query('SELECT * FROM public.user_licenses WHERE user_id = $1', [uid]);
    return res.json({ license: licRes.rows[0] });
  } catch (error: any) {
    console.error('[License GET Error]:', error);
    return res.status(500).json({ error: 'Error al consultar licencia', message: error.message });
  }
});

export default router;
