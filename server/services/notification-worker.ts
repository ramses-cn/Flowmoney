import { query, memoryStore } from '../db/cloudsql.ts';
import { generateFinancialReport } from './report-generator.ts';

// Corregido (F8): Integración real con Nodemailer (SMTP)
// Reemplaza el mock console.log con un transporte SMTP configurable.
import nodemailer from 'nodemailer';

let emailTransporter: nodemailer.Transporter | null = null;

function getEmailTransporter(): nodemailer.Transporter | null {
  if (emailTransporter) return emailTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Si no hay SMTP configurado, retornar null — el worker caerá a modo log (dev)
  if (!host || !user || !pass) {
    return null;
  }

  emailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    // Timeouts defensivos
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
  });

  console.log(`[Email Transporter] Configurado para ${host}:${port} (user: ${user})`);
  return emailTransporter;
}

export interface EmailDispatchPayload {
  to: string;
  subject: string;
  htmlContent: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType: string;
  };
}

/**
 * Servicio de envío de notificaciones y reportes por correo electrónico.
 *
 * Corregido (F8): reemplazado el mock console.log por Nodemailer real.
 * Si no hay SMTP configurado, cae a modo desarrollo (log) para no romper el flujo.
 */
export async function sendEmailNotification(payload: EmailDispatchPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const transporter = getEmailTransporter();

    // Modo desarrollo: si no hay SMTP configurado, loguear y simular éxito
    if (!transporter) {
      console.log(`[Email Dispatch DEV] [${timestamp}] To: ${payload.to}`);
      console.log(`[Email Dispatch DEV] Subject: "${payload.subject}" | Attachment: ${payload.attachment?.filename || 'none'}`);
      return {
        success: true,
        messageId: 'dev_mock_' + Math.random().toString(36).substr(2, 12),
      };
    }

    // Validar email destino
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.to)) {
      return { success: false, error: `Email destino inválido: ${payload.to}` };
    }

    // Enviar email real via SMTP
    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.SMTP_FROM || 'FlowMoney <noreply@flowmoney.app>',
      to: payload.to,
      subject: payload.subject,
      html: payload.htmlContent,
      attachments: payload.attachment ? [{
        filename: payload.attachment.filename,
        content: payload.attachment.content,
        contentType: payload.attachment.contentType,
      }] : undefined,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Dispatch OK] To: ${payload.to} | MessageId: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error('[Email Dispatch Service Error]:', err);
    return {
      success: false,
      error: err.message || 'Error en servicio de correo',
    };
  }
}

/**
 * Procesa la ejecución de un reporte programado específico
 */
export async function executeScheduledReport(reportId: string, isManualTest: boolean = false): Promise<{ success: boolean; log: any }> {
  const reportRes = await query(
    'SELECT * FROM public.scheduled_reports WHERE id = $1',
    [reportId]
  );
  const report = reportRes.rows[0];
  if (!report) {
    throw new Error('Reporte programado no encontrado');
  }

  const profRes = await query('SELECT * FROM public.profiles WHERE id = $1', [report.user_id]);
  const profile = profRes.rows[0] || {
    id: report.user_id,
    full_name: 'Usuario FlowMoney',
    email: report.recipient_email,
    default_currency: 'PEN',
  };

  try {
    // 1. Generar el documento
    const reportData = await generateFinancialReport({
      reportId: report.id,
      userId: report.user_id,
      userEmail: profile.email,
      userName: profile.full_name,
      currency: profile.default_currency || 'PEN',
      periodType: report.period_type,
      reportType: report.report_type,
      includeSections: report.include_sections || ['income', 'expenses', 'balance', 'categories', 'budgets', 'variation'],
      format: report.format as 'pdf' | 'excel' | 'csv',
      recipientEmail: report.recipient_email,
      categoryIds: report.category_ids || [],
      accountIds: report.account_ids || [],
    });

    // 2. Enviar por correo si está configurado
    if (report.export_destination === 'email' || isManualTest) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 12px;">
          <div style="background-color: #4f46e5; padding: 18px 24px; border-radius: 8px 8px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 20px; font-weight: bold;">FlowMoney • Reporte Programado</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">${report.name}</p>
          </div>
          <div style="background-color: #ffffff; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="font-size: 14px; color: #1e293b; margin-top: 0;">
              Hola <strong>${profile.full_name}</strong>,
            </p>
            <p style="font-size: 14px; color: #475569;">
              Adjunto encontrarás tu reporte financiero periódico automático correspondiente a <strong>${reportData.summary.periodLabel}</strong>.
            </p>
            
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 18px 0;">
              <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #0f172a; text-transform: uppercase;">Resumen Ejecutivo</h3>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
                <li><strong>Gasto Auditado:</strong> ${profile.default_currency} ${reportData.totalExpenses.toFixed(2)} (${reportData.itemCount} movimientos)</li>
                <li><strong>Cumplimiento de Presupuesto:</strong> ${reportData.summary.budgetExecutionPercent}% de la meta</li>
                <li><strong>Saldo Disponible en Cuentas:</strong> ${profile.default_currency} ${reportData.netBalance.toFixed(2)}</li>
              </ul>
            </div>

            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">
              Este correo fue emitido automáticamente por el motor de reportes de FlowMoney. Puedes administrar o modificar la frecuencia desde tu panel de usuario.
            </p>
          </div>
        </div>
      `;

      await sendEmailNotification({
        to: report.recipient_email,
        subject: `[FlowMoney] ${report.name} - ${reportData.summary.periodLabel}`,
        htmlContent: emailHtml,
        attachment: {
          filename: reportData.fileName,
          content: reportData.buffer,
          contentType: reportData.mimeType,
        },
      });
    }

    // 3. Registrar en bitácora de auditoría (REPORT_EXECUTION_LOGS)
    const logRes = await query(
      `INSERT INTO public.report_execution_logs 
       (report_id, user_id, recipient_email, format, status, file_name, file_size_bytes, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        report.id,
        report.user_id,
        report.recipient_email,
        report.format,
        'success',
        reportData.fileName,
        reportData.fileSizeBytes,
        null,
        JSON.stringify({
          is_manual_test: isManualTest,
          total_expenses: reportData.totalExpenses,
          execution_time: new Date().toISOString(),
        }),
      ]
    );

    // 4. Actualizar last_run_at y programar next_run_at
    const now = new Date();
    let nextDate = new Date(now);
    if (report.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    else if (report.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    else if (report.frequency === 'biweekly') nextDate.setDate(nextDate.getDate() + 15);
    else if (report.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    else nextDate.setDate(nextDate.getDate() + 1);

    await query(
      'UPDATE public.scheduled_reports SET last_run_at = $1, next_run_at = $2 WHERE id = $3',
      [now.toISOString(), nextDate.toISOString(), report.id]
    );

    return {
      success: true,
      log: logRes.rows[0],
    };
  } catch (err: any) {
    console.error(`[Scheduled Report Error ID ${reportId}]:`, err);
    // Registrar fallo en logs
    await query(
      `INSERT INTO public.report_execution_logs 
       (report_id, user_id, recipient_email, format, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [report.id, report.user_id, report.recipient_email, report.format, 'failed', err.message]
    );
    throw err;
  }
}

/**
 * Evaluador de alertas presupuestarias dinámicas
 * Se ejecuta al registrar/actualizar gastos o al solicitar estado de alertas
 */
export async function evaluateBudgetAlerts(userId: string): Promise<any[]> {
  const rulesRes = await query(
    'SELECT * FROM public.alert_rules WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  const rules = rulesRes.rows;
  if (rules.length === 0) return [];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Obtener gastos del mes por categoría
  const expRes = await query(
    `SELECT e.category_id, COALESCE(SUM(e.amount), 0) as total_spent
     FROM public.expenses e
     WHERE (e.user_id = $1 OR e.paid_by = $1)
       AND e.expense_date >= $2 AND e.expense_date <= $3
     GROUP BY e.category_id`,
    [userId, startOfMonth, endOfMonth]
  );
  const spentMap = new Map<string, number>();
  let totalSpentMonth = 0;
  for (const r of expRes.rows) {
    const amt = Number(r.total_spent || 0);
    totalSpentMonth += amt;
    if (r.category_id) spentMap.set(r.category_id, amt);
  }

  // Obtener categorías con presupuesto
  const catRes = await query('SELECT * FROM public.categories WHERE user_id = $1', [userId]);
  const catMap = new Map<string, any>();
  let totalBudgetMonth = 0;
  for (const c of catRes.rows) {
    catMap.set(c.id, c);
    totalBudgetMonth += Number(c.monthly_budget || 0);
  }

  const triggeredAlerts: any[] = [];

  for (const rule of rules) {
    let budget = 0;
    let spent = 0;
    let targetName = 'Presupuesto Total';

    if (rule.category_id) {
      const cat = catMap.get(rule.category_id);
      if (!cat || !cat.monthly_budget || Number(cat.monthly_budget) <= 0) continue;
      budget = Number(cat.monthly_budget);
      spent = spentMap.get(rule.category_id) || 0;
      targetName = cat.name;
    } else {
      if (totalBudgetMonth <= 0) continue;
      budget = totalBudgetMonth;
      spent = totalSpentMonth;
    }

    const currentPercent = Math.round((spent / budget) * 100);
    const threshold = Number(rule.threshold_percent);

    if (currentPercent >= threshold) {
      const isExcess = threshold >= 100;
      triggeredAlerts.push({
        rule_id: rule.id,
        category_id: rule.category_id,
        target_name: targetName,
        threshold_percent: threshold,
        current_percent: currentPercent,
        budget,
        spent,
        difference: Number((spent - budget).toFixed(2)),
        type: isExcess ? 'danger' : threshold >= 80 ? 'warning' : 'info',
        notify_in_app: rule.notify_in_app,
        notify_email: rule.notify_email,
        target_email: rule.target_email,
      });
    }
  }

  return triggeredAlerts;
}

// ============================================================
// Corregido (F8): Worker programado para ejecutar reportes pendientes
// ============================================================
// En el original, los reportes programados SOLO se ejecutaban via
// el endpoint /run-now manual. Este worker se ejecuta periódicamente
// para procesar los reportes con next_run_at <= now().
//
// Se inicializa desde server.ts en startServer() con setInterval.
// En producción se recomienda reemplazar por Cloud Scheduler + HTTP
// endpoint para evitar que cada réplica ejecute el worker.

let workerInterval: NodeJS.Timeout | null = null;

export async function runScheduledReportsWorker(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const now = new Date().toISOString();
    const pendingRes = await query(
      `SELECT id FROM public.scheduled_reports
       WHERE is_active = true
         AND next_run_at <= $1
       ORDER BY next_run_at ASC
       LIMIT 50`,
      [now]
    );

    for (const row of pendingRes.rows) {
      try {
        await executeScheduledReport(row.id, false);
        processed++;
      } catch (err: any) {
        console.error(`[Worker Report Error] Report ID ${row.id}:`, err.message);
        errors++;
      }
    }

    if (processed > 0 || errors > 0) {
      console.log(`[Worker Scheduled Reports] Procesados: ${processed}, Errores: ${errors}`);
    }
  } catch (err: any) {
    console.error('[Worker Scheduled Reports Fatal]:', err);
  }

  return { processed, errors };
}

/**
 * Inicia el worker de reportes programados.
 * Se ejecuta cada 5 minutos (suficiente para daily/weekly/monthly).
 * En multi-réplica, idealmente sólo una instancia debería ejecutar el worker
 * (usar Cloud Scheduler + Cloud Lock o un leader election simple).
 */
export function startScheduledReportsWorker(intervalMs: number = 5 * 60 * 1000): void {
  if (workerInterval) {
    console.warn('[Worker] Ya está corriendo, ignorando start duplicado.');
    return;
  }
  console.log(`[Worker] Iniciado. Ejecutando cada ${intervalMs / 1000}s.`);
  // Ejecutar inmediatamente, luego en intervalo
  runScheduledReportsWorker().catch(console.error);
  workerInterval = setInterval(() => {
    runScheduledReportsWorker().catch(console.error);
  }, intervalMs);
}

export function stopScheduledReportsWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[Worker] Detenido.');
  }
}
