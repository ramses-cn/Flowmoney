/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Trash2, Check, Users, Percent, Calculator, X, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { GroupMember } from '../types/flowmoney.ts';

interface BillItem {
  id: string;
  descripcion: string;
  precio: number;
  asignados: string[]; // user_ids
}

interface ItemizedSplitModalProps {
  members: GroupMember[];
  currency: string;
  initialItems?: { descripcion: string; precio: number }[];
  initialTax?: number;
  initialTip?: number;
  onApply: (total: number, splits: Record<string, { value: string }>, items: BillItem[]) => void;
  onClose: () => void;
}

export const ItemizedSplitModal: React.FC<ItemizedSplitModalProps> = ({
  members,
  currency,
  initialItems = [],
  onApply,
  onClose
}) => {
  const [items, setItems] = useState<BillItem[]>(() => {
    if (initialItems.length > 0) {
      return initialItems.map((it, idx) => ({
        id: `item_${idx}_${Date.now()}`,
        descripcion: it.descripcion,
        precio: Number(it.precio),
        asignados: members.map(m => m.user_id) // Default a todos
      }));
    }
    return [
      { id: 'item_1', descripcion: 'Plato 1', precio: 25, asignados: members.length > 0 ? [members[0].user_id] : [] },
      { id: 'item_2', descripcion: 'Bebidas', precio: 15, asignados: members.map(m => m.user_id) }
    ];
  });

  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [tipPercent, setTipPercent] = useState<number>(10);
  const [taxPercent, setTaxPercent] = useState<number>(0);

  // Agregar nuevo plato/ítem
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDesc || !newItemPrice) return;
    const p = parseFloat(newItemPrice);
    if (isNaN(p) || p <= 0) return;

    setItems([
      ...items,
      {
        id: `item_${Date.now()}_${Math.random()}`,
        descripcion: newItemDesc,
        precio: p,
        asignados: members.map(m => m.user_id) // por defecto todos
      }
    ]);
    setNewItemDesc('');
    setNewItemPrice('');
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(it => it.id !== id));
  };

  const toggleAssignee = (itemId: string, userId: string) => {
    setItems(items.map(it => {
      if (it.id !== itemId) return it;
      const exists = it.asignados.includes(userId);
      const newAsignados = exists 
        ? it.asignados.filter(u => u !== userId)
        : [...it.asignados, userId];
      return { ...it, asignados: newAsignados };
    }));
  };

  const assignAll = (itemId: string) => {
    setItems(items.map(it => {
      if (it.id !== itemId) return it;
      return { ...it, asignados: members.map(m => m.user_id) };
    }));
  };

  // Cálculos matemáticos de reparto proporcional
  const subtotal = items.reduce((acc, it) => acc + (it.precio || 0), 0);
  const tipAmount = subtotal * (tipPercent / 100);
  const taxAmount = subtotal * (taxPercent / 100);
  const grandTotal = subtotal + tipAmount + taxAmount;

  // Calcular monto por persona
  const memberTotals: Record<string, number> = {};
  members.forEach(m => { memberTotals[m.user_id] = 0; });

  items.forEach(it => {
    if (it.asignados.length > 0) {
      const share = it.precio / it.asignados.length;
      it.asignados.forEach(uid => {
        if (memberTotals[uid] !== undefined) {
          memberTotals[uid] += share;
        }
      });
    }
  });

  // Repartir propina e impuestos proporcionalmente al consumo de cada uno
  const finalSplits: Record<string, { value: string }> = {};
  members.forEach(m => {
    const rawSub = memberTotals[m.user_id] || 0;
    const ratio = subtotal > 0 ? rawSub / subtotal : 1 / members.length;
    const personTip = tipAmount * ratio;
    const personTax = taxAmount * ratio;
    const personFinal = rawSub + personTip + personTax;
    finalSplits[m.user_id] = { value: personFinal.toFixed(2) };
  });

  const handleConfirm = () => {
    onApply(Number(grandTotal.toFixed(2)), finalSplits, items);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="modal-itemized-split">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-sm shadow-indigo-600/20">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">Desglose de Cuenta Plato por Plato</h3>
              <p className="text-xs text-slate-500">Asigna consumos individuales y reparte propinas automáticamente</p>
            </div>
          </div>
          <button 
            id="close-itemized-modal-btn"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista interactiva de ítems */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4" id="items-list-container">
          {items.map((it, idx) => (
            <div key={it.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-xs text-slate-800 truncate">{it.descripcion}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs text-slate-900">
                    {it.precio.toFixed(2)} {currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(it.id)}
                    className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Selector de personas asignadas */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Quién lo consumió:</span>
                  <button
                    type="button"
                    onClick={() => assignAll(it.id)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold"
                  >
                    Todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {members.map(m => {
                    const isAssigned = it.asignados.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => toggleAssignee(it.id, m.user_id)}
                        className={`text-[11px] font-bold py-1 px-2.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer border ${
                          isAssigned
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{m.full_name || m.email || 'Miembro'}</span>
                        {isAssigned && <Check className="w-3 h-3 text-indigo-200" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Formulario rápido para añadir ítem */}
          <form onSubmit={handleAddItem} className="flex gap-2 pt-1" id="add-item-form">
            <input 
              type="text"
              placeholder="Nombre del plato/bebida..."
              value={newItemDesc}
              onChange={(e) => setNewItemDesc(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800"
            />
            <input 
              type="number"
              step="0.01"
              placeholder="Precio"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              className="w-24 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-indigo-500 text-slate-800 font-mono"
            />
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-3 py-2 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </form>
        </div>

        {/* Ajustes de propina e impuestos */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 mb-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <Percent className="w-3.5 h-3.5 text-indigo-600" /> Propina sugerida:
            </span>
            <div className="flex gap-1.5">
              {[0, 5, 10, 15].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setTipPercent(pct)}
                  className={`py-1 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tipPercent === pct
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
            <span className="text-slate-500 font-medium">Subtotal de platos:</span>
            <span className="font-mono font-bold text-slate-800">{subtotal.toFixed(2)} {currency}</span>
          </div>
          <div className="flex items-center justify-between text-indigo-700 font-bold">
            <span>Propina ({tipPercent}%):</span>
            <span className="font-mono">+{tipAmount.toFixed(2)} {currency}</span>
          </div>
          <div className="flex items-center justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200/60">
            <span>Total a pagar del ticket:</span>
            <span className="font-mono text-indigo-600">{grandTotal.toFixed(2)} {currency}</span>
          </div>
        </div>

        {/* Resumen por persona calculado */}
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Resultado calculado por persona:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs max-h-24 overflow-y-auto">
            {members.map(m => (
              <div key={m.user_id} className="bg-slate-100/70 p-2 rounded-xl flex items-center justify-between">
                <span className="font-bold text-slate-700 truncate max-w-[80px]">{m.full_name || m.email || 'Miembro'}</span>
                <span className="font-mono font-black text-indigo-600">{finalSplits[m.user_id]?.value} {currency}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          id="confirm-itemized-split-btn"
          type="button"
          onClick={handleConfirm}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-2xl text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-indigo-200" />
          <span>Aplicar Desglose Exacto al Gasto ({grandTotal.toFixed(2)} {currency})</span>
        </button>
      </motion.div>
    </div>
  );
};
