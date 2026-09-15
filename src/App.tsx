import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ProtectedRoute } from './components/auth/ProtectedRoute.tsx';
import { BottomNav, TabType } from './components/layout/BottomNav.tsx';
import { HomeView } from './components/dashboard/HomeView.tsx';
import { ExpensesView } from './components/dashboard/ExpensesView.tsx';
import { GroupsView } from './components/dashboard/GroupsView.tsx';
import { ProfileView } from './components/dashboard/ProfileView.tsx';
import { AddExpenseModal } from './components/dashboard/AddExpenseModal.tsx';
import { useAuthStore } from './store/useAuthStore.ts';
import { initThemeListener } from './utils/theme.ts';
import { AlertCircle } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | undefined>(undefined);
  const { profile, isDemoSession } = useAuthStore();
  const isDemo = isDemoSession || profile?.id?.startsWith('demo_');

  useEffect(() => {
    const cleanup = initThemeListener();
    return () => cleanup();
  }, []);

  const handleOpenAddExpense = (groupId?: string) => {
    setAddExpenseGroupId(groupId);
    setIsAddExpenseOpen(true);
  };

  // Mapa de orden de tabs para animación push/pop estilo iOS
  const tabOrder: Record<TabType, number> = { home: 0, expenses: 1, add: 2, groups: 3, profile: 4 };
  const currentIdx = tabOrder[activeTab];

  return (
    <ProtectedRoute>
      <div
        className="min-h-screen flex flex-col font-sans transition-colors duration-200"
        style={{ background: 'var(--ios-bg-primary)', color: 'var(--ios-label)' }}
      >
        {/* Banner persistente de sesión demo — iOS alert style */}
        {isDemo && (
          <div
            id="demo-session-banner"
            className="w-full px-4 py-2.5 text-center text-[12px] font-medium flex items-center justify-center space-x-2 z-40 sticky top-0"
            style={{
              background: 'rgba(255, 149, 0, 0.12)',
              borderBottom: '0.5px solid rgba(255, 149, 0, 0.25)',
              color: 'var(--ios-orange)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Estás viendo datos de ejemplo (Modo Demo). Los cambios no afectan a cuentas reales.</span>
          </div>
        )}

        {/* Contenedor responsivo principal */}
        <div className="w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl mx-auto flex-1 flex flex-col px-3 sm:px-6 pt-3 sm:pt-5 pb-24">
          {/* Vistas con transición push/pop iOS */}
          <main className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              >
                {activeTab === 'home' && (
                  <HomeView
                    onOpenAddModal={() => handleOpenAddExpense()}
                    onNavigateToTab={(tab) => setActiveTab(tab)}
                  />
                )}

                {activeTab === 'expenses' && (
                  <ExpensesView onOpenAddModal={() => handleOpenAddExpense()} />
                )}

                {activeTab === 'groups' && (
                  <GroupsView onOpenAddModal={(groupId) => handleOpenAddExpense(groupId)} />
                )}

                {activeTab === 'profile' && <ProfileView />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Barra de Navegación Inferior */}
        <BottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          onOpenAddModal={() => handleOpenAddExpense()}
        />

        {/* Modal de Registro Rápido de Gasto */}
        <AddExpenseModal
          isOpen={isAddExpenseOpen}
          initialGroupId={addExpenseGroupId}
          onClose={() => {
            setIsAddExpenseOpen(false);
            setAddExpenseGroupId(undefined);
          }}
          onSuccess={() => {
            // Refrescar al añadir gasto
          }}
        />
      </div>
    </ProtectedRoute>
  );
}

export default App;
