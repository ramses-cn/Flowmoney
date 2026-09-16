import { auth } from '../lib/firebase.ts';
import { useAuthStore } from '../store/useAuthStore.ts';

/**
 * Helper para realizar peticiones HTTP a la API del backend con manejo automático de sesión:
 * - Inyecta el token Bearer en los encabezados.
 * - Si la respuesta retorna status 401 (token expirado), fuerza la renovación del token con user.getIdToken(true).
 * - Reintenta la llamada UNA vez con el nuevo token.
 * - Si el reintento también falla o el token no se pudo renovar, muestra el mensaje
 *   "Tu sesión expiró, vuelve a iniciar sesión", limpia la sesión y redirige al login.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const store = useAuthStore.getState();
  let token = store.token;

  // Si el store no tiene el token inmediatamente, intentar obtenerlo de auth.currentUser o sesión demo
  if (!token) {
    if (auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
        if (token) {
          store.setToken(token);
        }
      } catch (err) {
        console.warn('[fetchWithAuth] No se pudo obtener token inicial de Firebase:', err);
      }
    } else {
      const demoToken = localStorage.getItem('flowmoney_demo_token');
      if (demoToken) {
        token = demoToken;
        store.setToken(demoToken);
      }
    }
  }

  const buildHeaders = (t: string | null): Headers => {
    const headers = new Headers(options.headers || {});
    if (t && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${t}`);
    }
    return headers;
  };

  let res = await fetch(url, {
    ...options,
    headers: buildHeaders(token),
  });

  // Si recibimos status 401
  if (res.status === 401) {
    console.warn(`[fetchWithAuth] 401 recibido en ${url}. Intentando refresco forzado con user.getIdToken(true)...`);
    const user = auth.currentUser;
    let freshToken: string | null = null;

    if (user) {
      try {
        freshToken = await user.getIdToken(true);
        if (freshToken) {
          store.setToken(freshToken);
        }
      } catch (err) {
        console.error('[fetchWithAuth] Falló el refresco forzado de token:', err);
      }
    }

    if (freshToken) {
      // Reintentar la llamada UNA sola vez
      res = await fetch(url, {
        ...options,
        headers: buildHeaders(freshToken),
      });
    }

    // Si el reintento también falla (o no hubo token fresco)
    if (res.status === 401) {
      console.warn('[fetchWithAuth] Reintento falló con 401. Redirigiendo a pantalla de inicio de sesión...');
      await store.logout();
      useAuthStore.setState({ error: 'Tu sesión expiró, vuelve a iniciar sesión' });
      window.dispatchEvent(
        new CustomEvent('session_expired', {
          detail: { message: 'Tu sesión expiró, vuelve a iniciar sesión' },
        })
      );
    }
  }

  return res;
}

/**
 * Realiza una petición usando fetchWithAuth y deserializa la respuesta JSON de forma segura:
 * - Previene errores como "Unexpected token '<', "<html> <hea"... is not valid JSON".
 * - Si la respuesta es HTML o texto de error (ej. 502/503 de proxy o 404), extrae un mensaje legible.
 * - Lanza errores claros con el mensaje del backend o descripción amigable.
 */
export async function safeFetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetchWithAuth(url, options);
  const rawText = await res.text();

  let data: any = null;
  const isJson = (res.headers.get('content-type') || '').includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[');

  if (isJson) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (data && (data.error || data.message)) {
      throw new Error(data.error || data.message);
    }
    if (res.status === 404) {
      throw new Error('Servicio temporalmente no disponible o ruta no encontrada. Reintenta en unos segundos.');
    }
    if (res.status >= 500) {
      throw new Error(`Error en el servidor (${res.status}). Por favor reintenta.`);
    }
    throw new Error(`Error al procesar la solicitud (Código ${res.status}).`);
  }

  if (!isJson || data === null) {
    // Si la respuesta fue HTML exitosa pero inesperada para una API
    throw new Error('El servidor devolvió una respuesta no válida. Por favor recarga o reintenta.');
  }

  return data as T;
}

