import React, { useState, useEffect, useCallback } from 'react';
import { Group, GroupBalance, GroupMemberItem, SimplifiedDebt, Expense } from '../../types/flowmoney.ts';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';
import { useRealtimeSync } from '../../hooks/useRealtimeSync.ts';
import { RealtimeStatusBadge } from '../common/RealtimeStatusBadge.tsx';
import { SimplifyDebtsModal } from './SimplifyDebtsModal.tsx';
import { SettleDebtModal } from './SettleDebtModal.tsx';
import { InviteMemberModal } from './InviteMemberModal.tsx';
import { EditGroupModal } from './EditGroupModal.tsx';
import { EditExpenseModal } from '../dashboard/EditExpenseModal.tsx';
import {
  ArrowLeft,
  Users,
  Settings,
  Sparkles,
  HandCoins,
  Plus,
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  LogOut,
  CreditCard,
  Receipt,
  UserCheck,
  Shield,
  Pencil,
} from 'lucide-react';

interface GroupDetailViewProps {
  group: Group;
  onBack: () => void;
  onOpenAddExpense?: (groupId: string) => void;
  onGroupUpdated: (updated: Group) => void;
  onGroupDeleted: () => void;
}

export const GroupDetailView: React.FC<GroupDetailViewProps> = ({
  group,
  onBack,
  onOpenAddExpense,
  onGroupUpdated,
  onGroupDeleted,
}) => {
  const { token, profile } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'balances' | 'history' | 'info'>('balances');
  const [balances, setBalances] = useState<GroupBalance[]>([]);
  const [members, setMembers] = useState<GroupMemberItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [historySubTab, setHistorySubTab] = useState<'expenses' | 'settlements'>('expenses');

  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [isLoadingSettlements, setIsLoadingSettlements] = useState(false);

  // Modals state
  const [showSimplifyModal, setShowSimplifyModal] = useState(false);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebt[]>([]);
  const [isSimplifying, setIsSimplifying] = useState(false);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settlePreFill, setSettlePreFill] = useState<{
    payerId?: string;
    payeeId?: string;
    amount?: number;
  }>({});

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isEditExpenseModalOpen, setIsEditExpenseModalOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const defaultCovers: Record<string, string> = {
    couple: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&auto=format&fit=crop&q=80',
    trip: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&auto=format&fit=crop&q=80',
    home: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',
    project: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80',
    other: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=800&auto=format&fit=crop&q=80',
  };
  const coverImage = group.cover_url || defaultCovers[group.type] || defaultCovers.other;

  const isAdmin = group.user_role === 'admin';

  // 1. Cargar balances
  const loadBalances = async () => {
    if (!token || !group?.id) return;
    setIsLoadingBalances(true);
    try {
      const data = await safeFetchJson<{ balances?: GroupBalance[] }>(`/api/groups/${group.id}/balances`);
      if (data && Array.isArray(data.balances)) {
        setBalances(data.balances);
      } else {
        setBalances([]);
      }
    } catch (err) {
      console.warn('[GroupDetailView] No se pudieron cargar balances:', err);
      setBalances([]);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  // 2. Cargar miembros
  const loadMembers = async () => {
    if (!token || !group?.id) return;
    setIsLoadingMembers(true);
    try {
      const data = await safeFetchJson<{ members?: GroupMemberItem[] }>(`/api/groups/${group.id}/members`);
      if (data && Array.isArray(data.members)) {
        setMembers(data.members);
      } else {
        setMembers([]);
      }
    } catch (err) {
      console.warn('[GroupDetailView] No se pudieron cargar miembros:', err);
      setMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // 3. Cargar gastos
  const loadExpenses = async () => {
    if (!token || !group?.id) return;
    setIsLoadingExpenses(true);
    try {
      const data = await safeFetchJson<{ expenses?: Expense[] }>(`/api/groups/${group.id}/expenses`);
      if (data && Array.isArray(data.expenses)) {
        setExpenses(data.expenses);
      } else {
        setExpenses([]);
      }
    } catch (err) {
      console.warn('[GroupDetailView] No se pudieron cargar gastos:', err);
      setExpenses([]);
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  // 4. Cargar liquidaciones
  const loadSettlements = async () => {
    if (!token || !group?.id) return;
    setIsLoadingSettlements(true);
    try {
      const data = await safeFetchJson<{ settlements?: any[] }>(`/api/settlements?group_id=${group.id}`);
      if (data && Array.isArray(data.settlements)) {
        setSettlements(data.settlements);
      } else {
        setSettlements([]);
      }
    } catch (err) {
      console.warn('[GroupDetailView] No se pudieron cargar liquidaciones:', err);
      setSettlements([]);
    } finally {
      setIsLoadingSettlements(false);
    }
  };

  useEffect(() => {
    loadBalances();
    loadMembers();
    loadExpenses();
    loadSettlements();

    const handleSync = () => {
      loadBalances();
      loadMembers();
      loadExpenses();
      loadSettlements();
    };

    window.addEventListener('flowmoney_data_changed', handleSync);
    window.addEventListener('expense_created', handleSync);
    window.addEventListener('expense_updated', handleSync);
    window.addEventListener('expense_deleted', handleSync);

    return () => {
      window.removeEventListener('flowmoney_data_changed', handleSync);
      window.removeEventListener('expense_created', handleSync);
      window.removeEventListener('expense_updated', handleSync);
      window.removeEventListener('expense_deleted', handleSync);
    };
  }, [group.id, token]);

  // Sincronización reactiva en tiempo real para el detalle de este grupo (Fase 5)
  const refreshAllGroupData = useCallback(() => {
    console.log(`[RealtimeSync] Refrescando datos completos del grupo ${group.name}`);
    loadBalances();
    loadMembers();
    loadExpenses();
    loadSettlements();
  }, [group.id, token]);

  const { isRealtimeActive, isPollingFallback, lastEventAt, refreshNow } = useRealtimeSync({
    groupIds: group.id,
    onRefresh: refreshAllGroupData,
    enabled: Boolean(group.id && token),
    label: `GroupDetail[${group.name}]`,
  });

  // Simplificar deudas vía endpoint greedy
  const handleSimplifyDebts = async () => {
    if (!token || !group?.id) return;
    setShowSimplifyModal(true);
    setIsSimplifying(true);
    try {
      const data = await safeFetchJson<{ simplified_debts?: SimplifiedDebt[] }>(`/api/groups/${group.id}/simplify-debts`, {
        method: 'POST',
      });
      if (data && Array.isArray(data.simplified_debts)) {
        setSimplifiedDebts(data.simplified_debts);
      }
    } catch (err) {
      console.error('Error simplifying debts:', err);
    } finally {
      setIsSimplifying(false);
    }
  };

  // Abrir modal de saldar con datos pre-rellenados
  const handleOpenSettleDebt = (debt?: SimplifiedDebt) => {
    if (debt) {
      setSettlePreFill({
        payerId: debt.debtor_id,
        payeeId: debt.creditor_id,
        amount: debt.amount,
      });
    } else {
      setSettlePreFill({});
    }
    setShowSettleModal(true);
  };

  // Expulsar miembro
  const handleRemoveMember = async (userId: string) => {
    if (!token || !confirm('¿Deseas remover a este miembro del grupo?')) return;
    try {
      await safeFetchJson(`/api/groups/${group.id}/members/${userId}`, {
        method: 'DELETE',
      });
      loadMembers();
      loadBalances();
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  // Cancelar invitación
  const handleCancelInvitation = async (invitationId: string) => {
    if (!token) return;
    try {
      await safeFetchJson(`/api/groups/${group.id}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      loadMembers();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
    }
  };

  // Abandonar grupo
  const handleLeaveGroup = async () => {
    if (!token || !confirm('¿Estás seguro de que deseas abandonar este grupo?')) return;
    setLeaveError(null);
    try {
      await safeFetchJson(`/api/groups/${group.id}/leave`, {
        method: 'POST',
      });
      onBack();
    } catch (err: any) {
      setLeaveError(err.message || 'Error al salir del grupo');
    }
  };

  // Balance neto del usuario actual en este grupo
  const myBalanceItem = balances.find((b) => b.user_id === profile?.id);
  const myNetBalance = myBalanceItem ? Number(myBalanceItem.net_balance) : 0;
  const isMyPositive = myNetBalance > 0.01;
  const isMyNegative = myNetBalance < -0.01;

  // Total gastado en el grupo
  const totalGroupExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const formattedDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div id="group-detail-view" className="space-y-4 pb-24 animate-fade-in">
      {/* Portada & Header Principal */}
      <div className="relative rounded-3xl overflow-hidden shadow-sm border border-slate-200/80 dark:border-slate-800">
        <div className="h-44 w-full relative">
          <img
            src={coverImage}
            alt={group.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-slate-950/20" />

          {/* Botones de navegación superior */}
          <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-10">
            <button
              onClick={onBack}
              className="p-2 rounded-2xl bg-slate-950/60 hover:bg-slate-950/80 text-white backdrop-blur-md transition-colors"
              title="Volver a grupos"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2">
              <RealtimeStatusBadge
                isRealtimeActive={isRealtimeActive}
                isPollingFallback={isPollingFallback}
                lastEventAt={lastEventAt}
                onManualRefresh={refreshNow}
                className="backdrop-blur-md bg-slate-950/60 text-white border-slate-700/60"
              />

              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 hover:bg-white text-slate-800 dark:text-slate-100 text-xs font-semibold backdrop-blur-md transition-colors shadow-sm"
              >
                <Mail className="w-3.5 h-3.5 text-indigo-600" />
                <span>Invitar</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="p-2 rounded-2xl bg-slate-950/60 hover:bg-slate-950/80 text-white backdrop-blur-md transition-colors"
                  title="Configurar grupo"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Datos del grupo en la base del banner */}
          <div className="absolute bottom-3.5 left-4 right-4 text-white">
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/80 backdrop-blur-md uppercase tracking-wider">
                {group.type}
              </span>
              <span className="text-xs text-slate-300 font-medium">
                {group.currency} &bull; {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight truncate drop-shadow-sm">
              {group.name}
            </h1>
            {group.description && (
              <p className="text-xs text-slate-200 line-clamp-1 mt-0.5 font-normal">
                {group.description}
              </p>
            )}
          </div>
        </div>

        {/* Resumen rápido de saldo del usuario */}
        <div className="bg-white dark:bg-slate-900 px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Tu situación en este grupo
            </div>
            <div className="text-sm font-bold mt-0.5">
              {isMyPositive && (
                <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center">
                  <ArrowDownLeft className="w-3.5 h-3.5 mr-1" />
                  Te deben {group.currency} {myNetBalance.toFixed(2)}
                </span>
              )}
              {isMyNegative && (
                <span className="text-rose-600 dark:text-rose-400 inline-flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                  Debes {group.currency} {Math.abs(myNetBalance).toFixed(2)}
                </span>
              )}
              {!isMyPositive && !isMyNegative && (
                <span className="text-slate-600 dark:text-slate-300 inline-flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Estás al día (0.00 {group.currency})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onOpenAddExpense && (
              <button
                onClick={() => onOpenAddExpense(group.id)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Gasto</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {leaveError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{leaveError}</span>
        </div>
      )}

      {/* Tabs Selector: Balances / Historial / Info */}
      <div className="flex bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab('balances')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'balances'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Balances
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'history'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Historial
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'info'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Info y Miembros
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: BALANCES */}
      {/* ========================================================= */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Botones de acción principales: Simplificar deudas & Saldar deuda */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleSimplifyDebts}
              className="flex items-center justify-center space-x-2 p-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl shadow-sm font-bold text-xs transition-all"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>Simplificar deudas</span>
            </button>

            <button
              onClick={() => handleOpenSettleDebt()}
              className="flex items-center justify-center space-x-2 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-sm font-bold text-xs transition-all"
            >
              <HandCoins className="w-4 h-4 text-emerald-200" />
              <span>Saldar deuda</span>
            </button>
          </div>

          {/* Desglose de cada miembro (calculate_group_balances) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Saldos individuales ({balances.length})
              </h3>
              <span className="text-[11px] font-medium text-slate-400">
                Total gastado: {group.currency} {totalGroupExpenses.toFixed(2)}
              </span>
            </div>

            {isLoadingBalances ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Calculando saldos...
              </div>
            ) : balances.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No hay movimientos registrados en este grupo todavía.
              </div>
            ) : (
              <div className="space-y-2.5">
                {balances.map((b) => {
                  const net = Number(b.net_balance);
                  const isPos = net > 0.01;
                  const isNeg = net < -0.01;

                  return (
                    <div
                      key={b.user_id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center">
                          {b.full_name ? b.full_name.slice(0, 2).toUpperCase() : 'MB'}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              {b.full_name || b.email}
                            </span>
                            {b.user_id === profile?.id && (
                              <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-semibold">
                                Tú
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Pagó {group.currency} {Number(b.total_paid).toFixed(2)} &bull; Debe {group.currency} {Number(b.total_owed).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold">
                          {isPos && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{group.currency} {net.toFixed(2)}
                            </span>
                          )}
                          {isNeg && (
                            <span className="text-rose-600 dark:text-rose-400">
                              -{group.currency} {Math.abs(net).toFixed(2)}
                            </span>
                          )}
                          {!isPos && !isNeg && (
                            <span className="text-slate-400 dark:text-slate-500">
                              0.00 {group.currency}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {isPos ? 'Le deben' : isNeg ? 'Debe pagar' : 'En paz'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: HISTORIAL */}
      {/* ========================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {/* Sub-toggle Gastos vs Pagos */}
          <div className="flex items-center justify-between">
            <div className="flex space-x-1 bg-slate-200/60 dark:bg-slate-800/60 p-1 rounded-xl text-[11px]">
              <button
                onClick={() => setHistorySubTab('expenses')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  historySubTab === 'expenses'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Gastos ({expenses.length})
              </button>
              <button
                onClick={() => setHistorySubTab('settlements')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  historySubTab === 'settlements'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Liquidaciones ({settlements.length})
              </button>
            </div>

            {onOpenAddExpense && historySubTab === 'expenses' && (
              <button
                onClick={() => onOpenAddExpense(group.id)}
                className="flex items-center space-x-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo gasto</span>
              </button>
            )}
          </div>

          {/* Sub-tab: GASTOS */}
          {historySubTab === 'expenses' && (
            <div className="space-y-2">
              {isLoadingExpenses ? (
                <div className="py-8 text-center text-xs text-slate-400">Cargando gastos...</div>
              ) : expenses.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-2">
                  <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400">No hay gastos registrados en este grupo.</p>
                  {onOpenAddExpense && (
                    <button
                      onClick={() => onOpenAddExpense(group.id)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
                    >
                      Añadir el primer gasto
                    </button>
                  )}
                </div>
              ) : (
                expenses.map((exp) => {
                  const canEdit = exp.paid_by === profile?.id || exp.user_id === profile?.id || isAdmin;
                  return (
                    <div
                      key={exp.id}
                      onClick={() => {
                        if (canEdit) {
                          setEditingExpense(exp);
                          setIsEditExpenseModalOpen(true);
                        }
                      }}
                      className={`group p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-sm transition-all ${
                        canEdit ? 'hover:border-indigo-400/50 cursor-pointer' : ''
                      }`}
                      title={canEdit ? 'Haz clic para ver o editar este gasto' : undefined}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0"
                          style={{
                            backgroundColor: `${exp.category_color || '#6366F1'}20`,
                            color: exp.category_color || '#6366F1',
                          }}
                        >
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {exp.description}
                          </h4>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Pagó {exp.paid_by === profile?.id ? 'Tú' : (exp as any).paid_by_name || 'Miembro'} &bull;{' '}
                            {formattedDate(exp.expense_date)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {exp.currency || group.currency} {Number(exp.amount).toFixed(2)}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {exp.category_name || 'General'}
                          </span>
                        </div>
                        {canEdit && (
                          <div className="p-1.5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 rounded-lg group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/40 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Sub-tab: LIQUIDACIONES / PAGOS */}
          {historySubTab === 'settlements' && (
            <div className="space-y-2">
              {isLoadingSettlements ? (
                <div className="py-8 text-center text-xs text-slate-400">Cargando pagos...</div>
              ) : settlements.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-2">
                  <HandCoins className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400">Aún no se han registrado pagos en este grupo.</p>
                  <button
                    onClick={() => handleOpenSettleDebt()}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold"
                  >
                    Registrar un pago
                  </button>
                </div>
              ) : (
                settlements.map((sett) => (
                  <div
                    key={sett.id}
                    className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <HandCoins className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {sett.payer_name} &rarr; {sett.payee_name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {sett.payment_method} &bull; {formattedDate(sett.settled_at)}
                          {sett.notes && ` (${sett.notes})`}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {sett.currency || group.currency} {Number(sett.amount).toFixed(2)}
                      </div>
                      <span className="text-[10px] text-slate-400">Completado</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: INFO Y MIEMBROS */}
      {/* ========================================================= */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          {/* Card de Configuración e Información */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Detalles del grupo
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Moneda</span>
                <strong className="text-slate-800 dark:text-slate-200">{group.currency}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Tipo</span>
                <strong className="text-slate-800 dark:text-slate-200 capitalize">{group.type}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Auto-archivado</span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {group.auto_archive_days ? `${group.auto_archive_days} días` : 'Desactivado'}
                </strong>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Creado el</span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {formattedDate(group.created_at)}
                </strong>
              </div>
            </div>
          </div>

          {/* Lista de Miembros e Invitaciones */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Miembros del grupo ({members.length})
              </h3>

              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center space-x-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Invitar por email</span>
              </button>
            </div>

            {isLoadingMembers ? (
              <div className="py-6 text-center text-xs text-slate-400">Cargando miembros...</div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.membership_id || m.invitation_id || m.email}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center ${
                          m.is_pending
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-dashed border-amber-300'
                            : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        {m.full_name ? m.full_name.slice(0, 2).toUpperCase() : 'MB'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {m.full_name || m.email}
                          </span>
                          {m.user_id === profile?.id && (
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded font-semibold">
                              Tú
                            </span>
                          )}
                          {m.role === 'admin' && !m.is_pending && (
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded font-semibold">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                          <span>{m.email}</span>
                          {m.is_pending && (
                            <>
                              <span>&bull;</span>
                              <span className="text-amber-600 dark:text-amber-400 font-medium inline-flex items-center">
                                <Clock className="w-3 h-3 mr-0.5" />
                                Invitación pendiente
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones de administración */}
                    {isAdmin && (
                      <div>
                        {m.is_pending && m.invitation_id ? (
                          <button
                            onClick={() => handleCancelInvitation(m.invitation_id!)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Cancelar invitación"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : m.user_id !== profile?.id ? (
                          <button
                            onClick={() => handleRemoveMember(m.user_id!)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Expulsar miembro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Opciones de salida / edición */}
          <div className="pt-2 space-y-2">
            <button
              onClick={handleLeaveGroup}
              className="w-full py-2.5 px-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 hover:border-rose-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Abandonar este grupo</span>
            </button>
          </div>
        </div>
      )}

      {/* Modales */}
      <SimplifyDebtsModal
        isOpen={showSimplifyModal}
        onClose={() => setShowSimplifyModal(false)}
        debts={simplifiedDebts}
        currency={group.currency}
        isLoading={isSimplifying}
        onSettleDebt={(debt) => handleOpenSettleDebt(debt)}
      />

      <SettleDebtModal
        isOpen={showSettleModal}
        onClose={() => setShowSettleModal(false)}
        groupId={group.id}
        currency={group.currency}
        members={members}
        currentUserId={profile?.id}
        initialPayerId={settlePreFill.payerId}
        initialPayeeId={settlePreFill.payeeId}
        initialAmount={settlePreFill.amount}
        onSettlementCreated={() => {
          loadBalances();
          loadSettlements();
        }}
      />

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        groupId={group.id}
        onMemberInvited={() => {
          loadMembers();
        }}
      />

      {showEditModal && (
        <EditGroupModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          group={group}
          onGroupUpdated={(updated) => {
            onGroupUpdated(updated);
          }}
          onGroupDeleted={() => {
            onGroupDeleted();
          }}
        />
      )}

      {/* Modal para editar o eliminar gastos del grupo */}
      <EditExpenseModal
        isOpen={isEditExpenseModalOpen}
        expense={editingExpense}
        onClose={() => {
          setIsEditExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        onSuccess={() => {
          loadBalances();
          loadExpenses();
          window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));
        }}
        onDeleteSuccess={() => {
          loadBalances();
          loadExpenses();
          window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));
        }}
      />
    </div>
  );
};
