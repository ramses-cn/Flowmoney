import React, { useState } from 'react';
import { DashboardCoupleData } from '../../types/flowmoney.ts';
import { Heart, Plus, ArrowUpRight, ArrowDownLeft, CheckCircle2, User, Users, Calendar } from 'lucide-react';
import { getCurrencySymbol } from '../../constants/currencies.ts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LensCoupleProps {
  data: DashboardCoupleData | null;
  currency: string;
  onOpenAddExpense: () => void;
  onRefreshData?: () => void;
}

export function LensCouple({
  data,
  currency,
  onOpenAddExpense,
}: LensCoupleProps) {
  const symbol = getCurrencySymbol(currency);

  if (!data || !data.hasCoupleGroup) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 mx-auto flex items-center justify-center border border-rose-100 dark:border-rose-900/40 shadow-sm">
          <Heart className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Finanzas en Pareja
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Aún no tienes un grupo de tipo "Pareja" configurado. Crea un grupo para sincronizar gastos del hogar, salidas y viajes juntos.
          </p>
        </div>
        <button
          onClick={onOpenAddExpense}
          className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md shadow-rose-500/20 inline-flex items-center space-x-2 transition-transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar gasto compartido</span>
        </button>
      </div>
    );
  }

  const net = Number(data.netBalance || 0);
  const partnerName = data.partnerInfo?.full_name || 'Tu pareja';

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      {/* Tarjeta de Resumen de Balance en Pareja */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-medium text-rose-100">
            <Heart className="w-4 h-4 fill-rose-200" />
            <span>Balance con {partnerName}</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md font-semibold">
            {data.coupleGroup?.name || 'Pareja'}
          </span>
        </div>

        <div className="mt-4">
          <div className="text-xs text-rose-100">Estado de cuentas:</div>
          <div className="text-3xl font-extrabold tracking-tight mt-1">
            {net > 0 ? (
              <span>Te debe {symbol} {net.toFixed(2)}</span>
            ) : net < 0 ? (
              <span>Debes {symbol} {Math.abs(net).toFixed(2)}</span>
            ) : (
              <span>¡Cuentas al día!</span>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-rose-400/40 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-rose-200 block text-[10px]">Te deben</span>
            <span className="font-bold text-sm">{symbol} {Number(data.partnerOwesMe || 0).toFixed(2)}</span>
          </div>
          <div>
            <span className="text-rose-200 block text-[10px]">Debes</span>
            <span className="font-bold text-sm">{symbol} {Number(data.iOwePartner || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Gastos Compartidos Recientes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-rose-500" />
            <span>Gastos Compartidos Recientes</span>
          </h3>
          <button
            onClick={onOpenAddExpense}
            className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir</span>
          </button>
        </div>

        {data.sharedExpenses.length === 0 ? (
          <div className="py-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            No hay gastos registrados en la cuenta compartida aún.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {data.sharedExpenses.slice(0, 10).map((exp) => (
              <div key={exp.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {exp.description}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                    <span>{format(new Date(exp.expense_date), 'dd MMM', { locale: es })}</span>
                    <span>•</span>
                    <span>Pagado por: {exp.paid_by_name || 'Tú'}</span>
                  </div>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {symbol} {Number(exp.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
