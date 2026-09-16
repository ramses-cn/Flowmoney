import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { PersonalInfoSection } from '../profile/PersonalInfoSection.tsx';
import { BudgetsSection } from '../profile/BudgetsSection.tsx';
import { AccountsSection } from '../profile/AccountsSection.tsx';
import { SubscriptionsSection } from '../profile/SubscriptionsSection.tsx';
import { PreferencesSection } from '../profile/PreferencesSection.tsx';
import { ExportDataSection } from '../profile/ExportDataSection.tsx';
import { AlertSettingsSection } from '../profile/AlertSettingsSection.tsx';
import { ScheduledReportsSection } from '../profile/ScheduledReportsSection.tsx';
import { MasterAdminModal } from '../profile/MasterAdminModal.tsx';
import { LogOut, ShieldAlert } from 'lucide-react';

const MASTER_ADMIN_EMAILS = ['psico.csar@gmail.com', 'cesar.nieto.ore@gmail.com'];

export const ProfileView: React.FC = () => {
  const { logout, profile, firebaseUser } = useAuthStore();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const currentUserEmail = (profile?.email || firebaseUser?.email || '').toLowerCase().trim();
  const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(currentUserEmail);

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  return (
    <div id="profile-view" className="space-y-6 pb-24 animate-fade-in">
      {/* Encabezado — iOS Large Title */}
      <div className="pt-1">
        <h1
          className="text-[34px] font-bold tracking-tight"
          style={{ color: 'var(--ios-label)', letterSpacing: '-0.022em', lineHeight: 1.1 }}
        >
          Perfil
        </h1>
        <p className="text-[14px] mt-0.5" style={{ color: 'var(--ios-label-secondary)' }}>
          Gestión de datos personales, presupuestos, cuentas y reportes
        </p>
      </div>

      {/* Acceso exclusivo Master Admin (solo para psico.csar@gmail.com y cesar.nieto.ore@gmail.com) */}
      {isMasterAdmin && (
        <div
          id="master-admin-banner"
          className="p-4 rounded-[20px] border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.12), rgba(255, 59, 48, 0.08))',
            borderColor: 'rgba(255, 149, 0, 0.3)',
          }}
        >
          <div className="flex items-center space-x-3.5">
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center text-white shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #FF9500, #FF3B30)' }}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[15px] font-bold" style={{ color: 'var(--ios-label)' }}>
                  Administrador Master
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-700 dark:text-amber-400">
                  Acceso Especial
                </span>
              </div>
              <p className="text-[12px] opacity-80" style={{ color: 'var(--ios-label-secondary)' }}>
                Gestión de usuarios principales, códigos de acceso y enlaces de vinculación.
              </p>
            </div>
          </div>

          <button
            id="open-master-admin-btn"
            type="button"
            onClick={() => setShowAdminModal(true)}
            className="self-start sm:self-center py-2 px-4 rounded-[12px] text-[13px] font-bold text-white shadow-sm transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #FF9500, #FF3B30)' }}
          >
            Abrir Gestión Master
          </button>
        </div>
      )}

      {/* 1. Sección Datos Personales */}
      <PersonalInfoSection />

      {/* 2. Sección Presupuestos y Gráfico de Dona con Recharts */}
      <BudgetsSection />

      {/* 3. Sección Cuentas */}
      <AccountsSection />

      {/* 4. Sección Suscripciones */}
      <SubscriptionsSection />

      {/* 5. Alertas de Presupuesto (50%, 75%, 80%, 90%, 100%, exceso - In-App y Email) */}
      <AlertSettingsSection />

      {/* 6. Reportes Programados (Diario, Semanal, Mensual, etc. con Desglose Completo) */}
      <ScheduledReportsSection />

      {/* 7. Sección Preferencias (Tema, Notificaciones, Idioma, Zona Horaria) */}
      <PreferencesSection />

      {/* 8. Sección Exportar Datos (CSV y PDF) */}
      <ExportDataSection />

      {/* 9. Botón Cerrar Sesión — iOS destructive style */}
      <div className="pt-2">
        <button
          id="logout-button"
          type="button"
          onClick={() => setShowLogoutModal(true)}
          className="w-full py-[14px] px-4 rounded-[14px] text-[15px] font-semibold transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
          style={{
            background: 'var(--ios-bg-elevated)',
            color: 'var(--ios-red)',
            border: '0.5px solid var(--ios-separator)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Cerrar Sesión</span>
        </button>
      </div>

      {/* Modal de confirmación para Cerrar Sesión — iOS Alert style */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-sm rounded-[14px] overflow-hidden animate-scale-in"
            style={{
              background: 'var(--ios-bg-elevated)',
              boxShadow: 'var(--shadow-2xl)',
            }}
          >
            {/* Modal body */}
            <div className="px-4 pt-5 pb-4 text-center">
              <h3 className="text-[17px] font-semibold mb-1" style={{ color: 'var(--ios-label)' }}>
                Cerrar Sesión
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ios-label-secondary)' }}>
                ¿Estás seguro que deseas salir de tu cuenta?
              </p>
            </div>
            {/* Modal divider */}
            <div className="h-px" style={{ background: 'var(--ios-separator)' }} />
            {/* Modal actions — iOS style side by side */}
            <div className="flex">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-[14px] text-[17px] font-normal transition-colors active:bg-[var(--ios-bg-tertiary)]"
                style={{ color: 'var(--ios-blue)', borderRight: '0.5px solid var(--ios-separator)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
                className="flex-1 py-[14px] text-[17px] font-semibold transition-colors active:bg-[var(--ios-bg-tertiary)]"
                style={{ color: 'var(--ios-red)' }}
              >
                {isLoggingOut ? 'Saliendo...' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal exclusivo Master Admin */}
      {isMasterAdmin && (
        <MasterAdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
        />
      )}
    </div>
  );
};
export default ProfileView;

