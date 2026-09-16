import React, { useState, useEffect } from 'react';
import { GroupMemberItem } from '../../types/flowmoney.ts';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';
import { X, HandCoins, Check, AlertCircle } from 'lucide-react';

interface SettleDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  members: GroupMemberItem[];
  currentUserId?: string;
  initialPayerId?: string;
  initialPayeeId?: string;
  initialAmount?: number;
  onSettlementCreated: () => void;
}

export const SettleDebtModal: React.FC<SettleDebtModalProps> = ({
  isOpen,
  onClose,
  groupId,
  currency,
  members,
  currentUserId,
  initialPayerId,
  initialPayeeId,
  initialAmount,
  onSettlementCreated,
}) => {
  const activeMembers = members.filter((m) => !m.is_pending);

  const [payerId, setPayerId] = useState<string>('');
  const [payeeId, setPayeeId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('transfer');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPayerId(initialPayerId || currentUserId || activeMembers[0]?.user_id || '');
      setPayeeId(
        initialPayeeId ||
          activeMembers.find((m) => m.user_id !== (initialPayerId || currentUserId))?.user_id ||
          ''
      );
      setAmount(initialAmount ? initialAmount.toString() : '');
      setNotes('');
    }
  }, [isOpen, initialPayerId, initialPayeeId, initialAmount, currentUserId, members]);

  const { token: authStoreToken } = useAuthStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!payerId || !payeeId) {
      setError('Debes seleccionar pagador y receptor.');
      return;
    }

    if (payerId === payeeId) {
      setError('El pagador y el receptor no pueden ser la misma persona.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Introduce un monto válido mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await safeFetchJson<{ success?: boolean; error?: string }>('/api/settlements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_id: groupId,
          payer_id: payerId,
          payee_id: payeeId,
          amount: numAmount,
          currency,
          payment_method: paymentMethod,
          notes: notes.trim() || undefined,
        }),
      });

      if (!data) {
        throw new Error('Error al registrar el pago');
      }

      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));
      onSettlementCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al registrar la liquidación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Saldar Deuda
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registra un pago directo entre dos miembros
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Pagador */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              ¿Quién paga?
            </label>
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
            >
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email} {m.user_id === currentUserId ? '(Tú)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Receptor */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              ¿Quién recibe el pago?
            </label>
            <select
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
            >
              {activeMembers
                .filter((m) => m.user_id !== payerId)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name || m.email} {m.user_id === currentUserId ? '(Tú)' : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Monto ({currency})
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 pl-8"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">
                {currency === 'PEN' ? 'S/' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency}
              </span>
            </div>
          </div>

          {/* Método de pago */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Método de pago
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="transfer">Transferencia bancaria</option>
              <option value="bizum">Bizum / Envío instantáneo</option>
              <option value="cash">Efectivo</option>
              <option value="revolut">Revolut</option>
              <option value="paypal">PayPal</option>
              <option value="other">Otro</option>
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notas (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. Transferencia vía Bizum de la cena"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Botones */}
          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
              className="flex-1 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              {isSubmitting ? (
                <span>Registrando...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirmar pago</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
