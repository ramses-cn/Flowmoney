import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { User, Mail, DollarSign, Check, Save } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '../../constants/currencies.ts';

export function PersonalInfoSection() {
  const { profile, updateProfileData, isDemoSession } = useAuthStore();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [currency, setCurrency] = useState(profile?.default_currency || 'PEN');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfileData({
        full_name: fullName,
        default_currency: currency,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
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
        <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-100 dark:border-blue-900/40">
          {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
            Información Personal
          </h3>
          <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
            Tu identidad y configuración de moneda principal
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
            Nombre Completo
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ color: 'var(--ios-label)' }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
            Correo Electrónico
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="email"
              disabled
              value={profile?.email || ''}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/30 opacity-70 cursor-not-allowed"
              style={{ color: 'var(--ios-label)' }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
            Moneda por Defecto
          </label>
          <div className="relative">
            <DollarSign className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ color: 'var(--ios-label)' }}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between">
          {savedSuccess && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-semibold">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Guardado exitosamente</span>
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="ml-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition-transform active:scale-95 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
