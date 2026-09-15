import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import {
  ExpenseLens,
  SmartAlert,
  DashboardPersonalData,
  DashboardCoupleData,
  DashboardGroupsData,
  DashboardPeriod,
  DynamicFilters,
  UserDashboardPreferences,
  DashboardWidgetConfig,
} from '../../types/flowmoney.ts';
import { HeaderHome } from './HeaderHome.tsx';
import { SmartAlertsBanner } from './SmartAlertsBanner.tsx';
import { LensPersonal } from './LensPersonal.tsx';
import { LensCouple } from './LensCouple.tsx';
import { LensGroups } from './LensGroups.tsx';
import { AddExpenseModal } from './AddExpenseModal.tsx';
import { PeriodFilterBar } from './PeriodFilterBar.tsx';
import { ConfigureWidgetsModal } from './ConfigureWidgetsModal.tsx';
import { QuickToolHubModal } from './QuickToolHubModal.tsx';
import { Plus, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { useRealtimeSync } from '../../hooks/useRealtimeSync.ts';
import { DEFAULT_CURRENCY } from '../../constants/currencies.ts';
import { fetchWithAuth } from '../../utils/apiClient.ts';

interface HomeViewProps {
  onOpenAddModal?: () => void;
  onNavigateToTab?: (tab: any) => void;
}

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
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
];

export const HomeView: React.FC<HomeViewProps> = ({ onOpenAddModal, onNavigateToTab }) => {
  const { token, profile, categories, accounts } = useAuthStore();

  const [currentLens, setCurrentLens] = useState<ExpenseLens>('personal');
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [personalData, setPersonalData] = useState<DashboardPersonalData | null>(null);
  const [coupleData, setCoupleData] = useState<DashboardCoupleData | null>(null);
  const [groupsData, setGroupsData] = useState<DashboardGroupsData | null>(null);

  // Preferencias de widgets y período por usuario
  const [preferences, setPreferences] = useState<UserDashboardPreferences>({
    default_period: 'month',
    widgets: DEFAULT_WIDGETS,
  });
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);

  // Periodo activo y filtros combinables
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [filters, setFilters] = useState<DynamicFilters>({
    type: 'all',
  });

  // Gestión y persistencia de alertas leídas
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => {
    try {
      const storageKey = `flowmoney_read_alerts_${profile?.id || 'default'}`;
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set<string>(JSON.parse(saved) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  useEffect(() => {
    if (profile?.id) {
      try {
        const storageKey = `flowmoney_read_alerts_${profile.id}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setReadAlertIds(new Set<string>(JSON.parse(saved) as string[]));
        }
      } catch (e) {
        console.warn('Error reading alerts from localStorage:', e);
      }
    }
  }, [profile?.id]);

  const persistReadAlertIds = (newSet: Set<string>) => {
    setReadAlertIds(newSet);
    try {
      const storageKey = `flowmoney_read_alerts_${profile?.id || 'default'}`;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
    } catch (e) {
      console.warn('Error saving read alert IDs:', e);
    }
  };

  const handleMarkAlertAsRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set<string>(readAlertIds);
    next.add(id);
    persistReadAlertIds(next);
  };

  const handleMarkAllAlertsAsRead = () => {
    const next = new Set<string>(readAlertIds);
    alerts.forEach((a) => next.add(a.id));
    persistReadAlertIds(next);
  };

  const handleAlertClick = (alert: SmartAlert) => {
    handleMarkAlertAsRead(alert.id);
    if (alert.targetLens) {
      setCurrentLens(alert.targetLens);
    }
    if (alert.targetTab && alert.targetTab !== 'home') {
      onNavigateToTab?.(alert.targetTab);
    } else if (!alert.targetTab && alert.actionUrl) {
      if (alert.actionUrl.includes('expenses')) {
        onNavigateToTab?.('expenses');
      } else if (alert.actionUrl.includes('groups')) {
        onNavigateToTab?.('groups');
      } else if (alert.actionUrl.includes('profile')) {
        onNavigateToTab?.('profile');
      }
    }
  };

  const unreadAlertsCount = useMemo(() => {
    return alerts.filter((a) => !readAlertIds.has(a.id)).length;
  }, [alerts, readAlertIds]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleExpired = (e: any) => {
      setSessionExpiredMessage(e.detail?.message || 'Tu sesión expiró, vuelve a iniciar sesión');
    };
    window.addEventListener('session_expired', handleExpired);
    return () => window.removeEventListener('session_expired', handleExpired);
  }, []);

  const currency = profile?.default_currency || DEFAULT_CURRENCY;

  // Cargar preferencias del usuario
  const fetchPreferences = async () => {
    if (!token) return;
    try {
      const res = await fetchWithAuth('/api/dashboard/preferences');
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setPreferences(data.preferences);
          if (data.preferences.default_period) {
            setPeriod(data.preferences.default_period);
          }
        }
      }
    } catch (e) {
      console.error('[Fetch Preferences Error]:', e);
    }
  };

  // Guardar preferencias del usuario
  const handleSavePreferences = async (updated: UserDashboardPreferences) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth('/api/dashboard/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setPreferences(updated);
        setPeriod(updated.default_period);
        setToastMessage('Preferencias del dashboard actualizadas');
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (e) {
      console.error('[Save Preferences Error]:', e);
    }
  };

  const handleOpenAddExpense = () => {
    if (onOpenAddModal) {
      onOpenAddModal();
    } else {
      setIsAddExpenseOpen(true);
    }
  };

  // Cargar datos del dashboard: Carga primero lo esencial (Personal y Alertas), y difiere lentes secundarios
  const fetchDashboardData = async (loadSecondary: boolean = false) => {
    if (!token) return;

    try {
      setIsLoading(true);

      // Construir query params para periodo y filtros
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'custom' && customStart && customEnd) {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      }
      if (filters.categoryId && filters.categoryId !== 'all') {
        params.set('categoryId', filters.categoryId);
      }
      if (filters.accountId && filters.accountId !== 'all') {
        params.set('accountId', filters.accountId);
      }

      const personalUrl = `/api/dashboard/personal?${params.toString()}`;

      // 1. CARGA CRÍTICA INMEDIATA: Métricas del lente actual y alertas con fetchWithAuth
      const criticalPromises: Promise<Response>[] = [
        fetchWithAuth('/api/dashboard/alerts'),
        fetchWithAuth(personalUrl),
      ];

      // Si el usuario ya está viendo pareja o grupos, o se solicita carga secundaria, los incluimos
      const shouldLoadCouple = loadSecondary || currentLens === 'couple';
      const shouldLoadGroups = loadSecondary || currentLens === 'group';

      if (shouldLoadCouple) {
        criticalPromises.push(fetchWithAuth('/api/dashboard/couple'));
      }
      if (shouldLoadGroups) {
        criticalPromises.push(fetchWithAuth('/api/dashboard/groups'));
      }

      const results = await Promise.all(criticalPromises);

      // Si después del intento y refresco automático forzado persiste algún 401
      if (results.some((r) => r.status === 401)) {
        setSessionExpiredMessage('Tu sesión expiró, vuelve a iniciar sesión');
        return;
      }

      const alertsRes = results[0];
      const personalRes = results[1];

      if (alertsRes && alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts || []);
      }
      if (personalRes && personalRes.ok) {
        const data = await personalRes.json();
        setPersonalData(data);
      }

      let resIdx = 2;
      if (shouldLoadCouple) {
        const coupleRes = results[resIdx++];
        if (coupleRes && coupleRes.ok) {
          const data = await coupleRes.json();
          setCoupleData(data);
        }
      }
      if (shouldLoadGroups) {
        const groupsRes = results[resIdx++];
        if (groupsRes && groupsRes.ok) {
          const data = await groupsRes.json();
          setGroupsData(data);
        }
      }
    } catch (error) {
      console.error('[Dashboard Fetch Error]:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar datos secundarios cuando el usuario cambia explícitamente a otro lente
  useEffect(() => {
    if (currentLens === 'couple' && !coupleData) {
      fetchDashboardData(true);
    } else if (currentLens === 'group' && !groupsData) {
      fetchDashboardData(true);
    }
  }, [currentLens]);

  useEffect(() => {
    fetchPreferences();
  }, [token]);

  useEffect(() => {
    fetchDashboardData();
  }, [token, period, customStart, customEnd, filters]);

  useEffect(() => {
    const handleSync = () => {
      fetchDashboardData();
    };
    window.addEventListener('flowmoney_data_changed', handleSync);
    window.addEventListener('expense_updated', handleSync);
    window.addEventListener('expense_deleted', handleSync);
    window.addEventListener('expense_created', handleSync);
    return () => {
      window.removeEventListener('flowmoney_data_changed', handleSync);
      window.removeEventListener('expense_updated', handleSync);
      window.removeEventListener('expense_deleted', handleSync);
      window.removeEventListener('expense_created', handleSync);
    };
  }, [token, period, customStart, customEnd, filters]);

  const activeGroupIds = useMemo(() => {
    if (currentLens === 'couple') {
      const gId = coupleData?.coupleGroup?.id || coupleData?.couple_group?.id;
      return gId ? [gId] : [];
    }
    if (currentLens === 'group') {
      return groupsData?.groups?.map((g) => g.id) || [];
    }
    return [];
  }, [currentLens, coupleData?.coupleGroup?.id, coupleData?.couple_group?.id, groupsData?.groups]);

  const { isRealtimeActive, isPollingFallback, lastEventAt, refreshNow } = useRealtimeSync({
    groupIds: activeGroupIds,
    onRefresh: fetchDashboardData,
    enabled: (currentLens === 'couple' || currentLens === 'group') && activeGroupIds.length > 0,
    label: `HomeView[${currentLens}]`,
  });

  const handleExpenseCreated = () => {
    setToastMessage('¡Gasto registrado con éxito!');
    setTimeout(() => setToastMessage(null), 3500);
    fetchDashboardData();
  };

  // Cálculo de balance total de cuentas
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0);
  }, [accounts]);

  return (
    <div className="w-full pb-8 transition-colors">
      <div className="w-full">
        {/* Header Fijo con Logo, Notificaciones, Configuración de Widgets y Selector de Lente */}
        <HeaderHome
          currentLens={currentLens}
          onSelectLens={setCurrentLens}
          alerts={alerts}
          unreadAlertsCount={unreadAlertsCount}
          readAlertIds={readAlertIds}
          onAlertClick={handleAlertClick}
          onMarkAllAsRead={handleMarkAllAlertsAsRead}
          onMarkAlertAsRead={handleMarkAlertAsRead}
          onOpenConfigureWidgets={() => setIsConfigureOpen(true)}
          onOpenTools={() => setIsToolsOpen(true)}
          realtimeStatus={{
            isRealtimeActive,
            isPollingFallback,
            lastEventAt,
            onManualRefresh: refreshNow,
          }}
        />

        {/* Notificación Toast Flotante — iOS style */}
        {toastMessage && (
          <div
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[14px] flex items-center space-x-2 text-[13px] font-semibold animate-fade-in"
            style={{
              background: 'var(--ios-bg-elevated)',
              color: 'var(--ios-label)',
              boxShadow: 'var(--shadow-lg)',
              border: '0.5px solid var(--ios-separator)',
            }}
          >
            <Check className="w-4 h-4" style={{ color: 'var(--ios-green)' }} />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Banner visible de sesión expirada — iOS alert style */}
        {sessionExpiredMessage && (
          <div
            id="session-expired-banner"
            className="mt-3 p-3.5 rounded-[14px] flex items-center justify-between space-x-2 text-[13px] font-semibold animate-fade-in"
            style={{
              background: 'var(--ios-red)',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(255, 59, 48, 0.18)',
            }}
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sessionExpiredMessage}</span>
            </div>
            <button
              onClick={() => {
                useAuthStore.getState().logout();
              }}
              className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-[8px] text-[12px] font-semibold transition-colors shrink-0"
            >
              Iniciar sesión
            </button>
          </div>
        )}

        {/* Contenido Principal */}
        <main className="mt-3 space-y-4">
          {/* Barra de Períodos y Filtros Dinámicos Combinables */}
          <PeriodFilterBar
            currentPeriod={period}
            onSelectPeriod={setPeriod}
            customStartDate={customStart}
            customEndDate={customEnd}
            onChangeCustomDates={(s, e) => {
              setCustomStart(s);
              setCustomEnd(e);
            }}
            filters={filters}
            onChangeFilters={setFilters}
            categories={categories}
            accounts={accounts}
            onOpenConfigureWidgets={() => setIsConfigureOpen(true)}
          />

          {/* Banners de Alertas Inteligentes calculadas desde Cloud Run */}
          <SmartAlertsBanner
            alerts={alerts}
            readAlertIds={readAlertIds}
            onAlertClick={handleAlertClick}
            onDismiss={handleMarkAlertAsRead}
          />

          {/* Renderizado Condicional por Lente */}
          {currentLens === 'personal' && (
            <LensPersonal
              data={personalData}
              currency={currency}
              onOpenAddExpense={handleOpenAddExpense}
              onNavigateToExpenses={() => onNavigateToTab?.('expenses')}
              widgetConfigs={preferences.widgets}
              onOpenConfigureWidgets={() => setIsConfigureOpen(true)}
              totalBalance={totalBalance}
            />
          )}

          {currentLens === 'couple' && (
            <LensCouple
              data={coupleData}
              currency={currency}
              onOpenAddExpense={handleOpenAddExpense}
              onRefreshData={fetchDashboardData}
            />
          )}

          {currentLens === 'group' && (
            <LensGroups
              data={groupsData}
              currency={currency}
              onOpenAddExpense={handleOpenAddExpense}
              onRefreshData={fetchDashboardData}
            />
          )}
        </main>

        {/* Botón Flotante (+) Siempre Visible para Añadir Gasto */}
        <div className="fixed bottom-20 right-6 z-40">
          <button
            onClick={handleOpenAddExpense}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white shadow-xl shadow-indigo-500/30 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:focus:ring-indigo-900"
            title="Añadir nuevo gasto"
            id="fab-add-expense-btn"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </div>

        {/* Modal de Personalización de Widgets */}
        <ConfigureWidgetsModal
          isOpen={isConfigureOpen}
          onClose={() => setIsConfigureOpen(false)}
          preferences={preferences}
          onSavePreferences={handleSavePreferences}
        />

        {/* Modal Centro Rápido de Herramientas y Reportes */}
        <QuickToolHubModal
          isOpen={isToolsOpen}
          onClose={() => setIsToolsOpen(false)}
          onNavigateToTab={onNavigateToTab}
          onOpenConfigureWidgets={() => {
            setIsToolsOpen(false);
            setIsConfigureOpen(true);
          }}
        />

        {/* Modal / Bottom Sheet de Añadir Gasto en 2 Pasos */}
        <AddExpenseModal
          isOpen={isAddExpenseOpen}
          onClose={() => setIsAddExpenseOpen(false)}
          onSuccess={handleExpenseCreated}
        />
      </div>
    </div>
  );
};
