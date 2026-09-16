import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { Expense, ExpenseLens } from '../../types/flowmoney.ts';
import { SUPPORTED_CURRENCIES } from '../../constants/currencies.ts';
import {
  X,
  Calendar,
  CreditCard,
  Tag,
  FileText,
  AlertCircle,
  Loader2,
  Trash2,
  Check,
  Save,
} from 'lucide-react';
import { safeFetchJson } from '../../utils/apiClient.ts';

interface EditExpenseModalProps {
  isOpen: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSuccess?: (updatedExpense: Expense) => void;
  onDeleteSuccess?: (deletedId: string) => void;
}

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  isOpen,
  expense,
  onClose,
  onSuccess,
  onDeleteSuccess,
}) => {
  const { token, categories, accounts, updateAccountBalance } = useAuthStore();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PEN');
  const [expenseDate, setExpenseDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [lens, setLens] = useState<ExpenseLens>('personal');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (expense) {
      setDescription(expense.description || '');
      setAmount(expense.amount ? String(expense.amount) : '');
      setCurrency(expense.currency || 'PEN');
      setExpenseDate(expense.expense_date ? expense.expense_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setCategoryId(expense.category_id || '');
      setAccountId(expense.account_id || '');
      setLens(expense.lens || 'personal');
      setNotes(expense.notes || '');
      setErrorMsg(null);
      setConfirmDelete(false);
    }
  }, [expense]);

  if (!isOpen || !expense) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('La descripción del gasto es obligatoria');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const data = await safeFetchJson(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description.trim(),
          amount: numAmount,
          currency,
          expense_date: expenseDate,
          category_id: categoryId || null,
          account_id: accountId || null,
          lens,
          notes: notes.trim() || null,
        }),
      });

      // Reajustar saldo de cuentas en el store local si correspondiera
      const oldAmount = Number(expense.amount || 0);
      const oldAccId = expense.account_id;
      const newAccId = accountId;

      if (oldAccId === newAccId && newAccId) {
        const diff = numAmount - oldAmount;
        const currentAcc = accounts.find((a) => a.id === newAccId);
        if (currentAcc && diff !== 0) {
          updateAccountBalance(newAccId, Number(currentAcc.current_balance || 0) - diff);
        }
      } else {
        if (oldAccId) {
          const oldAcc = accounts.find((a) => a.id === oldAccId);
          if (oldAcc) {
            updateAccountBalance(oldAccId, Number(oldAcc.current_balance || 0) + oldAmount);
          }
        }
        if (newAccId) {
          const newAcc = accounts.find((a) => a.id === newAccId);
          if (newAcc) {
            updateAccountBalance(newAccId, Number(newAcc.current_balance || 0) - numAmount);
          }
        }
      }

      window.dispatchEvent(new CustomEvent('expense_updated', { detail: data.expense }));
      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));

      if (onSuccess) onSuccess(data.expense);
      onClose();
    } catch (err: any) {
      console.error('[EditExpense Error]:', err);
      setErrorMsg(err.message || 'No se pudo guardar la modificación del gasto');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!token) return;

    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const data = await safeFetchJson(`/api/expenses/${expense.id}`, {
        method: 'DELETE',
      });

      // Restituir saldo a la cuenta en memoria si aplica
      if (expense.account_id && Number(expense.amount) > 0) {
        const acc = accounts.find((a) => a.id === expense.account_id);
        if (acc) {
          updateAccountBalance(
            expense.account_id,
            Number(acc.current_balance || 0) + Number(expense.amount)
          );
        }
      }

      window.dispatchEvent(new CustomEvent('expense_deleted', { detail: { id: expense.id } }));
      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));

      if (onDeleteSuccess) onDeleteSuccess(expense.id);
      onClose();
    } catch (err: any) {
      console.error('[DeleteExpense Error]:', err);
      setErrorMsg(err.message || 'No se pudo eliminar el gasto');
      setIsDeleting(false);
    }
  };

  return (
    <div
      id="edit-expense-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Cabecera */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Editar Gasto
            </h2>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {lens === 'couple' ? 'Pareja' : lens === 'group' ? 'Grupal' : 'Personal'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de error si ocurre */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleUpdate} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Monto y Moneda */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Monto y Moneda
            </label>
            <div className="flex rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 bg-slate-50 dark:bg-slate-950">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold px-3 py-2.5 border-r border-slate-200 dark:border-slate-700 focus:outline-none"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent px-3 py-2.5 text-slate-900 dark:text-white text-base font-bold placeholder-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Descripción
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Supermercado, Almuerzo, Gasolina..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Fecha del Gasto
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Categoría
            </label>
            <div className="relative">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none appearance-none"
              >
                <option value="">Sin categoría / General</option>
                {categories
                  .filter((c) => c.type === 'expense')
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
              <Tag className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Cuenta Bancaria / Origen */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Cuenta de Pago (Débito/Efectivo)
            </label>
            <div className="relative">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none appearance-none"
              >
                <option value="">Sin cuenta asignada (Efectivo / Libre)</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency} {Number(acc.current_balance).toFixed(2)})
                  </option>
                ))}
              </select>
              <CreditCard className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Al modificar el monto o cambiar de cuenta, el saldo de las cuentas se actualizará automáticamente.
            </p>
          </div>

          {/* Lente / Contexto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Lente del Gasto
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['personal', 'couple', 'group'] as const).map((l) => (
                <button
                  type="button"
                  key={l}
                  onClick={() => setLens(l)}
                  className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all text-center ${
                    lens === l
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {l === 'personal' ? 'Personal' : l === 'couple' ? 'Pareja' : 'Grupal'}
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Notas adicionales (opcional)
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles sobre el gasto..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
              />
              <FileText className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Confirmación de eliminación */}
          {confirmDelete && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl space-y-2">
              <div className="flex items-start space-x-2 text-rose-800 dark:text-rose-200 text-xs font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>¿Estás seguro de eliminar este gasto?</span>
              </div>
              <p className="text-[11px] text-rose-600 dark:text-rose-300">
                Se reembolsará el importe ({currency} {Number(amount).toFixed(2)}) a la cuenta origen seleccionada. Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center space-x-1"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sí, eliminar gasto</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-2 flex items-center space-x-2">
            {!confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl transition-colors"
                title="Eliminar este gasto"
                aria-label="Eliminar gasto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isDeleting}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-2xl shadow-sm transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando cambios...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
