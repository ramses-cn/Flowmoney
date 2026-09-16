import React, { useState } from 'react';
import { DashboardGroupsData, Group } from '../../types/flowmoney.ts';
import {
  Users,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { DebtSimplifierModal } from './DebtSimplifierModal.tsx';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { DEFAULT_CURRENCY } from '../../constants/currencies.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';

interface LensGroupsProps {
  data: DashboardGroupsData | null;
  currency: string;
  onOpenAddExpense: () => void;
  onRefreshData?: () => void;
}

export const LensGroups: React.FC<LensGroupsProps> = ({
  data,
  currency,
  onOpenAddExpense,
  onRefreshData,
}) => {
  const { token, profile } = useAuthStore();
  const [showSimplifierModal, setShowSimplifierModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<Group['type']>('trip');
  const [isCreating, setIsCreating] = useState(false);

  if (!data) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        Cargando finanzas grupales desde Cloud Run...
      </div>
    );
  }

  const { totalOwedToMe, totalIOwe, netSummary, groups, dominantCurrency } = data;
  const groupCurrency = dominantCurrency || 
    (groups.length > 0 && groups.every((g) => g.currency === groups[0].currency) ? groups[0].currency : currency);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setIsCreating(true);
    try {
      const data = await safeFetchJson<{ success?: boolean; group: Group }>('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newGroupName.trim(),
          type: newGroupType,
          currency: profile?.default_currency || DEFAULT_CURRENCY,
        }),
      });

      if (data?.group) {
        setNewGroupName('');
        setShowCreateGroupModal(false);
        window.dispatchEvent(new CustomEvent('group_created', { detail: data.group }));
        window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('[LensGroups] Error creando grupo:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Card de Resumen Total (Me deben - Debo = Balance Neto) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Balance Global en Grupos</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            {groups.length} grupos
          </span>
        </div>

        {/* Balance neto consolidado */}
        <div>
          <span className="text-xs text-slate-500 font-medium">Balance neto total:</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <span
              className={`text-3xl font-black tracking-tight ${
                netSummary >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {netSummary >= 0 ? '+' : '-'}
              {groupCurrency} {Math.abs(netSummary).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Desglose de Me deben vs Debo */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/50">
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Me deben</span>
            </div>
            <div className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-1">
              +{groupCurrency} {totalOwedToMe.toFixed(2)}
            </div>
          </div>

          <div className="p-3 bg-rose-50/70 dark:bg-rose-950/40 rounded-2xl border border-rose-100 dark:border-rose-900/50">
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Debo</span>
            </div>
            <div className="text-base font-black text-rose-700 dark:text-rose-300 mt-1">
              -{groupCurrency} {totalIOwe.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Accesos rápidos: Simplificar deudas y Crear grupo */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => setShowSimplifierModal(true)}
            className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 border border-indigo-200/80 dark:border-indigo-900/60"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Simplificar deudas</span>
          </button>

          <button
            onClick={() => setShowCreateGroupModal(true)}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear grupo</span>
          </button>
        </div>
      </div>

      {/* 2. Lista de Grupos con Saldo Neto de cada uno */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Mis Grupos y Balances
          </h3>
          {groups.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
            </span>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            Aún no tienes grupos registrados. Haz click en "Crear grupo" para comenzar.
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            {groups.map((grp) => {
              const net = Number(grp.net_balance || 0);
              const isPositive = net > 0;
              const isZero = net === 0;

              return (
                <div
                  key={grp.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950/70 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black text-xs flex items-center justify-center">
                      {grp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {grp.name}
                      </div>
                      <div className="text-[11px] text-slate-400 capitalize mt-0.5">
                        {grp.type === 'trip' ? 'Viaje' : grp.type === 'couple' ? 'Pareja' : grp.type} &bull; {grp.members_count || 2} miembros
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-xs font-black ${
                        isPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isZero
                          ? 'text-slate-500'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isPositive ? '+' : isZero ? '' : '-'}
                      {grp.currency} {Math.abs(net).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {isPositive ? 'Te deben' : isZero ? 'Al día' : 'Debes'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Simplificador de Deudas */}
      <DebtSimplifierModal
        isOpen={showSimplifierModal}
        onClose={() => setShowSimplifierModal(false)}
        groups={groups}
        currency={currency}
      />

      {/* Modal Crear Grupo */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Crear Nuevo Grupo</h3>
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del grupo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Departamento 402, Viaje a Cancún"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de grupo
                </label>
                <select
                  value={newGroupType}
                  onChange={(e) => setNewGroupType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                >
                  <option value="trip">Viaje / Vacaciones</option>
                  <option value="home">Hogar / Departamento</option>
                  <option value="couple">Pareja</option>
                  <option value="project">Proyecto / Amigos</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newGroupName.trim()}
                  className="flex-1 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                >
                  {isCreating ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
