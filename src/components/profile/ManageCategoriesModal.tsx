import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { X, Plus, Tags, Trash2, Check } from 'lucide-react';
import { Category } from '../../types/flowmoney.ts';

interface ManageCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesChanged?: () => void;
}

const PRESET_ICONS = ['🍔', '🚗', '🏠', '💡', '🎮', '💊', '🎓', '✈️', '🛒', '💼', '🎁', '📱'];
const PRESET_COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6', '#00C7BE'];

export function ManageCategoriesModal({
  isOpen,
  onClose,
  onCategoriesChanged,
}: ManageCategoriesModalProps) {
  const { categories, addCustomCategory, deleteCustomCategory } = useAuthStore();
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🛒');
  const [newCatColor, setNewCatColor] = useState('#007AFF');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsSubmitting(true);
    try {
      await addCustomCategory({
        name: newCatName.trim(),
        icon: newCatIcon,
        color: newCatColor,
      });
      setNewCatName('');
      onCategoriesChanged?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomCategory(id);
      onCategoriesChanged?.();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Tags className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Gestionar Categorías
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Form to create new category */}
          <form onSubmit={handleCreateCategory} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              Nueva Categoría Personalizada
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Nombre (ej. Mascotas, Cafeterías)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-1 shadow-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear</span>
              </button>
            </div>

            {/* Icon Picker */}
            <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewCatIcon(icon)}
                  className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center shrink-0 transition-transform ${
                    newCatIcon === icon ? 'bg-blue-100 dark:bg-blue-900/60 scale-110 shadow-xs' : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Color Picker */}
            <div className="flex items-center space-x-2">
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setNewCatColor(col)}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    newCatColor === col ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''
                  }`}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
          </form>

          {/* Existing Categories List */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Categorías Actuales ({categories.length})
            </span>
            {categories.map((c) => (
              <div
                key={c.id}
                className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-center space-x-2.5">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shadow-xs"
                    style={{ backgroundColor: `${c.color || '#007AFF'}20`, color: c.color || '#007AFF' }}
                  >
                    {c.icon || '🏷️'}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {c.name}
                  </span>
                  {!c.is_custom && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      Predeterminada
                    </span>
                  )}
                </div>

                {c.is_custom && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Eliminar categoría"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
