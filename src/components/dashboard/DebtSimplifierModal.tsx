import React, { useState, useEffect } from 'react';
import { Group, SimplifiedDebt } from '../../types/flowmoney.ts';
import { Sparkles, X, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { getCurrencySymbol } from '../../constants/currencies.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';
import { useAuthStore } from '../../store/useAuthStore.ts';

interface DebtSimplifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  currency?: string;
}

export function DebtSimplifierModal({
  isOpen,
  onClose,
  groups,
  currency = 'PEN',
}: DebtSimplifierModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || '');
  const [debts, setDebts] = useState<SimplifiedDebt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuthStore();

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups]);

  const loadSimplifiedDebts = async (groupId: string) => {
    if (!groupId || !token) return;
    setIsLoading(true);
    try {
      const res = await safeFetchJson<{ simplified_transactions?: SimplifiedDebt[] }>(
        `/api/groups/${groupId}/simplify-debts`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setDebts(res.simplified_transactions || []);
    } catch {
      setDebts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && selectedGroupId) {
      loadSimplifiedDebts(selectedGroupId);
    }
  }, [isOpen, selectedGroupId]);

  if (!isOpen) return null;

  const currentGroup = groups.find((g) => g.id === selectedGroupId);
  const symbol = getCurrencySymbol(currentGroup?.currency || currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-200/60 dark:border-purple-900/40">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Optimizador de Pagos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Minimiza las transferencias entre amigos
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

        {/* Group Selector */}
        {groups.length > 1 && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Selecciona el grupo a optimizar:
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({getCurrencySymbol(g.currency)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Results */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
              <span>Calculando transferencias óptimas...</span>
            </div>
          ) : debts.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                ¡Sin transferencias pendientes!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Todos los integrantes están al día con sus saldos.
              </p>
            </div>
          ) : (
            debts.map((debt, index) => (
              <div
                key={index}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  <span className="truncate">{debt.debtor_name || debt.from_name || 'Alguien'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{debt.creditor_name || debt.to_name || 'Otro'}</span>
                </div>
                <div className="text-sm font-bold text-purple-600 dark:text-purple-400 shrink-0">
                  {symbol} {Number(debt.amount).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <button
            onClick={() => loadSimplifiedDebts(selectedGroupId)}
            className="text-xs text-purple-600 dark:text-purple-400 font-medium hover:underline flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Recalcular</span>
          </button>
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
