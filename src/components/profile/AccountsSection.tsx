import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { Wallet, Plus, CreditCard, Banknote, Landmark, Trash2 } from 'lucide-react';
import { getCurrencySymbol } from '../../constants/currencies.ts';

const ACCOUNT_ICONS: Record<string, any> = {
  bank: Landmark,
  card: CreditCard,
  cash: Banknote,
  wallet: Wallet,
};

export function AccountsSection() {
  const { accounts, addAccount, deleteAccount, profile } = useAuthStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState(profile?.default_currency || 'PEN');

  const symbol = getCurrencySymbol(profile?.default_currency || 'PEN');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await addAccount({
        name: name.trim(),
        type,
        current_balance: parseFloat(balance) || 0,
        currency,
      });
      setName('');
      setBalance('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-100 dark:border-indigo-900/40">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--ios-label)' }}>
              Cuentas y Métodos de Pago
            </h3>
            <p className="text-xs" style={{ color: 'var(--ios-secondary-label)' }}>
              Bancos, tarjetas de crédito, Yape, Plin y efectivo
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(!showAddModal)}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center space-x-1 shadow-sm transition-transform active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva Cuenta</span>
        </button>
      </div>

      {showAddModal && (
        <form onSubmit={handleCreate} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Nombre</label>
              <input
                type="text"
                required
                placeholder="Ej. BCP Sueldo, Yape"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              >
                <option value="bank">Banco / Cuenta Corriente</option>
                <option value="card">Tarjeta de Crédito / Débito</option>
                <option value="wallet">Billetera Móvil (Yape / Plin)</option>
                <option value="cash">Efectivo</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-medium">Saldo Inicial</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
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
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              Crear Cuenta
            </button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          No tienes cuentas registradas todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((acc) => {
            const Icon = ACCOUNT_ICONS[acc.type] || Wallet;
            const accSymbol = getCurrencySymbol(acc.currency || profile?.default_currency);
            return (
              <div
                key={acc.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{acc.name}</h4>
                    <p className="text-[11px] text-slate-400 capitalize">{acc.type}</p>
                  </div>
                </div>

                <div className="text-right flex items-center space-x-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {accSymbol} {Number(acc.current_balance || 0).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAccount(acc.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-opacity"
                    title="Eliminar cuenta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
