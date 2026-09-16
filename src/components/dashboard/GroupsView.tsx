import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';
import { Group } from '../../types/flowmoney.ts';
import { GroupCard } from '../groups/GroupCard.tsx';
import { GroupDetailView } from '../groups/GroupDetailView.tsx';
import { CreateGroupModal } from '../groups/CreateGroupModal.tsx';
import { useRealtimeSync } from '../../hooks/useRealtimeSync.ts';
import { RealtimeStatusBadge } from '../common/RealtimeStatusBadge.tsx';
import { DEFAULT_CURRENCY } from '../../constants/currencies.ts';
import {
  Users,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Sparkles,
  Search,
} from 'lucide-react';

interface GroupsViewProps {
  onOpenAddModal?: (groupId?: string) => void;
}

export const GroupsView: React.FC<GroupsViewProps> = ({ onOpenAddModal }) => {
  const { token, profile } = useAuthStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson<{ groups?: Group[] }>('/api/groups');
      if (data && Array.isArray(data.groups)) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.warn('Error loading groups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
    const handleDataChanged = () => fetchGroups();
    window.addEventListener('flowmoney_data_changed', handleDataChanged);
    window.addEventListener('group_created', handleDataChanged);
    return () => {
      window.removeEventListener('flowmoney_data_changed', handleDataChanged);
      window.removeEventListener('group_created', handleDataChanged);
    };
  }, [token]);

  // Sincronización en tiempo real para la lista de grupos (Fase 5)
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const { isRealtimeActive, isPollingFallback, lastEventAt, refreshNow } = useRealtimeSync({
    groupIds,
    onRefresh: fetchGroups,
    enabled: groupIds.length > 0 && selectedGroupId === null,
    label: 'GroupsView[List]',
  });

  // Cálculos de balances agregados agrupados por divisa
  const currencyTotals = useMemo(() => {
    const map: Record<string, { owedToMe: number; iOwe: number }> = {};
    for (const g of groups) {
      const curr = g.currency || profile?.default_currency || DEFAULT_CURRENCY;
      if (!map[curr]) map[curr] = { owedToMe: 0, iOwe: 0 };
      const net = Number(g.net_balance || 0);
      if (net > 0) map[curr].owedToMe += net;
      else if (net < 0) map[curr].iOwe += Math.abs(net);
    }
    return map;
  }, [groups, profile?.default_currency]);

  // Si hay un grupo seleccionado, renderizar la vista de detalle
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  if (selectedGroup) {
    return (
      <GroupDetailView
        group={selectedGroup}
        onBack={() => {
          setSelectedGroupId(null);
          fetchGroups();
        }}
        onOpenAddExpense={(groupId) => onOpenAddModal?.(groupId)}
        onGroupUpdated={(updated) => {
          setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        }}
        onGroupDeleted={() => {
          setSelectedGroupId(null);
          fetchGroups();
        }}
      />
    );
  }

  const currencyKeys = Object.keys(currencyTotals);
  const singleCurrency = currencyKeys.length === 1 ? currencyKeys[0] : null;

  const totalTheyOweMe = groups.reduce((sum, g) => {
    const net = Number(g.net_balance || 0);
    return net > 0 ? sum + net : sum;
  }, 0);

  const totalIOwe = groups.reduce((sum, g) => {
    const net = Number(g.net_balance || 0);
    return net < 0 ? sum + Math.abs(net) : sum;
  }, 0);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="groups-view" className="space-y-4 pb-24 animate-fade-in">
      {/* Header Principal — iOS Large Title */}
      <div className="flex items-end justify-between pt-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1
              className="text-[34px] font-bold tracking-tight"
              style={{ color: 'var(--ios-label)', letterSpacing: '-0.022em', lineHeight: 1.1 }}
            >
              Grupos
            </h1>
            <RealtimeStatusBadge
              isRealtimeActive={isRealtimeActive}
              isPollingFallback={isPollingFallback}
              lastEventAt={lastEventAt}
              onManualRefresh={refreshNow}
            />
          </div>
          <p className="text-[14px] mt-0.5" style={{ color: 'var(--ios-label-secondary)' }}>
            Gastos compartidos, viajes y finanzas en común
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-[12px] text-[13px] font-semibold text-white transition-all active:scale-95"
          style={{
            background: 'var(--ios-blue)',
            boxShadow: '0 1px 2px rgba(0,122,255,0.3), 0 4px 12px rgba(0,122,255,0.18)',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo</span>
        </button>
      </div>

      {/* Banner Resumen Global de Grupos */}
      {groups.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 rounded-2xl">
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Te deben en total</span>
            </div>
            {singleCurrency ? (
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {singleCurrency} {totalTheyOweMe.toFixed(2)}
              </div>
            ) : currencyKeys.length > 0 ? (
              <div className="space-y-0.5">
                {currencyKeys.map((curr) => (
                  <div key={curr} className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {curr} {currencyTotals[curr].owedToMe.toFixed(2)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {profile?.default_currency || DEFAULT_CURRENCY} 0.00
              </div>
            )}
          </div>

          <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 rounded-2xl">
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Debes en total</span>
            </div>
            {singleCurrency ? (
              <div className="text-lg font-bold text-rose-700 dark:text-rose-300">
                {singleCurrency} {totalIOwe.toFixed(2)}
              </div>
            ) : currencyKeys.length > 0 ? (
              <div className="space-y-0.5">
                {currencyKeys.map((curr) => (
                  <div key={curr} className="text-sm font-bold text-rose-700 dark:text-rose-300">
                    {curr} {currencyTotals[curr].iOwe.toFixed(2)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-lg font-bold text-rose-700 dark:text-rose-300">
                {profile?.default_currency || DEFAULT_CURRENCY} 0.00
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buscador de grupos (si hay más de 2) */}
      {groups.length > 2 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Buscar por nombre de grupo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      )}

      {/* Lista de Grupos */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-400 space-y-2">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Cargando tus grupos...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 text-center space-y-3.5 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Aún no formas parte de ningún grupo
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              Crea tu primer grupo para compartir gastos en viajes, piso de estudiantes o con tu pareja.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-2xl transition-colors shadow-sm inline-flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Crear mi primer grupo</span>
          </button>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No se encontraron grupos con el nombre "{searchQuery}".
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              currentUserId={profile?.id}
              onClick={() => setSelectedGroupId(group.id)}
            />
          ))}
        </div>
      )}

      {/* Botón flotante para crear nuevo grupo */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-24 right-5 sm:right-8 w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 z-30 focus:outline-none focus:ring-4 focus:ring-indigo-500/30"
        title="Crear nuevo grupo"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modal Crear Grupo */}
      <CreateGroupModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        defaultCurrency={profile?.default_currency || DEFAULT_CURRENCY}
        onGroupCreated={(newGroup) => {
          setGroups((prev) => {
            const exists = prev.some((g) => g.id === newGroup.id);
            if (exists) return prev;
            return [newGroup, ...prev];
          });
          setSelectedGroupId(newGroup.id);
          fetchGroups();
        }}
      />
    </div>
  );
};
