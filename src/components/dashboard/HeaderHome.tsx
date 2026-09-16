import React, { useState } from 'react';
import { LensType, SmartAlert } from '../../types/flowmoney.ts';
import { Bell, Sliders, Wrench, User, Heart, Users, CheckCheck } from 'lucide-react';
import { RealtimeStatusBadge } from '../common/RealtimeStatusBadge.tsx';

interface HeaderHomeProps {
  currentLens: LensType;
  onSelectLens: (lens: LensType) => void;
  alerts: SmartAlert[];
  unreadAlertsCount: number;
  readAlertIds: Set<string>;
  onAlertClick: (alert: SmartAlert) => void;
  onMarkAllAsRead: () => void;
  onMarkAlertAsRead: (id: string) => void;
  onOpenConfigureWidgets: () => void;
  onOpenTools: () => void;
  realtimeStatus: {
    isRealtimeActive: boolean;
    isPollingFallback: boolean;
    lastEventAt: Date | null;
    onManualRefresh: () => void;
  };
}

export function HeaderHome({
  currentLens,
  onSelectLens,
  alerts,
  unreadAlertsCount,
  readAlertIds,
  onAlertClick,
  onMarkAllAsRead,
  onOpenConfigureWidgets,
  onOpenTools,
  realtimeStatus,
}: HeaderHomeProps) {
  const [showAlertMenu, setShowAlertMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        {/* Logo & Estado Realtime */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-black text-base flex items-center justify-center shadow-sm">
              F
            </div>
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white hidden sm:inline">
              FlowMoney
            </span>
          </div>
          <div className="hidden xs:block">
            <RealtimeStatusBadge
              isRealtimeActive={realtimeStatus.isRealtimeActive}
              isPollingFallback={realtimeStatus.isPollingFallback}
              lastEventAt={realtimeStatus.lastEventAt}
              onManualRefresh={realtimeStatus.onManualRefresh}
            />
          </div>
        </div>

        {/* Selector de Lente: Personal / Pareja / Grupos */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60">
          <button
            type="button"
            onClick={() => onSelectLens('personal')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              currentLens === 'personal'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Personal</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectLens('couple')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              currentLens === 'couple'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Pareja</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectLens('group')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              currentLens === 'group'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Grupos</span>
          </button>
        </div>

        {/* Acciones del Header: Herramientas, Widgets, Notificaciones */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={onOpenTools}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Herramientas y calculadora"
          >
            <Wrench className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenConfigureWidgets}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Configurar widgets"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Notificaciones */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAlertMenu(!showAlertMenu)}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
              title="Notificaciones"
            >
              <Bell className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {showAlertMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-fadeIn">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Notificaciones y Alertas
                  </span>
                  {unreadAlertsCount > 0 && (
                    <button
                      onClick={onMarkAllAsRead}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>Leídas</span>
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                  {alerts.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      Sin alertas pendientes
                    </div>
                  ) : (
                    alerts.slice(0, 5).map((a) => (
                      <div
                        key={a.id}
                        onClick={() => {
                          onAlertClick(a);
                          setShowAlertMenu(false);
                        }}
                        className={`p-3 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                          readAlertIds.has(a.id) ? 'opacity-60' : 'font-medium'
                        }`}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">{a.title}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{a.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
