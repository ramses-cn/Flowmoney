import React, { useState } from 'react';
import { Settings, Moon, Sun, Monitor, Globe } from 'lucide-react';
import { getSavedTheme, applyTheme, ThemeMode } from '../../utils/theme.ts';

export function PreferencesSection() {
  const [theme, setTheme] = useState<ThemeMode>(getSavedTheme());
  const [language, setLanguage] = useState('es');

  const handleSelectTheme = (mode: ThemeMode) => {
    setTheme(mode);
    applyTheme(mode);
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
        <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold border border-blue-100 dark:border-blue-900/40">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
            Preferencias de la Aplicación
          </h3>
          <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
            Tema visual e idioma de la interfaz
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Selector de Tema */}
        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--ios-label)' }}>
            Tema de Apariencia
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSelectTheme('light')}
              className={`p-3 rounded-2xl border flex flex-col items-center space-y-1.5 transition-all ${
                theme === 'light'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sun className="w-5 h-5" />
              <span className="text-xs">Claro</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTheme('dark')}
              className={`p-3 rounded-2xl border flex flex-col items-center space-y-1.5 transition-all ${
                theme === 'dark'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Moon className="w-5 h-5" />
              <span className="text-xs">Oscuro</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTheme('system')}
              className={`p-3 rounded-2xl border flex flex-col items-center space-y-1.5 transition-all ${
                theme === 'system'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Monitor className="w-5 h-5" />
              <span className="text-xs">Sistema</span>
            </button>
          </div>
        </div>

        {/* Selector de Idioma */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
            Idioma
          </label>
          <div className="relative">
            <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
              style={{ color: 'var(--ios-label)' }}
            >
              <option value="es">Español (Latinoamérica)</option>
              <option value="en">English (US)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
