import React from 'react';
import { Wifi, RefreshCw } from 'lucide-react';

interface RealtimeStatusBadgeProps {
  isRealtimeActive: boolean;
  isPollingFallback?: boolean;
  lastEventAt?: Date | null;
  onManualRefresh?: () => void;
  className?: string;
}

export function RealtimeStatusBadge({
  isRealtimeActive,
  isPollingFallback = false,
  lastEventAt,
  onManualRefresh,
  className = '',
}: RealtimeStatusBadgeProps) {
  return (
    <div className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 transition-colors ${className}`}>
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            isRealtimeActive ? 'bg-emerald-400' : isPollingFallback ? 'bg-amber-400' : 'bg-slate-400'
          }`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isRealtimeActive ? 'bg-emerald-500' : isPollingFallback ? 'bg-amber-500' : 'bg-slate-500'
          }`}
        />
      </span>
      <span className="font-medium text-[11px]">
        {isRealtimeActive ? 'En vivo' : isPollingFallback ? 'Sincronizado' : 'Sin conexión'}
      </span>
      {onManualRefresh && (
        <button
          type="button"
          onClick={onManualRefresh}
          className="ml-1 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          title="Actualizar ahora"
        >
          <RefreshCw className="w-3 h-3 hover:rotate-180 transition-transform duration-300" />
        </button>
      )}
    </div>
  );
}
