import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';
import { X, Mail, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  onMemberInvited: () => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  groupId,
  onMemberInvited,
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ message: string; isPending: boolean } | null>(null);

  const { token: authStoreToken } = useAuthStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    const inputVal = email.trim();
    if (!inputVal) {
      setError('Por favor introduce un correo electrónico o nombre de participante');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = inputVal.includes('@')
        ? { email: inputVal.toLowerCase(), role }
        : { name: inputVal, role };

      const data = await safeFetchJson<{ success?: boolean; message?: string; member?: any }>(`/api/groups/${groupId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!data) {
        throw new Error('Error al agregar participante');
      }

      setSuccessInfo({
        message: data.message || 'Participante agregado exitosamente',
        isPending: Boolean(data.member?.is_pending),
      });

      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));
      setEmail('');
      onMemberInvited();

      setTimeout(() => {
        setSuccessInfo(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error al invitar al participante');
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
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Invitar Miembro
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Se vinculará automáticamente al registrarse
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

        {successInfo && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-1">
            <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              {successInfo.isPending ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{successInfo.isPending ? 'Invitación pendiente' : '¡Miembro añadido!'}</span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              {successInfo.message}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Correo electrónico o Nombre
            </label>
            <input
              type="text"
              required
              placeholder="amigo@ejemplo.com o Nombre (ej. Lucas)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              No es restrictivo registrarse antes: puedes invitar por correo (se vinculará cuando se registre) o agregar su nombre directamente para empezar a registrar gastos compartidos.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Rol en el grupo
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="member">Miembro (puede ver y añadir gastos)</option>
              <option value="admin">Administrador (puede editar y gestionar miembros)</option>
            </select>
          </div>

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
              disabled={isSubmitting || !email.trim()}
              className="flex-1 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              {isSubmitting ? (
                <span>Enviando...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar invitación</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
