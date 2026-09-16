import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { Target, Plus, TrendingUp, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getCurrencySymbol } from '../../constants/currencies.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';

const COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6', '#00C7BE'];

export function BudgetsSection() {
  const { profile, token, categories } = useAuthStore();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  const currency = profile?.default_currency || 'PEN';
  const symbol = getCurrencySymbol(currency);

  const fetchBudgets = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await safeFetchJson<{ budgets?: any[] }>('/api/budgets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBudgets(res.budgets || []);
    } catch {
      setBudgets([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [token]);

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedCatId || !budgetAmount) return;
    try {
      await safeFetchJson('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          categoryId: selectedCatId,
          amount: parseFloat(budgetAmount),
          period: 'monthly',
        }),
      });
      setShowAddBudget(false);
      setBudgetAmount('');
      fetchBudgets();
    } catch (err) {
      console.error(err);
    }
  };

  const chartData = budgets.map((b) => ({
    name: b.category_name || b.name || 'General',
    value: Number(b.amount || 0),
  }));

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
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-100 dark:border-emerald-900/40">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
              Presupuestos Mensuales
            </h3>
            <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
              Metas de ahorro y límites de gasto por categoría
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddBudget(!showAddBudget)}
          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1 shadow-sm transition-transform active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nuevo Presupuesto</span>
        </button>
      </div>

      {showAddBudget && (
        <form onSubmit={handleCreateBudget} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Categoría</label>
              <select
                value={selectedCatId}
                onChange={(e) => setSelectedCatId(e.target.value)}
                required
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              >
                <option value="">Selecciona categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Límite Mensual ({symbol})</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="Ej. 500.00"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setShowAddBudget(false)}
              className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {chartData.length > 0 && (
        <div className="h-44 w-full my-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                innerRadius={45}
                outerRadius={65}
                paddingAngle={4}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => `${symbol} ${Number(value).toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          No tienes presupuestos activos. Agrega uno para monitorear tus límites.
        </div>
      ) : (
        <div className="space-y-2.5">
          {budgets.map((b, idx) => {
            const spent = Number(b.current_spent || 0);
            const total = Number(b.amount || 1);
            const percent = Math.min(Math.round((spent / total) * 100), 100);
            const isExceeded = spent > total;

            return (
              <div key={b.id || idx} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span style={{ color: 'var(--ios-label)' }}>{b.category_name || 'Presupuesto'}</span>
                  <span className={isExceeded ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                    {symbol} {spent.toFixed(2)} / {symbol} {total.toFixed(2)} ({percent}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isExceeded ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
