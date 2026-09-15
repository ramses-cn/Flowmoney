import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let isInitialized = false;

function getFirebaseProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const configRaw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configRaw);
      return config.projectId;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function initFirebaseAdmin() {
  if (isInitialized) return;

  const projectId = getFirebaseProjectId();
  try {
    if (getApps().length === 0) {
      if (projectId) {
        initializeApp({
          projectId: projectId,
        });
      } else {
        initializeApp();
      }
    }
    isInitialized = true;
    console.log('[Firebase Admin] Inicializado con projectId:', projectId || 'default');
  } catch (err) {
    console.warn('[Firebase Admin] Aviso al inicializar Firebase Admin:', err);
  }
}

export interface VerifiedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  is_demo?: boolean;
  role?: string;
  master_admin?: boolean;
  is_master_admin?: boolean;
}

export async function verifyFirebaseToken(idToken: string): Promise<VerifiedUser> {
  const isProduction = process.env.NODE_ENV === 'production';
  // En desarrollo o cuando ALLOW_DEMO_AUTH='true', permitir tokens de demostración
  const allowDemoAuth = process.env.ALLOW_DEMO_AUTH === 'true' || !isProduction;

  // Si el token es de demostración:
  if (idToken.startsWith('demo-token-')) {
    if (!allowDemoAuth) {
      throw new Error('Modo demo deshabilitado en este entorno');
    }
    const rawUid = idToken.replace('demo-token-', '').trim();
    // Forzar prefijo demo_ para evitar colisión o suplantación de UIDs de usuarios reales
    const safeDemoUid = rawUid.startsWith('demo_') ? rawUid : `demo_${rawUid || 'carlos_flow'}`;
    return {
      uid: safeDemoUid,
      email: `${safeDemoUid}@flowmoney.app`,
      name: 'Usuario Demo FlowMoney',
      picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      is_demo: true,
    };
  }

  initFirebaseAdmin();

  // Corregido (F9): eliminado bypass 'test-token' que permitía acceso sin verificación en desarrollo.
  // Cualquier token que no sea demo-token-* debe pasar por verifyIdToken de Firebase Admin.
  const auth = getAuth();
  const decodedToken = await auth.verifyIdToken(idToken);
  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name || (decodedToken.email ? decodedToken.email.split('@')[0] : 'Usuario FlowMoney'),
    picture: decodedToken.picture,
    role: (decodedToken as any).role,
    master_admin: (decodedToken as any).master_admin,
    is_master_admin: (decodedToken as any).is_master_admin,
  };
}
