import { query, memoryStore } from '../db/cloudsql.ts';
import PDFDocument from 'pdfkit';

export interface ReportGenerationOptions {
  reportId?: string;
  userId: string;
  userEmail: string;
  userName: string;
  currency: string;
  periodType: string;
  reportType: string;
  includeSections: string[];
  format: 'pdf' | 'excel' | 'csv';
  recipientEmail: string;
  categoryIds?: string[];
  accountIds?: string[];
}

export interface ReportGenerationResult {
  success: boolean;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  fileSizeBytes: number;
  totalExpenses: number;
  totalIncome: number;
  netBalance: number;
  itemCount: number;
  summary: any;
}

/**
 * Generador modular de reportes financieros programados o bajo demanda
 */
export async function generateFinancialReport(options: ReportGenerationOptions): Promise<ReportGenerationResult> {
  const {
    userId,
    userName,
    currency,
    periodType,
    includeSections,
    format,
    categoryIds = [],
    accountIds = [],
  } = options;

  // 1. Determinar rango de fechas según período
  const now = new Date();
  let startDate = '';
  let endDate = now.toISOString().slice(0, 10);
  let periodLabel = '';

  switch (periodType) {
    case 'today':
      startDate = endDate;
      periodLabel = 'Hoy';
      break;
    case 'week':
    case 'last_7_days': {
      const past = new Date(now.getTime() - 7 * 86400000);
      startDate = past.toISOString().slice(0, 10);
      periodLabel = 'Últimos 7 días';
      break;
    }
    case 'last_30_days': {
      const past = new Date(now.getTime() - 30 * 86400000);
      startDate = past.toISOString().slice(0, 10);
      periodLabel = 'Últimos 30 días';
      break;
    }
    case 'last_90_days': {
      const past = new Date(now.getTime() - 90 * 86400000);
      startDate = past.toISOString().slice(0, 10);
      periodLabel = 'Últimos 90 días';
      break;
    }
    case 'year': {
      startDate = `${now.getFullYear()}-01-01`;
      periodLabel = `Año ${now.getFullYear()}`;
      break;
    }
    case 'month':
    default: {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate = lastDay.toISOString().slice(0, 10);
      const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      periodLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;
      break;
    }
  }

  // 2. Extraer datos de la base de datos
  const expRes = await query(
    `SELECT e.*, c.name as category_name, c.color as category_color, a.name as account_name
     FROM public.expenses e
     LEFT JOIN public.categories c ON c.id = e.category_id
     LEFT JOIN public.accounts a ON a.id = e.account_id
     WHERE (e.user_id = $1 OR e.paid_by = $1)
       AND e.expense_date >= $2 AND e.expense_date <= $3
     ORDER BY e.expense_date DESC`,
    [userId, startDate, endDate]
  );

  let expenses = expRes.rows;
  if (categoryIds.length > 0) {
    expenses = expenses.filter((e) => categoryIds.includes(e.category_id));
  }
  if (accountIds.length > 0) {
    expenses = expenses.filter((e) => accountIds.includes(e.account_id));
  }

  const catRes = await query(
    'SELECT * FROM public.categories WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  const categories = catRes.rows;

  const accRes = await query(
    'SELECT * FROM public.accounts WHERE user_id = $1 AND is_archived = false',
    [userId]
  );
  const accounts = accRes.rows;

  const subRes = await query(
    'SELECT * FROM public.subscriptions WHERE user_id = $1 AND status = \'active\'',
    [userId]
  );
  const subscriptions = subRes.rows;

  // 3. Cálculos analíticos
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalAccountBalance = accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const totalBudget = categories.reduce((sum, c) => sum + Number(c.monthly_budget || 0), 0);
  const totalSubscriptions = subscriptions.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const budgetExecutionPercent = totalBudget > 0 ? Math.round((totalExpenses / totalBudget) * 100) : 0;

  // Desglose por categoría
  const categoryBreakdownMap = new Map<string, { name: string; color: string; budget: number; spent: number }>();
  for (const c of categories) {
    categoryBreakdownMap.set(c.id, {
      name: c.name,
      color: c.color || '#6366F1',
      budget: Number(c.monthly_budget || 0),
      spent: 0,
    });
  }
  for (const e of expenses) {
    const item = categoryBreakdownMap.get(e.category_id) || {
      name: e.category_name || 'Sin Categoría',
      color: e.category_color || '#64748B',
      budget: 0,
      spent: 0,
    };
    item.spent += Number(e.amount || 0);
    if (e.category_id) categoryBreakdownMap.set(e.category_id, item);
  }
  const categoryBreakdown = Array.from(categoryBreakdownMap.values())
    .map((c) => ({
      ...c,
      percentage: totalExpenses > 0 ? Number(((c.spent / totalExpenses) * 100).toFixed(1)) : 0,
      variance: c.budget > 0 ? Number((c.spent - c.budget).toFixed(2)) : 0,
      isExceeded: c.budget > 0 && c.spent > c.budget,
    }))
    .sort((a, b) => b.spent - a.spent);

  // 4. Formatear según formato solicitado (PDF, Excel o CSV)
  const timestamp = new Date().toISOString().slice(0, 10);
  let fileName = `FlowMoney_Reporte_${periodType}_${timestamp}.${format === 'excel' ? 'csv' : format}`;
  let mimeType = 'application/pdf';
  let buffer: Buffer;

  if (format === 'csv' || format === 'excel') {
    mimeType = 'text/csv; charset=utf-8';
    let csv = '\uFEFF'; // BOM para soporte perfecto de tildes en Excel
    csv += `# ==============================================================================\r\n`;
    csv += `# FLOWMONEY - REPORTE PROGRAMADO AUTOMÁTICO DE ESTADO FINANCIERO\r\n`;
    csv += `# Titular: ${userName}\r\n`;
    csv += `# Período: ${periodLabel} (${startDate} a ${endDate})\r\n`;
    csv += `# Moneda: ${currency}\r\n`;
    csv += `# Gasto Total: ${currency} ${totalExpenses.toFixed(2)}\r\n`;
    csv += `# Presupuesto Mensual: ${currency} ${totalBudget.toFixed(2)} (${budgetExecutionPercent}% consumido)\r\n`;
    csv += `# Saldo en Cuentas: ${currency} ${totalAccountBalance.toFixed(2)}\r\n`;
    csv += `# Suscripciones Activas: ${currency} ${totalSubscriptions.toFixed(2)} / mes\r\n`;
    csv += `# Fecha de Generación: ${new Date().toLocaleString('es-ES')}\r\n`;
    csv += `# ==============================================================================\r\n\r\n`;

    if (includeSections.includes('categories') || includeSections.includes('budgets')) {
      csv += `## DESGLOSE POR CATEGORÍAS Y CUMPLIMIENTO DE PRESUPUESTOS\r\n`;
      csv += `Categoría,Presupuesto (${currency}),Gastado (${currency}),% Participación,Variación,Estado\r\n`;
      for (const cat of categoryBreakdown) {
        const estado = cat.budget === 0 ? 'Sin Presupuesto' : cat.isExceeded ? 'EXCEDIDO' : 'DENTRO DE LÍMITE';
        csv += `"${cat.name}",${cat.budget.toFixed(2)},${cat.spent.toFixed(2)},${cat.percentage}%,${cat.variance.toFixed(2)},"${estado}"\r\n`;
      }
      csv += `\r\n`;
    }

    if (includeSections.includes('expenses')) {
      csv += `## DETALLE CRONOLÓGICO DE MOVIMIENTOS Y GASTOS\r\n`;
      csv += `Fecha,Descripción / Concepto,Categoría,Cuenta de Origen,Ámbito,Importe (${currency})\r\n`;
      for (const e of expenses) {
        const d = String(e.expense_date || '').slice(0, 10);
        const desc = (e.description || 'Gasto').replace(/"/g, '""');
        const cat = (e.category_name || 'General').replace(/"/g, '""');
        const acc = (e.account_name || 'Principal').replace(/"/g, '""');
        const lens = e.lens === 'couple' ? 'Pareja' : e.lens === 'group' ? 'Grupal' : 'Personal';
        const amt = Number(e.amount || 0).toFixed(2);
        csv += `"${d}","${desc}","${cat}","${acc}","${lens}",${amt}\r\n`;
      }
    }

    buffer = Buffer.from(csv, 'utf-8');
  } else {
    // Generar PDF con pdfkit
    fileName = `FlowMoney_Reporte_${periodType}_${timestamp}.pdf`;
    mimeType = 'application/pdf';
    buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cabecera membretada
      doc.rect(0, 0, 595, 8).fill('#4F46E5');
      doc.fillColor('#1E1B4B').fontSize(18).font('Helvetica-Bold').text('FLOWMONEY', 40, 30);
      doc.fillColor('#6366F1').fontSize(8.5).font('Helvetica-Bold').text('REPORTE FINANCIERO PROGRAMADO', 165, 36);

      doc.fillColor('#475569').fontSize(8).font('Helvetica').text(`Generado automáticamente para: ${userName}`, 40, 52);
      doc.text(`Período de auditoría: ${periodLabel} (${startDate} al ${endDate}) • Moneda: ${currency}`, 40, 64);
      doc.text(`Fecha y hora de emisión: ${new Date().toLocaleString('es-ES')}`, 40, 76);

      doc.lineWidth(1).strokeColor('#E2E8F0').moveTo(40, 92).lineTo(555, 92).stroke();

      // Tarjetas Resumen KPI
      let y = 105;
      const cardW = 165;
      const cardH = 55;

      // KPI 1: Gastos
      doc.roundedRect(40, y, cardW, cardH, 6).fillAndStroke('#FEF2F2', '#FECACA');
      doc.fillColor('#991B1B').fontSize(7.5).font('Helvetica-Bold').text('GASTO AUDITADO', 50, y + 10);
      doc.fillColor('#7F1D1D').fontSize(14).font('Helvetica-Bold').text(`${currency} ${totalExpenses.toFixed(2)}`, 50, y + 24);
      doc.fillColor('#B91C1C').fontSize(7.5).font('Helvetica').text(`${expenses.length} movimientos en total`, 50, y + 42);

      // KPI 2: Presupuesto
      doc.roundedRect(215, y, cardW, cardH, 6).fillAndStroke('#EEF2FF', '#C7D2FE');
      doc.fillColor('#3730A3').fontSize(7.5).font('Helvetica-Bold').text('PRESUPUESTO EJECUTADO', 225, y + 10);
      doc.fillColor('#1E1B4B').fontSize(14).font('Helvetica-Bold').text(`${budgetExecutionPercent}%`, 225, y + 24);
      doc.fillColor('#4338CA').fontSize(7.5).font('Helvetica').text(`Meta asignada: ${currency} ${totalBudget.toFixed(2)}`, 225, y + 42);

      // KPI 3: Saldo Disponible
      doc.roundedRect(390, y, cardW, cardH, 6).fillAndStroke('#ECFDF5', '#A7F3D0');
      doc.fillColor('#065F46').fontSize(7.5).font('Helvetica-Bold').text('DISPONIBLE EN CUENTAS', 400, y + 10);
      doc.fillColor('#064E3B').fontSize(14).font('Helvetica-Bold').text(`${currency} ${totalAccountBalance.toFixed(2)}`, 400, y + 24);
      doc.fillColor('#047857').fontSize(7.5).font('Helvetica').text(`${accounts.length} cuentas bancarias activas`, 400, y + 42);

      y = 175;

      // Sección Categorías y Variación
      if (includeSections.includes('categories') || includeSections.includes('budgets')) {
        doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('Estado de Presupuestos y Variación por Categoría', 40, y);
        y += 16;

        // Cabecera tabla categorías
        doc.rect(40, y, 515, 18).fill('#F1F5F9');
        doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold');
        doc.text('CATEGORÍA', 48, y + 5);
        doc.text('PRESUPUESTO', 170, y + 5);
        doc.text('GASTADO', 260, y + 5);
        doc.text('% CONSUMO', 345, y + 5);
        doc.text('VARIACIÓN / EXCESO', 430, y + 5, { width: 115, align: 'right' });
        y += 18;

        for (const cat of categoryBreakdown.slice(0, 8)) {
          const rowH = 18;
          doc.rect(40, y, 515, rowH).fill(cat.isExceeded ? '#FFF1F2' : '#FFFFFF');
          doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(40, y + rowH).lineTo(555, y + rowH).stroke();

          doc.fillColor(cat.isExceeded ? '#991B1B' : '#1E293B').fontSize(7.5).font(cat.isExceeded ? 'Helvetica-Bold' : 'Helvetica');
          doc.text(cat.name, 48, y + 5);
          doc.fillColor('#64748B').text(`${currency} ${cat.budget.toFixed(2)}`, 170, y + 5);
          doc.fillColor('#0F172A').text(`${currency} ${cat.spent.toFixed(2)}`, 260, y + 5);

          const percentText = cat.budget > 0 ? `${Math.round((cat.spent / cat.budget) * 100)}%` : '-';
          doc.fillColor(cat.isExceeded ? '#DC2626' : '#2563EB').text(percentText, 345, y + 5);

          const varText = cat.budget > 0
            ? (cat.isExceeded ? `+${currency} ${cat.variance.toFixed(2)} (Exceso)` : `-${currency} ${Math.abs(cat.variance).toFixed(2)}`)
            : 'Sin presupuesto';
          doc.fillColor(cat.isExceeded ? '#DC2626' : '#059669').text(varText, 430, y + 5, { width: 115, align: 'right' });

          y += rowH;
        }
        y += 12;
      }

      // Detalle de movimientos
      if (includeSections.includes('expenses') && y < 650) {
        doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('Últimas Transacciones del Período', 40, y);
        y += 16;

        doc.rect(40, y, 515, 18).fill('#1E1B4B');
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
        doc.text('FECHA', 48, y + 5);
        doc.text('CONCEPTO', 110, y + 5);
        doc.text('CATEGORÍA', 260, y + 5);
        doc.text('CUENTA', 370, y + 5);
        doc.text('IMPORTE', 485, y + 5, { width: 60, align: 'right' });
        y += 18;

        for (const e of expenses.slice(0, 16)) {
          if (y > 750) break;
          const rowH = 17;
          doc.rect(40, y, 515, rowH).fill('#FFFFFF');
          doc.lineWidth(0.5).strokeColor('#F1F5F9').moveTo(40, y + rowH).lineTo(555, y + rowH).stroke();

          doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
          doc.text(String(e.expense_date || '').slice(0, 10), 48, y + 5);

          const desc = (e.description || 'Gasto').length > 30 ? (e.description || '').slice(0, 28) + '..' : e.description;
          doc.text(desc, 110, y + 5);

          const cName = (e.category_name || 'General').length > 18 ? (e.category_name || '').slice(0, 16) + '..' : (e.category_name || 'General');
          doc.text(cName, 260, y + 5);

          const aName = (e.account_name || 'Principal').length > 16 ? (e.account_name || '').slice(0, 14) + '..' : (e.account_name || 'Principal');
          doc.fillColor('#64748B').text(aName, 370, y + 5);

          doc.fillColor('#0F172A').font('Helvetica-Bold').text(
            `${Number(e.amount || 0).toFixed(2)}`,
            485,
            y + 5,
            { width: 60, align: 'right' }
          );

          y += rowH;
        }
      }

      // Pie de página
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fillColor('#94A3B8').fontSize(7).font('Helvetica').text(
          `FlowMoney Reportes Automatizados • Documento oficial generado en la nube • Página ${i + 1} de ${pageCount}`,
          40,
          805,
          { align: 'center', width: 515 }
        );
      }

      doc.end();
    });
  }

  return {
    success: true,
    fileName,
    buffer,
    mimeType,
    fileSizeBytes: buffer.length,
    totalExpenses,
    totalIncome: 0,
    netBalance: totalAccountBalance,
    itemCount: expenses.length,
    summary: {
      periodLabel,
      startDate,
      endDate,
      totalBudget,
      budgetExecutionPercent,
      totalSubscriptions,
      categoryBreakdown,
    },
  };
}
