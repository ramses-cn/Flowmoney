import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { isFirebaseConfigured } from '../../lib/firebase.ts';
import {
  Sparkles,
  AlertCircle,
  Mail,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Wallet,
  X,
  Loader2,
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithMagicLink,
    loginAsDemoUser,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setMagicLinkLoading(true);
    try {
      await loginWithMagicLink(email.trim());
      setMagicLinkSent(true);
    } catch {
      // Error manejado en auth store
    } finally {
      setMagicLinkLoading(false);
    }
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-200 font-sans"
      style={{
        background: 'var(--ios-bg-primary)',
        color: 'var(--ios-label)',
      }}
    >
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Cabecera FlowMoney */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-[22px] shadow-lg mb-2"
            style={{
              background: 'linear-gradient(135deg, var(--ios-blue), var(--ios-indigo))',
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(0, 122, 255, 0.3)',
            }}
          >
            <Wallet className="w-8 h-8" />
          </div>
          <h1
            className="text-[32px] font-bold tracking-tight"
            style={{ color: 'var(--ios-label)', letterSpacing: '-0.025em' }}
          >
            FlowMoney
          </h1>
          <p
            className="text-[15px] leading-relaxed max-w-xs mx-auto"
            style={{ color: 'var(--ios-label-secondary)' }}
          >
            Gestión inteligente de gastos personales, en pareja y en grupos con triple lente
          </p>
        </div>

        {/* Tarjeta de Inicio de Sesión */}
        <div
          className="p-6 sm:p-7 rounded-[24px] shadow-sm space-y-5"
          style={{
            background: 'var(--ios-bg-secondary)',
            border: '0.5px solid var(--ios-separator)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
          }}
        >
          {/* Alerta de Error si ocurre */}
          {error && (
            <div
              id="login-error-alert"
              className="p-3.5 rounded-[12px] flex flex-col space-y-2.5"
              style={{
                background: 'rgba(255, 59, 48, 0.08)',
                border: '0.5px solid rgba(255, 59, 48, 0.2)',
              }}
            >
              <div className="flex items-start justify-between space-x-2">
                <div className="flex items-start space-x-2.5 flex-1">
                  <AlertCircle
                    className="w-[18px] h-[18px] shrink-0 mt-0.5"
                    style={{ color: 'var(--ios-red)' }}
                  />
                  <span className="flex-1 text-[13px] leading-relaxed" style={{ color: 'var(--ios-label)' }}>
                    {error}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearError}
                  className="p-1 rounded-md transition-colors active:scale-90"
                  style={{ color: 'var(--ios-label-secondary)' }}
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Botón rápido si requiere modo demo */}
              <button
                type="button"
                onClick={() => {
                  clearError();
                  loginAsDemoUser('demo_carlos_flow', 'Carlos Sandoval');
                }}
                className="self-start text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5"
                style={{ background: 'rgba(175, 82, 222, 0.15)', color: 'var(--ios-purple)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Entrar con Modo Demo inmediatamente</span>
              </button>
            </div>
          )}

          {/* Botón Principal: Acceder con Google */}
          <button
            id="google-login-button"
            type="button"
            onClick={() => loginWithGoogle()}
            disabled={isLoading}
            className="w-full h-12 rounded-[14px] font-semibold text-[15px] flex items-center justify-center space-x-3 transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: 'var(--ios-label)',
              color: 'var(--ios-bg-secondary)',
            }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continuar con Google</span>
              </>
            )}
          </button>

          {/* Separador */}
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            <span
              className="px-3 text-[12px] font-medium absolute uppercase tracking-wider"
              style={{
                background: 'var(--ios-bg-secondary)',
                color: 'var(--ios-label-tertiary)',
              }}
            >
              o con enlace
            </span>
          </div>

          {/* Magic Link */}
          {magicLinkSent ? (
            <div
              className="p-4 rounded-[14px] text-center space-y-2"
              style={{
                background: 'rgba(52, 199, 89, 0.1)',
                border: '0.5px solid rgba(52, 199, 89, 0.25)',
              }}
            >
              <CheckCircle2 className="w-6 h-6 mx-auto" style={{ color: 'var(--ios-green)' }} />
              <p className="text-[14px] font-semibold" style={{ color: 'var(--ios-label)' }}>
                ¡Enlace de acceso enviado!
              </p>
              <p className="text-[12px]" style={{ color: 'var(--ios-label-secondary)' }}>
                Revisa tu bandeja de entrada en <span className="font-medium">{email}</span> para ingresar sin contraseña.
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLinkSubmit} className="space-y-3">
              <div className="relative">
                <Mail
                  className="w-4 h-4 absolute left-3.5 top-3.5"
                  style={{ color: 'var(--ios-label-tertiary)' }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full h-11 pl-10 pr-3 rounded-[12px] text-[14px] transition-all outline-none"
                  style={{
                    background: 'var(--ios-bg-primary)',
                    border: '0.5px solid var(--ios-separator)',
                    color: 'var(--ios-label)',
                  }}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={magicLinkLoading || !email.trim()}
                className="w-full h-11 rounded-[12px] text-[13px] font-semibold transition-all active:scale-[0.98] flex items-center justify-center space-x-1.5 disabled:opacity-40"
                style={{
                  background: 'rgba(0, 122, 255, 0.1)',
                  color: 'var(--ios-blue)',
                }}
              >
                {magicLinkLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Enviar enlace mágico</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Opción Rápida: Modo Demo */}
          <div
            className="pt-2 border-t"
            style={{ borderColor: 'var(--ios-separator)' }}
          >
            <button
              id="demo-login-button"
              type="button"
              onClick={() => loginAsDemoUser('demo_carlos_flow', 'Carlos Sandoval')}
              className="w-full py-2.5 px-4 rounded-[12px] text-[13px] font-semibold transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
              style={{
                background: 'rgba(175, 82, 222, 0.12)',
                color: 'var(--ios-purple)',
              }}
            >
              <Sparkles className="w-4 h-4" />
              <span>Explorar en Modo Demo (Acceso Instantáneo)</span>
            </button>
          </div>
        </div>

        {/* Garantías de Privacidad */}
        <div
          className="flex items-center justify-center space-x-4 text-[12px]"
          style={{ color: 'var(--ios-label-tertiary)' }}
        >
          <div className="flex items-center space-x-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Encriptación TLS</span>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Seguridad Firebase & Cloud SQL</span>
          </div>
        </div>
      </div>
    </div>
  );
};
