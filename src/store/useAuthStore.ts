import { create } from 'zustand';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth, loginWithGoogle as fbLoginWithGoogle, logoutFirebase, sendMagicLinkEmail, completeMagicLinkSignIn } from '../lib/firebase.ts';
import { Profile, Category, Account } from '../types/flowmoney.ts';
import { applyTheme, getSavedTheme } from '../utils/theme.ts';

export interface DeleteAccountResponse {
  success: boolean;
  message?: string;
  groupsWithBalance?: Array<{ id: string; name: string; balance: number }>;
}

export interface DeleteCategoryResponse {
  success: boolean;
  message?: string;
  wasDeactivated?: boolean;
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: Profile | null;
  token: string | null;
  categories: Category[];
  accounts: Account[];
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  isDemoSession: boolean;

  // Acciones
  setToken: (token: string | null) => void;
  initializeAuth: () => () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithMagicLink: (email: string) => Promise<void>;
  checkEmailLinkCallback: () => Promise<void>;
  loginAsDemoUser: (demoId?: string, demoName?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;

  // Métodos de perfil y categorías
  syncBackendProfile: (user: FirebaseUser | { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }, idToken: string) => Promise<void>;
  fetchCategories: () => Promise<Category[]>;
  fetchAllCategories: () => Promise<Category[]>;
  toggleCategoryActive: (catId: string, isActive: boolean) => Promise<boolean>;
  addCustomCategory: (cat: { name: string; icon?: string; color?: string; type?: 'expense' | 'income'; monthly_budget?: number }) => Promise<Category>;
  updateCategory: (catId: string, data: { name?: string; icon?: string; color?: string; monthly_budget?: number }) => Promise<Category>;
  deleteCustomCategory: (catId: string) => Promise<DeleteCategoryResponse>;
  reorderCategories: (orderedIds: string[]) => Promise<void>;
  updateCategoryBudget: (catId: string, monthly_budget: number) => Promise<boolean>;

  // Métodos de cuentas
  fetchAccounts: () => Promise<Account[]>;
  addAccount: (data: { name: string; type?: string; currency?: string; current_balance?: number; color?: string }) => Promise<Account>;
  deleteAccount: (id: string) => Promise<void>;
  updateAccountBalance: (id: string, newBalance: number) => Promise<void>;

  // Preferencias de perfil
  updateProfileData: (data: { full_name?: string; avatar_url?: string; default_currency?: string; theme?: 'light' | 'dark' | 'system' }) => Promise<void>;
  deleteMyAccount: () => Promise<DeleteAccountResponse>;
  resetUserData: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  profile: null,
  token: null,
  categories: [],
  accounts: [],
  isLoading: true,
  isInitialized: false,
  error: null,
  isDemoSession: false,

  setToken: (token: string | null) => set({ token }),
  clearError: () => set({ error: null }),

  initializeAuth: () => {
    // Aplicar tema guardado
    applyTheme(getSavedTheme());

    // Verificar si había sesión demo guardada
    const savedDemo = localStorage.getItem('flowmoney_demo_profile');
    const savedDemoToken = localStorage.getItem('flowmoney_demo_token');
    if (savedDemo && savedDemoToken) {
      try {
        const demoProf = JSON.parse(savedDemo);
        set({
          profile: demoProf,
          token: savedDemoToken,
          isDemoSession: true,
          isLoading: false,
          isInitialized: true,
        });
        get().fetchCategories();
        get().fetchAccounts();
        return () => {};
      } catch {
        localStorage.removeItem('flowmoney_demo_profile');
        localStorage.removeItem('flowmoney_demo_token');
      }
    }

    // Listener de estado de autenticación de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          set({ firebaseUser: user, token, isLoading: true });
          await get().syncBackendProfile(user, token);
        } catch (err: any) {
          console.error('[AuthStore] Error sincronizando usuario:', err);
          set({ isLoading: false, isInitialized: true, error: err.message });
        }
      } else {
        const isDemo = get().isDemoSession;
        if (!isDemo) {
          set({
            firebaseUser: null,
            profile: null,
            token: null,
            categories: [],
            accounts: [],
            isLoading: false,
            isInitialized: true,
          });
        }
      }
    });

    return unsubscribe;
  },

  syncBackendProfile: async (user, idToken) => {
    try {
      const res = await fetch('/api/profile/upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          full_name: (user as any).displayName || (user as any).full_name || 'Usuario FlowMoney',
          avatar_url: (user as any).photoURL || (user as any).avatar_url,
          default_currency: 'PEN',
        }),
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status} al sincronizar perfil con el servidor`);
      }

      const resData = await res.json();
      const prof = resData.data?.profile || resData.data;

      set({
        profile: prof,
        token: idToken,
        isLoading: false,
        isInitialized: true,
        error: null,
      });

      await get().fetchCategories();
      await get().fetchAccounts();
    } catch (err: any) {
      console.error('[AuthStore] Error en syncBackendProfile:', err);
      // Fallback a perfil local si la API aún no está disponible
      const fallbackProfile: Profile = {
        id: (user as any).uid || 'user_' + Date.now(),
        email: (user as any).email || '',
        full_name: (user as any).displayName || (user as any).full_name || 'Usuario FlowMoney',
        avatar_url: (user as any).photoURL || null,
        default_currency: 'PEN',
        theme: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      set({
        profile: fallbackProfile,
        token: idToken,
        isLoading: false,
        isInitialized: true,
        error: null,
      });
      get().fetchCategories();
      get().fetchAccounts();
    }
  },

  loginWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await fbLoginWithGoogle();
      const idToken = await user.getIdToken();
      set({ firebaseUser: user, token: idToken, isDemoSession: false });
      await get().syncBackendProfile(user, idToken);
    } catch (err: any) {
      console.error('[AuthStore] Error en loginWithGoogle:', err);
      const errMsg = String(err?.message || '');
      const errCode = String(err?.code || '');
      if (errCode === 'auth/popup-closed-by-user') {
        set({ isLoading: false, error: 'Inicio de sesión cancelado por el usuario.' });
      } else if (errCode === 'auth/popup-blocked') {
        set({
          isLoading: false,
          error: 'El navegador bloqueó la ventana emergente. Habilita popups o utiliza el modo demo.',
        });
      } else if (errCode === 'auth/api-key-not-valid' || errMsg.includes('api-key-not-valid') || errMsg.includes('API key')) {
        set({
          isLoading: false,
          error: 'Firebase requiere aprovisionamiento en AI Studio o una clave válida. Puedes explorar la app ahora con el Modo Demo.',
        });
      } else {
        set({ isLoading: false, error: err.message || 'Fallo al autenticar con Google.' });
      }
    }
  },

  loginWithMagicLink: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      await sendMagicLinkEmail(email);
      set({ isLoading: false });
    } catch (err: any) {
      console.error('[AuthStore] Error en sendMagicLinkEmail:', err);
      set({ isLoading: false, error: err.message || 'Error al enviar enlace mágico' });
      throw err;
    }
  },

  checkEmailLinkCallback: async () => {
    try {
      const user = await completeMagicLinkSignIn();
      if (user) {
        const idToken = await user.getIdToken();
        set({ firebaseUser: user, token: idToken, isDemoSession: false });
        await get().syncBackendProfile(user, idToken);
      }
    } catch (err: any) {
      console.error('[AuthStore] Error completando magic link:', err);
    }
  },

  loginAsDemoUser: async (demoId = 'demo_carlos_flow', demoName = 'Carlos Sandoval') => {
    set({ isLoading: true, error: null });
    const demoToken = `demo-token-${demoId}`;
    const demoProfile: Profile = {
      id: demoId,
      email: `${demoId}@flowmoney.app`,
      full_name: demoName,
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      default_currency: 'PEN',
      theme: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStorage.setItem('flowmoney_demo_profile', JSON.stringify(demoProfile));
    localStorage.setItem('flowmoney_demo_token', demoToken);

    set({
      profile: demoProfile,
      token: demoToken,
      firebaseUser: null,
      isDemoSession: true,
      isLoading: false,
      isInitialized: true,
      error: null,
    });

    try {
      await get().syncBackendProfile(
        {
          uid: demoId,
          displayName: demoName,
          email: `${demoId}@flowmoney.app`,
          photoURL: demoProfile.avatar_url,
        },
        demoToken
      );
    } catch (err) {
      console.warn('Demo profile backend sync:', err);
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      if (!get().isDemoSession) {
        await logoutFirebase();
      }
    } catch (err) {
      console.warn('Firebase logout warning:', err);
    } finally {
      localStorage.removeItem('flowmoney_demo_profile');
      localStorage.removeItem('flowmoney_demo_token');
      set({
        firebaseUser: null,
        profile: null,
        token: null,
        categories: [],
        accounts: [],
        isDemoSession: false,
        isLoading: false,
        error: null,
      });
    }
  },

  fetchCategories: async () => {
    const { token } = get();
    if (!token) return [];
    try {
      const res = await fetch('/api/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const cats = data.categories || [];
        set({ categories: cats });
        return cats;
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
    return [];
  },

  fetchAllCategories: async () => {
    const { token } = get();
    if (!token) return [];
    try {
      const res = await fetch('/api/categories?all=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.categories || [];
      }
    } catch (err) {
      console.error('Error fetching all categories:', err);
    }
    return [];
  },

  toggleCategoryActive: async (catId: string, is_active: boolean): Promise<boolean> => {
    const { token } = get();
    if (!token) return false;
    try {
      const res = await fetch(`/api/categories/${catId}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) return false;
      await get().fetchCategories();
      return true;
    } catch {
      return false;
    }
  },

  addCustomCategory: async (cat) => {
    const { token } = get();
    if (!token) throw new Error('No autenticado');
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cat),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al crear categoría');
    }
    const data = await res.json();
    await get().fetchCategories();
    return data.category;
  },

  updateCategory: async (catId: string, catData) => {
    const { token } = get();
    if (!token) throw new Error('No autenticado');
    const res = await fetch(`/api/categories/${catId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(catData),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al actualizar categoría');
    }
    const data = await res.json();
    await get().fetchCategories();
    return data.category;
  },

  deleteCustomCategory: async (catId: string): Promise<DeleteCategoryResponse> => {
    const { token } = get();
    if (!token) throw new Error('No autenticado');
    const res = await fetch(`/api/categories/${catId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: data.error || 'Error al eliminar categoría' };
    }
    await get().fetchCategories();
    return {
      success: true,
      message: data.message,
      wasDeactivated: data.wasDeactivated,
    };
  },

  reorderCategories: async (orderedIds: string[]) => {
    const { token } = get();
    if (!token) return;
    const res = await fetch('/api/categories/reorder', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderedIds }),
    });
    if (!res.ok) throw new Error('Error al reordenar categorías');
    await get().fetchCategories();
  },

  updateCategoryBudget: async (catId: string, monthly_budget: number): Promise<boolean> => {
    const { token } = get();
    if (!token) return false;
    try {
      const res = await fetch(`/api/categories/${catId}/budget`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ monthly_budget }),
      });
      if (!res.ok) return false;
      await get().fetchCategories();
      return true;
    } catch {
      return false;
    }
  },

  fetchAccounts: async () => {
    const { token } = get();
    if (!token) return [];
    try {
      const res = await fetch('/api/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const accs = data.accounts || [];
        set({ accounts: accs });
        return accs;
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
    return [];
  },

  addAccount: async (accData) => {
    const { token } = get();
    if (!token) throw new Error('No autenticado');
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(accData),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al crear cuenta');
    }
    const data = await res.json();
    await get().fetchAccounts();
    return data.account;
  },

  deleteAccount: async (id: string) => {
    const { token } = get();
    if (!token) return;
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Error al eliminar cuenta');
    await get().fetchAccounts();
  },

  updateAccountBalance: async (id: string, newBalance: number) => {
    // Actualización optimista en el estado de Zustand
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, current_balance: newBalance } : a
      ),
    }));
  },

  updateProfileData: async (data) => {
    const { token, profile } = get();
    if (!token) return;
    const res = await fetch('/api/profile/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const resData = await res.json();
      set({ profile: resData.profile });
    } else if (profile) {
      set({ profile: { ...profile, ...data } });
    }
  },

  deleteMyAccount: async (): Promise<DeleteAccountResponse> => {
    const { token } = get();
    if (!token) return { success: false, message: 'No autenticado' };
    try {
      const res = await fetch('/api/profile/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data.error || data.message || 'Error al eliminar cuenta',
          groupsWithBalance: data.groupsWithBalance,
        };
      }
      await get().logout();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error al eliminar cuenta' };
    }
  },

  resetUserData: async (): Promise<boolean> => {
    const { token } = get();
    if (!token) return false;
    try {
      const res = await fetch('/api/profile/reset-data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const resData = await res.json();
      if (resData.profile) set({ profile: resData.profile });
      await get().fetchCategories();
      await get().fetchAccounts();
      return true;
    } catch {
      return false;
    }
  },
}));
