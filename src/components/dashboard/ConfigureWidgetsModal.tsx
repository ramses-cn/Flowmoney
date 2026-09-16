import React, { useState } from 'react';
import { UserDashboardPreferences, DashboardWidgetConfig } from '../../types/flowmoney.ts';
import { X, Sliders, Check, GripVertical } from 'lucide-react';

interface ConfigureWidgetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserDashboardPreferences;
  onSavePreferences: (prefs: UserDashboardPreferences) => void;
}

const WIDGET_NAMES: Record<string, string> = {
  balance: 'Balance Total y Cuentas',
  income: 'Ingresos del Período',
  expenses: 'Gastos y Presupuesto',
  trend: 'Gráfico de Tendencia Mensual',
  categories: 'Distribución por Categorías',
  recent: 'Últimas Transacciones',
};

export function ConfigureWidgetsModal({
  isOpen,
  onClose,
  preferences,
  onSavePreferences,
}: ConfigureWidgetsModalProps) {
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(preferences.widgets || []);

  if (!isOpen) return null;

  const toggleWidget = (id: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  };

  const handleSave = () => {
    onSavePreferences({
      ...preferences,
      widgets,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Personalizar Dashboard
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Widgets List */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Activa o desactiva las tarjetas que deseas ver en tu pantalla principal:
          </p>
          {widgets.map((widget) => (
            <div
              key={widget.id}
              onClick={() => toggleWidget(widget.id)}
              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                widget.enabled
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-slate-900 dark:text-white'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400'
              }`}
            >
              <span className="text-xs font-semibold">
                {WIDGET_NAMES[widget.id] || widget.id}
              </span>
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                  widget.enabled ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-600'
                }`}
              >
                {widget.enabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
