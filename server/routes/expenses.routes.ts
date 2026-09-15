import { Router, Response } from 'express';
import { requireFirebaseAuth, AuthenticatedRequest } from '../middleware/auth.middleware.ts';
import { query, getDbPool } from '../db/cloudsql.ts';
import { emitRealtimeEvent } from '../lib/realtime-events.ts';
import { scanReceiptWithGemini } from '../gemini.ts';
import PDFDocument from 'pdfkit';

const router = Router();

router.use(requireFirebaseAuth);

/**
 * GET /api/expenses/report-summary
 * Devuelve métricas, KPIs y desglose analítico para la vista previa en vivo de reportes
 */
router.get('/report-summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { start_date, end_date, lens } = req.query;

    const now = new Date();
    const startDate = (start_date as string) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = (end_date as string) || now.toISOString().slice(0, 10);

    const profileRes = await query('SELECT full_name, email, default_currency FROM public.profiles WHERE id = $1', [uid]);
    const userProfile = profileRes.rows[0] || {
      full_name: req.user!.name || 'Usuario FlowMoney',
      email: req.user!.email || '',
      default_currency: 'PEN',
    };

    let sql = `
      SELECT e.*, c.name as category_name, c.color as category_color, a.name as account_name, p.full_name as paid_by_name
      FROM public.expenses e
      LEFT JOIN public.categories c ON c.id = e.category_id
      LEFT JOIN public.accounts a ON a.id = e.account_id
      LEFT JOIN public.profiles p ON p.id = e.paid_by
      WHERE (e.user_id = $1 OR e.paid_by = $1)
        AND e.expense_date >= $2 AND e.expense_date <= $3
    `;
    const params: any[] = [uid, startDate, endDate];

    if (lens && typeof lens === 'string' && ['personal', 'couple', 'group'].includes(lens)) {
      params.push(lens);
      sql += ` AND e.lens = $${params.length}`;
    }

    sql += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    const result = await query(sql, params);
    const expenses = result.rows;

    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const currency = userProfile.default_currency || 'PEN';

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const daysInPeriod = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
    const dailyAverage = totalSpent / daysInPeriod;
    const averageTicket = expenses.length > 0 ? totalSpent / expenses.length : 0;
    const highestExpense = expenses.length > 0
      ? expenses.reduce((max, curr) => Number(curr.amount) > Number(max.amount) ? curr : max, expenses[0])
      : null;

    // Desglose por categorías
    const catMap = new Map<string, { name: string; color: string; total: number; count: number }>();
    for (const e of expenses) {
      const cName = e.category_name || 'Sin Categoría';
      const cColor = e.category_color || '#6366F1';
      const curr = catMap.get(cName) || { name: cName, color: cColor, total: 0, count: 0 };
      curr.total += Number(e.amount || 0);
      curr.count += 1;
      catMap.set(cName, curr);
    }
    const categoriesBreakdown = Array.from(catMap.values())
      .map(c => ({
        ...c,
        percentage: totalSpent > 0 ? Number(((c.total / totalSpent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Desglose por lente
    const lensBreakdown = {
      personal: { total: 0, count: 0, percentage: 0 },
      couple: { total: 0, count: 0, percentage: 0 },
      group: { total: 0, count: 0, percentage: 0 },
    };
    for (const e of expenses) {
      const l = (e.lens as 'personal' | 'couple' | 'group') || 'personal';
      if (lensBreakdown[l]) {
        lensBreakdown[l].total += Number(e.amount || 0);
        lensBreakdown[l].count += 1;
      }
    }
    for (const key of ['personal', 'couple', 'group'] as const) {
      lensBreakdown[key].percentage = totalSpent > 0 ? Number(((lensBreakdown[key].total / totalSpent) * 100).toFixed(1)) : 0;
    }

    // Desglose por cuentas
    const accMap = new Map<string, { name: string; total: number; count: number }>();
    for (const e of expenses) {
      const aName = e.account_name || 'Sin cuenta específica';
      const curr = accMap.get(aName) || { name: aName, total: 0, count: 0 };
      curr.total += Number(e.amount || 0);
      curr.count += 1;
      accMap.set(aName, curr);
    }
    const accountsBreakdown = Array.from(accMap.values())
      .map(a => ({
        ...a,
        percentage: totalSpent > 0 ? Number(((a.total / totalSpent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return res.json({
      user: {
        full_name: userProfile.full_name,
        email: userProfile.email,
        currency,
      },
      summary: {
        total_spent: totalSpent,
        transaction_count: expenses.length,
        days_in_period: daysInPeriod,
        daily_average: dailyAverage,
        average_ticket: averageTicket,
        highest_expense: highestExpense ? {
          description: highestExpense.description,
          amount: Number(highestExpense.amount),
          date: highestExpense.expense_date,
          category_name: highestExpense.category_name,
        } : null,
        start_date: startDate,
        end_date: endDate,
        lens: lens || 'all',
      },
      categories_breakdown: categoriesBreakdown,
      lens_breakdown: lensBreakdown,
      accounts_breakdown: accountsBreakdown,
      expenses_sample: expenses.slice(0, 30),
      total_records: expenses.length,
    });
  } catch (error: any) {
    console.error('[API Report Summary Error]:', error);
    return res.status(500).json({ error: 'Error al generar resumen del reporte', message: error.message });
  }
});

/**
 * GET /api/expenses/export
 * Genera y descarga reporte de movimientos reales en formato CSV, PDF o JSON
 */
router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { format = 'csv', start_date, end_date, lens } = req.query;

    const now = new Date();
    const startDate = (start_date as string) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = (end_date as string) || now.toISOString().slice(0, 10);

    // 1. Obtener datos del perfil para cabeceras del reporte
    const profileRes = await query('SELECT full_name, email, default_currency FROM public.profiles WHERE id = $1', [uid]);
    const userProfile = profileRes.rows[0] || {
      full_name: req.user!.name || 'Usuario FlowMoney',
      email: req.user!.email || '',
      default_currency: 'PEN',
    };

    // 2. Consulta de movimientos en el rango
    let sql = `
      SELECT e.*, c.name as category_name, c.color as category_color, a.name as account_name, p.full_name as paid_by_name
      FROM public.expenses e
      LEFT JOIN public.categories c ON c.id = e.category_id
      LEFT JOIN public.accounts a ON a.id = e.account_id
      LEFT JOIN public.profiles p ON p.id = e.paid_by
      WHERE (e.user_id = $1 OR e.paid_by = $1)
        AND e.expense_date >= $2 AND e.expense_date <= $3
    `;
    const params: any[] = [uid, startDate, endDate];

    if (lens && typeof lens === 'string' && ['personal', 'couple', 'group'].includes(lens)) {
      params.push(lens);
      sql += ` AND e.lens = $${params.length}`;
    }

    sql += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    const result = await query(sql, params);
    const expenses = result.rows;

    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const currency = userProfile.default_currency || 'PEN';

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const daysInPeriod = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
    const dailyAverage = totalSpent / daysInPeriod;
    const averageTicket = expenses.length > 0 ? totalSpent / expenses.length : 0;

    // Desglose de categorías
    const catMap = new Map<string, { name: string; color: string; total: number; count: number }>();
    for (const e of expenses) {
      const cName = e.category_name || 'Sin Categoría';
      const cColor = e.category_color || '#6366F1';
      const curr = catMap.get(cName) || { name: cName, color: cColor, total: 0, count: 0 };
      curr.total += Number(e.amount || 0);
      curr.count += 1;
      catMap.set(cName, curr);
    }
    const categoriesBreakdown = Array.from(catMap.values())
      .map(c => ({
        ...c,
        percentage: totalSpent > 0 ? Number(((c.total / totalSpent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Desglose por lente
    const lensBreakdown = {
      personal: { total: 0, count: 0, percentage: 0 },
      couple: { total: 0, count: 0, percentage: 0 },
      group: { total: 0, count: 0, percentage: 0 },
    };
    for (const e of expenses) {
      const l = (e.lens as 'personal' | 'couple' | 'group') || 'personal';
      if (lensBreakdown[l]) {
        lensBreakdown[l].total += Number(e.amount || 0);
        lensBreakdown[l].count += 1;
      }
    }
    for (const key of ['personal', 'couple', 'group'] as const) {
      lensBreakdown[key].percentage = totalSpent > 0 ? Number(((lensBreakdown[key].total / totalSpent) * 100).toFixed(1)) : 0;
    }

    // ------------------------------------------------------------------------
    // CASO A: Exportación a JSON (Respaldo Completo de Datos)
    // ------------------------------------------------------------------------
    if (format === 'json') {
      const filename = `flowmoney_backup_${startDate}_al_${endDate}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      return res.status(200).json({
        app: 'FlowMoney',
        export_type: 'Full Expense & Audit Backup',
        exported_at: new Date().toISOString(),
        user: {
          id: uid,
          full_name: userProfile.full_name,
          email: userProfile.email,
          currency,
        },
        period: {
          start_date: startDate,
          end_date: endDate,
          days: daysInPeriod,
          lens_filter: lens || 'all',
        },
        summary: {
          total_spent: totalSpent,
          transaction_count: expenses.length,
          daily_average: dailyAverage,
          average_ticket: averageTicket,
        },
        categories_breakdown: categoriesBreakdown,
        lens_breakdown: lensBreakdown,
        expenses,
      });
    }

    // ------------------------------------------------------------------------
    // CASO B: Exportación a CSV Enriquecido y Estructurado
    // ------------------------------------------------------------------------
    if (format === 'csv') {
      const filename = `flowmoney_reporte_${startDate}_al_${endDate}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // BOM para compatibilidad con Excel (acentos y ñ)
      let csvContent = '\uFEFF';
      csvContent += `# FLOWMONEY - REPORTE DE MOVIMIENTOS Y AUDITORÍA FINANCIERA\r\n`;
      csvContent += `# Titular: ${userProfile.full_name} (${userProfile.email})\r\n`;
      csvContent += `# Período: ${startDate} al ${endDate} (${daysInPeriod} días)\r\n`;
      csvContent += `# Moneda Base: ${currency}\r\n`;
      csvContent += `# Total Gastado: ${currency} ${totalSpent.toFixed(2)}\r\n`;
      csvContent += `# Total Transacciones: ${expenses.length}\r\n`;
      csvContent += `# Promedio Diario: ${currency} ${dailyAverage.toFixed(2)}\r\n`;
      csvContent += `# Generado el: ${new Date().toLocaleString('es-ES')}\r\n`;
      csvContent += `#\r\n`;
      csvContent += 'ID,Fecha,Concepto / Descripción,Categoría,Cuenta de Origen,Ámbito / Lente,Pagado Por,Moneda,Importe,Notas,Comprobante\r\n';

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      for (const e of expenses) {
        const lensLabel = e.lens === 'couple' ? 'Pareja' : e.lens === 'group' ? 'Grupal' : 'Personal';
        const row = [
          escapeCsv(e.id),
          escapeCsv(e.expense_date),
          escapeCsv(e.description),
          escapeCsv(e.category_name || 'General'),
          escapeCsv(e.account_name || 'Sin Cuenta'),
          escapeCsv(lensLabel),
          escapeCsv(e.paid_by_name || 'Tú'),
          escapeCsv(e.currency || currency),
          Number(e.amount || 0).toFixed(2),
          escapeCsv(e.notes || ''),
          escapeCsv(e.receipt_url ? 'Adjunto' : 'Sin comprobante'),
        ];
        csvContent += row.join(',') + '\r\n';
      }

      // Fila de total al final para fórmulas de hoja de cálculo
      csvContent += `\r\n,,,,,,,,TOTAL EGRESOS,${currency} ${totalSpent.toFixed(2)},\r\n`;

      return res.status(200).send(csvContent);
    }

    // ------------------------------------------------------------------------
    // CASO C: Exportación a PDF Ejecutivo con PDFKit
    // ------------------------------------------------------------------------
    const filename = `flowmoney_reporte_ejecutivo_${startDate}_al_${endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
      info: {
        Title: `Reporte Ejecutivo FlowMoney - ${startDate} a ${endDate}`,
        Author: 'FlowMoney Intelligence',
        Subject: `Auditoría y desglose de gastos para ${userProfile.full_name}`,
      },
    });

    doc.pipe(res);

    // 1. Barra superior decorativa
    doc.rect(0, 0, 595, 6).fill('#4F46E5');

    // 2. Encabezado institucional
    doc.fillColor('#1E1B4B').fontSize(18).font('Helvetica-Bold').text('FLOWMONEY', 40, 32);
    doc.fillColor('#4F46E5').fontSize(8.5).font('Helvetica-Bold').text('REPORTE FINANCIERO EJECUTIVO & AUDITORÍA DE MOVIMIENTOS', 40, 54);

    const reportCode = `FM-${startDate.replace(/-/g, '').slice(2)}-${endDate.replace(/-/g, '').slice(2)}`;
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(`Código de Auditoría: ${reportCode}`, 360, 34, { width: 195, align: 'right' });
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-ES', { dateStyle: 'medium' })}`, 360, 46, { width: 195, align: 'right' });
    doc.text(`Moneda Base: ${currency}`, 360, 58, { width: 195, align: 'right' });

    // Línea divisoria sutil
    doc.lineWidth(0.75).strokeColor('#E2E8F0').moveTo(40, 72).lineTo(555, 72).stroke();

    // 3. Tira de Información del Titular y Parámetros
    let currentY = 82;
    doc.roundedRect(40, currentY, 515, 26, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold');
    doc.text(`Titular:`, 48, currentY + 8);
    doc.font('Helvetica').fillColor('#0F172A').text(`${userProfile.full_name} (${userProfile.email})`, 82, currentY + 8);
    doc.font('Helvetica-Bold').fillColor('#334155').text(`Rango:`, 310, currentY + 8);
    doc.font('Helvetica').fillColor('#0F172A').text(`${startDate} al ${endDate} (${daysInPeriod} días)`, 345, currentY + 8);
    const lensText = lens === 'personal' ? 'Personal' : lens === 'couple' ? 'Pareja' : lens === 'group' ? 'Grupal' : 'Todos';
    doc.font('Helvetica-Bold').fillColor('#4F46E5').text(`[Lente: ${lensText}]`, 480, currentY + 8, { width: 68, align: 'right' });

    // 4. Tres Tarjetas de Métricas Ejecutivas (KPIs)
    currentY = 118;
    const cardWidth = 165;
    const cardHeight = 62;

    // KPI 1: Total Gastado
    doc.roundedRect(40, currentY, cardWidth, cardHeight, 6).fillAndStroke('#EEF2FF', '#C7D2FE');
    doc.fillColor('#4338CA').fontSize(7.5).font('Helvetica-Bold').text('TOTAL EGRESOS DEL PERÍODO', 50, currentY + 8);
    doc.fillColor('#1E1B4B').fontSize(14).font('Helvetica-Bold').text(`${currency} ${totalSpent.toFixed(2)}`, 50, currentY + 22);
    doc.fillColor('#6366F1').fontSize(7.5).font('Helvetica').text(`${expenses.length} movimientos registrados`, 50, currentY + 44);

    // KPI 2: Promedio Diario
    doc.roundedRect(215, currentY, cardWidth, cardHeight, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold').text('PROMEDIO DIARIO ESTIMADO', 225, currentY + 8);
    doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text(`${currency} ${dailyAverage.toFixed(2)} / día`, 225, currentY + 22);
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(`Ticket prom: ${currency} ${averageTicket.toFixed(2)}`, 225, currentY + 44);

    // KPI 3: Categoría Top o Mayor Gasto
    const topCategory = categoriesBreakdown[0];
    doc.roundedRect(390, currentY, cardWidth, cardHeight, 6).fillAndStroke('#ECFDF5', '#A7F3D0');
    doc.fillColor('#047857').fontSize(7.5).font('Helvetica-Bold').text('CATEGORÍA DE MAYOR IMPACTO', 400, currentY + 8);
    const topCatName = (topCategory?.name || 'General').length > 18 ? (topCategory?.name || 'General').slice(0, 16) + '...' : (topCategory?.name || 'General');
    doc.fillColor('#064E3B').fontSize(12).font('Helvetica-Bold').text(topCatName, 400, currentY + 22);
    doc.fillColor('#059669').fontSize(7.5).font('Helvetica').text(
      topCategory ? `${currency} ${topCategory.total.toFixed(2)} (${topCategory.percentage}%)` : 'Sin registros',
      400,
      currentY + 44
    );

    // 5. Bloque Analítico: Categorías & Lentes
    currentY = 190;
    doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica-Bold').text('Desglose Analítico por Categorías y Ámbitos', 40, currentY);
    currentY += 15;

    // Caja izquierda: Top 4 Categorías con barras visuales
    const boxWidth = 250;
    doc.roundedRect(40, currentY, boxWidth, 90, 5).fillAndStroke('#FFFFFF', '#E2E8F0');
    doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold').text('TOP CATEGORÍAS DE GASTO', 50, currentY + 8);

    let catY = currentY + 22;
    if (categoriesBreakdown.length === 0) {
      doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('Sin movimientos categorizados', 50, catY);
    } else {
      for (const cat of categoriesBreakdown.slice(0, 4)) {
        doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica-Bold');
        const cName = cat.name.length > 16 ? cat.name.slice(0, 15) + '..' : cat.name;
        doc.text(cName, 50, catY);
        doc.fillColor('#64748B').font('Helvetica').text(`${currency} ${cat.total.toFixed(2)} (${cat.percentage}%)`, 160, catY, { width: 120, align: 'right' });

        // Barra de progreso visual
        doc.roundedRect(50, catY + 9, 230, 3.5, 1.5).fill('#F1F5F9');
        const barWidth = Math.max(3, Math.min(230, (cat.percentage / 100) * 230));
        doc.roundedRect(50, catY + 9, barWidth, 3.5, 1.5).fill(cat.color || '#6366F1');

        catY += 16;
      }
    }

    // Caja derecha: Distribución por Lente y Cuenta
    doc.roundedRect(305, currentY, boxWidth, 90, 5).fillAndStroke('#FFFFFF', '#E2E8F0');
    doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold').text('DISTRIBUCIÓN POR ÁMBITO DE GASTO', 315, currentY + 8);

    let lensY = currentY + 22;
    const lensItems = [
      { label: 'Personal', val: lensBreakdown.personal, color: '#6366F1' },
      { label: 'Pareja', val: lensBreakdown.couple, color: '#EC4899' },
      { label: 'Grupal / Amigos', val: lensBreakdown.group, color: '#06B6D4' },
    ];
    for (const item of lensItems) {
      doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica-Bold').text(item.label, 315, lensY);
      doc.fillColor('#64748B').font('Helvetica').text(`${currency} ${item.val.total.toFixed(2)} (${item.val.percentage}%)`, 425, lensY, { width: 120, align: 'right' });

      doc.roundedRect(315, lensY + 9, 230, 3.5, 1.5).fill('#F1F5F9');
      const bWidth = Math.max(3, Math.min(230, (item.val.percentage / 100) * 230));
      doc.roundedRect(315, lensY + 9, bWidth, 3.5, 1.5).fill(item.color);

      lensY += 16;
    }

    // 6. Tabla Detallada de Transacciones
    currentY = 305;
    doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica-Bold').text('Registro Auditado de Transacciones', 40, currentY);
    currentY += 14;

    const drawTableHeader = (y: number) => {
      doc.rect(40, y, 515, 20).fill('#1E1B4B');
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
      doc.text('FECHA', 48, y + 6);
      doc.text('CONCEPTO / DESCRIPCIÓN', 110, y + 6);
      doc.text('CATEGORÍA', 260, y + 6);
      doc.text('CUENTA ORIGEN', 360, y + 6);
      doc.text('ÁMBITO', 440, y + 6);
      doc.text('IMPORTE', 495, y + 6, { width: 52, align: 'right' });
    };

    drawTableHeader(currentY);
    currentY += 20;

    if (expenses.length === 0) {
      doc.rect(40, currentY, 515, 30).fill('#FFFFFF');
      doc.fillColor('#94A3B8').fontSize(8.5).font('Helvetica').text('No se encontraron movimientos registrados en el período especificado.', 50, currentY + 10);
      currentY += 35;
    } else {
      let isAlt = false;
      for (const e of expenses) {
        if (currentY > 740) {
          doc.addPage();
          // Redibujar encabezado de página y tabla
          doc.rect(0, 0, 595, 6).fill('#4F46E5');
          doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(`Reporte FlowMoney (${startDate} - ${endDate}) • Continuación`, 40, 25);
          currentY = 40;
          drawTableHeader(currentY);
          currentY += 20;
        }

        const rowHeight = 19;
        doc.rect(40, currentY, 515, rowHeight).fill(isAlt ? '#F8FAFC' : '#FFFFFF');
        isAlt = !isAlt;

        // Línea sutil separadora
        doc.lineWidth(0.5).strokeColor('#F1F5F9').moveTo(40, currentY + rowHeight).lineTo(555, currentY + rowHeight).stroke();

        doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica');
        doc.text(String(e.expense_date || '').slice(0, 10), 48, currentY + 5);

        // Concepto
        const desc = (e.description || 'Gasto').length > 34 ? (e.description || '').slice(0, 32) + '...' : e.description;
        doc.text(desc, 110, currentY + 5);

        // Categoría
        const cat = (e.category_name || 'General').length > 20 ? (e.category_name || '').slice(0, 18) + '...' : (e.category_name || 'General');
        doc.text(cat, 260, currentY + 5);

        // Cuenta
        const acc = (e.account_name || 'Sin cuenta').length > 16 ? (e.account_name || '').slice(0, 14) + '...' : (e.account_name || 'Sin cuenta');
        doc.fillColor('#64748B').text(acc, 360, currentY + 5);

        // Lente
        const lensLbl = e.lens === 'couple' ? 'Pareja' : e.lens === 'group' ? 'Grupal' : 'Personal';
        doc.text(lensLbl, 440, currentY + 5);

        // Monto
        doc.fillColor('#0F172A').font('Helvetica-Bold').text(
          `${Number(e.amount || 0).toFixed(2)}`,
          495,
          currentY + 5,
          { width: 52, align: 'right' }
        );

        currentY += rowHeight;
      }

      // Fila de gran total
      if (currentY > 740) {
        doc.addPage();
        currentY = 40;
      }
      doc.rect(40, currentY, 515, 24).fill('#EEF2FF');
      doc.lineWidth(1).strokeColor('#C7D2FE').moveTo(40, currentY).lineTo(555, currentY).stroke();
      doc.lineWidth(1).strokeColor('#4F46E5').moveTo(40, currentY + 24).lineTo(555, currentY + 24).stroke();

      doc.fillColor('#1E1B4B').fontSize(8.5).font('Helvetica-Bold');
      doc.text(`TOTAL AUDITADO (${expenses.length} MOVIMIENTOS):`, 110, currentY + 7);
      doc.fillColor('#4338CA').fontSize(9.5).text(
        `${currency} ${totalSpent.toFixed(2)}`,
        440,
        currentY + 6,
        { width: 107, align: 'right' }
      );
    }

    // Pie de página en todas las páginas
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).font('Helvetica').fillColor('#94A3B8').text(
        `FlowMoney Intelligence • Documento oficial membretado • Sincronizado en Google Cloud SQL y Firebase • Página ${i + 1} de ${totalPages}`,
        40,
        800,
        { align: 'center', width: 515 }
      );
    }

    doc.end();
  } catch (error: any) {
    console.error('[API Expenses Export Error]:', error);
    return res.status(500).json({ error: 'Error al exportar reporte', message: error.message });
  }
});

/**
 * GET /api/expenses/frequent
 * Devuelve descripciones y categorías de gastos frecuentes del usuario para autocompletado
 */
router.get('/frequent', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const sql = `
      SELECT description, category_id, COUNT(*) as frequency
      FROM public.expenses
      WHERE user_id = $1
      GROUP BY description, category_id
      ORDER BY frequency DESC, MAX(expense_date) DESC
      LIMIT 8
    `;
    const result = await query(sql, [uid]);

    // Opciones sugeridas por defecto si el usuario tiene pocos gastos aún
    const defaultSuggestions = [
      { description: 'Supermercado', frequency: 1 },
      { description: 'Café de la mañana', frequency: 1 },
      { description: 'Almuerzo de trabajo', frequency: 1 },
      { description: 'Transporte / Uber', frequency: 1 },
      { description: 'Farmacia', frequency: 1 },
      { description: 'Cena en pareja', frequency: 1 },
      { description: 'Servicios de streaming', frequency: 1 },
    ];

    const merged = result.rows.length > 0 ? result.rows : defaultSuggestions;
    return res.json({ frequent: merged });
  } catch (error: any) {
    console.error('[API Expenses Frequent Error]:', error);
    return res.status(500).json({ error: 'Error obteniendo gastos frecuentes', message: error.message });
  }
});

/**
 * GET /api/expenses
 * Lista los gastos asociados al usuario verificado con paginación eficiente y búsqueda
 * Regla: No descargar todos los gastos si solo se necesitan los últimos 20
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      lens,
      limit = 20,
      offset = 0,
      search,
      category_id,
      account_id,
      start_date,
      end_date,
    } = req.query;

    const parsedLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const parsedOffset = Math.max(0, Number(offset) || 0);

    let whereClauses = ['(e.user_id = $1 OR e.paid_by = $1)'];
    const params: any[] = [uid];

    if (lens && typeof lens === 'string' && ['personal', 'couple', 'group'].includes(lens)) {
      params.push(lens);
      whereClauses.push(`e.lens = $${params.length}`);
    }

    if (category_id && typeof category_id === 'string' && category_id !== 'all') {
      params.push(category_id);
      whereClauses.push(`e.category_id = $${params.length}`);
    }

    if (account_id && typeof account_id === 'string' && account_id !== 'all') {
      params.push(account_id);
      whereClauses.push(`e.account_id = $${params.length}`);
    }

    if (start_date && typeof start_date === 'string') {
      params.push(start_date);
      whereClauses.push(`e.expense_date >= $${params.length}`);
    }

    if (end_date && typeof end_date === 'string') {
      params.push(end_date);
      whereClauses.push(`e.expense_date <= $${params.length}`);
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      params.push(`%${search.trim().toLowerCase()}%`);
      whereClauses.push(`LOWER(e.description) LIKE $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // 1. Consulta de conteo total para cálculo de páginas en el cliente
    const countSql = `SELECT COUNT(*) as total FROM public.expenses e WHERE ${whereStr}`;
    const countRes = await query(countSql, params);
    const totalCount = Number(countRes.rows[0]?.total || 0);

    // 2. Consulta paginada con LIMIT y OFFSET
    let dataSql = `
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
      FROM public.expenses e
      LEFT JOIN public.categories c ON c.id = e.category_id
      LEFT JOIN public.accounts a ON a.id = e.account_id
      WHERE ${whereStr}
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataParams = [...params, parsedLimit, parsedOffset];
    const result = await query(dataSql, dataParams);

    const hasMore = parsedOffset + result.rows.length < totalCount;

    return res.json({
      expenses: result.rows,
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore,
      },
    });
  } catch (error: any) {
    console.error('[API Expenses GET Error]:', error);
    return res.status(500).json({ error: 'Error al obtener gastos', message: error.message });
  }
});

/**
 * POST /api/expenses
 * Registra un gasto e inserta sus expense_shares dentro de una ÚNICA transacción atómica de Postgres
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      amount,
      currency = 'PEN',
      description,
      expense_date,
      lens = 'personal',
      category_id,
      account_id,
      group_id,
      paid_by,
      receipt_url,
      notes,
      split_type = 'equal',
      shares = [],
    } = req.body;

    if (!amount || Number(amount) <= 0 || !description) {
      return res.status(400).json({ error: 'Monto y descripción requeridos' });
    }

    const payer = paid_by || uid;
    const date = expense_date || new Date().toISOString().slice(0, 10);
    const numAmount = Number(amount);

    // Validación y corrección de moneda única por grupo:
    // Si el gasto pertenece a un grupo o pareja con group_id, forzar el currency de dicho grupo
    let finalGroupId = group_id || null;
    let enforcedCurrency = currency;
    if (finalGroupId) {
      // Control de seguridad IDOR: verificar que el usuario pertenece al grupo
      const memberCheck = await query(
        'SELECT 1 FROM public.group_members WHERE group_id = $1 AND user_id = $2',
        [finalGroupId, uid]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'No perteneces al grupo especificado' });
      }

      const groupRes = await query('SELECT currency FROM public.groups WHERE id = $1', [finalGroupId]);
      if (groupRes.rows.length > 0 && groupRes.rows[0].currency) {
        enforcedCurrency = groupRes.rows[0].currency;
      }
    } else if (lens === 'couple') {
      const coupleRes = await query(
        `SELECT g.id, g.currency FROM public.groups g JOIN public.group_members gm ON gm.group_id = g.id WHERE gm.user_id = $1 AND g.type = 'couple' LIMIT 1`,
        [uid]
      );
      if (coupleRes.rows.length > 0) {
        finalGroupId = coupleRes.rows[0].id;
        if (coupleRes.rows[0].currency) {
          enforcedCurrency = coupleRes.rows[0].currency;
        }
      }
    }

    // Control de seguridad: si se especifica cuenta bancaria, verificar que pertenezca al usuario
    if (account_id) {
      const accCheck = await query(
        'SELECT 1 FROM public.accounts WHERE id = $1 AND user_id = $2',
        [account_id, uid]
      );
      if (accCheck.rows.length === 0) {
        return res.status(403).json({ error: 'La cuenta bancaria especificada no pertenece al usuario' });
      }
    }

    const pool = await getDbPool();

    if (pool) {
      // Transacción atómica en PostgreSQL real
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Insertar el gasto
        const expenseInsertSql = `
          INSERT INTO public.expenses (
            user_id, paid_by, group_id, account_id, category_id,
            amount, currency, description, expense_date, lens, receipt_url, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `;

        const expResult = await client.query(expenseInsertSql, [
          uid,
          payer,
          finalGroupId,
          account_id || null,
          category_id || null,
          numAmount,
          enforcedCurrency,
          description.trim(),
          date,
          lens,
          receipt_url || null,
          notes || null,
        ]);

        const createdExpense = expResult.rows[0];

        // 2. Insertar expense_shares si corresponde (en pareja o grupo)
        const insertedShares = [];
        if (Array.isArray(shares) && shares.length > 0 && lens !== 'personal') {
          for (const s of shares) {
            const shareInsertSql = `
              INSERT INTO public.expense_shares (
                expense_id, user_id, owed_amount, percentage
              ) VALUES ($1, $2, $3, $4)
              RETURNING *
            `;
            const shareRes = await client.query(shareInsertSql, [
              createdExpense.id,
              s.user_id,
              Number(s.owed_amount || 0),
              s.percentage !== undefined ? Number(s.percentage) : null,
            ]);
            insertedShares.push(shareRes.rows[0]);
          }
        }

        // 3. Descontar saldo de la cuenta de origen si el pagador es el usuario
        if (account_id && payer === uid) {
          await client.query(
            `UPDATE public.accounts
             SET current_balance = current_balance - $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND user_id = $3`,
            [numAmount, account_id, uid]
          );
        }

        await client.query('COMMIT');

        // Notificación en tiempo real a Firestore (Fase 5)
        if (createdExpense.group_id) {
          emitRealtimeEvent(
            {
              type: 'expense_created',
              group_id: createdExpense.group_id,
              actor_uid: uid,
            },
            req.headers.authorization
          ).catch((e) => console.warn('[Realtime Event Expense Error]:', e));
        }

        // 4. Obtener información complementaria para respuesta
        let categoryName = null;
        let categoryColor = null;
        if (category_id) {
          const cRes = await client.query('SELECT name, color FROM public.categories WHERE id = $1', [category_id]);
          if (cRes.rows[0]) {
            categoryName = cRes.rows[0].name;
            categoryColor = cRes.rows[0].color;
          }
        }

        return res.status(201).json({
          success: true,
          expense: {
            ...createdExpense,
            category_name: categoryName,
            category_color: categoryColor,
            shares: insertedShares,
          },
        });
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[Transaction Error in POST /expenses]:', err);
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Fallback local memoryStore para desarrollo ágil
      const expRes = await query(
        `INSERT INTO public.expenses (
          user_id, paid_by, group_id, account_id, category_id,
          amount, currency, description, expense_date, lens, receipt_url, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          uid,
          payer,
          finalGroupId,
          account_id || null,
          category_id || null,
          numAmount,
          enforcedCurrency,
          description.trim(),
          date,
          lens,
          receipt_url || null,
          notes || null,
        ]
      );

      const createdExpense = expRes.rows[0];

      // 2. Insertar participantes (expense_shares) en memoria si corresponde
      const insertedShares: any[] = [];
      if (Array.isArray(shares) && shares.length > 0 && lens !== 'personal') {
        for (const s of shares) {
          const shareInsertSql = `
            INSERT INTO public.expense_shares (
              expense_id, user_id, owed_amount, percentage
            ) VALUES ($1, $2, $3, $4)
            RETURNING *
          `;
          const shareRes = await query(shareInsertSql, [
            createdExpense.id,
            s.user_id,
            Number(s.owed_amount || 0),
            s.percentage !== undefined && s.percentage !== null ? Number(s.percentage) : null,
          ]);
          if (shareRes.rows && shareRes.rows[0]) {
            insertedShares.push(shareRes.rows[0]);
          }
        }
      }

      // Notificación en tiempo real a Firestore en fallback local (Fase 5)
      if (createdExpense.group_id) {
        emitRealtimeEvent(
          {
            type: 'expense_created',
            group_id: createdExpense.group_id,
            actor_uid: uid,
          },
          req.headers.authorization
        ).catch((e) => console.warn('[Realtime Event Expense Local Error]:', e));
      }

      // Actualizar balance de cuenta en memoria si corresponde
      if (account_id && payer === uid) {
        await query(
          'UPDATE public.accounts SET current_balance = current_balance - $1 WHERE id = $2 AND user_id = $3',
          [numAmount, account_id, uid]
        );
      }

      // Enriquecer con nombre de categoría si existe
      let categoryName = null;
      let categoryColor = null;
      if (category_id) {
        const catRes = await query('SELECT name, color FROM public.categories WHERE id = $1', [category_id]);
        if (catRes.rows && catRes.rows[0]) {
          categoryName = catRes.rows[0].name;
          categoryColor = catRes.rows[0].color;
        }
      }

      return res.status(201).json({
        success: true,
        expense: {
          ...createdExpense,
          category_name: categoryName,
          category_color: categoryColor,
          shares: insertedShares,
        },
      });
    }
  } catch (error: any) {
    console.error('[API Expenses POST Error]:', error);
    return res.status(500).json({ error: 'Error al registrar gasto', message: error.message });
  }
});

/**
 * PUT /api/expenses/:id
 * Actualiza un gasto existente, reajusta saldos bancarios y participaciones
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const {
      amount,
      currency,
      description,
      expense_date,
      category_id,
      account_id,
      lens,
      notes,
      receipt_url,
      split_type = 'equal',
      shares = [],
    } = req.body;

    if (amount !== undefined && Number(amount) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser un valor positivo' });
    }

    if (description !== undefined && !description.trim()) {
      return res.status(400).json({ error: 'La descripción no puede estar vacía' });
    }

    // 1. Obtener el gasto existente
    const expRes = await query('SELECT * FROM public.expenses WHERE id = $1', [id]);
    if (!expRes.rows || expRes.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const existingExpense = expRes.rows[0];

    // Verificar permisos: creador, pagador o miembro del grupo
    let hasPermission = existingExpense.user_id === uid || existingExpense.paid_by === uid;
    if (!hasPermission && existingExpense.group_id) {
      const memberRes = await query(
        'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
        [existingExpense.group_id, uid]
      );
      if (memberRes.rows.length > 0) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ error: 'No tienes permisos para editar este gasto' });
    }

    const oldAmount = Number(existingExpense.amount || 0);
    const newAmount = amount !== undefined ? Number(amount) : oldAmount;
    const oldAccountId = existingExpense.account_id;
    const newAccountId = account_id !== undefined ? account_id : oldAccountId;
    const oldPaidBy = existingExpense.paid_by;

    // Control de seguridad: validar titularidad de la cuenta si fue modificada
    if (newAccountId && newAccountId !== oldAccountId) {
      const accCheck = await query(
        'SELECT 1 FROM public.accounts WHERE id = $1 AND user_id = $2',
        [newAccountId, uid]
      );
      if (accCheck.rows.length === 0) {
        return res.status(403).json({ error: 'La cuenta bancaria seleccionada no pertenece al usuario' });
      }
    }

    const newDescription = description !== undefined ? description.trim() : existingExpense.description;
    const newCurrency = currency || existingExpense.currency || 'PEN';
    const newExpenseDate = expense_date || existingExpense.expense_date;
    const newCategoryId = category_id !== undefined ? category_id : existingExpense.category_id;
    const newLens = lens || existingExpense.lens || 'personal';
    const newNotes = notes !== undefined ? (notes ? notes.trim() : null) : existingExpense.notes;
    const newReceiptUrl = receipt_url !== undefined ? receipt_url : existingExpense.receipt_url;

    const pool = await getDbPool();

    let updatedExpense: any;
    let updatedShares: any[] = [];

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Reajuste de saldos de cuentas bancarias
        if (oldPaidBy === uid) {
          if (oldAccountId === newAccountId) {
            const diff = newAmount - oldAmount;
            if (diff !== 0 && oldAccountId) {
              if (diff > 0) {
                await client.query(
                  'UPDATE public.accounts SET current_balance = current_balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
                  [diff, oldAccountId, uid]
                );
              } else {
                await client.query(
                  'UPDATE public.accounts SET current_balance = current_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
                  [Math.abs(diff), oldAccountId, uid]
                );
              }
            }
          } else {
            if (oldAccountId && oldAmount > 0) {
              await client.query(
                'UPDATE public.accounts SET current_balance = current_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
                [oldAmount, oldAccountId, uid]
              );
            }
            if (newAccountId && newAmount > 0) {
              await client.query(
                'UPDATE public.accounts SET current_balance = current_balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
                [newAmount, newAccountId, uid]
              );
            }
          }
        }

        // Actualizar el registro del gasto
        const updateSql = `
          UPDATE public.expenses
          SET description = $1, amount = $2, currency = $3, expense_date = $4,
              category_id = $5, account_id = $6, lens = $7, notes = $8,
              receipt_url = $9, updated_at = CURRENT_TIMESTAMP
          WHERE id = $10
          RETURNING *
        `;
        const updateResult = await client.query(updateSql, [
          newDescription,
          newAmount,
          newCurrency,
          newExpenseDate,
          newCategoryId || null,
          newAccountId || null,
          newLens,
          newNotes,
          newReceiptUrl || null,
          id,
        ]);
        updatedExpense = updateResult.rows[0];

        // Actualizar participaciones si se pasaron shares
        if (Array.isArray(shares) && shares.length > 0) {
          await client.query('DELETE FROM public.expense_shares WHERE expense_id = $1', [id]);
          for (const s of shares) {
            const shareInsertSql = `
              INSERT INTO public.expense_shares (
                expense_id, user_id, owed_amount, percentage
              ) VALUES ($1, $2, $3, $4)
              RETURNING *
            `;
            const shareRes = await client.query(shareInsertSql, [
              id,
              s.user_id,
              Number(s.owed_amount || 0),
              s.percentage !== undefined ? Number(s.percentage) : null,
            ]);
            updatedShares.push(shareRes.rows[0]);
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Reajuste en memoria / fallback
      if (oldPaidBy === uid) {
        if (oldAccountId === newAccountId) {
          const diff = newAmount - oldAmount;
          if (diff !== 0 && oldAccountId) {
            if (diff > 0) {
              await query(
                'UPDATE public.accounts SET current_balance = current_balance - $1 WHERE id = $2 AND user_id = $3',
                [diff, oldAccountId, uid]
              );
            } else {
              await query(
                'UPDATE public.accounts SET current_balance = current_balance + $1 WHERE id = $2 AND user_id = $3',
                [Math.abs(diff), oldAccountId, uid]
              );
            }
          }
        } else {
          if (oldAccountId && oldAmount > 0) {
            await query(
              'UPDATE public.accounts SET current_balance = current_balance + $1 WHERE id = $2 AND user_id = $3',
              [oldAmount, oldAccountId, uid]
            );
          }
          if (newAccountId && newAmount > 0) {
            await query(
              'UPDATE public.accounts SET current_balance = current_balance - $1 WHERE id = $2 AND user_id = $3',
              [newAmount, newAccountId, uid]
            );
          }
        }
      }

      const updateResult = await query(
        `UPDATE public.expenses
         SET description = $1, amount = $2, currency = $3, expense_date = $4,
             category_id = $5, account_id = $6, lens = $7, notes = $8,
             receipt_url = $9
         WHERE id = $10 RETURNING *`,
        [
          newDescription,
          newAmount,
          newCurrency,
          newExpenseDate,
          newCategoryId || null,
          newAccountId || null,
          newLens,
          newNotes,
          newReceiptUrl || null,
          id,
        ]
      );
      updatedExpense = updateResult.rows[0];

      if (Array.isArray(shares) && shares.length > 0) {
        await query('DELETE FROM public.expense_shares WHERE expense_id = $1', [id]);
        for (const s of shares) {
          const sRes = await query(
            `INSERT INTO public.expense_shares (expense_id, user_id, owed_amount, percentage) VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, s.user_id, Number(s.owed_amount || 0), s.percentage !== undefined ? Number(s.percentage) : null]
          );
          updatedShares.push(sRes.rows[0]);
        }
      }
    }

    // Obtener complementos de categoría y cuenta
    let categoryName = null;
    let categoryColor = null;
    let categoryIcon = null;
    if (newCategoryId) {
      const catRes = await query('SELECT name, color, icon FROM public.categories WHERE id = $1', [newCategoryId]);
      if (catRes.rows && catRes.rows[0]) {
        categoryName = catRes.rows[0].name;
        categoryColor = catRes.rows[0].color;
        categoryIcon = catRes.rows[0].icon;
      }
    }

    let accountName = null;
    if (newAccountId) {
      const accRes = await query('SELECT name FROM public.accounts WHERE id = $1', [newAccountId]);
      if (accRes.rows && accRes.rows[0]) {
        accountName = accRes.rows[0].name;
      }
    }

    const completeExpense = {
      ...updatedExpense,
      category_name: categoryName,
      category_color: categoryColor,
      category_icon: categoryIcon,
      account_name: accountName,
      shares: updatedShares,
    };

    if (existingExpense.group_id) {
      emitRealtimeEvent(
        {
          type: 'expense_updated',
          group_id: existingExpense.group_id,
          actor_uid: uid,
        },
        req.headers.authorization
      ).catch((e) => console.warn('[Realtime Event Expense Update Error]:', e));
    }

    return res.json({
      success: true,
      message: 'Gasto actualizado exitosamente',
      expense: completeExpense,
    });
  } catch (error: any) {
    console.error('[API Expenses PUT Error]:', error);
    return res.status(500).json({ error: 'Error al actualizar gasto', message: error.message });
  }
});

/**
 * DELETE /api/expenses/:id
 * Elimina un gasto, revierte el saldo de la cuenta involucrada y elimina participaciones
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;

    // 1. Obtener gasto
    const expRes = await query('SELECT * FROM public.expenses WHERE id = $1', [id]);
    if (!expRes.rows || expRes.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const expense = expRes.rows[0];

    // 2. Verificar permisos
    // Solo el creador del gasto, el pagador registrado, o un administrador del grupo pueden eliminarlo
    let hasPermission = expense.user_id === uid || expense.paid_by === uid;
    if (!hasPermission && expense.group_id) {
      const memberRes = await query(
        'SELECT role FROM public.group_members WHERE group_id = $1 AND user_id = $2',
        [expense.group_id, uid]
      );
      if (memberRes.rows.length > 0 && memberRes.rows[0].role === 'admin') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar este gasto' });
    }

    const oldAmount = Number(expense.amount || 0);
    const oldAccountId = expense.account_id;
    const oldPaidBy = expense.paid_by;

    const pool = await getDbPool();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Revertir saldo de la cuenta si el pagador fue el usuario
        if (oldAccountId && oldPaidBy === uid && oldAmount > 0) {
          await client.query(
            `UPDATE public.accounts
             SET current_balance = current_balance + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND user_id = $3`,
            [oldAmount, oldAccountId, uid]
          );
        }

        // Eliminar participaciones del gasto
        await client.query('DELETE FROM public.expense_shares WHERE expense_id = $1', [id]);

        // Eliminar el gasto
        await client.query('DELETE FROM public.expenses WHERE id = $1', [id]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Revertir saldo en almacén persistente
      if (oldAccountId && oldPaidBy === uid && oldAmount > 0) {
        await query(
          'UPDATE public.accounts SET current_balance = current_balance + $1 WHERE id = $2 AND user_id = $3',
          [oldAmount, oldAccountId, uid]
        );
      }

      await query('DELETE FROM public.expense_shares WHERE expense_id = $1', [id]);
      await query('DELETE FROM public.expenses WHERE id = $1', [id]);
    }

    if (expense.group_id) {
      emitRealtimeEvent(
        {
          type: 'expense_deleted',
          group_id: expense.group_id,
          actor_uid: uid,
        },
        req.headers.authorization
      ).catch((e) => console.warn('[Realtime Event Expense Delete Error]:', e));
    }

    return res.json({
      success: true,
      message: 'Gasto eliminado exitosamente',
      deleted_id: id,
    });
  } catch (error: any) {
    console.error('[API Expenses DELETE Error]:', error);
    return res.status(500).json({ error: 'Error al eliminar gasto', message: error.message });
  }
});

// Mapa de rate limit para llamadas de IA por usuario (máximo 15 análisis por minuto por usuario)
const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * POST /api/expenses/scan-receipt
 * Fase 6: Autocompletar gastos escaneando el ticket con Gemini Multimodal.
 * Acepta imageBase64 o imageUrl de Firebase Storage.
 * Optimización de costos y rendimiento: Rate limit por usuario y control de payload.
 */
router.post('/scan-receipt', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;

    // 1. Control y protección de costos de IA: Rate limit 15 peticiones/minuto por usuario
    const now = Date.now();
    const userLimit = aiRateLimitMap.get(uid);
    if (userLimit && userLimit.resetAt > now) {
      if (userLimit.count >= 15) {
        return res.status(429).json({
          success: false,
          error: 'Has alcanzado el límite de escaneos por minuto. Por favor, espera unos instantes o ingresa los datos manualmente.',
        });
      }
      userLimit.count += 1;
    } else {
      aiRateLimitMap.set(uid, { count: 1, resetAt: now + 60000 });
    }

    const { imageBase64, image, imageUrl, mimeType } = req.body;

    let base64Payload = '';
    let finalMimeType = mimeType || 'image/jpeg';

    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      try {
        // F1 — SSRF mitigation: validar URL antes de descargar
        const { isUrlSafeToFetch } = await import('../lib/url-safety.ts');
        const safety = await isUrlSafeToFetch(imageUrl);
        if (!safety.safe) {
          console.warn('[Scan Receipt URL Rejected SSRF]:', safety.reason);
          return res.status(422).json({
            success: false,
            error: 'URL de imagen no permitida por políticas de seguridad',
            data: {
              amount: null,
              currency: null,
              merchant: null,
              date: null,
              suggested_category: null,
              confidence: 'low',
            },
          });
        }

        const fetchRes = await fetch(imageUrl, {
          signal: AbortSignal.timeout(10000), // F1 — timeout para evitar SSRF via timing
          redirect: 'error', // F1 — no seguir redirects externos
        });
        if (!fetchRes.ok) {
          throw new Error(`HTTP ${fetchRes.status} al descargar imagen desde Storage`);
        }
        const arrayBuf = await fetchRes.arrayBuffer();
        // F1 — limitar tamaño a 8MB para evitar payloads maliciosos
        if (arrayBuf.byteLength > 8 * 1024 * 1024) {
          throw new Error('Imagen excede el límite de 8MB');
        }
        base64Payload = Buffer.from(arrayBuf).toString('base64');
        const headerMime = fetchRes.headers.get('content-type');
        if (headerMime) finalMimeType = headerMime;
      } catch (fetchErr: any) {
        console.warn('[Scan Receipt Image Fetch Error]:', fetchErr.message);
        return res.status(422).json({
          success: false,
          error: 'No se pudo leer el ticket, complétalo manualmente',
          data: {
            amount: null,
            currency: null,
            merchant: null,
            date: null,
            suggested_category: null,
            confidence: 'low',
          },
        });
      }
    } else {
      const rawImage = imageBase64 || image;
      if (!rawImage || typeof rawImage !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Se requiere una imagen en base64 o su URL de Firebase Storage para analizar el ticket',
        });
      }

      // Si viene con formato Data URI: data:image/...;base64,...
      if (rawImage.includes(';base64,')) {
        const parts = rawImage.split(';base64,');
        const mimeMatch = parts[0].match(/data:(.*?)$/);
        if (mimeMatch) finalMimeType = mimeMatch[1];
        base64Payload = parts[1];
      } else {
        base64Payload = rawImage;
      }
    }

    if (!base64Payload || base64Payload.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Datos de imagen vacíos o inválidos',
      });
    }

    const scanResult = await scanReceiptWithGemini(base64Payload, finalMimeType);

    return res.json({
      success: true,
      data: scanResult,
    });
  } catch (error: any) {
    console.error('[API Expenses Scan Receipt Error]:', error);
    return res.status(422).json({
      success: false,
      error: 'No se pudo leer el ticket, complétalo manualmente',
      data: {
        amount: null,
        currency: null,
        merchant: null,
        date: null,
        suggested_category: null,
        confidence: 'low',
      },
    });
  }
});

export default router;
