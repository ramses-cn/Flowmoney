import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { Calendar, Plus, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { getCurrencySymbol } from '../../constants/currencies.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';

export function SubscriptionsSection() {
  const { token, profile } = useAuthStore();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');

  const symbol = getCurrencySymbol(profile?.default_currency || 'PEN');

  const fetchSubscriptions = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await safeFetchJson<{ subscriptions?: any[] }>('/api/subscriptions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubscriptions(res.subscriptions || []);
    } catch {
      setSubscriptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount) return;
    try {
      await safeFetchJson('/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          amount: parseFloat(amount),
          billing_cycle: billingCycle,
          next_billing_date: new Date().toISOString().slice(0, 10),
        }),
      });
      setName('');
      setAmount('');
      setShowAddModal(false);
      fetchSubscriptions();
    } catch (err) {
      console.error(err);
    }
  };

  const monthlyTotal = subscriptions.reduce((sum, s) => {
    const amt = Number(s.amount || 0);
    return sum + (s.billing_cycle === 'yearly' ? amt / 12 : amt);
  }, 0);

  return (
    <div
      className="p-5 rounded-3xl border shadow-sm space-y-4"
      style={{
        background: 'var(--ios-bg-secondary)',
        borderColor: 'var(--ios-separator)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold border border-purple-100 dark:border-purple-900/40">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
              Suscripciones y Pagos Recurrentes
            </h3>
            <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
              Servicios fijos mensuales: ~{symbol} {monthlyTotal.toFixed(2)}/mes
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(!showAddModal)}
          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center space-x-1 shadow-sm transition-transform active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva Suscripción</span>
        </button>
      </div>

      {showAddModal && (
        <form onSubmit={handleCreate} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Servicio</label>
              <input
                type="text"
                required
                placeholder="Ej. Netflix, Spotify, Internet"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Costo ({symbol})</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Frecuencia</label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              >
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {subscriptions.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          No tienes suscripciones registradas aún.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          {subscriptions.map((s, idx) => (
            <div key={s.id || idx} className="p-3.5 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{s.name}</h4>
                <p className="text-[11px] text-slate-400 capitalize">
                  Ciclo {s.billing_cycle || 'mensual'}
                </p>
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {symbol} {Number(s.amount || 0).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
