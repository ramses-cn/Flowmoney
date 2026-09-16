import React from 'react';
import { Group } from '../../types/flowmoney.ts';
import { Users, ChevronRight, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import { getCurrencySymbol } from '../../constants/currencies.ts';

interface GroupCardProps {
  group: Group;
  currentUserId?: string;
  onClick: () => void;
}

export function GroupCard({ group, currentUserId, onClick }: GroupCardProps) {
  const netBalance = Number(group.net_balance || 0);
  const symbol = getCurrencySymbol(group.currency);
  const memberCount = group.member_count ?? 1;

  const isOwed = netBalance > 0.01;
  const iOwe = netBalance < -0.01;
  const isSettled = !isOwed && !iOwe;

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base border border-blue-100 dark:border-blue-900/40">
            {group.icon || group.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {group.name}
            </h3>
            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="flex items-center space-x-1">
                <Users className="w-3.5 h-3.5" />
                <span>{memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}</span>
              </span>
              <span>•</span>
              <span className="capitalize">{group.type || 'general'}</span>
              {group.user_role === 'admin' && (
                <>
                  <span>•</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    Admin
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tu balance:</span>
        <div className="flex items-center space-x-1 text-sm font-bold">
          {isOwed && (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Te deben {symbol} {netBalance.toFixed(2)}</span>
            </span>
          )}
          {iOwe && (
            <span className="text-rose-600 dark:text-rose-400 flex items-center space-x-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Debes {symbol} {Math.abs(netBalance).toFixed(2)}</span>
            </span>
          )}
          {isSettled && (
            <span className="text-slate-500 dark:text-slate-400 flex items-center space-x-1 font-normal">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Al día</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
