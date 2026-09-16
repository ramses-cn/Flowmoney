import React from 'react';
import { SimplifiedDebt } from '../../types/flowmoney.ts';
import { Sparkles, X, ArrowRight, CheckCircle2, HandCoins } from 'lucide-react';
import { getCurrencySymbol } from '../../constants/currencies.ts';

interface SimplifyDebtsModalProps {
  isOpen: boolean;
  onClose: () => void;
  debts: SimplifiedDebt[];
  currency?: string;
  isLoading?: boolean;
  onSettleDebt: (debt: SimplifiedDebt) => void;
}

export function SimplifyDebtsModal({
  isOpen,
  onClose,
  debts,
  currency = 'PEN',
  isLoading = false,
  onSettleDebt,
}: SimplifyDebtsModalProps) {
  if (!isOpen) return null;

  const symbol = getCurrencySymbol(currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Encabezado */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200/60 dark:border-amber-900/40">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Simplificación de Deudas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Algoritmo inteligente de transferencias mínimas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Calculando pagos óptimos...
            </div>
          ) : debts.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                ¡Todas las deudas están saldadas!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No hay pagos pendientes en este grupo.
              </p>
            </div>
          ) : (
            debts.map((debt, index) => (
              <div
                key={index}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <span className="truncate">{debt.debtor_name || debt.from_name || 'Alguien'}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{debt.creditor_name || debt.to_name || 'Otro'}</span>
                  </div>
                  <div className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {symbol} {Number(debt.amount).toFixed(2)}
                  </div>
                </div>

                <button
                  onClick={() => onSettleDebt(debt)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-1 transition-transform active:scale-95 shrink-0 shadow-sm"
                >
                  <HandCoins className="w-3.5 h-3.5" />
                  <span>Liquidar</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Pie */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
