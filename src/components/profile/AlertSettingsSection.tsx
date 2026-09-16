import React, { useState } from 'react';
import { BellRing, Check, Save } from 'lucide-react';

export function AlertSettingsSection() {
  const [thresholds, setThresholds] = useState<number[]>([50, 75, 90, 100]);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const [saved, setSaved] = useState(false);

  const availableThresholds = [50, 75, 80, 90, 100];

  const toggleThreshold = (val: number) => {
    setThresholds((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val].sort((a, b) => a - b)
    );
  };

  const handleSave = () => {
    localStorage.setItem(
      'flowmoney_alert_settings',
      JSON.stringify({ thresholds, emailAlerts, inAppAlerts })
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div
      className="p-5 rounded-3xl border shadow-sm space-y-4"
      style={{
        background: 'var(--ios-bg-secondary)',
        borderColor: 'var(--ios-separator)',
      }}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold border border-amber-100 dark:border-amber-900/40">
          <BellRing className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
            Alertas de Presupuesto y Límites
          </h3>
          <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
            Recibe avisos antes de exceder tus presupuestos fijados
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--ios-label)' }}>
            Umbrales de notificación (% del presupuesto consumido)
          </label>
          <div className="flex flex-wrap gap-2">
            {availableThresholds.map((th) => {
              const isSelected = thresholds.includes(th);
              return (
                <button
                  key={th}
                  type="button"
                  onClick={() => toggleThreshold(th)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {th}%
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <label className="flex items-center space-x-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={inAppAlerts}
              onChange={(e) => setInAppAlerts(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400"
            />
            <span style={{ color: 'var(--ios-label)' }}>Alertas dentro de la aplicación</span>
          </label>

          <label className="flex items-center space-x-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={emailAlerts}
              onChange={(e) => setEmailAlerts(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400"
            />
            <span style={{ color: 'var(--ios-label)' }}>Notificaciones por correo electrónico</span>
          </label>
        </div>

        <div className="pt-2 flex items-center justify-between">
          {saved && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-semibold">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Configuración guardada</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="ml-auto px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Alertas</span>
          </button>
        </div>
      </div>
    </div>
  );
}
