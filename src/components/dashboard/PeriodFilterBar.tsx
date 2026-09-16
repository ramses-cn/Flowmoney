import React, { useState } from 'react';
import { PeriodType, DynamicFilters, Category, Account } from '../../types/flowmoney.ts';
import { Calendar, Filter, X } from 'lucide-react';

interface PeriodFilterBarProps {
  currentPeriod: PeriodType;
  onSelectPeriod: (period: PeriodType) => void;
  customStartDate?: string;
  customEndDate?: string;
  onChangeCustomDates?: (start: string, end: string) => void;
  filters?: DynamicFilters;
  onChangeFilters?: (filters: DynamicFilters) => void;
  categories?: Category[];
  accounts?: Account[];
  onOpenConfigureWidgets?: () => void;
}

const PERIOD_LABELS: Record<PeriodType, string> = {
  today: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  last_7_days: '7 Días',
  last_30_days: '30 Días',
  last_90_days: '90 Días',
  custom: 'Personalizado',
};

export function PeriodFilterBar({
  currentPeriod,
  onSelectPeriod,
  customStartDate = '',
  customEndDate = '',
  onChangeCustomDates,
  filters,
  onChangeFilters,
  categories = [],
  accounts = [],
}: PeriodFilterBarProps) {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const periods: PeriodType[] = ['today', 'week', 'month', 'year', 'custom'];

  return (
    <div className="flex flex-col gap-2 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-1">
        {/* Selector de Período */}
        <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shrink-0">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSelectPeriod(p)}
              className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all ${
                currentPeriod === p
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Botón de Filtros Dinámicos */}
        <button
          type="button"
          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold border transition-all ${
            filters?.categoryId || filters?.accountId || filters?.minAmount
              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros</span>
        </button>
      </div>

      {/* Rango de fechas personalizado si aplica */}
      {currentPeriod === 'custom' && (
        <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500">Desde:</span>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => onChangeCustomDates?.(e.target.value, customEndDate)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs"
          />
          <span className="text-slate-500">Hasta:</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => onChangeCustomDates?.(customStartDate, e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs"
          />
        </div>
      )}

      {/* Dropdown de Filtros Avanzados */}
      {showFilterDropdown && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white">Filtros Avanzados</span>
            <button
              onClick={() => {
                onChangeFilters?.({});
                setShowFilterDropdown(false);
              }}
              className="text-xs text-rose-500 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Categoría</label>
              <select
                value={filters?.categoryId || ''}
                onChange={(e) => onChangeFilters?.({ ...filters, categoryId: e.target.value || undefined })}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-500 mb-1 font-medium">Cuenta</label>
              <select
                value={filters?.accountId || ''}
                onChange={(e) => onChangeFilters?.({ ...filters, accountId: e.target.value || undefined })}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              >
                <option value="">Todas las cuentas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
