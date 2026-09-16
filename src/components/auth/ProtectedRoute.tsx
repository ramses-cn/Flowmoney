import React, { useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { LoginScreen } from './LoginScreen.tsx';
import { Loader2, Ban, Clock, LogOut, Mail } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const MASTER_ADMIN_EMAILS = ['psico.csar@gmail.com', 'cesar.nieto.ore@gmail.com'];

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const {
    profile,
    firebaseUser,
    isLoading,
    isInitialized,
    initializeAuth,
    checkEmailLinkCallback,
    logout,
  } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initializeAuth();
    // Revisar si la URL actual proviene de un magic link de correo
    checkEmailLinkCallback();
    return () => unsubscribe();
  }, [initializeAuth, checkEmailLinkCallback]);

  // Pantalla de carga mientras se verifica la sesión en Firebase y Cloud SQL
  if (isLoading && !isInitialized) {
    return (
      <div id="auth-loading-state" className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <span className="text-xl font-black tracking-tighter">FM</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
            <span>Verificando credenciales con FlowMoney...</span>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay usuario autenticado ni perfil de Cloud SQL, mostrar pantalla de login
  if (!firebaseUser && !profile) {
    return <LoginScreen />;
  }

  // Verificación de suspensión o vigencia vencida (excepto Master Admins)
  const isMaster =
    profile?.email && MASTER_ADMIN_EMAILS.includes(profile.email.toLowerCase().trim());

  if (profile && !isMaster) {
    // 1. Estado Suspendido
    if (profile.is_suspended) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 animate-fade-in">
          <div
            className="w-full max-w-md p-6 sm:p-8 rounded-[24px] border shadow-2xl space-y-5 text-center"
            style={{
              background: 'var(--ios-bg-elevated)',
              borderColor: 'var(--ios-separator)',
            }}
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm">
              <Ban className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                Acceso Suspendido
              </h2>
              <p className="text-xs opacity-75">
                Tu cuenta ha sido suspendida temporalmente por el Administrador Master.
              </p>
            </div>

            {profile.suspended_reason && (
              <div className="p-3.5 rounded-[14px] bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 text-left">
                <span className="font-semibold block mb-0.5">Motivo registrado:</span>
                <span>{profile.suspended_reason}</span>
              </div>
            )}

            <div className="p-3.5 rounded-[14px] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <p className="font-medium">Para reactivar tu cuenta, ponte en contacto con:</p>
              <a
                href="mailto:psico.csar@gmail.com"
                className="inline-flex items-center space-x-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>psico.csar@gmail.com</span>
              </a>
            </div>

            <button
              onClick={() => logout()}
              className="w-full py-2.5 px-4 rounded-[14px] border text-xs font-semibold flex items-center justify-center space-x-2 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              style={{ borderColor: 'var(--ios-separator)' }}
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      );
    }

    // 2. Estado Vencido / Expirado
    if (profile.access_expires_at) {
      const expTime = new Date(profile.access_expires_at).getTime();
      if (!isNaN(expTime) && expTime < Date.now()) {
        const formattedDate = new Date(profile.access_expires_at).toLocaleDateString('es-PE', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

        return (
          <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 animate-fade-in">
            <div
              className="w-full max-w-md p-6 sm:p-8 rounded-[24px] border shadow-2xl space-y-5 text-center"
              style={{
                background: 'var(--ios-bg-elevated)',
                borderColor: 'var(--ios-separator)',
              }}
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-orange-500/15 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-sm">
                <Clock className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-orange-600 dark:text-orange-400">
                  Vigencia de Acceso Vencida
                </h2>
                <p className="text-xs opacity-75">
                  El periodo de acceso para tu cuenta concluyó el{' '}
                  <span className="font-semibold">{formattedDate}</span>.
                </p>
              </div>

              <div className="p-3.5 rounded-[14px] bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p className="font-medium">Para renovar tu periodo de acceso, contacta con:</p>
                <a
                  href="mailto:psico.csar@gmail.com"
                  className="inline-flex items-center space-x-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>psico.csar@gmail.com</span>
                </a>
              </div>

              <button
                onClick={() => logout()}
                className="w-full py-2.5 px-4 rounded-[14px] border text-xs font-semibold flex items-center justify-center space-x-2 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                style={{ borderColor: 'var(--ios-separator)' }}
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        );
      }
    }
  }

  return <>{children}</>;
};
