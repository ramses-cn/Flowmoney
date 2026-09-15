/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Share2, Copy, Check, ExternalLink, Download, Printer, X, MessageSquare, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { Group, GroupMember, Expense, SimplifiedDebt } from '../types/flowmoney.ts';

interface WhatsAppShareModalProps {
  group: Group;
  members: (GroupMember & { alias_pago?: string; metodo_pago_preferido?: string })[];
  expenses: Expense[];
  balances: {
    totalGasto: number;
    deudasSimplificadas: SimplifiedDebt[];
    balancesPersonales: { user_id: string; nombre: string; balance_consolidado: number }[];
  } | null;
  formatMoney: (amount: number, currency: string) => string;
  onClose: () => void;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  group,
  members,
  expenses,
  balances,
  formatMoney,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  // Generar texto para WhatsApp
  const generateWhatsAppText = () => {
    if (!balances) return '';

    const lines: string[] = [];
    const groupName = (group as any).nombre || group.name;
    const groupCurrency = (group as any).moneda_dominante_grupo || group.currency;

    lines.push(`🧾 *RESUMEN DE GASTOS: ${groupName.toUpperCase()}*`);
    lines.push(`💰 *Gasto Total del Grupo:* ${formatMoney(balances.totalGasto, groupCurrency)}`);
    lines.push(`👥 *Miembros:* ${members.length} personas`);
    lines.push(``);

    lines.push(`⚖️ *BALANCES NETOS:*`);
    balances.balancesPersonales.forEach(b => {
      if (b.balance_consolidado > 0) {
        lines.push(`• *${b.nombre}:* +${formatMoney(b.balance_consolidado, groupCurrency)} (A favor) ✅`);
      } else if (b.balance_consolidado < 0) {
        lines.push(`• *${b.nombre}:* -${formatMoney(Math.abs(b.balance_consolidado), groupCurrency)} (Debe) 🔻`);
      } else {
        lines.push(`• *${b.nombre}:* ${formatMoney(0, groupCurrency)} (Al día) 🤝`);
      }
    });

    lines.push(``);
    lines.push(`🤝 *LIQUIDACIÓN SUGERIDA (MÍNIMAS TRANSFERENCIAS):*`);
    if (balances.deudasSimplificadas.length === 0) {
      lines.push(`🎉 ¡Todos están al día! No hay transferencias pendientes.`);
    } else {
      balances.deudasSimplificadas.forEach(d => {
        const creditorId = d.creditor_id || (d as any).acreedor_id;
        const receiverMember = members.find(m => m.user_id === creditorId);
        const aliasInfo = receiverMember?.alias_pago ? ` (Pagar a: ${receiverMember.alias_pago})` : '';
        const debtorName = d.debtor_name || (d as any).deudor_nombre;
        const creditorName = d.creditor_name || (d as any).acreedor_nombre;
        const amount = d.amount ?? (d as any).monto;
        const curr = d.currency || (d as any).moneda || groupCurrency;
        lines.push(`👉 *${debtorName}* le paga a *${creditorName}*: *${formatMoney(amount, curr)}*${aliasInfo}`);
      });
    }

    // Datos de pago registrados
    const membersWithPaymentData = members.filter(m => m.alias_pago);
    if (membersWithPaymentData.length > 0) {
      lines.push(``);
      lines.push(`📱 *DATOS DE PAGO / ALIAS:*`);
      membersWithPaymentData.forEach(m => {
        const mName = m.full_name || (m as any).nombre || m.email || 'Miembro';
        lines.push(`• ${mName}: ${m.alias_pago} (${m.metodo_pago_preferido || 'Transferencia'})`);
      });
    }

    lines.push(``);
    lines.push(`✨ _Liquidado con GastosGrupales AI · Más rápido y libre que Splitwise_`);
    return lines.join('\n');
  };

  const textToShare = generateWhatsAppText();

  const handleCopy = () => {
    navigator.clipboard.writeText(textToShare);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(textToShare);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    if (expenses.length === 0) return;

    const headers = ['Fecha', 'Descripción', 'Categoría', 'Pagador', 'Monto Original', 'Moneda', 'Monto Equivalente', 'Moneda Grupo'];
    const groupName = (group as any).nombre || group.name;
    const groupCurrency = (group as any).moneda_dominante_grupo || group.currency;

    const rows = expenses.map(e => {
      const payerId = (e as any).payer_user_id || e.paid_by || (e as any).pagador_id;
      const payer = members.find(m => m.user_id === payerId);
      const payerName = payer?.full_name || (payer as any)?.nombre || payerId;
      const dateStr = ((e as any).fecha || e.created_at || '').slice(0, 10);
      const desc = (e.description || (e as any).descripcion || '').replace(/"/g, '""');
      const cat = e.category_name || (e as any).categoria || 'Otros';
      const amount = e.amount ?? (e as any).monto_total ?? 0;
      const curr = e.currency || (e as any).moneda_gasto || groupCurrency;
      return [
        `"${dateStr}"`,
        `"${desc}"`,
        `"${cat}"`,
        `"${payerName}"`,
        amount,
        `"${curr}"`,
        amount,
        `"${groupCurrency}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `gastos_${groupName.toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Imprimir
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="modal-whatsapp-share">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]"
      >
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-sm shadow-emerald-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">Compartir Resumen del Grupo</h3>
              <p className="text-xs text-slate-500">Tus amigos no necesitan descargar la app para enterarse</p>
            </div>
          </div>
          <button 
            id="close-whatsapp-modal-btn"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Vista previa del mensaje formateado */}
        <div className="flex-1 overflow-y-auto mb-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed select-all" id="whatsapp-preview-box">
          {textToShare}
        </div>

        {/* Botones de acción rápida */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              id="copy-whatsapp-text-btn"
              type="button"
              onClick={handleCopy}
              className={`py-3 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                copied 
                  ? 'bg-emerald-700 text-white' 
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>¡Copiado al portapapeles!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Formato WhatsApp</span>
                </>
              )}
            </button>

            <button
              id="open-direct-whatsapp-btn"
              type="button"
              onClick={handleOpenWhatsApp}
              className="py-3 px-4 rounded-2xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-emerald-600/20"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Abrir en WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>

          {/* Exportar a CSV y Imprimir (Funcionalidades que Splitwise cobra en Pro) */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
              <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[10px]">Sin costo</span>
              <span>Descargas ilimitadas</span>
            </div>

            <div className="flex gap-2">
              <button
                id="export-csv-btn"
                type="button"
                onClick={handleExportCSV}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="Descargar hoja de cálculo Excel/CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Descargar CSV</span>
              </button>

              <button
                id="print-summary-btn"
                type="button"
                onClick={handlePrint}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="Imprimir resumen o guardar en PDF"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>Imprimir / PDF</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
