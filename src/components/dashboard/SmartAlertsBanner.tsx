import React from 'react';
import { SmartAlert } from '../../types/flowmoney.ts';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface SmartAlertsBannerProps {
  alerts: SmartAlert[];
  readAlertIds: Set<string>;
  onAlertClick: (alert: SmartAlert) => void;
  onDismiss: (id: string) => void;
}

export function SmartAlertsBanner({
  alerts,
  readAlertIds,
  onAlertClick,
  onDismiss,
}: SmartAlertsBannerProps) {
  const visibleAlerts = alerts.filter((a) => !readAlertIds.has(a.id)).slice(0, 2);

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-2">
      {visibleAlerts.map((alert) => {
        const isWarning = alert.type === 'warning';
        const isCritical = alert.type === 'danger';

        return (
          <div
            key={alert.id}
            className={`p-3.5 rounded-2xl flex items-start justify-between gap-3 border transition-all ${
              isCritical
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                : isWarning
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
                : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200'
            }`}
          >
            <div
              className="flex items-start space-x-2.5 cursor-pointer flex-1"
              onClick={() => onAlertClick(alert)}
            >
              {isCritical ? (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              ) : isWarning ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className="text-xs font-bold leading-tight">{alert.title}</h4>
                <p className="text-[11px] opacity-90 mt-0.5 leading-snug">{alert.message}</p>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(alert.id);
              }}
              className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity shrink-0"
              title="Descartar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
