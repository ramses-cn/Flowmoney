import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { Expense, ExpenseLens } from '../../types/flowmoney.ts';
import { DEFAULT_CURRENCY } from '../../constants/currencies.ts';
import { EditExpenseModal } from './EditExpenseModal.tsx';
import { ExportDataSection } from '../profile/ExportDataSection.tsx';
import { ManageCategoriesModal } from '../profile/ManageCategoriesModal.tsx';
import {
  Layers,
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  CreditCard,
  Tag,
  FileText,
  X,
  SlidersHorizontal,
} from 'lucide-react';

interface ExpensesViewProps {
  onOpenAddModal: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ onOpenAddModal }) => {
  const { token, profile, accounts, updateAccountBalance } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedLens, setSelectedLens] = useState<'all' | ExpenseLens>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalExpensesCount, setTotalExpensesCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const PAGE_LIMIT = 20;

  const [showExportModal, setShowExportModal] = useState(false);
  const [showManageCatModal, setShowManageCatModal] = useState(false);

  // Modal de edición
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Modal de confirmación rápida de eliminación
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notificación toast flotante
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchExpenses = (reset: boolean = true) => {
    if (!token) return;
    if (reset) {
      setIsLoading(true);
      setOffset(0);
    } else {
      setIsLoadingMore(true);
    }

    const currentOffset = reset ? 0 : offset + PAGE_LIMIT;
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_LIMIT));
    params.set('offset', String(currentOffset));
    if (selectedLens !== 'all') {
      params.set('lens', selectedLens);
    }
    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    }

    fetch(`/api/expenses?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.expenses) {
          if (reset) {
            setExpenses(data.expenses);
          } else {
            setExpenses((prev) => [...prev, ...data.expenses]);
          }
          setOffset(currentOffset);
          setHasMore(Boolean(data.pagination?.hasMore));
          setTotalExpensesCount(data.pagination?.total ?? data.expenses.length);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        setIsLoading(false);
        setIsLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchExpenses(true);
  }, [token, selectedLens, searchQuery]);

  // Escuchar eventos globales de cambios de gastos
  useEffect(() => {
    const handleExpenseChange = () => {
      fetchExpenses();
    };

    window.addEventListener('expense_created', handleExpenseChange);
    window.addEventListener('expense_updated', handleExpenseChange);
    window.addEventListener('expense_deleted', handleExpenseChange);
    window.addEventListener('flowmoney_data_changed', handleExpenseChange);

    return () => {
      window.removeEventListener('expense_created', handleExpenseChange);
      window.removeEventListener('expense_updated', handleExpenseChange);
      window.removeEventListener('expense_deleted', handleExpenseChange);
      window.removeEventListener('flowmoney_data_changed', handleExpenseChange);
    };
  }, [token, selectedLens]);

  const handleEditClick = (expense: Expense, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingExpense(expense);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (expense: Expense, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpenseToDelete(expense);
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete || !token) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/expenses/${expenseToDelete.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar el gasto');
      }

      // Reembolsar saldo de cuenta localmente
      if (expenseToDelete.account_id && Number(expenseToDelete.amount) > 0) {
        const acc = accounts.find((a) => a.id === expenseToDelete.account_id);
        if (acc) {
          updateAccountBalance(
            expenseToDelete.account_id,
            Number(acc.current_balance || 0) + Number(expenseToDelete.amount)
          );
        }
      }

      setExpenses((prev) => prev.filter((e) => e.id !== expenseToDelete.id));
      showToast('Gasto eliminado exitosamente y saldo restituido');

      window.dispatchEvent(new CustomEvent('expense_deleted', { detail: { id: expenseToDelete.id } }));
      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));

      setExpenseToDelete(null);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'No se pudo eliminar el gasto');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtrado por búsqueda
  const filteredExpenses = useMemo(() => {
    if (!searchQuery.trim()) return expenses;
    const q = searchQuery.toLowerCase().trim();
    return expenses.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        (e.category_name && e.category_name.toLowerCase().includes(q)) ||
        (e.account_name && e.account_name.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q))
    );
  }, [expenses, searchQuery]);

  // Total acumulado filtrado
  const totalAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredExpenses]);

  return (
    <div id="expenses-view" className="space-y-4 pb-20 animate-fade-in">
      {/* Toast Notifier — iOS style */}
      {toastMessage && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[14px] flex items-center space-x-2 text-[13px] font-semibold animate-fade-in"
          style={{
            background: 'var(--ios-bg-elevated)',
            color: 'var(--ios-label)',
            boxShadow: 'var(--shadow-lg)',
            border: '0.5px solid var(--ios-separator)',
          }}
        >
          <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ios-green)' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Cabecera — Large Title iOS */}
      <div className="flex items-end justify-between pt-1">
        <div className="flex-1 min-w-0">
          <h1
            className="text-[34px] font-bold tracking-tight"
            style={{ color: 'var(--ios-label)', letterSpacing: '-0.022em', lineHeight: 1.1 }}
          >
            Gastos
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--ios-label-secondary)' }}>
            {expenses.length} de {totalExpensesCount} movimientos &bull;{' '}
            <span className="font-semibold tabular-nums" style={{ color: 'var(--ios-label)' }}>
              {profile?.default_currency || DEFAULT_CURRENCY} {totalAmount.toFixed(2)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManageCatModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-[12px] text-[12px] font-medium transition-all active:scale-95"
            style={{
              background: 'rgba(120, 120, 128, 0.12)',
              color: 'var(--ios-label)',
            }}
            title="Gestionar y personalizar categorías"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--ios-blue)' }} />
            <span className="hidden sm:inline">Categorías</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-[12px] text-[12px] font-medium transition-all active:scale-95"
            style={{
              background: 'rgba(120, 120, 128, 0.12)',
              color: 'var(--ios-label)',
            }}
            title="Centro de Reportes y Exportación"
          >
            <FileText className="w-3.5 h-3.5" style={{ color: 'var(--ios-blue)' }} />
            <span className="hidden sm:inline">Reportes</span>
          </button>
          <button
            onClick={onOpenAddModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-[12px] text-[12px] font-semibold text-white transition-all active:scale-95"
            style={{
              background: 'var(--ios-blue)',
              boxShadow: '0 1px 2px rgba(0,122,255,0.3), 0 4px 12px rgba(0,122,255,0.18)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo</span>
          </button>
        </div>
      </div>

      {/* Buscador — iOS search bar */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por concepto, categoría o cuenta..."
          className="w-full rounded-[12px] pl-10 pr-4 py-[12px] text-[16px] transition-all focus:outline-none"
          style={{
            background: 'var(--ios-bg-tertiary)',
            border: '0.5px solid var(--ios-separator)',
            color: 'var(--ios-label)',
          }}
        />
        <Search
          className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--ios-label-tertiary)' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium transition-colors"
            style={{ color: 'var(--ios-blue)' }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Selector de lentes — iOS Segmented Control */}
      <div className="segmented-control w-full">
        {(['all', 'personal', 'couple', 'group'] as const).map((lens) => (
          <button
            key={lens}
            type="button"
            onClick={() => setSelectedLens(lens)}
            className="segmented-control-item flex-1 capitalize"
            style={{
              color: selectedLens === lens ? 'var(--ios-blue)' : 'var(--ios-label-secondary)',
              fontWeight: selectedLens === lens ? 600 : 500,
            }}
          >
            {lens === 'all' ? 'Todos' : lens === 'couple' ? 'Pareja' : lens === 'group' ? 'Grupal' : 'Personal'}
            {selectedLens === lens && (
              <motion.div
                layoutId="expensesLensIndicator"
                className="segmented-control-thumb"
                style={{ top: 2, bottom: 2, left: 0, width: '25%' }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Lista de gastos */}
      {isLoading ? (
        <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ios-label-secondary)' }}>
          Cargando gastos...
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div
          className="rounded-[16px] p-8 text-center space-y-3"
          style={{
            background: 'var(--ios-bg-elevated)',
            border: '0.5px solid var(--ios-separator)',
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{
              background: 'rgba(0, 122, 255, 0.10)',
              color: 'var(--ios-blue)',
            }}
          >
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ios-label)' }}>
              {searchQuery ? 'No se encontraron gastos coincidentes' : 'No hay gastos en esta vista'}
            </h3>
            <p className="text-[12px] mt-1 max-w-xs mx-auto" style={{ color: 'var(--ios-label-secondary)' }}>
              {searchQuery
                ? 'Prueba modificando los términos de búsqueda o cambiando el filtro de lente.'
                : 'Cada gasto se asocia a su cuenta de débito y al lente correspondiente (personal, pareja o grupo).'}
            </p>
          </div>
          {!searchQuery && (
            <button
              onClick={onOpenAddModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl transition-colors shadow-sm"
            >
              Añadir primer gasto
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredExpenses.map((expense) => (
            <div
              key={expense.id}
              onClick={() => {
                setEditingExpense(expense);
                setIsEditModalOpen(true);
              }}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl flex items-center justify-between shadow-sm hover:border-indigo-400/50 hover:shadow transition-all cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: expense.category_color || '#4F46E5' }}
                >
                  {(expense.category_name || 'G').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {expense.description}
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>{expense.category_name || 'General'}</span>
                    <span>&bull;</span>
                    <span className="capitalize">{expense.lens === 'couple' ? 'Pareja' : expense.lens === 'group' ? 'Grupo' : 'Personal'}</span>
                    <span>&bull;</span>
                    <span>{expense.expense_date}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    -{expense.currency || profile?.default_currency || DEFAULT_CURRENCY} {Number(expense.amount).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400 line-clamp-1 max-w-[110px]">
                    {expense.account_name || 'Sin cuenta (Efectivo)'}
                  </div>
                </div>

                {/* Acciones directas de editar y eliminar */}
                <div className="flex items-center space-x-1 pl-1">
                  <button
                    type="button"
                    onClick={(e) => handleEditClick(expense, e)}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors"
                    title="Editar gasto"
                    aria-label={`Editar gasto ${expense.description}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteClick(expense, e)}
                    className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                    title="Eliminar gasto"
                    aria-label={`Eliminar gasto ${expense.description}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botón Paginado / Cargar Más */}
      {!isLoading && hasMore && (
        <div className="pt-2 flex justify-center">
          <button
            id="btn-load-more-expenses"
            type="button"
            disabled={isLoadingMore}
            onClick={() => fetchExpenses(false)}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-2xl transition-all active:scale-95 shadow-xs flex items-center space-x-2 disabled:opacity-50"
          >
            {isLoadingMore ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                <span>Cargando transacciones anteriores...</span>
              </>
            ) : (
              <span>Cargar 20 gastos más ({totalExpensesCount - expenses.length} restantes)</span>
            )}
          </button>
        </div>
      )}

      {/* Modal de Edición */}
      <EditExpenseModal
        isOpen={isEditModalOpen}
        expense={editingExpense}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingExpense(null);
        }}
        onSuccess={(updated) => {
          setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          showToast('Gasto actualizado correctamente');
        }}
        onDeleteSuccess={(deletedId) => {
          setExpenses((prev) => prev.filter((e) => e.id !== deletedId));
          showToast('Gasto eliminado correctamente');
        }}
      />

      {/* Modal rápido de confirmación de eliminación */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                ¿Eliminar este gasto?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Estás a punto de eliminar <span className="font-semibold text-slate-800 dark:text-slate-200">"{expenseToDelete.description}"</span> por un monto de{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {expenseToDelete.currency || DEFAULT_CURRENCY} {Number(expenseToDelete.amount).toFixed(2)}
                </span>
                . Se reintegrará el saldo a tu cuenta.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteExpense}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setExpenseToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal interactivo de Exportación y Reportes */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Centro de Reportes y Exportación</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-y-auto">
              <ExportDataSection hideHeader={true} />
            </div>
          </div>
        </div>
      )}

      {/* Modal para Administrar y Personalizar Categorías */}
      <ManageCategoriesModal
        isOpen={showManageCatModal}
        onClose={() => setShowManageCatModal(false)}
        onCategoriesChanged={() => {
          fetchExpenses();
        }}
      />
    </div>
  );
};
