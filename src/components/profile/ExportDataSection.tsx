import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';

interface ExportDataSectionProps {
  hideHeader?: boolean;
}

export function ExportDataSection({ hideHeader = false }: ExportDataSectionProps) {
  const { token } = useAuthStore();
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const res = await safeFetchJson<{ expenses?: any[] }>('/api/expenses', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const expenses = res.expenses || [];

      // Generar CSV
      const headers = ['Fecha', 'Descripción', 'Monto', 'Moneda', 'Categoría', 'Tipo'];
      const rows = expenses.map((e: any) => [
        e.expense_date,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        e.amount,
        e.currency,
        `"${(e.category_name || '').replace(/"/g, '""')}"`,
        e.type || 'gasto',
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `flowmoney_gastos_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportPDF = () => {
    setIsExportingPDF(true);
    // Imprimir o guardar como PDF usando el navegador
    window.print();
    setIsExportingPDF(false);
  };

  return (
    <div
      className={hideHeader ? 'space-y-3' : 'p-5 rounded-3xl border shadow-sm space-y-4'}
      style={
        hideHeader
          ? undefined
          : {
              background: 'var(--ios-bg-secondary)',
              borderColor: 'var(--ios-separator)',
            }
      }
    >
      {!hideHeader && (
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
              Exportar Datos y Respaldo
            </h3>
            <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
              Descarga tu historial financiero completo en formato estándar
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={isExportingCSV}
          className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-3 text-left transition-all active:scale-[0.99] disabled:opacity-50"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            {isExportingCSV ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: 'var(--ios-label)' }}>
              Exportar a Excel (CSV)
            </div>
            <div className="text-[11px]" style={{ color: 'var(--ios-secondary-label)' }}>
              Compatible con hojas de cálculo
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleExportPDF}
          disabled={isExportingPDF}
          className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-3 text-left transition-all active:scale-[0.99] disabled:opacity-50"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: 'var(--ios-label)' }}>
              Exportar Reporte (PDF)
            </div>
            <div className="text-[11px]" style={{ color: 'var(--ios-secondary-label)' }}>
              Documento imprimible con resumen
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
