import React, { useState } from 'react';
import {
  DashboardPersonalData,
  Expense,
  DashboardWidgetConfig,
  DashboardWidgetId,
} from '../../types/flowmoney.ts';
import { EditExpenseModal } from './EditExpenseModal.tsx';
import {
  Wallet,
  Calendar,
  CreditCard,
  Repeat,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Tag,
  ChevronRight,
  Pencil,
  ArrowDownRight,
  Sparkles,
  Layers,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Scale,
} from 'lucide-react';

interface LensPersonalProps {
  data: DashboardPersonalData | null;
  currency: string;
  onOpenAddExpense: () => void;
  onNavigateToExpenses?: () => void;
  widgetConfigs?: DashboardWidgetConfig[];
  onOpenConfigureWidgets?: () => void;
  totalIncome?: number;
  totalBalance?: number;
}

export const LensPersonal: React.FC<LensPersonalProps> = ({
  data,
  currency,
  onOpenAddExpense,
  onNavigateToExpenses,
  widgetConfigs,
  onOpenConfigureWidgets,
  totalIncome = 0,
  totalBalance = 0,
}) => {
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  if (!data) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        Cargando datos del lente personal desde Cloud Run...
      </div>
    );
  }

  const {
    monthLabel,
    totalSpent,
    totalBudget,
    budgetProgress,
    daysRemaining,
    dailyAverage,
    categories,
    recentExpenses,
    subscriptions,
    totalSubscriptionsMonthly,
  } = data;

  const isOverBudget = totalSpent > totalBudget && totalBudget > 0;
  const savingsAmount = Math.max(0, totalIncome - totalSpent);
  const savingsRate =
    totalIncome > 0 ? Math.round((savingsAmount / totalIncome) * 100) : 0;

  // Mapa de widgets activos y ordenados
  const activeWidgets = (
    widgetConfigs || [
      { id: 'balance', enabled: true, order: 1 },
      { id: 'income', enabled: true, order: 2 },
      { id: 'expenses', enabled: true, order: 3 },
      { id: 'savings', enabled: true, order: 4 },
      { id: 'budget', enabled: true, order: 5 },
      { id: 'recent_expenses', enabled: true, order: 6 },
      { id: 'categories', enabled: true, order: 7 },
      { id: 'upcoming_payments', enabled: true, order: 8 },
      { id: 'alerts', enabled: true, order: 9 },
      { id: 'subscriptions', enabled: true, order: 10 },
      { id: 'debts', enabled: true, order: 11 },
    ]
  )
    .filter((w) => w.enabled)
    .sort((a, b) => a.order - b.order);

  // Renderizadores modulares para cada widget
  const renderWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case 'balance':
        return (
          <div
            key="balance"
            className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-bold uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span>Balance en Cuentas</span>
              </span>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                Disponible
              </span>
            </div>
            <div className="pt-3">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                {currency} {totalBalance.toFixed(2)}
              </span>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Total consolidado
              </p>
            </div>
          </div>
        );

      case 'income':
        return (
          <div
            key="income"
            className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
              <span className="font-bold uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </div>
                <span>Ingresos</span>
              </span>
              <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full font-bold">
                Entradas
              </span>
            </div>
            <div className="pt-3">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 block">
                +{currency} {totalIncome.toFixed(2)}
              </span>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                En el período actual
              </p>
            </div>
          </div>
        );

      case 'expenses':
        return (
          <div
            key="expenses"
            className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-xs text-rose-500">
              <span className="font-bold uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
                <span>Gastos</span>
              </span>
              <span className="text-[10px] bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-full font-bold">
                Salidas
              </span>
            </div>
            <div className="pt-3">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-rose-500 block">
                -{currency} {totalSpent.toFixed(2)}
              </span>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Total acumulado
              </p>
            </div>
          </div>
        );

      case 'savings':
        return (
          <div
            key="savings"
            className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400">
              <span className="font-bold uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span>Ahorro</span>
              </span>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full font-bold">
                Tasa: {savingsRate}%
              </span>
            </div>
            <div className="pt-3">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                {currency} {savingsAmount.toFixed(2)}
              </span>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Capacidad de retención
              </p>
            </div>
          </div>
        );

      case 'budget':
        return (
          <div
            key="budget"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Wallet className="w-4 h-4 text-indigo-500" />
                <span>Presupuesto y Ritmo ({monthLabel})</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {daysRemaining} días restantes
              </span>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                    {currency} {totalSpent.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-1.5 font-medium">
                    gastado
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">Límite mensual</span>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {currency} {totalBudget.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="mt-3 space-y-1.5">
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOverBudget
                        ? 'bg-rose-500'
                        : budgetProgress > 80
                        ? 'bg-amber-500'
                        : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span>{budgetProgress}% consumido</span>
                  <span>
                    {isOverBudget ? (
                      <span className="text-rose-500 font-bold">
                        Excedido por {currency}{' '}
                        {(totalSpent - totalBudget).toFixed(2)}
                      </span>
                    ) : (
                      <span>
                        Disponible: {currency}{' '}
                        {(totalBudget - totalSpent).toFixed(2)}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/70 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                <span>Ritmo diario de consumo:</span>
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {currency} {dailyAverage.toFixed(2)} / día
              </span>
            </div>
          </div>
        );

      case 'categories':
        return (
          <div
            key="categories"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <Tag className="w-4 h-4 text-indigo-500" />
                <span>Principales Categorías</span>
              </h3>
              <span className="text-xs text-slate-400">
                {categories.length} categorías activas
              </span>
            </div>

            <div className="space-y-3 pt-1">
              {categories.slice(0, 6).map((cat) => (
                <div key={cat.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {cat.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {currency} {cat.spent.toFixed(2)}
                      </span>
                      {cat.monthly_budget > 0 && (
                        <span className="text-slate-400">
                          {' '}
                          / {currency} {cat.monthly_budget.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(cat.percentage, 100)}%`,
                        backgroundColor: cat.is_over
                          ? '#EF4444'
                          : cat.percentage > 80
                          ? '#F59E0B'
                          : cat.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'recent_expenses':
        return (
          <div
            key="recent_expenses"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span>Gastos Recientes</span>
              </h3>
              {onNavigateToExpenses && (
                <button
                  type="button"
                  onClick={onNavigateToExpenses}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center space-x-1"
                >
                  <span>Ver todos</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {recentExpenses.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                No hay movimientos registrados en el periodo seleccionado.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {recentExpenses.slice(0, 5).map((exp) => (
                  <div
                    key={exp.id}
                    onClick={() => {
                      setEditingExpense(exp as unknown as Expense);
                      setIsEditModalOpen(true);
                    }}
                    className="group py-2.5 px-2 -mx-2 rounded-xl flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    title="Clic para ver o editar"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs"
                        style={{
                          backgroundColor: `${exp.category_color || '#6366F1'}1A`,
                          color: exp.category_color || '#6366F1',
                        }}
                      >
                        {(exp.category_name || 'G').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {exp.description}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                          <span>{exp.category_name || 'General'}</span>
                          <span>&bull;</span>
                          <span>{exp.expense_date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <div className="text-xs font-black text-slate-900 dark:text-white">
                          -{currency} {Number(exp.amount).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {exp.account_name || 'Sin cuenta (Efectivo)'}
                        </div>
                      </div>
                      <div className="p-1.5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 rounded-lg group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/40 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'upcoming_payments':
        return (
          <div
            key="upcoming_payments"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Próximos Pagos y Vencimientos
                </h3>
              </div>
              <span className="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
                Cercanos
              </span>
            </div>

            {subscriptions.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">
                No tienes compromisos de pago en los próximos días.
              </div>
            ) : (
              <div className="space-y-2">
                {subscriptions.slice(0, 3).map((sub) => (
                  <div
                    key={sub.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {sub.name}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {sub.next_billing_date
                          ? `Vence: ${sub.next_billing_date}`
                          : 'Programado'}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {sub.currency || currency} {Number(sub.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'alerts':
        return (
          <div
            key="alerts"
            className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-3xl p-5 shadow-2xs space-y-2"
          >
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
              <Sparkles className="w-4 h-4" />
              <span>Resumen de Alertas y Diagnóstico</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isOverBudget
                ? `⚠️ Has superado el presupuesto establecido en ${currency} ${(totalSpent - totalBudget).toFixed(2)}. Modera tus consumos en las categorías con mayor desvío.`
                : `✅ Tu gasto promedio diario de ${currency} ${dailyAverage.toFixed(2)} se encuentra dentro del rango saludable previsto.`}
            </p>
          </div>
        );

      case 'subscriptions':
        return (
          <div
            key="subscriptions"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Repeat className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Suscripciones Activas
                </h3>
              </div>
              <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                {currency} {totalSubscriptionsMonthly.toFixed(2)} / mes
              </span>
            </div>

            {subscriptions.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">
                No tienes suscripciones activas registradas.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {subscriptions.slice(0, 4).map((sub) => (
                  <div
                    key={sub.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                      {sub.name}
                    </span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
                      {currency} {Number(sub.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'debts':
        return (
          <div
            key="debts"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Scale className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Deudas y Saldos Pendientes
                </h3>
              </div>
              <span className="text-[10px] bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full font-bold">
                Al día
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No se registran saldos deudores personales pendientes. Las finanzas
              compartidas se concilian automáticamente en Pareja o Grupos.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // Separar widgets KPI principales para mostrarlos en un Bento Grid responsivo
  const kpiIds: DashboardWidgetId[] = ['balance', 'income', 'expenses', 'savings'];
  const activeKpis = activeWidgets.filter((w) => kpiIds.includes(w.id));
  const otherWidgets = activeWidgets.filter((w) => !kpiIds.includes(w.id));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Bento Grid responsivo para métricas KPI principales */}
      {activeKpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {activeKpis.map((w) => renderWidget(w.id))}
        </div>
      )}

      {/* 2. Módulos y widgets analíticos */}
      {otherWidgets.map((w) => renderWidget(w.id))}

      {/* Modal de edición rápida de gastos */}
      {editingExpense && (
        <EditExpenseModal
          isOpen={isEditModalOpen}
          expense={editingExpense}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingExpense(null);
          }}
          onSuccess={() => {
            setIsEditModalOpen(false);
            setEditingExpense(null);
          }}
        />
      )}
    </div>
  );
};
