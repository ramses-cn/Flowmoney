import React from 'react';
import { Home, ReceiptText, Plus, Users, User } from 'lucide-react';

export type TabType = 'home' | 'expenses' | 'add' | 'groups' | 'profile';

interface BottomNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenAddModal: () => void;
}

export function BottomNav({ activeTab, onSelectTab, onOpenAddModal }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl transition-colors duration-200"
      style={{
        backgroundColor: 'rgba(var(--ios-bg-secondary), 0.85)',
        borderColor: 'var(--ios-separator)',
        paddingBottom: 'env(safe-area-inset-bottom, 12px)',
      }}
    >
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {/* Inicio */}
        <button
          id="nav-tab-home"
          type="button"
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-transform active:scale-95 ${
            activeTab === 'home' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className={`w-5 h-5 transition-colors ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 tracking-tight">Inicio</span>
        </button>

        {/* Gastos */}
        <button
          id="nav-tab-expenses"
          type="button"
          onClick={() => onSelectTab('expenses')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-transform active:scale-95 ${
            activeTab === 'expenses' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ReceiptText className={`w-5 h-5 transition-colors ${activeTab === 'expenses' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 tracking-tight">Gastos</span>
        </button>

        {/* Botón Central Agregar Gasto */}
        <div className="flex-1 flex items-center justify-center">
          <button
            id="nav-tab-add"
            type="button"
            onClick={onOpenAddModal}
            className="w-12 h-12 -mt-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 transition-transform active:scale-90"
            title="Añadir gasto"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Grupos */}
        <button
          id="nav-tab-groups"
          type="button"
          onClick={() => onSelectTab('groups')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-transform active:scale-95 ${
            activeTab === 'groups' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Users className={`w-5 h-5 transition-colors ${activeTab === 'groups' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 tracking-tight">Grupos</span>
        </button>

        {/* Perfil */}
        <button
          id="nav-tab-profile"
          type="button"
          onClick={() => onSelectTab('profile')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-transform active:scale-95 ${
            activeTab === 'profile' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <User className={`w-5 h-5 transition-colors ${activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-1 tracking-tight">Perfil</span>
        </button>
      </div>
    </nav>
  );
}
