import React, { useState } from 'react';
import { FileText, Clock, Check, Send } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore.ts';

export function ScheduledReportsSection() {
  const { profile } = useAuthStore();
  const [frequency, setFrequency] = useState('weekly');
  const [includeBreakdown, setIncludeBreakdown] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(
      'flowmoney_scheduled_reports',
      JSON.stringify({ frequency, includeBreakdown })
    );
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <div
      className="p-5 rounded-3xl border shadow-sm space-y-4"
      style={{
        background: 'var(--ios-bg-secondary)',
        borderColor: 'var(--ios-separator)',
      }}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold border border-teal-100 dark:border-teal-900/40">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
            Reportes Programados Automáticos
          </h3>
          <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
            Recibe resúmenes de flujo de caja y balances directo a tu correo
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
            Frecuencia de envío
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
            style={{ color: 'var(--ios-label)' }}
          >
            <option value="weekly">Semanal (todos los lunes por la mañana)</option>
            <option value="monthly">Mensual (1ro de cada mes con cierre completo)</option>
            <option value="daily">Diario (resumen nocturno)</option>
            <option value="disabled">Desactivado</option>
          </select>
        </div>

        <label className="flex items-center space-x-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={includeBreakdown}
            onChange={(e) => setIncludeBreakdown(e.target.checked)}
            className="rounded text-teal-600 focus:ring-teal-500"
          />
          <span style={{ color: 'var(--ios-label)' }}>
            Incluir desglose por categoría y cuentas compartidas
          </span>
        </label>

        <div className="pt-2 flex items-center justify-between">
          {isSaved && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-semibold">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Reportes programados guardados</span>
            </span>
          )}
          <button
            type="submit"
            className="ml-auto px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Actualizar Programación</span>
          </button>
        </div>
      </form>
    </div>
  );
}
