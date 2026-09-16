import React, { useState } from 'react';
import { Group, GroupType } from '../../types/flowmoney.ts';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { safeFetchJson } from '../../utils/apiClient.ts';
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY } from '../../constants/currencies.ts';
import { X, Plus, Image as ImageIcon, Sparkles } from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCurrency: string;
  onGroupCreated: (newGroup: Group) => void;
}

const PRESET_COVERS: { label: string; url: string; type: GroupType }[] = [
  {
    label: 'Viaje / Montaña',
    url: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&auto=format&fit=crop&q=80',
    type: 'trip',
  },
  {
    label: 'Pareja / Citas',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&auto=format&fit=crop&q=80',
    type: 'couple',
  },
  {
    label: 'Hogar / Depto',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80',
    type: 'home',
  },
  {
    label: 'Proyecto / Equipo',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
    type: 'project',
  },
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  defaultCurrency,
  onGroupCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<GroupType>('trip');
  const [currency, setCurrency] = useState(defaultCurrency || DEFAULT_CURRENCY);
  const [coverUrl, setCoverUrl] = useState(PRESET_COVERS[0].url);
  const [autoArchiveDays, setAutoArchiveDays] = useState('0');
  const [initialMembersInput, setInitialMembersInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { token: authStoreToken } = useAuthStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('El nombre del grupo es requerido');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await safeFetchJson<{ success?: boolean; group: Group }>('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          currency,
          cover_url: coverUrl || undefined,
          auto_archive_days: Number(autoArchiveDays) || 0,
        }),
      });

      if (!data?.group) {
        throw new Error('No se pudo crear el grupo');
      }

      // Si el usuario especificó participantes opcionales de inmediato, enviarlos
      if (initialMembersInput.trim() && data.group.id) {
        const items = initialMembersInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const item of items) {
          try {
            await safeFetchJson(`/api/groups/${data.group.id}/invite`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(item.includes('@') ? { email: item } : { name: item }),
            });
          } catch (invErr) {
            console.warn('Invitación inicial:', invErr);
          }
        }
      }

      // Limpiar campos del formulario
      setName('');
      setDescription('');
      setInitialMembersInput('');

      window.dispatchEvent(new CustomEvent('group_created', { detail: data.group }));
      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));
      onGroupCreated(data.group);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al crear grupo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Crear Nuevo Grupo
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparte gastos, organiza viajes o finanzas en común
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Tip explicativo: el usuario puede crear el grupo ahora e invitar después */}
        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl flex items-start space-x-2.5">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-indigo-950 dark:text-indigo-200">
            <span className="font-semibold">Crea tu grupo con total libertad:</span> Puedes crearlo ahora mismo e invitar a los demás participantes después en cualquier momento. Registrar participantes antes no es obligatorio.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nombre del grupo *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Escapada a Bariloche, Piso Compartido, Finanzas Dúo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
            />
          </div>

          {/* Participantes iniciales (opcional y no restrictivo) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Invitar participantes ahora (opcional)
              </label>
              <span className="text-[10px] text-slate-400 font-medium">Opcional</span>
            </div>
            <input
              type="text"
              placeholder="Escribe correos o nombres (ej. carlos@email.com, María)"
              value={initialMembersInput}
              onChange={(e) => setInitialMembersInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Puedes dejarlo vacío y añadir personas más tarde con un enlace o correo directo.
            </p>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descripción corta (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. Cabaña, gasolina y comidas del viaje"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Tipo & Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tipo
              </label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as GroupType;
                  setType(newType);
                  const matchingPreset = PRESET_COVERS.find((p) => p.type === newType);
                  if (matchingPreset) setCoverUrl(matchingPreset.url);
                }}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
              >
                <option value="trip">Viaje</option>
                <option value="couple">Pareja</option>
                <option value="home">Hogar / Piso</option>
                <option value="project">Proyecto</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Moneda
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Portada predefinida */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Imagen de portada</span>
              <span className="text-[10px] text-slate-400">Elige un estilo</span>
            </label>

            <div className="grid grid-cols-4 gap-2 mb-2">
              {PRESET_COVERS.map((preset) => (
                <button
                  type="button"
                  key={preset.url}
                  onClick={() => setCoverUrl(preset.url)}
                  className={`relative h-14 rounded-xl overflow-hidden border-2 transition-all ${
                    coverUrl === preset.url
                      ? 'border-indigo-600 scale-[1.03] shadow-sm'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-slate-950/30" />
                  <span className="absolute bottom-1 left-1 right-1 text-[9px] font-bold text-white leading-tight truncate">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>

            <input
              type="url"
              placeholder="O pega una URL de imagen personalizada (opcional)"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full px-3 py-2 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Auto-archivado */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Auto-archivar tras inactividad
            </label>
            <select
              value={autoArchiveDays}
              onChange={(e) => setAutoArchiveDays(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100"
            >
              <option value="0">Desactivado (permanente)</option>
              <option value="30">Tras 30 días sin gastos</option>
              <option value="60">Tras 60 días sin gastos</option>
              <option value="90">Tras 90 días sin gastos</option>
            </select>
          </div>

          {/* Botones */}
          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              {isSubmitting ? (
                <span>Creando grupo...</span>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear grupo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
