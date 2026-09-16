import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import configData from '../../firebase-applet-config.json';

export const isFirebaseConfigured = Boolean(
  configData.apiKey &&
  !configData.apiKey.includes('XXXX') &&
  configData.apiKey !== 'placeholder'
);

const firebaseConfig = {
  apiKey: configData.apiKey || import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: configData.authDomain || `${configData.projectId}.firebaseapp.com`,
  projectId: configData.projectId,
  storageBucket: configData.storageBucket || `${configData.projectId}.appspot.com`,
  messagingSenderId: configData.messagingSenderId,
  appId: configData.appId,
};

// Inicializar app de Firebase (singleton)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, configData.firestoreDatabaseId || '(default)');
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Inicio de sesión mediante Google Popup
 */
export async function loginWithGoogle(): Promise<FirebaseUser> {
  if (!isFirebaseConfigured) {
    const err: any = new Error('Firebase aún no está aprovisionado con una API key válida.');
    err.code = 'auth/api-key-not-valid';
    throw err;
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Envío de Magic Link (acceso sin contraseña por correo electrónico)
 */
export async function sendMagicLinkEmail(email: string): Promise<void> {
  const actionCodeSettings = {
    url: window.location.origin,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  window.localStorage.setItem('flowmoney_emailForSignIn', email);
}

/**
 * Confirmación de inicio de sesión con Magic Link al regresar de la URL de confirmación
 */
export async function completeMagicLinkSignIn(): Promise<FirebaseUser | null> {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    return null;
  }

  let email = window.localStorage.getItem('flowmoney_emailForSignIn');
  if (!email) {
    email = window.prompt('Por favor, confirma tu correo electrónico para completar el acceso');
  }

  if (!email) return null;

  const result = await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem('flowmoney_emailForSignIn');
  return result.user;
}

/**
 * Cierre de sesión de Firebase
 */
export async function logoutFirebase(): Promise<void> {
  await signOut(auth);
}

/**
 * Subida de foto de avatar de usuario a Firebase Storage
 */
export async function uploadAvatarImage(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop() || 'jpg';
  const storageRef = ref(storage, `avatars/${userId}_${Date.now()}.${fileExt}`);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}

/**
 * Subida de imagen de ticket de gasto a Firebase Storage
 */
export async function uploadReceiptImage(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop() || 'jpg';
  const storageRef = ref(storage, `receipts/${userId}_${Date.now()}.${fileExt}`);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}
